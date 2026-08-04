import { Router, Request, Response } from 'express';
import { enqueueTelemetry, TelemetryPayload } from '../services/telemetryProcessor';
import { pool } from '../db/init';

const router = Router();

// Ingestion Endpoint: Accept telemetry logs from devices or simulator
router.post('/', (req: Request, res: Response) => {
  const body = req.body;
  
  if (!body) {
    return res.status(400).json({ error: 'Missing telemetry payload' });
  }

  // Enqueue to batch processor for asynchronous db saving
  enqueueTelemetry(body as TelemetryPayload | TelemetryPayload[]);

  // Instantly return 202 Accepted to minimize telemetry uplink latency
  res.status(202).json({ status: 'ACCEPTED' });
});

// Fetch recent telemetry logs for scrolling terminal in operator console
router.get('/', async (req: Request, res: Response) => {
  try {
    const logs = await pool.query('SELECT * FROM telemetry_logs ORDER BY ts DESC LIMIT 50');
    res.json(logs.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
