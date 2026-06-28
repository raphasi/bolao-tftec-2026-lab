/**
 * Rotas públicas de configuração (S2.7 — read-only).
 *  - GET /api/config/specials-lock  qualquer usuário logado pode ler
 *
 * Retorna apenas { lockUtc, locked, description? } — sem metadados de admin.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSpecialsLockState } from '../services/specials-lock.js';
import type { SpecialsLockPublic } from '../types/domain.js';

const router = Router();

router.get('/specials-lock', requireAuth, async (_req, res) => {
  const { config, locked, lockUtc } = await getSpecialsLockState();

  const payload: SpecialsLockPublic = {
    lockUtc,
    locked,
    description: config?.value.description,
  };

  res.json(payload);
});

export { router as configRouter };
