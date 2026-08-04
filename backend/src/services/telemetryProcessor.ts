import { pool } from '../db/init';

export interface TelemetryPayload {
  device_id: string;
  event: 'heartbeat' | 'power_lost' | 'boot';
  ts: string; // ISO timestamp
  seq: number;
  battery_mv: number;
  rssi: number;
  fw: string;
}

interface DeviceMapping {
  pole_id: string;
  dt_id: string;
  feeder_id: string;
}

// Memory cache for device mappings to achieve extreme performance (> 500 msg/s)
const deviceCache = new Map<string, DeviceMapping>();
let cacheInitialized = false;

export async function initDeviceCache() {
  console.log('Initializing device-to-pole mapping cache...');
  const res = await pool.query('SELECT id, device_id, dt_id, feeder_id FROM poles WHERE device_id IS NOT NULL');
  deviceCache.clear();
  for (const row of res.rows) {
    deviceCache.set(row.device_id, {
      pole_id: row.id,
      dt_id: row.dt_id,
      feeder_id: row.feeder_id,
    });
  }
  cacheInitialized = true;
  console.log(`Cache loaded with ${deviceCache.size} devices.`);
}

// Queue for buffering incoming telemetry
let queue: TelemetryPayload[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

export function enqueueTelemetry(payloads: TelemetryPayload | TelemetryPayload[]) {
  if (!cacheInitialized) {
    // If cache is not ready, we initialize it asynchronously
    initDeviceCache().catch(err => console.error('Error loading device cache:', err));
  }

  if (Array.isArray(payloads)) {
    queue.push(...payloads);
  } else {
    queue.push(payloads);
  }

  // Trigger flush timer if not active
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushQueue, 100);
  }
}

// Custom hook to trigger fault localization algorithm (Phase 5)
let onNewTelemetryProcessed: ((deviceIds: string[]) => void) | null = null;
export function registerTelemetryHook(callback: (deviceIds: string[]) => void) {
  onNewTelemetryProcessed = callback;
}

async function flushQueue() {
  flushTimeout = null;
  if (queue.length === 0) return;

  const currentBatch = queue;
  queue = [];

  // 1. De-duplicate batch internally (keep the one with latest timestamp/sequence if duplicates exist)
  const uniqueBatchMap = new Map<string, TelemetryPayload>();
  for (const item of currentBatch) {
    const key = `${item.device_id}-${item.ts}-${item.seq}`;
    uniqueBatchMap.set(key, item);
  }
  const uniqueBatch = Array.from(uniqueBatchMap.values());

  // 2. Map devices to poles and filter out untracked devices
  const validLogs: {
    device_id: string;
    pole_id: string;
    event: string;
    energized: boolean;
    ts: string;
    seq: number;
    battery_mv: number;
    rssi: number;
    fw: string;
  }[] = [];

  const affectedDeviceIds = new Set<string>();

  for (const item of uniqueBatch) {
    const mapping = deviceCache.get(item.device_id);
    if (!mapping) {
      // Ignore packets from devices not in database (e.g. noise or unregistered)
      continue;
    }

    // Determine energized state: 'heartbeat' and 'boot' imply energized (true), 'power_lost' implies dark (false)
    const energized = item.event !== 'power_lost';
    validLogs.push({
      device_id: item.device_id,
      pole_id: mapping.pole_id,
      event: item.event,
      energized,
      ts: item.ts,
      seq: item.seq,
      battery_mv: item.battery_mv,
      rssi: item.rssi,
      fw: item.fw,
    });
    affectedDeviceIds.add(item.device_id);
  }

  if (validLogs.length === 0) return;

  // 3. Construct multi-row bulk insert SQL query
  // Example: INSERT INTO telemetry_logs (...) VALUES ($1, $2, ...), ($10, $11, ...) ON CONFLICT ON CONSTRAINT unique_telemetry DO NOTHING
  const columns = ['device_id', 'pole_id', 'event', 'energized', 'ts', 'seq', 'battery_mv', 'rssi', 'fw'];
  const values: any[] = [];
  const valuePlaceholders: string[] = [];

  let placeholderIndex = 1;
  for (const log of validLogs) {
    const rowPlaceholders: string[] = [];
    rowPlaceholders.push(`$${placeholderIndex++}`); // device_id
    values.push(log.device_id);

    rowPlaceholders.push(`$${placeholderIndex++}`); // pole_id
    values.push(log.pole_id);

    rowPlaceholders.push(`$${placeholderIndex++}`); // event
    values.push(log.event);

    rowPlaceholders.push(`$${placeholderIndex++}`); // energized
    values.push(log.energized);

    rowPlaceholders.push(`$${placeholderIndex++}`); // ts
    values.push(log.ts);

    rowPlaceholders.push(`$${placeholderIndex++}`); // seq
    values.push(log.seq);

    rowPlaceholders.push(`$${placeholderIndex++}`); // battery_mv
    values.push(log.battery_mv);

    rowPlaceholders.push(`$${placeholderIndex++}`); // rssi
    values.push(log.rssi);

    rowPlaceholders.push(`$${placeholderIndex++}`); // fw
    values.push(log.fw);

    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const queryText = `
    INSERT INTO telemetry_logs (${columns.join(', ')})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT ON CONSTRAINT unique_telemetry DO NOTHING
  `;

  try {
    await pool.query(queryText, values);
    
    // Trigger Fault Localization Engine asynchronously for affected devices
    if (onNewTelemetryProcessed && affectedDeviceIds.size > 0) {
      onNewTelemetryProcessed(Array.from(affectedDeviceIds));
    }
  } catch (err) {
    console.error('Failed to save bulk telemetry logs:', err);
  }
}
