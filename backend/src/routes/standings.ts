/**
 * Rota pública GET /api/standings — Tabela da Copa (classificação dos grupos).
 *
 * Lê só os jogos `phase='group'` da matches-cache, roda o motor de classificação
 * (standings.ts) via serializer público e devolve as 12 tabelas + 8 melhores 3º,
 * com a flag de qualificação por seleção. Somente leitura, sem auth.
 */
import { Router } from 'express';
import { container } from '../services/cosmos.js';
import { buildStandingsResponse } from '../services/standings-public.js';
import type { MatchCacheDoc } from '../types/domain.js';

const router = Router();

// GET /api/standings  (público — não exige auth)
router.get('/', async (_req, res) => {
  const { resources } = await container('matchesCache')
    .items.query<MatchCacheDoc>({
      query: 'SELECT * FROM c WHERE c.phase = @phase',
      parameters: [{ name: '@phase', value: 'group' }],
    })
    .fetchAll();

  const body = buildStandingsResponse(resources, new Date().toISOString());
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json(body);
});

export { router as standingsRouter };
