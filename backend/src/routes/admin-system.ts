/**
 * Admin System API (S4.5.2).
 *  - GET  /api/admin/system/stats                     — KPIs agregados + status infra
 *  - POST /api/admin/system/cache/invalidate-active   — flush manual cache de active
 *
 * Requer requireAuth + requireAdmin (já aplicados no parent router /admin).
 */
import { Router } from 'express';
import { z } from 'zod';
import { getSystemStats } from '../services/system-stats.js';
import { invalidateUserActive } from '../middleware/auth.js';
import { logger } from '../config/logger.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  const stats = await getSystemStats();
  res.json(stats);
});

const invalidateBodySchema = z.object({
  userId: z.string().uuid().optional(),
});

/**
 * POST /api/admin/system/cache/invalidate-active
 *  - body: { userId?: string } — sem userId, flush full
 *  - Útil pra forçar propagação imediata após mutate de active fora do fluxo padrão
 */
router.post('/cache/invalidate-active', (req, res) => {
  const { userId } = invalidateBodySchema.parse(req.body ?? {});
  invalidateUserActive(userId);
  logger.info({ adminId: req.user?.userId, targetUserId: userId ?? 'ALL' }, 'admin invalidated active cache');
  res.json({ ok: true, scope: userId ?? 'all' });
});

export { router as adminSystemRouter };
