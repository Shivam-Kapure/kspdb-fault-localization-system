import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgres://griduser:gridpassword@db:5432/gridguard';
export const pool = new Pool({
  connectionString: dbUrl,
});

const schemaSQL = `
  CREATE TABLE IF NOT EXISTS substations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feeders (
    id VARCHAR(50) PRIMARY KEY,
    substation_id VARCHAR(50) REFERENCES substations(id),
    name VARCHAR(100) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transformers (
    id VARCHAR(50) PRIMARY KEY,
    feeder_id VARCHAR(50) REFERENCES feeders(id),
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    capacity_kva INT NOT NULL,
    households_served INT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poles (
    id VARCHAR(50) PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    feeder_id VARCHAR(50) REFERENCES feeders(id),
    dt_id VARCHAR(50) REFERENCES transformers(id),
    seq_on_line INT,
    parent_pole_id VARCHAR(50),
    pole_type VARCHAR(50) NOT NULL,
    ward VARCHAR(50) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    device_id VARCHAR(50) UNIQUE
  );

  CREATE TABLE IF NOT EXISTS telemetry_logs (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    pole_id VARCHAR(50) NOT NULL,
    event VARCHAR(50) NOT NULL,
    energized BOOLEAN NOT NULL,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    seq INT NOT NULL,
    battery_mv INT NOT NULL,
    rssi INT NOT NULL,
    fw VARCHAR(20) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_telemetry UNIQUE (device_id, ts, seq)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(50) PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'span', 'dt', 'feeder'
    target_id VARCHAR(50) NOT NULL, -- pole_id, dt_id, or feeder_id
    span_start_pole_id VARCHAR(50),
    span_end_pole_id VARCHAR(50),
    coordinates VARCHAR(100) NOT NULL, -- "lat,lon"
    pincode VARCHAR(10) NOT NULL,
    downstream_poles_count INT NOT NULL,
    confidence INT NOT NULL,
    rationale TEXT NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'detected', 'acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_faults (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'span', 'dt', 'feeder'
    target_id VARCHAR(50) NOT NULL, -- pole_id, dt_id, or feeder_id
    span_end_pole_id VARCHAR(50), -- only for span faults
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS scheduled_outages (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'dt', 'feeder', 'pole'
    target_id VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL
  );
`;

export async function initDb() {
  console.log('Connecting to database...');
  await pool.query(schemaSQL);
  console.log('Database tables verified/created.');

  // Check if we need to seed
  const countRes = await pool.query('SELECT COUNT(*) FROM poles');
  const count = parseInt(countRes.rows[0].count, 10);
  if (count === 0) {
    console.log('Database empty. Seeding synthetic KSPDB network...');
    await seedDatabase();
  } else {
    console.log(`Database already has ${count} poles. Skipping seed.`);
  }
}

async function seedDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Substations (4 substations, matching brief scale)
    const substations = [
      { id: 'S-01', name: 'Hebbal Substation', lat: 13.0354, lon: 77.5988 },
      { id: 'S-02', name: 'Jayanagar Substation', lat: 12.9307, lon: 77.5838 },
      { id: 'S-03', name: 'Indiranagar Substation', lat: 12.9719, lon: 77.6412 },
      { id: 'S-04', name: 'Whitefield Substation', lat: 12.9698, lon: 77.7500 },
    ];

    for (const sub of substations) {
      await client.query(
        'INSERT INTO substations (id, name, lat, lon) VALUES ($1, $2, $3, $4)',
        [sub.id, sub.name, sub.lat, sub.lon]
      );
    }
    console.log('Seeded substations.');

    // 2. Seed Feeders (8 feeders total for our dev subset)
    const feeders = [
      { id: 'F-01-01', substation_id: 'S-01', name: 'Feeder Hebbal Main' },
      { id: 'F-01-02', substation_id: 'S-01', name: 'Feeder RT Nagar' },
      { id: 'F-02-01', substation_id: 'S-02', name: 'Feeder JP Nagar' },
      { id: 'F-02-02', substation_id: 'S-02', name: 'Feeder Jayanagar 4th T' },
      { id: 'F-03-01', substation_id: 'S-03', name: 'Feeder Halasuru' },
      { id: 'F-03-02', substation_id: 'S-03', name: 'Feeder Indiranagar 100ft' },
      { id: 'F-04-01', substation_id: 'S-04', name: 'Feeder ITPL' },
      { id: 'F-04-02', substation_id: 'S-04', name: 'Feeder Kadugodi' },
    ];

    for (const feed of feeders) {
      await client.query(
        'INSERT INTO feeders (id, substation_id, name) VALUES ($1, $2, $3)',
        [feed.id, feed.substation_id, feed.name]
      );
    }
    console.log('Seeded feeders.');

    // 3. Seed Transformers (DTs)
    // We want around 40 DTs (5 under each feeder)
    const dts: { id: string; feeder_id: string; lat: number; lon: number; capacity_kva: number; households_served: number }[] = [];
    let dtIndex = 1;

    for (const feed of feeders) {
      // Base coordinates around the parent substation
      const parentSub = substations.find(s => s.id === feed.substation_id)!;
      for (let d = 1; d <= 5; d++) {
        const id = `DT-${dtIndex.toString().padStart(4, '0')}`;
        // Jitter coordinate by ~500m
        const lat = parentSub.lat + (Math.random() - 0.5) * 0.01;
        const lon = parentSub.lon + (Math.random() - 0.5) * 0.01;
        const capacity_kva = [100, 250, 400][Math.floor(Math.random() * 3)];
        const households_served = Math.floor(capacity_kva * 1.2 + Math.random() * 50);

        dts.push({ id, feeder_id: feed.id, lat, lon, capacity_kva, households_served });
        dtIndex++;
      }
    }

    for (const dt of dts) {
      await client.query(
        'INSERT INTO transformers (id, feeder_id, lat, lon, capacity_kva, households_served) VALUES ($1, $2, $3, $4, $5, $6)',
        [dt.id, dt.feeder_id, dt.lat, dt.lon, dt.capacity_kva, dt.households_served]
      );
    }
    console.log(`Seeded ${dts.length} transformers.`);

    // 4. Seed Poles
    // For each DT, we generate a tree structure of poles.
    // 60% of DTs have NO topology (seq_on_line and parent_pole_id are null).
    // 40% of DTs have complete topology.
    // 9% of poles have no device_id.
    let poleCount = 0;
    let deviceCount = 1;

    for (let i = 0; i < dts.length; i++) {
      const dt = dts[i];
      const isMissingTopology = i < Math.floor(dts.length * 0.6); // 60% missing topology
      const numPoles = 20 + Math.floor(Math.random() * 35); // 20 to 55 poles per DT

      // Generate a radial line of poles
      // Start at DT position
      let currentLat = dt.lat;
      let currentLon = dt.lon;

      // We will model the poles as a main line with optional spurs (branches)
      const polesList: {
        id: string;
        lat: number;
        lon: number;
        feeder_id: string;
        dt_id: string;
        seq_on_line: number | null;
        parent_pole_id: string | null;
        pole_type: string;
        ward: string;
        pincode: string;
        device_id: string | null;
      }[] = [];

      // Main line poles
      const mainLineLength = Math.floor(numPoles * 0.6);
      const spurLength = numPoles - mainLineLength;

      // Bearing for main line (random)
      const bearing = Math.random() * Math.PI * 2;
      const stepDist = 0.0003; // ~30m steps

      for (let p = 1; p <= mainLineLength; p++) {
        const poleId = `P-${dt.id.replace('DT-', '')}-${p.toString().padStart(3, '0')}`;
        currentLat += Math.sin(bearing) * stepDist + (Math.random() - 0.5) * 0.00005;
        currentLon += Math.cos(bearing) * stepDist + (Math.random() - 0.5) * 0.00005;

        // 9% chance of no device
        const hasDevice = Math.random() > 0.09;
        const deviceId = hasDevice ? `KSPDB-DEV-${deviceCount.toString().padStart(5, '0')}` : null;
        if (hasDevice) deviceCount++;

        polesList.push({
          id: poleId,
          lat: currentLat,
          lon: currentLon,
          feeder_id: dt.feeder_id,
          dt_id: dt.id,
          seq_on_line: isMissingTopology ? null : p,
          parent_pole_id: isMissingTopology ? null : (p === 1 ? null : polesList[p - 2].id),
          pole_type: 'LT-9m-PCC',
          ward: 'W-084',
          pincode: '560078',
          device_id: deviceId,
        });
        poleCount++;
      }

      // Add a couple of spurs off the main line
      let spurPoleIdx = 1;
      const numSpurs = 2;
      const spurSize = Math.floor(spurLength / numSpurs);

      for (let s = 1; s <= numSpurs; s++) {
        // Pick a random junction pole from main line (excluding last few)
        const junctionIndex = Math.floor(Math.random() * (mainLineLength - 5)) + 1;
        if (junctionIndex < 0 || junctionIndex >= polesList.length) continue;
        const junctionPole = polesList[junctionIndex];
        
        let spurLat = junctionPole.lat;
        let spurLon = junctionPole.lon;
        // Spur bearing is roughly perpendicular
        const spurBearing = bearing + Math.PI / 2 + (Math.random() - 0.5) * 0.5;

        for (let sp = 1; sp <= spurSize; sp++) {
          const poleId = `P-${dt.id.replace('DT-', '')}-S${s}-${sp.toString().padStart(2, '0')}`;
          spurLat += Math.sin(spurBearing) * stepDist + (Math.random() - 0.5) * 0.00005;
          spurLon += Math.cos(spurBearing) * stepDist + (Math.random() - 0.5) * 0.00005;

          const hasDevice = Math.random() > 0.09;
          const deviceId = hasDevice ? `KSPDB-DEV-${deviceCount.toString().padStart(5, '0')}` : null;
          if (hasDevice) deviceCount++;

          const parentId = sp === 1 ? junctionPole.id : polesList[polesList.length - 1].id;

          polesList.push({
            id: poleId,
            lat: spurLat,
            lon: spurLon,
            feeder_id: dt.feeder_id,
            dt_id: dt.id,
            // For spurs, we still give incrementing sequence if topology is known
            seq_on_line: isMissingTopology ? null : (junctionPole.seq_on_line || 1) + sp,
            parent_pole_id: isMissingTopology ? null : parentId,
            pole_type: 'LT-8m-Steel',
            ward: 'W-084',
            pincode: '560078',
            device_id: deviceId,
          });
          poleCount++;
          spurPoleIdx++;
        }
      }

      // Insert all poles for this DT
      for (const p of polesList) {
        await client.query(
          `INSERT INTO poles (id, lat, lon, feeder_id, dt_id, seq_on_line, parent_pole_id, pole_type, ward, pincode, device_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [p.id, p.lat, p.lon, p.feeder_id, p.dt_id, p.seq_on_line, p.parent_pole_id, p.pole_type, p.ward, p.pincode, p.device_id]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Seeded ${poleCount} poles successfully. Network seeded completely.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding database, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
