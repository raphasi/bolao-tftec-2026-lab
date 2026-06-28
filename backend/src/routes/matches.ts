/**
 * Rotas de matches (S2.2 — API matches).
 *  - GET /api/matches       lista 72 jogos da fase de grupos (locked: bool)
 *  - GET /api/matches/:id   1 jogo individual
 *
 * Dados servidos do container Cosmos 'matches-cache' (populado por scripts/seed-cosmos.ts).
 * Campo `locked` é computado: now >= kickoffUtc - 30min.
 */
import { Router } from 'express';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { NotFoundError } from '../utils/http-errors.js';
import { computeMatchLocked } from '../services/match-lock.js';
import { readPhaseWindowsConfig, isPredictionOpen, type PhaseWindows } from '../services/phase-windows.js';
import {
  type MatchCacheDoc,
  type MatchPublic,
} from '../types/domain.js';

const router = Router();

function toPublic(doc: MatchCacheDoc, nowMs: number, windows: PhaseWindows | null): MatchPublic {
  const { open, opensUtc } = isPredictionOpen(doc, windows, nowMs);
  return {
    matchId: doc.matchId,
    groupCode: doc.groupCode,
    phase: doc.phase,
    homeTeam: doc.homeTeam,
    homeFlag: doc.homeFlag,
    awayTeam: doc.awayTeam,
    awayFlag: doc.awayFlag,
    kickoffUtc: doc.kickoffUtc,
    venue: doc.venue,
    homeScore: doc.homeScore,
    awayScore: doc.awayScore,
    status: doc.status,
    locked: computeMatchLocked(doc, nowMs),
    predictionsOpen: open,
    opensUtc,
  };
}

// ---------------------------------------------------------------------------
// GET /api/matches  (público — não exige auth)
// Query params:
//   ?groupCode=A   filtra por grupo
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  groupCode: z
    .string()
    .regex(/^[A-L]$/i, 'groupCode deve ser A-L')
    .optional()
    .transform((s) => s?.toUpperCase()),
});

router.get('/', async (req, res) => {
  const { groupCode } = listQuerySchema.parse(req.query);
  const matches = container('matchesCache');

  const query = groupCode
    ? {
        query: 'SELECT * FROM c WHERE c.groupCode = @gc ORDER BY c.kickoffUtc',
        parameters: [{ name: '@gc', value: groupCode }],
      }
    : { query: 'SELECT * FROM c ORDER BY c.kickoffUtc' };

  const { resources } = await matches.items.query<MatchCacheDoc>(query).fetchAll();
  const nowMs = Date.now();
  const windows = (await readPhaseWindowsConfig())?.value ?? null;
  const result = resources.map((d) => toPublic(d, nowMs, windows));

  // max-age curto: o doc embute 'locked'/'predictionsOpen' computados por request;
  // 5s evita janela em que um jogo recém-travado ainda apareça "aberto" na borda.
  res.setHeader('Cache-Control', 'public, max-age=5');
  res.json({ matches: result, count: result.length });
});

// ---------------------------------------------------------------------------
// GET /api/matches/:id  (público)
// :id é matchId numérico 1..72
// ---------------------------------------------------------------------------
const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'matchId deve ser numérico')
    .transform((s) => parseInt(s, 10))
    .refine((n) => n >= 1 && n <= 200, 'matchId fora de range'),
});

router.get('/:id', async (req, res) => {
  const { id: matchId } = idParamSchema.parse(req.params);
  const matches = container('matchesCache');

  // matchId vira id (string) mas precisa do PK pra read direto.
  // Alternativa: query cross-partition (mais lenta mas evita scan de PKs).
  const { resources } = await matches.items
    .query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();

  const doc = resources[0];
  if (!doc) {
    throw new NotFoundError(`Jogo ${matchId} não encontrado`);
  }

  const windows = (await readPhaseWindowsConfig())?.value ?? null;
  res.json({ match: toPublic(doc, Date.now(), windows) });
});

export { router as matchesRouter };
