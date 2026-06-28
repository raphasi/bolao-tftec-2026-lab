/**
 * Rotas de palpites de jogos (S2.3 — predictions).
 *  - POST   /api/predictions          cria/atualiza palpite (se !locked)
 *  - GET    /api/predictions          lista palpites do usuário logado
 *  - GET    /api/predictions/:matchId 1 palpite (se existir)
 *  - DELETE /api/predictions/:matchId remove palpite (se !locked)
 *
 * Lock rule: isLocked = now >= match.kickoffUtc - 30min.
 * Quando locked, palpite vira imutável (lockedAt setado, retornos 409 em
 * tentativas de mudança).
 *
 * Pontuação fica null até o jogo terminar e a Function de cálculo rodar.
 */
import { Router } from 'express';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { requireAuth } from '../middleware/auth.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/http-errors.js';
import {
  type MatchCacheDoc,
  type PredictionDoc,
  type PredictionPublic,
} from '../types/domain.js';
import { computeMatchLocked, isTimeBasedLockActive } from '../services/match-lock.js';
import { readPhaseWindowsConfig, isPredictionOpen } from '../services/phase-windows.js';
import { appendAuditEntry } from '../services/audit.js';
import { logger } from '../config/logger.js';

/** Formata uma data ISO em DD/MM HH:mm BRT (UTC-3) para mensagens. */
function fmtBrt(iso: string): string {
  const d = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const router = Router();

// Todas as rotas exigem auth
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * S6.3: usa match doc completo pra respeitar lock manual do admin.
 * Para PredictionPublic.locked (resposta), só temos kickoffUtc — usamos time-based.
 */
function toPublic(doc: PredictionDoc, nowMs: number = Date.now()): PredictionPublic {
  // Lock visual no PredictionPublic é time-based + lockedAt freeze
  // (não consulta MatchCacheDoc pra evitar query extra por palpite).
  // Admin lock manual ainda é enforced em POST/DELETE via match doc.
  const kickoffMs = Date.parse(doc.kickoffUtc);
  const timeLocked = Number.isFinite(kickoffMs) && nowMs >= kickoffMs - 30 * 60 * 1000;
  return {
    matchId: doc.matchId,
    groupCode: doc.groupCode,
    homeTeam: doc.homeTeam,
    awayTeam: doc.awayTeam,
    kickoffUtc: doc.kickoffUtc,
    predictedHome: doc.predictedHome,
    predictedAway: doc.predictedAway,
    actualHome: doc.actualHome,
    actualAway: doc.actualAway,
    points: doc.points,
    locked: Boolean(doc.lockedAt) || timeLocked,
    updatedAt: doc.updatedAt,
  };
}

async function findMatch(matchId: number): Promise<MatchCacheDoc | null> {
  const { resources } = await container('matchesCache')
    .items.query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const upsertBodySchema = z.object({
  matchId: z.number().int().min(1).max(200),
  predictedHome: z.number().int().min(0).max(20),
  predictedAway: z.number().int().min(0).max(20),
});

const matchIdParamSchema = z.object({
  matchId: z
    .string()
    .regex(/^\d+$/, 'matchId deve ser numérico')
    .transform((s) => parseInt(s, 10))
    .refine((n) => n >= 1 && n <= 200, 'matchId fora de range'),
});

// ---------------------------------------------------------------------------
// POST /api/predictions  (upsert)
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const { matchId, predictedHome, predictedAway } = upsertBodySchema.parse(req.body);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1. Validar que o jogo existe
  const match = await findMatch(matchId);
  if (!match) {
    throw new NotFoundError(`Jogo ${matchId} não encontrado`);
  }

  // 2. Validar janela de fase — fase de mata-mata só abre na data configurada
  const matchLabel = `${match.homeTeam} x ${match.awayTeam}`;
  const windows = (await readPhaseWindowsConfig())?.value ?? null;
  const { open, opensUtc } = isPredictionOpen(match, windows, nowMs);
  if (!open) {
    void appendAuditEntry({
      performedBy: req.user.userId,
      performedByEmail: req.user.email,
      action: 'prediction-rejected',
      targetType: 'prediction',
      targetId: String(matchId),
      targetLabel: matchLabel,
      previousValue: null,
      newValue: { predictedHome, predictedAway },
      reason: `fase ainda não aberta${opensUtc ? ` (libera ${fmtBrt(opensUtc)})` : ''}`,
    });
    throw new ConflictError(
      `Os palpites desta fase ainda não abriram${opensUtc ? ` — liberam em ${fmtBrt(opensUtc)}` : ''}.`,
    );
  }

  // 3. Validar lock — respeita manual lock do admin + time-based
  if (computeMatchLocked(match, nowMs)) {
    const reason = match.status === 'finished'
      ? 'já finalizado'
      : match.lockedManually === true && !isTimeBasedLockActive(match, nowMs)
        ? 'travado manualmente pelo administrador'
        : `inicia em menos de 30min (kickoff: ${match.kickoffUtc})`;
    void appendAuditEntry({
      performedBy: req.user.userId,
      performedByEmail: req.user.email,
      action: 'prediction-rejected',
      targetType: 'prediction',
      targetId: String(matchId),
      targetLabel: matchLabel,
      previousValue: null,
      newValue: { predictedHome, predictedAway },
      reason: `jogo ${reason}`,
    });
    throw new ConflictError(`Palpite travado: jogo ${matchId} ${reason}`);
  }

  // 3. Upsert
  const predictions = container('predictions');
  const docId = `${req.user.userId}_${matchId}`;

  // Tenta ler existente pra preservar createdAt + capturar valor anterior (audit)
  let createdAt = nowIso;
  let previousPrediction: { predictedHome: number; predictedAway: number } | null = null;
  try {
    const { resource: existing } = await predictions
      .item(docId, req.user.userId)
      .read<PredictionDoc>();
    if (existing) {
      // Defesa em profundidade: se ficou marcado lockedAt no passado, recusa
      if (existing.lockedAt) {
        throw new ConflictError('Palpite já foi congelado, não pode mais ser alterado');
      }
      createdAt = existing.createdAt;
      previousPrediction = {
        predictedHome: existing.predictedHome,
        predictedAway: existing.predictedAway,
      };
    }
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  const doc: PredictionDoc = {
    id: docId,
    userId: req.user.userId,
    matchId,
    groupCode: match.groupCode,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffUtc: match.kickoffUtc,
    predictedHome,
    predictedAway,
    actualHome: null,
    actualAway: null,
    points: null,
    lockedAt: null,
    createdAt,
    updatedAt: nowIso,
  };

  await predictions.items.upsert(doc);
  logger.info(
    { userId: req.user.userId, matchId, predictedHome, predictedAway },
    'prediction upserted',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'prediction-set',
    targetType: 'prediction',
    targetId: String(matchId),
    targetLabel: matchLabel,
    previousValue: previousPrediction,
    newValue: { predictedHome, predictedAway },
  });

  res.status(201).json({ prediction: toPublic(doc, nowMs) });
});

// ---------------------------------------------------------------------------
// GET /api/predictions  (lista do usuário)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const { resources } = await container('predictions')
    .items.query<PredictionDoc>({
      query: 'SELECT * FROM c WHERE c.userId = @uid ORDER BY c.kickoffUtc',
      parameters: [{ name: '@uid', value: req.user.userId }],
    })
    .fetchAll();

  const nowMs = Date.now();
  res.json({
    predictions: resources.map((d) => toPublic(d, nowMs)),
    count: resources.length,
  });
});

// ---------------------------------------------------------------------------
// GET /api/predictions/user/:userId/finished  (S7.2 — transparência)
// Retorna palpites de outro usuário APENAS para jogos já finalizados+pontuados.
// Acesso: qualquer user autenticado pode ver palpites finalizados de qualquer outro.
// ---------------------------------------------------------------------------
const userIdParamSchema = z.object({
  userId: z.string().uuid('userId deve ser UUID'),
});

router.get('/user/:userId/finished', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParamSchema.parse(req.params);

  // Filtra por points != null = match foi finalizado E pontos foram calculados.
  // Single source of truth — não precisa join com matchesCache.
  const { resources } = await container('predictions')
    .items.query<PredictionDoc>({
      query:
        'SELECT * FROM c WHERE c.userId = @uid AND c.points != null ORDER BY c.kickoffUtc DESC',
      parameters: [{ name: '@uid', value: userId }],
    })
    .fetchAll();

  const nowMs = Date.now();
  res.json({
    predictions: resources.map((d) => toPublic(d, nowMs)),
    count: resources.length,
  });
});

// ---------------------------------------------------------------------------
// GET /api/predictions/:matchId  (1 palpite específico)
// ---------------------------------------------------------------------------
router.get('/:matchId', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const { matchId } = matchIdParamSchema.parse(req.params);
  const docId = `${req.user.userId}_${matchId}`;

  try {
    const { resource } = await container('predictions')
      .item(docId, req.user.userId)
      .read<PredictionDoc>();
    if (!resource) {
      throw new NotFoundError(`Palpite para jogo ${matchId} não existe`);
    }
    res.json({ prediction: toPublic(resource) });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) {
      throw new NotFoundError(`Palpite para jogo ${matchId} não existe`);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/predictions/:matchId
// ---------------------------------------------------------------------------
router.delete('/:matchId', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const { matchId } = matchIdParamSchema.parse(req.params);
  const docId = `${req.user.userId}_${matchId}`;

  // Lê pra checar lock antes de deletar
  let doc: PredictionDoc | null = null;
  try {
    const { resource } = await container('predictions')
      .item(docId, req.user.userId)
      .read<PredictionDoc>();
    doc = resource ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  if (!doc) {
    throw new NotFoundError(`Palpite para jogo ${matchId} não existe`);
  }
  // S6.3: respeita admin manual lock também (busca match doc atual)
  const match = await findMatch(matchId);
  if (doc.lockedAt || (match && computeMatchLocked(match))) {
    throw new ConflictError(`Palpite travado: jogo ${matchId} não pode mais ser apagado`);
  }

  await container('predictions').item(docId, req.user.userId).delete();
  logger.info({ userId: req.user.userId, matchId }, 'prediction deleted');

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'prediction-delete',
    targetType: 'prediction',
    targetId: String(matchId),
    targetLabel: `${doc.homeTeam} x ${doc.awayTeam}`,
    previousValue: { predictedHome: doc.predictedHome, predictedAway: doc.predictedAway },
    newValue: null,
  });

  res.status(204).send();
});

export { router as predictionsRouter };
