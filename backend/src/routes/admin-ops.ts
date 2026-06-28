/**
 * Admin Ops API (S8.2) — live event dashboard.
 *  - GET /api/admin/ops/live — 4 sinais real-time, cache 10s
 *
 * Requer requireAuth + requireAdmin (já aplicados no parent router /admin).
 */
import { Router } from 'express';
import { getOpsLive } from '../services/ops-live.js';

const router = Router();

router.get('/live', async (_req, res) => {
  const data = await getOpsLive();
  res.json(data);
});

export { router as adminOpsRouter };
