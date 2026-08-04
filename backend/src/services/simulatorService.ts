import { pool } from '../db/init';
import { enqueueTelemetry, TelemetryPayload } from './telemetryProcessor';

export interface ActiveFault {
  id: number;
  type: 'span' | 'dt' | 'feeder';
  target_id: string;
  span_end_pole_id?: string;
  created_at: Date;
}

export interface ScheduledOutage {
  id: number;
  type: 'dt' | 'feeder' | 'pole';
  target_id: string;
  start_time: Date;
  end_time: Date;
}

// Background simulation intervals
let simulationInterval: NodeJS.Timeout | null = null;
const firmwareVersions = ['1.0.1', '1.1.2', '1.2.0', '1.2.5', '1.3.1', '2.0.0'];

// Fetch all devices from DB with their details
async function getAllDevices() {
  const query = `
    SELECT p.id as pole_id, p.device_id, p.dt_id, p.feeder_id, p.seq_on_line, p.parent_pole_id, p.lat, p.lon, p.pincode
    FROM poles p
    WHERE p.device_id IS NOT NULL
  `;
  const res = await pool.query(query);
  return res.rows;
}

// Determine if a device is currently affected by an active fault (Ground Truth)
export async function getAffectedPolesForFault(type: string, targetId: string, spanEndPoleId?: string): Promise<string[]> {
  const allPolesRes = await pool.query('SELECT id, dt_id, feeder_id FROM poles');
  const allPoles = allPolesRes.rows;

  if (type === 'feeder') {
    // All poles on this feeder are affected
    return allPoles.filter(p => p.feeder_id === targetId).map(p => p.id);
  }

  if (type === 'dt') {
    // All poles on this transformer (DT) are affected
    return allPoles.filter(p => p.dt_id === targetId).map(p => p.id);
  }

  if (type === 'span') {
    // A break between starting pole (targetId) and ending pole (spanEndPoleId)
    // Downstream poles from the end pole are affected
    if (!spanEndPoleId) return [];

    // To simulate the physical ground truth (even if DB doesn't have parent_pole_id):
    // We walk the structural tree. In our synthetic generation:
    // Main line poles are P-XXXX-001, P-XXXX-002...
    // Spurs are P-XXXX-S1-01, P-XXXX-S1-02...
    // Let's load all poles of this DT to find downstream children
    const dtPolesRes = await pool.query('SELECT id, parent_pole_id FROM poles WHERE dt_id = (SELECT dt_id FROM poles WHERE id = $1)', [spanEndPoleId]);
    const dtPoles = dtPolesRes.rows;

    const affected = new Set<string>();
    const queue = [spanEndPoleId];

    // Helper: find kids using structural rules (e.g. parent_pole_id OR sequence number suffixes)
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (affected.has(current)) continue;
      affected.add(current);

      // Find children by parent_pole_id
      const kidsByParent = dtPoles.filter(p => p.parent_pole_id === current).map(p => p.id);
      queue.push(...kidsByParent);

      // Fallback for missing topology in DB: simulator knows the physical naming convention
      // E.g. If current is P-0001-005, then children includes P-0001-006 (if main line)
      // If current is P-0001-005 and is a junction for spur S1, then spur P-0001-S1-01 is a child
      const match = current.match(/^P-(\d+)-(S\d+-)?(\d+)$/);
      if (match) {
        const dtNum = match[1];
        const isSpur = !!match[2];
        const seq = parseInt(match[3], 10);

        if (!isSpur) {
          // Main line next pole
          const nextMainId = `P-${dtNum}-${(seq + 1).toString().padStart(3, '0')}`;
          if (dtPoles.some(p => p.id === nextMainId)) {
            queue.push(nextMainId);
          }
          // Check for spurs branching from this pole
          const spurStart1 = `P-${dtNum}-S1-01`;
          const spurStart2 = `P-${dtNum}-S2-01`;
          // If junction checks out, push spur starts
          // (Our synthetic seeder picked a random junction. If a pole is parent of spur start in database,
          // or if the naming matches, we add it).
        } else {
          // Spur next pole
          const spurPrefix = match[2];
          const nextSpurId = `P-${dtNum}-${spurPrefix}${(seq + 1).toString().padStart(2, '0')}`;
          if (dtPoles.some(p => p.id === nextSpurId)) {
            queue.push(nextSpurId);
          }
        }
      }
    }
    return Array.from(affected);
  }

  return [];
}

// Get all currently dark poles across all active faults
export async function getDarkPolesGroundTruth(): Promise<Set<string>> {
  const faultsRes = await pool.query('SELECT type, target_id, span_end_pole_id FROM active_faults');
  const darkPoles = new Set<string>();

  for (const fault of faultsRes.rows) {
    const affected = await getAffectedPolesForFault(fault.type, fault.target_id, fault.span_end_pole_id);
    for (const p of affected) {
      darkPoles.add(p);
    }
  }

  return darkPoles;
}

// Get active scheduled outages
export async function getActiveScheduledOutages(): Promise<ScheduledOutage[]> {
  const res = await pool.query(
    'SELECT id, type, target_id, start_time, end_time FROM scheduled_outages WHERE NOW() BETWEEN start_time AND end_time'
  );
  return res.rows.map(row => ({
    id: row.id,
    type: row.type,
    target_id: row.target_id,
    start_time: row.start_time,
    end_time: row.end_time,
  }));
}

// Inject a network fault
export async function injectFault(type: 'span' | 'dt' | 'feeder', targetId: string, spanEndPoleId?: string) {
  // Save to DB
  const insertRes = await pool.query(
    'INSERT INTO active_faults (type, target_id, span_end_pole_id) VALUES ($1, $2, $3) RETURNING id',
    [type, targetId, spanEndPoleId || null]
  );
  const faultId = insertRes.rows[0].id;

  console.log(`Fault injected [ID: ${faultId}]: ${type} on ${targetId} -> ${spanEndPoleId || 'N/A'}`);

  // Generate outage telemetry with noise models
  const affectedPoles = await getAffectedPolesForFault(type, targetId, spanEndPoleId);
  const devices = await getAllDevices();
  const affectedDevices = devices.filter(d => affectedPoles.includes(d.pole_id));

  const telemetryBatch: TelemetryPayload[] = [];
  const now = new Date();

  for (const dev of affectedDevices) {
    // 1. Firmware Bug: Bypass devices running 1.2.x (we assign fw deterministically based on device_id)
    const devNum = parseInt(dev.device_id.replace('KSPDB-DEV-', ''), 10);
    const fw = firmwareVersions[devNum % firmwareVersions.length];
    if (fw.startsWith('1.2.')) {
      // Firmware bug: device hangs and fails to send power_lost telemetry
      continue;
    }

    // 2. Packet Drop: 30% chance of packet drop for power_lost events
    if (Math.random() < 0.3) {
      continue;
    }

    // Generate telemetry
    telemetryBatch.push({
      device_id: dev.device_id,
      event: 'power_lost',
      ts: now.toISOString(),
      seq: 15, // Mock sequence
      battery_mv: 3200 + Math.floor(Math.random() * 400),
      rssi: -75 - Math.floor(Math.random() * 20),
      fw,
    });
  }

  // Send to Ingestion pipeline with minor random network jitter (0 to 1500ms)
  if (telemetryBatch.length > 0) {
    setTimeout(() => {
      enqueueTelemetry(telemetryBatch);
    }, Math.random() * 1500);
  }

  return faultId;
}

// Clear/repair a network fault
export async function clearFault(faultId: number) {
  // Fetch details first
  const faultRes = await pool.query('SELECT type, target_id, span_end_pole_id FROM active_faults WHERE id = $1', [faultId]);
  if (faultRes.rows.length === 0) return false;
  const fault = faultRes.rows[0];

  // Delete fault
  await pool.query('DELETE FROM active_faults WHERE id = $1', [faultId]);
  console.log(`Fault cleared [ID: ${faultId}]: ${fault.type} on ${fault.target_id}`);

  // Devices restoration telemetry: Boot event followed by heartbeat
  const affectedPoles = await getAffectedPolesForFault(fault.type, fault.target_id, fault.span_end_pole_id);
  
  // Re-verify if any other active fault still keeps these poles dark
  const remainingDark = await getDarkPolesGroundTruth();
  const restoredPoles = affectedPoles.filter(p => !remainingDark.has(p));

  const devices = await getAllDevices();
  const restoredDevices = devices.filter(d => restoredPoles.includes(d.pole_id));

  const bootTelemetry: TelemetryPayload[] = [];
  const hbTelemetry: TelemetryPayload[] = [];
  const now = new Date();

  for (const dev of restoredDevices) {
    const devNum = parseInt(dev.device_id.replace('KSPDB-DEV-', ''), 10);
    const fw = firmwareVersions[devNum % firmwareVersions.length];

    // Restoring devices send a 'boot' event, resetting their sequence number to 1
    bootTelemetry.push({
      device_id: dev.device_id,
      event: 'boot',
      ts: now.toISOString(),
      seq: 1,
      battery_mv: 3600,
      rssi: -60 - Math.floor(Math.random() * 15),
      fw,
    });

    // Followed by a standard heartbeat
    hbTelemetry.push({
      device_id: dev.device_id,
      event: 'heartbeat',
      ts: new Date(now.getTime() + 1000).toISOString(),
      seq: 2,
      battery_mv: 3590,
      rssi: -60 - Math.floor(Math.random() * 15),
      fw,
    });
  }

  if (bootTelemetry.length > 0) {
    // Send boots, then heartbeats shortly after
    enqueueTelemetry(bootTelemetry);
    setTimeout(() => {
      enqueueTelemetry(hbTelemetry);
    }, 1200);
  }

  return true;
}

// Background simulator loop to stream normal heartbeats and inject random noise
export async function startSimulationLoop() {
  if (simulationInterval) clearInterval(simulationInterval);

  console.log('Starting background telemetry simulator loop...');
  simulationInterval = setInterval(async () => {
    try {
      const devices = await getAllDevices();
      const darkPoles = await getDarkPolesGroundTruth();
      const now = new Date();

      const telemetryBatch: TelemetryPayload[] = [];

      for (const dev of devices) {
        const devNum = parseInt(dev.device_id.replace('KSPDB-DEV-', ''), 10);
        const fw = firmwareVersions[devNum % firmwareVersions.length];

        // If the pole is physically dark, it shouldn't send heartbeats
        if (darkPoles.has(dev.pole_id)) {
          continue;
        }

        // 3. Fleeting Offline Noise: 4% chance a healthy device randomly sends a false 'power_lost' event (bad sensor/outage noise)
        // Ensure this doesn't happen every tick (e.g. roll a 1/200 chance)
        const isNoise = Math.random() < 0.005; // ~0.5% chance per device per tick

        if (isNoise) {
          telemetryBatch.push({
            device_id: dev.device_id,
            event: 'power_lost',
            ts: now.toISOString(),
            seq: Math.floor(Math.random() * 1000) + 10,
            battery_mv: 3300,
            rssi: -85,
            fw,
          });
        } else {
          // Standard periodic heartbeat (e.g. 5% of fleet sends heartbeat in each 5s tick, simulating full fleet heartbeat every 100s)
          if (Math.random() < 0.08) {
            telemetryBatch.push({
              device_id: dev.device_id,
              event: 'heartbeat',
              ts: now.toISOString(),
              seq: Math.floor(Math.random() * 1000) + 10,
              battery_mv: 3500 + Math.floor(Math.random() * 100),
              rssi: -65 - Math.floor(Math.random() * 10),
              fw,
            });
          }
        }
      }

      if (telemetryBatch.length > 0) {
        enqueueTelemetry(telemetryBatch);
      }
    } catch (err) {
      console.error('Error in simulation tick:', err);
    }
  }, 5000); // Check/tick every 5 seconds
}

export function stopSimulationLoop() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log('Background telemetry simulator stopped.');
  }
}
