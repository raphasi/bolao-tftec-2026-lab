/**
 * Rotas de palpites especiais (S2.3 — specials).
 *  - POST  /api/specials   cria/atualiza palpite especial (campeão, top 4, artilheiro)
 *  - GET   /api/specials   lê palpite especial do usuário
 *
 * Lock rule: lock GLOBAL — lockUtc é configurado pelo admin (S2.7).
 * Quando agora >= lockUtc, todos os 5 campos ficam imutáveis.
 */
import { Router } from 'express';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { requireAuth } from '../middleware/auth.js';
import { getSpecialsLockState } from '../services/specials-lock.js';
import { appendAuditEntry } from '../services/audit.js';
import { isValidPlayerId } from '../services/players-catalog.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/http-errors.js';
import {
  SEASON,
  type SpecialPredictionDoc,
  type SpecialPredictionPublic,
} from '../types/domain.js';
import { logger } from '../config/logger.js';

const router = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// ISO code de seleção (ex: 'br', 'gb-eng') OU null
const isoOrNull = z
  .union([z.string().min(2).max(12).regex(/^[a-z0-9-]+$/i, 'iso inválido'), z.null()])
  .optional()
  .transform((v) => v ?? null);

const upsertBodySchema = z
  .object({
    champion: isoOrNull,
    runnerUp: isoOrNull,
    thirdPlace: isoOrNull,
    fourthPlace: isoOrNull,
    // Artilheiro agora é ID de jogador (ex.: 'br-vinicius-junior'), não texto livre.
    // Formato aqui; existência no catálogo é checada no handler (assíncrono).
    topScorer: z
      .union([z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'id de jogador inválido'), z.null()])
      .optional()
      .transform((v) => v ?? null),
  })
  // B1.3 fix: os 4 países do Top4 devem ser distintos (ou null).
  // Sem isso, user podia colocar Brasil em todos os 4 slots e tentar ganhar
  // 150+75+40+40+50 = 355 pts injustamente.
  .refine(
    (d) => {
      const picks = [d.champion, d.runnerUp, d.thirdPlace, d.fourthPlace].filter(
        (v): v is string => v !== null,
      );
      return new Set(picks).size === picks.length;
    },
    {
      message:
        'Os 4 países do Top 4 devem ser distintos. Você não pode escolher a mesma seleção em mais de um lugar.',
    },
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultPoints: SpecialPredictionDoc['points'] = {
  champion: 0,
  runnerUp: 0,
  thirdPlace: 0,
  fourthPlace: 0,
  topScorer: 0,
  top4Bonus: 0,
};

function toPublic(doc: SpecialPredictionDoc, locked: boolean): SpecialPredictionPublic {
  return {
    season: doc.season,
    champion: doc.champion,
    runnerUp: doc.runnerUp,
    thirdPlace: doc.thirdPlace,
    fourthPlace: doc.fourthPlace,
    topScorer: doc.topScorer,
    locked,
    points: doc.points,
    updatedAt: doc.updatedAt,
  };
}

function emptyPublic(locked: boolean): SpecialPredictionPublic {
  return {
    season: SEASON,
    champion: null,
    runnerUp: null,
    thirdPlace: null,
    fourthPlace: null,
    topScorer: null,
    locked,
    points: defaultPoints,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /api/specials
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const { locked } = await getSpecialsLockState();
  const docId = `${req.user.userId}_${SEASON}`;

  try {
    const { resource } = await container('specials')
      .item(docId, req.user.userId)
      .read<SpecialPredictionDoc>();
    if (!resource) {
      res.json({ specials: emptyPublic(locked) });
      return;
    }
    res.json({ specials: toPublic(resource, locked) });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) {
      res.json({ specials: emptyPublic(locked) });
      return;
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /api/specials  (upsert)
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const parsed = upsertBodySchema.parse(req.body);

  // Artilheiro: o id precisa existir no catálogo (anti-burla via API).
  if (parsed.topScorer && !(await isValidPlayerId(parsed.topScorer))) {
    throw new BadRequestError('Artilheiro inválido — selecione um jogador da lista.');
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Lock check (B1.4: pode ser time-based OR manual)
  const { locked, config } = await getSpecialsLockState(nowMs);
  if (locked) {
    const reason = config?.value.lockedManually === true
      ? 'Travado manualmente pelo admin.'
      : `Travado desde ${config?.value.lockUtc}.`;
    void appendAuditEntry({
      performedBy: req.user.userId,
      performedByEmail: req.user.email,
      action: 'special-rejected',
      targetType: 'special',
      targetId: String(SEASON),
      targetLabel: 'Palpites especiais',
      previousValue: null,
      newValue: parsed,
      reason,
    });
    throw new ConflictError(
      `Palpites especiais não podem ser alterados. ${reason}`,
    );
  }

  const specials = container('specials');
  const docId = `${req.user.userId}_${SEASON}`;

  // Preserva campos não enviados (merge com existente)
  let existing: SpecialPredictionDoc | null = null;
  try {
    const { resource } = await specials.item(docId, req.user.userId).read<SpecialPredictionDoc>();
    existing = resource ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  const doc: SpecialPredictionDoc = {
    id: docId,
    userId: req.user.userId,
    season: SEASON,
    champion: parsed.champion ?? existing?.champion ?? null,
    runnerUp: parsed.runnerUp ?? existing?.runnerUp ?? null,
    thirdPlace: parsed.thirdPlace ?? existing?.thirdPlace ?? null,
    fourthPlace: parsed.fourthPlace ?? existing?.fourthPlace ?? null,
    topScorer: parsed.topScorer ?? existing?.topScorer ?? null,
    lockedAt: existing?.lockedAt ?? null,
    points: existing?.points ?? defaultPoints,
    updatedAt: nowIso,
  };

  await specials.items.upsert(doc);
  logger.info(
    { userId: req.user.userId, champion: doc.champion, topScorer: doc.topScorer },
    'specials upserted',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'special-set',
    targetType: 'special',
    targetId: String(SEASON),
    targetLabel: 'Palpites especiais',
    previousValue: existing
      ? {
          champion: existing.champion,
          runnerUp: existing.runnerUp,
          thirdPlace: existing.thirdPlace,
          fourthPlace: existing.fourthPlace,
          topScorer: existing.topScorer,
        }
      : null,
    newValue: parsed,
  });

  res.status(201).json({ specials: toPublic(doc, false) });
});

export { router as specialsRouter };
