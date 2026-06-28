/**
 * Admin User Management API (S4.5.1).
 * Todos os endpoints exigem requireAuth + requireAdmin.
 *
 * Endpoints:
 *   GET    /api/admin/users              lista paginada com filtros
 *   PATCH  /api/admin/users/:userId/role          { role, reason? }
 *   PATCH  /api/admin/users/:userId/deactivate    { reason? }
 *   PATCH  /api/admin/users/:userId/reactivate    { reason? }
 *   PATCH  /api/admin/users/:userId               { name }
 *   GET    /api/admin/audit-log          filtros + pagination
 *
 * Segurança:
 *   - Last-admin guard (não permite zerar admins ativos)
 *   - Self-protect (admin não pode demote/deactivate a si)
 *   - Email IMUTÁVEL
 *   - passwordHash NUNCA exposto
 *   - Audit log automático em TODAS mutations
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireAdmin, invalidateUserActive } from '../middleware/auth.js';
import { container } from '../services/cosmos.js';
import { env } from '../config/env.js';
import { appendAuditEntry } from '../services/audit.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/http-errors.js';
import { logger } from '../config/logger.js';
import type {
  AuditAction,
  AuditLogDoc,
  UserAdminPublic,
  UserDoc,
} from '../types/domain.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ===========================================================================
// Helpers
// ===========================================================================

function toPublic(doc: UserDoc): UserAdminPublic {
  return {
    userId: doc.userId,
    email: doc.email,
    name: doc.name,
    role: doc.role,
    active: doc.active !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Gera uma senha temporária forte e transcritível (sem caracteres ambíguos),
 * para o admin repassar ao usuário que perdeu a senha. Uso único — o usuário
 * deve trocá-la em seguida via /api/auth/change-password.
 */
function generateTempPassword(len = 16): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += charset[bytes[i] % charset.length];
  return out;
}

async function loadUser(userId: string): Promise<UserDoc> {
  try {
    const { resource } = await container('users').item(userId, userId).read<UserDoc>();
    if (!resource) throw new NotFoundError(`Usuário ${userId} não encontrado`);
    return resource;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) throw new NotFoundError(`Usuário ${userId} não encontrado`);
    throw err;
  }
}

/**
 * Verifica se desativar/demote este user deixaria o sistema sem admin ativo.
 * Retorna true se essa operação criaria estado inválido (last admin).
 */
async function wouldRemoveLastAdmin(targetUserId: string): Promise<boolean> {
  const { resources } = await container('users')
    .items.query<number>({
      query:
        'SELECT VALUE COUNT(1) FROM c WHERE c.role = "admin" AND c.active = true AND c.userId != @uid',
      parameters: [{ name: '@uid', value: targetUserId }],
    })
    .fetchAll();
  return (resources[0] ?? 0) === 0;
}

// ===========================================================================
// GET /api/admin/users — list paginated
// ===========================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['all', 'admin', 'user']).default('all'),
  active: z.enum(['all', 'true', 'false']).default('all'),
  search: z.string().max(80).optional(),
});

router.get('/', async (req, res) => {
  const { page, pageSize, role, active, search } = listQuerySchema.parse(req.query);

  // Build WHERE clause
  const where: string[] = [];
  const params: { name: string; value: string | boolean }[] = [];
  if (role !== 'all') {
    where.push('c.role = @role');
    params.push({ name: '@role', value: role });
  }
  if (active !== 'all') {
    where.push('c.active = @active');
    params.push({ name: '@active', value: active === 'true' });
  }
  if (search) {
    where.push('(CONTAINS(LOWER(c.email), @search) OR CONTAINS(LOWER(c.name), @search))');
    params.push({ name: '@search', value: search.toLowerCase() });
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Count total (separate query — Cosmos não tem OFFSET com SELECT*)
  const { resources: totalResult } = await container('users')
    .items.query<number>({
      query: `SELECT VALUE COUNT(1) FROM c ${whereSql}`,
      parameters: params,
    })
    .fetchAll();
  const total = totalResult[0] ?? 0;

  // Fetch page (Cosmos suporta OFFSET/LIMIT)
  const offset = (page - 1) * pageSize;
  const { resources: docs } = await container('users')
    .items.query<UserDoc>({
      query: `SELECT * FROM c ${whereSql} ORDER BY c.createdAt DESC OFFSET ${offset} LIMIT ${pageSize}`,
      parameters: params,
    })
    .fetchAll();

  const users = docs.map(toPublic);

  res.json({
    users,
    page,
    pageSize,
    total,
    hasMore: offset + users.length < total,
  });
});

// ===========================================================================
// PATCH /api/admin/users/:userId/role
// ===========================================================================

const userIdParam = z.object({ userId: z.string().uuid('userId deve ser UUID') });

const patchRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
  reason: z.string().max(200).optional(),
});

router.patch('/:userId/role', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParam.parse(req.params);
  const { role, reason } = patchRoleSchema.parse(req.body);

  // Self-demote guard
  if (userId === req.user.userId && role === 'user') {
    throw new ForbiddenError('Você não pode rebaixar a si mesmo');
  }

  const target = await loadUser(userId);
  if (target.role === role) {
    res.json({ user: toPublic(target), unchanged: true });
    return;
  }

  // Last-admin guard: target era admin ativo e vai virar user
  if (target.role === 'admin' && target.active !== false && role === 'user') {
    if (await wouldRemoveLastAdmin(userId)) {
      throw new ConflictError('Operação bloqueada: deixaria o sistema sem admin ativo');
    }
  }

  const previousRole = target.role;
  const nowIso = new Date().toISOString();
  const updated: UserDoc = { ...target, role, updatedAt: nowIso };
  await container('users').items.upsert(updated);

  // Audit fire-and-forget (não bloqueia response)
  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'role-change' satisfies AuditAction,
    targetUserId: userId,
    targetEmail: target.email,
    previousValue: previousRole,
    newValue: role,
    reason,
  });

  logger.info({ adminId: req.user.userId, target: userId, previousRole, newRole: role }, 'admin role change');

  res.json({ user: toPublic(updated) });
});

// ===========================================================================
// PATCH /api/admin/users/:userId/deactivate
// ===========================================================================

const reasonSchema = z.object({ reason: z.string().max(200).optional() });

router.patch('/:userId/deactivate', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParam.parse(req.params);
  const { reason } = reasonSchema.parse(req.body ?? {});

  // Self-deactivate guard
  if (userId === req.user.userId) {
    throw new ForbiddenError('Você não pode desativar a si mesmo');
  }

  const target = await loadUser(userId);
  if (target.active === false) {
    res.json({ user: toPublic(target), unchanged: true });
    return;
  }

  // Last-admin guard
  if (target.role === 'admin' && (await wouldRemoveLastAdmin(userId))) {
    throw new ConflictError('Operação bloqueada: deixaria o sistema sem admin ativo');
  }

  const nowIso = new Date().toISOString();
  const updated: UserDoc = { ...target, active: false, updatedAt: nowIso };
  await container('users').items.upsert(updated);

  // Invalida cache active imediato — propagação <1s ao invés de até 10s
  invalidateUserActive(userId);

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'soft-delete' satisfies AuditAction,
    targetUserId: userId,
    targetEmail: target.email,
    previousValue: true,
    newValue: false,
    reason,
  });

  logger.info({ adminId: req.user.userId, target: userId }, 'admin deactivated user');
  res.json({ user: toPublic(updated) });
});

// ===========================================================================
// PATCH /api/admin/users/:userId/reactivate
// ===========================================================================

router.patch('/:userId/reactivate', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParam.parse(req.params);
  const { reason } = reasonSchema.parse(req.body ?? {});

  const target = await loadUser(userId);
  if (target.active !== false) {
    res.json({ user: toPublic(target), unchanged: true });
    return;
  }

  const nowIso = new Date().toISOString();
  const updated: UserDoc = { ...target, active: true, updatedAt: nowIso };
  await container('users').items.upsert(updated);

  invalidateUserActive(userId);

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'reactivate' satisfies AuditAction,
    targetUserId: userId,
    targetEmail: target.email,
    previousValue: false,
    newValue: true,
    reason,
  });

  logger.info({ adminId: req.user.userId, target: userId }, 'admin reactivated user');
  res.json({ user: toPublic(updated) });
});

// ===========================================================================
// PATCH /api/admin/users/:userId/reset-password — gera senha temporária
// ===========================================================================

router.patch('/:userId/reset-password', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParam.parse(req.params);
  const { reason } = reasonSchema.parse(req.body ?? {});

  const target = await loadUser(userId);

  const tempPassword = generateTempPassword();
  const nowIso = new Date().toISOString();
  const passwordHash = await bcrypt.hash(tempPassword, env.BCRYPT_ROUNDS);
  const updated: UserDoc = { ...target, passwordHash, passwordChangedAt: nowIso, updatedAt: nowIso };
  await container('users').items.upsert(updated);

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'password-reset' satisfies AuditAction,
    targetUserId: userId,
    targetEmail: target.email,
    previousValue: { passwordChangedAt: target.passwordChangedAt ?? null },
    newValue: { passwordChangedAt: nowIso },
    reason,
  });

  logger.info({ adminId: req.user.userId, target: userId }, 'admin reset user password');

  // tempPassword é retornado em claro SOMENTE nesta resposta, para o admin
  // repassar ao usuário. Nunca é logado nem auditado.
  res.json({ user: toPublic(updated), tempPassword });
});

// ===========================================================================
// PATCH /api/admin/users/:userId — edit name (email é imutável)
// ===========================================================================

const patchNameSchema = z.object({ name: z.string().min(2).max(80).trim() });

router.patch('/:userId', async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId } = userIdParam.parse(req.params);
  const { name } = patchNameSchema.parse(req.body);

  // Bloquear update de email accidental (Zod já filtra mas double check)
  if ('email' in (req.body as object)) {
    throw new BadRequestError('Email é imutável. Apenas name pode ser alterado.');
  }

  const target = await loadUser(userId);
  if (target.name === name) {
    res.json({ user: toPublic(target), unchanged: true });
    return;
  }

  const previousName = target.name;
  const nowIso = new Date().toISOString();
  const updated: UserDoc = { ...target, name, updatedAt: nowIso };
  await container('users').items.upsert(updated);

  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'name-change' satisfies AuditAction,
    targetUserId: userId,
    targetEmail: target.email,
    previousValue: previousName,
    newValue: name,
  });

  logger.info({ adminId: req.user.userId, target: userId }, 'admin edited user name');
  res.json({ user: toPublic(updated) });
});

// ===========================================================================
// GET /api/admin/audit-log
// ===========================================================================

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  targetUserId: z.string().uuid().optional(),
  performedBy: z.string().uuid().optional(),
  targetId: z.string().optional(),
  targetType: z.enum(['user', 'match', 'config', 'prediction', 'special']).optional(),
  action: z
    .enum([
      'role-change',
      'soft-delete',
      'reactivate',
      'name-change',
      'password-change',
      'password-reset',
      'match-result-set',
      'match-lock',
      'match-early-finish',
      'match-teams-set',
      'phase-window-set',
      'specials-lock-set',
      'tournament-final-set',
      'prediction-set',
      'prediction-delete',
      'prediction-rejected',
      'special-set',
      'special-rejected',
    ])
    .optional(),
});

router.get('/audit-log', async (req, res) => {
  const { page, pageSize, targetUserId, performedBy, action, targetId, targetType } =
    auditQuerySchema.parse(req.query);

  const where: string[] = [];
  const params: { name: string; value: string }[] = [];
  if (targetUserId) {
    where.push('c.targetUserId = @target');
    params.push({ name: '@target', value: targetUserId });
  }
  if (performedBy) {
    where.push('c.performedBy = @actor');
    params.push({ name: '@actor', value: performedBy });
  }
  if (action) {
    where.push('c.action = @action');
    params.push({ name: '@action', value: action });
  }
  if (targetId) {
    where.push('c.targetId = @targetId');
    params.push({ name: '@targetId', value: targetId });
  }
  if (targetType) {
    where.push('c.targetType = @targetType');
    params.push({ name: '@targetType', value: targetType });
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const { resources } = await container('auditLog')
    .items.query<AuditLogDoc>({
      query: `SELECT * FROM c ${whereSql} ORDER BY c.timestamp DESC OFFSET ${offset} LIMIT ${pageSize}`,
      parameters: params,
    })
    .fetchAll();

  res.json({
    entries: resources,
    page,
    pageSize,
    hasMore: resources.length === pageSize,
  });
});

export { router as adminUsersRouter };
