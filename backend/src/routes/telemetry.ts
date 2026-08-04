import { Router, Request, Response } from 'express';
import { enqueueTelemetry, TelemetryPayload } from '../services/telemetryProcessor';

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

export default router;
