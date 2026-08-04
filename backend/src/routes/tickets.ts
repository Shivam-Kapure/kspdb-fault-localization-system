import { Router, Request, Response } from 'express';
import { pool } from '../db/init';

const router = Router();

// Get all tickets
router.get('/', async (req: Request, res: Response) => {
  try {
    const tickets = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(tickets.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update ticket status
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }

  try {
    // If attempting to resolve/close manually:
    // We should check downstream telemetry (Phase 7 rule)
    if (status === 'resolved' || status === 'closed' || status === 'verified') {
      // Load ticket details
      const tktRes = await pool.query('SELECT type, target_id, span_end_pole_id FROM tickets WHERE id = $1', [id]);
      if (tktRes.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const ticket = tktRes.rows[0];

      // G4 Ticket workflow: "Block manual closure if telemetry is dark"
      // Check if there are active faults affecting this asset
      const activeFaults = await pool.query(
        'SELECT id FROM active_faults WHERE (type = $1 AND target_id = $2) OR (type = $3 AND span_end_pole_id = $4)',
        [ticket.type, ticket.target_id, ticket.type, ticket.span_end_pole_id || null]
      );

      if (activeFaults.rows.length > 0) {
        return res.status(400).json({
          error: 'CANNOT_CLOSE_DARK_ASSET',
          message: 'Telemetry indicates downstream devices are still offline. Manual closure rejected.',
        });
      }
    }

    const result = await pool.query(
      'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
