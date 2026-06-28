/**
 * Rotas de leaderboard.
 *  - GET /api/leaderboard                     (S3.4 público) ranking ordenado
 *  - GET /api/leaderboard/:userId/specials    (B3.1) breakdown dos pontos de especiais de um user
 *
 * Dados consumidos do container 'leaderboard' (agregado pela Function S3.3).
 */
import { Router } from 'express';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { requireAuth } from '../middleware/auth.js';
import { rankLeaderboard } from '../services/leaderboard-rank.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/http-errors.js';
import {
  SEASON,
  type LeaderboardDocument,
  type SpecialPredictionDoc,
  type TournamentFinalConfigDoc,
} from '../types/domain.js';

const router = Router();

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  totalPoints: number;
  matchPoints: number;
  specialPoints: number;
  predictionsCount: number;
  pendingCount: number;
  perfectScores: number;
  rank: number;
}

router.get('/', async (_req, res) => {
  const leaderboard = container('leaderboard');

  const { resources } = await leaderboard.items
    .query<LeaderboardDocument>({
      query: 'SELECT * FROM c WHERE c.season = @season',
      parameters: [{ name: '@season', value: SEASON }],
    })
    .fetchAll();

  // Ordenação com critérios oficiais de desempate (ver leaderboard-rank.ts):
  // totalPoints DESC → perfectScores DESC → createdAt ASC → userId ASC.
  // NÃO confiar na ordem do Cosmos: empates ficariam em ordem arbitrária.
  const ordered = rankLeaderboard(resources);

  // rank 1-indexed
  const ranking: LeaderboardEntry[] = ordered.map((doc, idx) => ({
    userId: doc.userId,
    userName: doc.userName,
    totalPoints: doc.totalPoints,
    matchPoints: doc.matchPoints,
    specialPoints: doc.specialPoints,
    predictionsCount: doc.predictionsCount,
    pendingCount: doc.pendingCount ?? 0,
    perfectScores: doc.perfectScores,
    rank: idx + 1,
  }));

  const lastUpdated = resources.reduce<string | null>((latest, doc) => {
    if (!latest) return doc.lastUpdated;
    return doc.lastUpdated > latest ? doc.lastUpdated : latest;
  }, null);

  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json({ ranking, count: ranking.length, lastUpdated });
});

// ===========================================================================
// B3.1: GET /api/leaderboard/:userId/specials — breakdown dos pontos de especiais
// ===========================================================================
//
// Privacidade: picks só ficam visíveis para terceiros depois que a trava de
// especiais ativar (time-based OU manual). O próprio user e admins veem sempre.

export interface SpecialsBreakdown {
  userId: string;
  picks: {
    champion: string | null;
    runnerUp: string | null;
    thirdPlace: string | null;
    fourthPlace: string | null;
    topScorer: string | null;
  };
  actuals: {
    champion: string;
    runnerUp: string;
    thirdPlace: string;
    fourthPlace: string;
    topScorer: string;
  } | null;
  points: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    topScorer: number;
    top4Bonus: number;
    total: number;
  };
  hasPicks: boolean;
}

const userIdParamSchema = z.object({
  userId: z.string().uuid('userId deve ser UUID'),
});

router.get('/:userId/specials', requireAuth, async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParamSchema.parse(req.params);

  const isSelf = req.user.userId === userId;

  // 'tournament-final' só é setado quando a Copa termina (admin lança os resultados
  // oficiais) — é o sinal de "Copa finalizada".
  let tournamentFinal: TournamentFinalConfigDoc['value'] | null = null;
  try {
    const { resource } = await container('config')
      .item('tournament-final', 'global')
      .read<TournamentFinalConfigDoc>();
    tournamentFinal = resource?.value ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  // Privacidade: os palpites especiais de OUTROS usuários (campeão/top4/artilheiro)
  // só ficam visíveis APÓS O TÉRMINO DA COPA — senão alguém poderia copiar o especial
  // alheio. (Os palpites de jogo não têm esse problema: revelam por jogo, após cada
  // partida.) Vale INCLUSIVE para admin, pra não vazar ao projetar o leaderboard na sala.
  if (!isSelf && !tournamentFinal) {
    throw new ForbiddenError(
      'Palpites especiais de outros usuários só ficam visíveis após o término da Copa.',
    );
  }

  const specialsDocId = `${userId}_${SEASON}`;
  let specialDoc: SpecialPredictionDoc | null = null;
  try {
    const { resource } = await container('specials')
      .item(specialsDocId, userId)
      .read<SpecialPredictionDoc>();
    specialDoc = resource ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  // Confirma que userId existe (via leaderboard doc) — evita expor inexistentes.
  if (!specialDoc) {
    const { resources } = await container('leaderboard')
      .items.query<LeaderboardDocument>({
        query: 'SELECT TOP 1 c.userId FROM c WHERE c.userId = @uid AND c.season = @season',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@season', value: SEASON },
        ],
      })
      .fetchAll();
    if (resources.length === 0) {
      throw new NotFoundError(`Usuário ${userId} não encontrado.`);
    }
  }

  const points = specialDoc?.points ?? {
    champion: 0,
    runnerUp: 0,
    thirdPlace: 0,
    fourthPlace: 0,
    topScorer: 0,
    top4Bonus: 0,
  };

  const breakdown: SpecialsBreakdown = {
    userId,
    picks: {
      champion: specialDoc?.champion ?? null,
      runnerUp: specialDoc?.runnerUp ?? null,
      thirdPlace: specialDoc?.thirdPlace ?? null,
      fourthPlace: specialDoc?.fourthPlace ?? null,
      topScorer: specialDoc?.topScorer ?? null,
    },
    actuals: tournamentFinal
      ? {
          champion: tournamentFinal.champion,
          runnerUp: tournamentFinal.runnerUp,
          thirdPlace: tournamentFinal.thirdPlace,
          fourthPlace: tournamentFinal.fourthPlace,
          topScorer: tournamentFinal.topScorer,
        }
      : null,
    points: {
      ...points,
      total:
        points.champion +
        points.runnerUp +
        points.thirdPlace +
        points.fourthPlace +
        points.topScorer +
        points.top4Bonus,
    },
    hasPicks: !!specialDoc,
  };

  res.json(breakdown);
});

export { router as leaderboardRouter };
