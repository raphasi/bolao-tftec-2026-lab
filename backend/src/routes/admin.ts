/**
 * Rotas administrativas (admin-only).
 *  - GET  /api/admin/config/specials-lock     S2.7: lê config completo
 *  - PUT  /api/admin/config/specials-lock     S2.7: upsert (set lockUtc)
 *  - GET  /api/admin/matches                  S3.1: lista matches com filtros admin
 *  - PUT  /api/admin/matches/:id/result       S3.1: registra resultado (homeScore/awayScore)
 *  - GET  /api/admin/config/tournament-final  S3.3: lê resultado final do torneio
 *  - PUT  /api/admin/config/tournament-final  S3.3: registra campeão/top4/artilheiro
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { container } from '../services/cosmos.js';
import { adminUsersRouter } from './admin-users.js';
import { adminSystemRouter } from './admin-system.js';
import { adminOpsRouter } from './admin-ops.js';
import { computeMatchLocked } from '../services/match-lock.js';
import {
  readSpecialsLockConfig,
  upsertSpecialsLockConfig,
  setSpecialsLockManual,
  computeSpecialsLocked,
  isTimeBasedLocked,
} from '../services/specials-lock.js';
import {
  readPhaseWindowsConfig,
  upsertPhaseWindowsConfig,
} from '../services/phase-windows.js';
import { buildKnockoutProposal, checkR32Assignment, type BracketWarning } from '../services/bracket.js';
import { computeGroupStandings } from '../services/standings.js';
import { assertCanSetTeams, applyTeams } from '../services/match-teams.js';
import { isValidPlayerId } from '../services/players-catalog.js';
import { appendAuditEntry } from '../services/audit.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/http-errors.js';
import { logger } from '../config/logger.js';
import type {
  MatchAdmin,
  MatchCacheDoc,
  SpecialsLockConfigDoc,
  TournamentFinalConfigDoc,
} from '../types/domain.js';

const router = Router();

// Todas as rotas admin exigem auth + admin role
router.use(requireAuth, requireAdmin);

// Sub-routers S4.5+
router.use('/users', adminUsersRouter);
router.use('/system', adminSystemRouter);
router.use('/ops', adminOpsRouter);

// ===========================================================================
// S2.7: Specials Lock Config
// ===========================================================================

function serializeAdminSpecialsLock(config: SpecialsLockConfigDoc | null, nowMs: number = Date.now()) {
  if (!config) {
    return {
      lockUtc: null,
      description: null,
      updatedBy: null,
      updatedAt: null,
      locked: false,
      lockedManually: false,
      lockedManuallyAt: null,
    };
  }
  return {
    lockUtc: config.value.lockUtc,
    description: config.value.description ?? null,
    updatedBy: config.updatedBy ?? null,
    updatedAt: config.updatedAt,
    locked: computeSpecialsLocked(config, nowMs),
    lockedManually: config.value.lockedManually === true,
    lockedManuallyAt: config.value.lockedManuallyAt ?? null,
  };
}

router.get('/config/specials-lock', async (_req, res) => {
  const config = await readSpecialsLockConfig();
  res.json(serializeAdminSpecialsLock(config));
});

const putLockBodySchema = z.object({
  lockUtc: z.union([z.string().datetime({ message: 'lockUtc deve ser ISO 8601' }), z.null()]),
  description: z.string().max(200).optional(),
});

router.put('/config/specials-lock', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { lockUtc, description } = putLockBodySchema.parse(req.body);
  const nowMs = Date.now();

  if (lockUtc) {
    const lockMs = Date.parse(lockUtc);
    if (lockMs <= nowMs) {
      throw new BadRequestError(
        'lockUtc deve estar no futuro. Para destravar, envie lockUtc: null (mas apenas se ainda não travou).',
      );
    }
  }

  const current = await readSpecialsLockConfig();
  // B1.4: usa isTimeBasedLocked aqui (não computeSpecialsLocked) — admin ainda pode
  // alterar lockUtc mesmo com lock manual ativo, desde que time-based ainda não tenha disparado.
  if (current && isTimeBasedLocked(current, nowMs)) {
    throw new ConflictError(
      `Palpites especiais já estão travados (desde ${current.value.lockUtc}). Não é possível alterar lock após travar.`,
    );
  }

  const updated = await upsertSpecialsLockConfig({
    lockUtc,
    description,
    updatedBy: req.user.userId,
  });

  logger.info({ userId: req.user.userId, lockUtc }, 'admin updated specials-lock config');

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'specials-lock-set',
    targetType: 'config',
    targetId: 'specials-lock',
    targetLabel: 'Trava dos palpites especiais',
    previousValue: { lockUtc: current?.value.lockUtc ?? null },
    newValue: { lockUtc: lockUtc ?? null, description },
  });

  res.json(serializeAdminSpecialsLock(updated, nowMs));
});

// B1.4: PATCH /api/admin/config/specials-lock — toggle do lock manual (aditivo).
// Independente do lockUtc — admin pode acionar/desativar a qualquer momento.
const patchSpecialsLockBodySchema = z.object({
  manual: z.boolean(),
  reason: z.string().max(200).optional(),
});

router.patch('/config/specials-lock', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { manual, reason } = patchSpecialsLockBodySchema.parse(req.body);

  const updated = await setSpecialsLockManual({
    manual,
    updatedBy: req.user.userId,
  });

  logger.info(
    { adminId: req.user.userId, manual, reason },
    manual ? 'admin manually locked specials' : 'admin removed manual lock on specials',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'specials-lock-set',
    targetType: 'config',
    targetId: 'specials-lock',
    targetLabel: 'Trava manual dos palpites especiais',
    previousValue: null,
    newValue: { manual },
    reason,
  });

  res.json(serializeAdminSpecialsLock(updated));
});

// ---------------------------------------------------------------------------
// Feature phase-windows: datas de abertura de palpite por fase (mata-mata).
//  - GET  /api/admin/config/phase-windows
//  - PUT  /api/admin/config/phase-windows  { windows: { '<fase>': '<ISO>' , ... } }
// ---------------------------------------------------------------------------
router.get('/config/phase-windows', async (_req, res) => {
  const config = await readPhaseWindowsConfig();
  res.json({ windows: config?.value ?? {}, updatedAt: config?.updatedAt ?? null });
});

const putPhaseWindowsBodySchema = z.object({
  // Chave restrita às fases reais (MatchPhase). Sem isto, uma fase com typo
  // (ex.: 'round-of-32' digitado errado) seria aceita com 200 e silenciosamente
  // nunca aplicada por isPredictionOpen — agora retorna 400.
  windows: z.record(
    z.enum(['group', 'round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final']),
    z.string().datetime({ message: 'openUtc deve ser ISO 8601' }),
  ),
});

router.put('/config/phase-windows', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { windows } = putPhaseWindowsBodySchema.parse(req.body);

  const previous = await readPhaseWindowsConfig();
  const updated = await upsertPhaseWindowsConfig({
    windows,
    updatedBy: req.user.userId,
  });

  logger.info({ userId: req.user.userId, windows }, 'admin updated phase-windows config');

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'phase-window-set',
    targetType: 'config',
    targetId: 'phase-windows',
    targetLabel: 'Janelas de abertura por fase',
    previousValue: previous?.value ?? null,
    newValue: windows,
  });

  res.json({ windows: updated.value, updatedAt: updated.updatedAt });
});

// ===========================================================================
// S3.1: Match Results
// ===========================================================================

const adminMatchesQuerySchema = z.object({
  status: z.enum(['scheduled', 'finished', 'all']).optional().default('all'),
});

/**
 * GET /api/admin/matches — lista jogos com campos admin-only (finishedAt, pointsCalculatedAt).
 */
router.get('/matches', async (req, res) => {
  const { status } = adminMatchesQuerySchema.parse(req.query);
  const matches = container('matchesCache');

  const query =
    status === 'all'
      ? { query: 'SELECT * FROM c ORDER BY c.kickoffUtc' }
      : {
          query: 'SELECT * FROM c WHERE c.status = @s ORDER BY c.kickoffUtc',
          parameters: [{ name: '@s', value: status }],
        };

  const { resources } = await matches.items.query<MatchCacheDoc>(query).fetchAll();

  // Usa helper toMatchAdmin (declarado abaixo) — single source of truth pra serialização.
  // Antes a lista tinha mapeamento inline desatualizado (faltava allowEarlyFinish do S6.4).
  const result: MatchAdmin[] = resources.map((doc) => toMatchAdmin(doc));

  res.json({ matches: result, count: result.length });
});

const putResultBodySchema = z.object({
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
  status: z.enum(['scheduled', 'finished']).optional().default('finished'),
});

const matchIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'matchId deve ser numérico')
    .transform((s) => parseInt(s, 10))
    .refine((n) => n >= 1 && n <= 200, 'matchId fora de range'),
});

/**
 * PUT /api/admin/matches/:id/result — registra placar oficial.
 *  - Não permite finalizar jogo se now < kickoffUtc.
 *  - Resetar pointsCalculatedAt força recálculo via changefeed.
 */
router.put('/matches/:id/result', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id: matchId } = matchIdParamSchema.parse(req.params);
  const { homeScore, awayScore, status } = putResultBodySchema.parse(req.body);

  const matches = container('matchesCache');

  // Buscar match (cross-partition por matchId)
  const { resources } = await matches.items
    .query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();

  const match = resources[0];
  if (!match) {
    throw new NotFoundError(`Jogo ${matchId} não encontrado`);
  }

  // I3: reverter um jogo já finalizado para 'scheduled' deixaria PONTOS FANTASMAS.
  // calc-predictions só recalcula status='finished'; os PredictionDoc.points antigos
  // ficariam grudados e o leaderboard nunca corrigiria (inflado). Para corrigir um
  // placar lançado errado, reenvie status='finished' com o placar certo (finished→
  // finished funciona) — nunca volte para 'scheduled'.
  if (match.status === 'finished' && status !== 'finished') {
    throw new BadRequestError(
      `Jogo ${matchId} já foi finalizado. Para corrigir o placar, reenvie com status='finished' e o ` +
      `placar certo — não volte para '${status}' (deixaria pontos fantasmas no leaderboard).`,
    );
  }

  // Validação: não permite finalizar jogo futuro, EXCETO se admin liberou via allowEarlyFinish
  if (status === 'finished' && match.allowEarlyFinish !== true) {
    const kickoffMs = Date.parse(match.kickoffUtc);
    if (Number.isFinite(kickoffMs) && Date.now() < kickoffMs) {
      throw new BadRequestError(
        `Jogo ${matchId} ainda não começou (kickoff: ${match.kickoffUtc}). Não pode ser finalizado. ` +
        `Habilite "Permitir finalizar" no admin antes.`,
      );
    }
  }

  const nowIso = new Date().toISOString();
  const updated: MatchCacheDoc = {
    ...match,
    homeScore,
    awayScore,
    status,
    finishedAt: status === 'finished' ? nowIso : null,
    // Resetar pointsCalculatedAt força recálculo (re-edição também)
    pointsCalculatedAt: null,
    syncedAt: nowIso,
  };

  await matches.items.upsert(updated);
  logger.info(
    { userId: req.user.userId, matchId, homeScore, awayScore, status },
    'admin updated match result',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'match-result-set',
    targetType: 'match',
    targetId: String(matchId),
    targetLabel: `${match.homeTeam} x ${match.awayTeam}`,
    previousValue: { homeScore: match.homeScore, awayScore: match.awayScore, status: match.status },
    newValue: { homeScore, awayScore, status },
  });

  res.json({
    match: toMatchAdmin(updated),
  });
});

// Helper compartilhado: monta MatchAdmin a partir de MatchCacheDoc.
// Usado em todas as routes que retornam um match individual (result, lock, early-finish).
function toMatchAdmin(doc: MatchCacheDoc): MatchAdmin {
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
    locked: computeMatchLocked(doc),
    finishedAt: doc.finishedAt ?? null,
    pointsCalculatedAt: doc.pointsCalculatedAt,
    lockedManually: doc.lockedManually === true,
    lockedManuallyAt: doc.lockedManuallyAt,
    allowEarlyFinish: doc.allowEarlyFinish === true,
    allowEarlyFinishAt: doc.allowEarlyFinishAt,
  };
}

// ===========================================================================
// S6.3: Manual match lock (admin override aditivo)
// ===========================================================================

const patchLockBodySchema = z.object({
  manual: z.boolean(),
  reason: z.string().max(200).optional(),
});

/**
 * PATCH /api/admin/matches/:id/lock — admin liga/desliga lock manual.
 * Regra aditiva: manual + time-based; manual NUNCA pode remover time-based.
 */
router.patch('/matches/:id/lock', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id: matchId } = matchIdParamSchema.parse(req.params);
  const { manual, reason } = patchLockBodySchema.parse(req.body);

  const matches = container('matchesCache');
  const { resources } = await matches.items
    .query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();

  const match = resources[0];
  if (!match) throw new NotFoundError(`Jogo ${matchId} não encontrado`);

  const nowIso = new Date().toISOString();
  const updated: MatchCacheDoc = {
    ...match,
    lockedManually: manual,
    lockedManuallyBy: manual ? req.user.userId : undefined,
    lockedManuallyAt: manual ? nowIso : undefined,
    syncedAt: nowIso,
  };

  await matches.items.upsert(updated);
  logger.info(
    { adminId: req.user.userId, matchId, manual, reason },
    manual ? 'admin manually locked match' : 'admin removed manual lock',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'match-lock',
    targetType: 'match',
    targetId: String(matchId),
    targetLabel: `${match.homeTeam} x ${match.awayTeam}`,
    previousValue: { lockedManually: match.lockedManually === true },
    newValue: { lockedManually: manual },
    reason,
  });

  res.json({ match: toMatchAdmin(updated) });
});

// ===========================================================================
// S6.4: Allow early finish (admin override pra finalizar antes do kickoff)
// ===========================================================================

const patchEarlyFinishBodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().max(200).optional(),
});

/**
 * PATCH /api/admin/matches/:id/early-finish — toggle pra permitir finalizar antes do kickoff.
 * Sem isso, PUT /result com status=finished e now < kickoff retorna 400.
 */
router.patch('/matches/:id/early-finish', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id: matchId } = matchIdParamSchema.parse(req.params);
  const { enabled, reason } = patchEarlyFinishBodySchema.parse(req.body);

  const matches = container('matchesCache');
  const { resources } = await matches.items
    .query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();

  const match = resources[0];
  if (!match) throw new NotFoundError(`Jogo ${matchId} não encontrado`);

  const nowIso = new Date().toISOString();
  const updated: MatchCacheDoc = {
    ...match,
    allowEarlyFinish: enabled,
    allowEarlyFinishBy: enabled ? req.user.userId : undefined,
    allowEarlyFinishAt: enabled ? nowIso : undefined,
    syncedAt: nowIso,
  };

  await matches.items.upsert(updated);
  logger.info(
    { adminId: req.user.userId, matchId, enabled, reason },
    enabled ? 'admin enabled early-finish' : 'admin disabled early-finish',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'match-early-finish',
    targetType: 'match',
    targetId: String(matchId),
    targetLabel: `${match.homeTeam} x ${match.awayTeam}`,
    previousValue: { allowEarlyFinish: match.allowEarlyFinish === true },
    newValue: { allowEarlyFinish: enabled },
    reason,
  });

  res.json({ match: toMatchAdmin(updated) });
});

// ===========================================================================
// S3.3: Tournament Final Config (champion, top4, topScorer real)
// ===========================================================================

const TOURNAMENT_ID = 'tournament-final';
const CONFIG_SCOPE = 'global';

const putTournamentBodySchema = z.object({
  champion: z.string().min(2).max(12).regex(/^[a-z0-9-]+$/i),
  runnerUp: z.string().min(2).max(12).regex(/^[a-z0-9-]+$/i),
  thirdPlace: z.string().min(2).max(12).regex(/^[a-z0-9-]+$/i),
  fourthPlace: z.string().min(2).max(12).regex(/^[a-z0-9-]+$/i),
  // Artilheiro = ID de jogador do catálogo (existência checada no handler).
  topScorer: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'id de jogador inválido'),
});

router.get('/config/tournament-final', async (_req, res) => {
  try {
    const { resource } = await container('config')
      .item(TOURNAMENT_ID, CONFIG_SCOPE)
      .read<TournamentFinalConfigDoc>();
    if (!resource) {
      res.json({ tournamentFinal: null });
      return;
    }
    res.json({
      tournamentFinal: {
        champion: resource.value.champion,
        runnerUp: resource.value.runnerUp,
        thirdPlace: resource.value.thirdPlace,
        fourthPlace: resource.value.fourthPlace,
        topScorer: resource.value.topScorer,
        updatedBy: resource.updatedBy ?? null,
        updatedAt: resource.updatedAt,
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) {
      res.json({ tournamentFinal: null });
      return;
    }
    throw err;
  }
});

router.put('/config/tournament-final', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = putTournamentBodySchema.parse(req.body);

  // Artilheiro: id precisa existir no catálogo (gabarito errado = ninguém pontua).
  if (!(await isValidPlayerId(parsed.topScorer))) {
    throw new BadRequestError('Artilheiro inválido — selecione um jogador da lista.');
  }

  const nowIso = new Date().toISOString();

  const doc: TournamentFinalConfigDoc = {
    id: TOURNAMENT_ID,
    scope: CONFIG_SCOPE,
    value: parsed,
    updatedBy: req.user.userId,
    updatedAt: nowIso,
  };

  const previousTournament = await container('config')
    .item(TOURNAMENT_ID, CONFIG_SCOPE)
    .read<TournamentFinalConfigDoc>()
    .then((r) => r.resource ?? null)
    .catch(() => null);

  await container('config').items.upsert<TournamentFinalConfigDoc>(doc);
  logger.info(
    { userId: req.user.userId, champion: parsed.champion },
    'admin updated tournament-final config',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'tournament-final-set',
    targetType: 'config',
    targetId: TOURNAMENT_ID,
    targetLabel: 'Resultado final do torneio',
    previousValue: previousTournament?.value ?? null,
    newValue: parsed,
  });

  res.json({
    tournamentFinal: {
      ...parsed,
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    },
  });
});

// ===========================================================================
// Chaveamento do mata-mata (motor oficial FIFA 2026 + transcrição admin)
//  - GET   /api/admin/bracket/proposal      proposta calculada (sem efeito)
//  - PATCH /api/admin/matches/:id/teams      grava o confronto (transcrição)
// ===========================================================================

/**
 * GET /api/admin/bracket/proposal — calcula a proposta de chaveamento a partir
 * dos resultados atuais (standings dos grupos + árvore fixa) e devolve junto o
 * estado atual dos jogos de mata-mata (73–104). Não grava nada.
 */
router.get('/bracket/proposal', async (_req, res) => {
  const matches = container('matchesCache');
  const { resources } = await matches.items
    .query<MatchCacheDoc>({ query: 'SELECT * FROM c' })
    .fetchAll();

  const proposal = buildKnockoutProposal(resources);
  const current = resources
    .filter((m) => m.phase !== 'group')
    .sort((a, b) => a.matchId - b.matchId)
    .map(toMatchAdmin);

  // Avisos do Anexo C: confrontos de 16-avos JÁ gravados que divergem do
  // template oficial dado o estado atual dos grupos (não bloqueia — só informa).
  const tables = computeGroupStandings(resources);
  const warnings: Record<number, BracketWarning[]> = {};
  for (const m of resources) {
    if (m.matchId < 73 || m.matchId > 88 || !m.homeTeam || !m.awayTeam) continue;
    const w = checkR32Assignment(
      m.matchId,
      { name: m.homeTeam, iso: m.homeFlag ?? '' },
      { name: m.awayTeam, iso: m.awayFlag ?? '' },
      tables,
    );
    if (w.length > 0) warnings[m.matchId] = w;
  }

  res.json({ proposal, current, warnings });
});

const patchTeamsBodySchema = z.object({
  homeTeam: z.string().min(2).max(40),
  homeFlag: z.string().max(8).optional(),
  awayTeam: z.string().min(2).max(40),
  awayFlag: z.string().max(8).optional(),
  reason: z.string().max(200).optional(),
});

/**
 * PATCH /api/admin/matches/:id/teams — define o confronto (times) de um jogo de
 * mata-mata. Guards (services/match-teams): só mata-mata, antes de travar/
 * finalizar e ANTES de existir qualquer palpite (não orfanar palpites).
 */
router.patch('/matches/:id/teams', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id: matchId } = matchIdParamSchema.parse(req.params);
  const { homeTeam, homeFlag, awayTeam, awayFlag, reason } = patchTeamsBodySchema.parse(req.body);

  const matches = container('matchesCache');
  const { resources } = await matches.items
    .query<MatchCacheDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();

  const match = resources[0];
  if (!match) throw new NotFoundError(`Jogo ${matchId} não encontrado`);

  // Conta palpites já feitos sobre este jogo (não orfanar ao trocar o confronto).
  const { resources: countRes } = await container('predictions')
    .items.query<number>({
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();
  const predictionsCount = countRes[0] ?? 0;

  assertCanSetTeams(match, predictionsCount);

  const nowIso = new Date().toISOString();
  const updated = applyTeams(match, { homeTeam, homeFlag, awayTeam, awayFlag }, nowIso);
  await matches.items.upsert(updated);

  // Validação Anexo C (não bloqueante): confere o confronto gravado contra o
  // template oficial dado o estado atual dos grupos. Avisos vão pra resposta,
  // log e auditoria — o admin decide se mantém (pode haver ajuste intencional).
  const { resources: groupMatches } = await matches.items
    .query<MatchCacheDoc>({ query: "SELECT * FROM c WHERE c.phase = 'group'" })
    .fetchAll();
  const warnings: BracketWarning[] = checkR32Assignment(
    matchId,
    { name: homeTeam, iso: homeFlag ?? '' },
    { name: awayTeam, iso: awayFlag ?? '' },
    computeGroupStandings(groupMatches),
  );

  logger.info(
    { userId: req.user.userId, matchId, homeTeam, awayTeam, warnings: warnings.length },
    'admin set match teams (confronto)',
  );

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'match-teams-set',
    targetType: 'match',
    targetId: String(matchId),
    targetLabel: `${homeTeam} x ${awayTeam}`,
    previousValue: { homeTeam: match.homeTeam, awayTeam: match.awayTeam },
    newValue: { homeTeam, awayTeam, anexoCWarnings: warnings.map((w) => w.message) },
    reason,
  });

  res.json({ match: toMatchAdmin(updated), warnings });
});

export { router as adminRouter };
