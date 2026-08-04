import { pool } from '../db/init';
import { runLocalization } from '../services/localizationEngine';

// Mock the PG pool
jest.mock('../db/init', () => {
  return {
    pool: {
      query: jest.fn(),
    },
  };
});

describe('Fault Localization Engine tests', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = pool.query as jest.Mock;
    jest.clearAllMocks();
  });

  test('DT Fault: All devices are dark -> Create DT Ticket', async () => {
    // 1. Mock DT list for affected device
    mockQuery.mockImplementation((queryText: string, values?: any[]) => {
      // Get distinct DTs
      if (queryText.includes('SELECT DISTINCT dt_id FROM poles')) {
        return Promise.resolve({ rows: [{ dt_id: 'DT-0001' }] });
      }
      // Check scheduled outages for DT
      if (queryText.includes('SELECT id FROM scheduled_outages WHERE target_id = $1')) {
        return Promise.resolve({ rows: [] });
      }
      // Get DT info
      if (queryText.includes('SELECT lat, lon, feeder_id FROM transformers')) {
        return Promise.resolve({ rows: [{ lat: 12.93, lon: 77.58, feeder_id: 'F-01' }] });
      }
      // Load all poles of DT-0001
      if (queryText.includes('SELECT * FROM poles WHERE dt_id = $1')) {
        return Promise.resolve({
          rows: [
            { id: 'P-0001-001', lat: 12.9301, lon: 77.5801, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 1, parent_pole_id: null, device_id: 'DEV-1', pincode: '560078' },
            { id: 'P-0001-002', lat: 12.9302, lon: 77.5802, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 2, parent_pole_id: 'P-0001-001', device_id: 'DEV-2', pincode: '560078' },
            { id: 'P-0001-003', lat: 12.9303, lon: 77.5803, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 3, parent_pole_id: 'P-0001-002', device_id: 'DEV-3', pincode: '560078' },
          ],
        });
      }
      // Load latest telemetry for DEV-1, DEV-2, DEV-3 -> All Dark
      if (queryText.includes('SELECT DISTINCT ON (device_id)')) {
        return Promise.resolve({
          rows: [
            { device_id: 'DEV-1', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-2', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-3', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
          ],
        });
      }
      // Check if ticket exists
      if (queryText.includes('SELECT status FROM tickets')) {
        return Promise.resolve({ rows: [] }); // Not exists
      }
      // Insert Ticket
      if (queryText.includes('INSERT INTO tickets')) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });
    });

    await runLocalization(['DEV-1']);

    // Check if the query inserted a DT ticket
    const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO tickets'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1][1]).toBe('dt'); // ticket type should be 'dt'
    expect(insertCall![1][2]).toBe('DT-0001'); // target_id should be DT-0001
  });

  test('Span Fault: Upstream is live, downstream branch is dark -> Create Span Ticket', async () => {
    mockQuery.mockImplementation((queryText: string, values?: any[]) => {
      if (queryText.includes('SELECT DISTINCT dt_id FROM poles')) {
        return Promise.resolve({ rows: [{ dt_id: 'DT-0001' }] });
      }
      if (queryText.includes('SELECT id FROM scheduled_outages')) {
        return Promise.resolve({ rows: [] });
      }
      if (queryText.includes('SELECT lat, lon, feeder_id FROM transformers')) {
        return Promise.resolve({ rows: [{ lat: 12.93, lon: 77.58, feeder_id: 'F-01' }] });
      }
      if (queryText.includes('SELECT * FROM poles WHERE dt_id = $1')) {
        return Promise.resolve({
          rows: [
            { id: 'P-0001-001', lat: 12.9301, lon: 77.5801, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 1, parent_pole_id: null, device_id: 'DEV-1', pincode: '560078' },
            { id: 'P-0001-002', lat: 12.9302, lon: 77.5802, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 2, parent_pole_id: 'P-0001-001', device_id: 'DEV-2', pincode: '560078' },
            { id: 'P-0001-003', lat: 12.9303, lon: 77.5803, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 3, parent_pole_id: 'P-0001-002', device_id: 'DEV-3', pincode: '560078' },
          ],
        });
      }
      // Telemetry: DEV-1 is live, DEV-2 and DEV-3 are dark
      if (queryText.includes('SELECT DISTINCT ON (device_id)')) {
        return Promise.resolve({
          rows: [
            { device_id: 'DEV-1', event: 'heartbeat', energized: true, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-2', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-3', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
          ],
        });
      }
      if (queryText.includes('SELECT status FROM tickets')) {
        return Promise.resolve({ rows: [] });
      }
      if (queryText.includes('INSERT INTO tickets')) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });
    });

    await runLocalization(['DEV-2']);

    const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO tickets'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1][1]).toBe('span'); // span ticket
    expect(insertCall![1][2]).toBe('P-0001-002'); // target_id is first dark pole P-02
    expect(insertCall![1][3]).toBe('P-0001-001'); // span_start_pole_id is parent P-01
    expect(insertCall![1][4]).toBe('P-0001-002'); // span_end_pole_id is child P-02
  });

  test('Dead Sensor: Isolated dark device between live neighbors -> Do NOT Create Ticket', async () => {
    mockQuery.mockImplementation((queryText: string, values?: any[]) => {
      if (queryText.includes('SELECT DISTINCT dt_id FROM poles')) {
        return Promise.resolve({ rows: [{ dt_id: 'DT-0001' }] });
      }
      if (queryText.includes('SELECT id FROM scheduled_outages')) {
        return Promise.resolve({ rows: [] });
      }
      if (queryText.includes('SELECT lat, lon, feeder_id FROM transformers')) {
        return Promise.resolve({ rows: [{ lat: 12.93, lon: 77.58, feeder_id: 'F-01' }] });
      }
      if (queryText.includes('SELECT * FROM poles WHERE dt_id = $1')) {
        return Promise.resolve({
          rows: [
            { id: 'P-0001-001', lat: 12.9301, lon: 77.5801, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 1, parent_pole_id: null, device_id: 'DEV-1', pincode: '560078' },
            // DEV-2 is dark (isolated)
            { id: 'P-0001-002', lat: 12.9302, lon: 77.5802, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 2, parent_pole_id: 'P-0001-001', device_id: 'DEV-2', pincode: '560078' },
            // DEV-3 is live (leaf child)
            { id: 'P-0001-003', lat: 12.9303, lon: 77.5803, feeder_id: 'F-01', dt_id: 'DT-0001', seq_on_line: 3, parent_pole_id: 'P-0001-002', device_id: 'DEV-3', pincode: '560078' },
          ],
        });
      }
      // Telemetry: DEV-1 is live, DEV-2 is dark, DEV-3 is live
      if (queryText.includes('SELECT DISTINCT ON (device_id)')) {
        return Promise.resolve({
          rows: [
            { device_id: 'DEV-1', event: 'heartbeat', energized: true, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-2', event: 'power_lost', energized: false, ts: '2026-08-05T00:00:00Z' },
            { device_id: 'DEV-3', event: 'heartbeat', energized: true, ts: '2026-08-05T00:00:00Z' },
          ],
        });
      }

      return Promise.resolve({ rows: [] });
    });

    await runLocalization(['DEV-2']);

    const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO tickets'));
    // Since DEV-3 is downstream and live, power is flowing through DEV-2. DEV-2 must be a dead sensor.
    expect(insertCall).toBeUndefined(); // Should not create ticket
  });

  test('Outage Suppression: Active scheduled outage exists -> Do NOT Create Ticket', async () => {
    mockQuery.mockImplementation((queryText: string, values?: any[]) => {
      if (queryText.includes('SELECT DISTINCT dt_id FROM poles')) {
        return Promise.resolve({ rows: [{ dt_id: 'DT-0001' }] });
      }
      // Scheduled outage active!
      if (queryText.includes('SELECT id FROM scheduled_outages')) {
        return Promise.resolve({ rows: [{ id: 99 }] });
      }

      return Promise.resolve({ rows: [] });
    });

    await runLocalization(['DEV-1']);

    const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO tickets'));
    expect(insertCall).toBeUndefined(); // Should be suppressed
  });
});
