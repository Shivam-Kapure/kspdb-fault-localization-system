import { Router, Request, Response } from 'express';
import { injectFault, clearFault, getDarkPolesGroundTruth, getActiveScheduledOutages } from '../services/simulatorService';
import { pool } from '../db/init';

const router = Router();

// Inject a network fault
router.post('/inject', async (req: Request, res: Response) => {
  const { type, target_id, span_end_pole_id } = req.body;

  if (!type || !target_id) {
    return res.status(400).json({ error: 'Missing type or target_id' });
  }

  try {
    const faultId = await injectFault(type, target_id, span_end_pole_id);
    res.json({ status: 'SUCCESS', fault_id: faultId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear a network fault
router.post('/clear', async (req: Request, res: Response) => {
  const { fault_id } = req.body;

  if (fault_id === undefined) {
    return res.status(400).json({ error: 'Missing fault_id' });
  }

  try {
    const success = await clearFault(Number(fault_id));
    if (success) {
      res.json({ status: 'SUCCESS' });
    } else {
      res.status(404).json({ error: 'Fault not found or already cleared' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current simulator state
router.get('/state', async (req: Request, res: Response) => {
  try {
    const activeFaultsRes = await pool.query('SELECT * FROM active_faults ORDER BY created_at DESC');
    const scheduledOutagesRes = await pool.query('SELECT * FROM scheduled_outages ORDER BY start_time DESC');
    const darkPoles = await getDarkPolesGroundTruth();

    res.json({
      active_faults: activeFaultsRes.rows,
      scheduled_outages: scheduledOutagesRes.rows,
      dark_poles_count: darkPoles.size,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a scheduled outage
router.post('/outage', async (req: Request, res: Response) => {
  const { type, target_id, start_time, end_time } = req.body;

  if (!type || !target_id || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required outage fields' });
  }

  try {
    await pool.query(
      'INSERT INTO scheduled_outages (type, target_id, start_time, end_time) VALUES ($1, $2, $3, $4)',
      [type, target_id, start_time, end_time]
    );
    res.json({ status: 'SUCCESS' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of all network assets (Substations, Feeders, DTs, Poles)
router.get('/assets', async (req: Request, res: Response) => {
  try {
    const substations = await pool.query('SELECT * FROM substations ORDER BY id');
    const feeders = await pool.query('SELECT * FROM feeders ORDER BY id');
    const dts = await pool.query('SELECT * FROM transformers ORDER BY id');
    const poles = await pool.query('SELECT * FROM poles ORDER BY id');

    res.json({
      substations: substations.rows,
      feeders: feeders.rows,
      transformers: dts.rows,
      poles: poles.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
