/**
 * Rotas de autenticação:
 *  - POST /api/auth/register  cria novo usuário, retorna JWT
 *  - POST /api/auth/login     valida credenciais, retorna JWT
 *  - GET  /api/auth/me        protegida — devolve usuário atual
 *
 * Auth próprio do bolão (sem SSO com o main app). bcrypt para senha,
 * JWT assinado com env.JWT_SECRET, validade env.JWT_EXPIRES_IN.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { signToken } from '../services/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/http-errors.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { appendAuditEntry } from '../services/audit.js';
import type { AuditAction, UserDoc } from '../types/domain.js';

const router = Router();

// Rate limit agressivo para login/register (proteção contra brute force).
// Chave = IP + email do corpo (quando houver). Atrás do Front Door a turma
// inteira sai por 1 IP (NAT); chavear SÓ por IP colapsaria a sala num único
// balde de 10/min e barraria TODOS no login da estreia. Com IP+email cada
// conta tem seu próprio balde — anti-brute-force real, sem punir a sala.
// (/change-password roda antes do requireAuth e não tem email no corpo →
// cai no IP; volume baixo e autenticado, ok.)
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip ?? 'unknown'; // em prod App Service entrega IPv4 (NAT da sala)
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return email ? `${ip}:${email}` : ip;
  },
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas, tente novamente em 1 min' } },
});

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  email: z.string().email('E-mail inválido').toLowerCase().trim(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
  name: z.string().min(2).max(80).trim(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: registerSchema.shape.password, // mesma política do cadastro (min 8, max 128)
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  });

// UserDoc importado de types/domain.ts (centralizado em S4.5.3)

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);
  const users = container('users');

  // Email é unique (configurado em cosmos.bicep), mas validamos antes pra dar erro amigável
  const { resources: existing } = await users.items
    .query<UserDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }],
    })
    .fetchAll();

  if (existing.length > 0) {
    throw new ConflictError('E-mail já cadastrado');
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const nowIso = new Date().toISOString();

  const doc: UserDoc = {
    id: userId,
    userId,
    email,
    name,
    passwordHash,
    role: 'user',
    active: true,                // S4.5.3 — default ativo
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await users.items.create(doc);
  logger.info({ userId, email }, 'user registered');

  const token = signToken({ userId, email, role: 'user' });

  res.status(201).json({
    token,
    user: {
      userId,
      email,
      name,
      role: 'user',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const users = container('users');

  const { resources } = await users.items
    .query<UserDoc>({
      query: 'SELECT TOP 1 * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }],
    })
    .fetchAll();

  const user = resources[0];

  // Comparação constante de tempo: rodamos bcrypt mesmo se user não existe
  // pra evitar timing attack revelar usuários cadastrados.
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuv1234567890ABCDEFGHIJKL.MNOPQRST';
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordMatches) {
    throw new UnauthorizedError('Credenciais inválidas');
  }

  // S4.5.3 — rejeita user desativado (soft delete).
  // Mensagem unificada com credentials inválidas pra não revelar status da conta (evita enumeration).
  if (user.active === false) {
    logger.warn({ userId: user.userId, email }, 'login attempt by deactivated user');
    throw new UnauthorizedError('Credenciais inválidas');
  }

  const token = signToken({ userId: user.userId, email: user.email, role: user.role });
  logger.info({ userId: user.userId }, 'user logged in');

  res.json({
    token,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /me (protegida)
// ---------------------------------------------------------------------------

router.get('/me', requireAuth, async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  const users = container('users');
  const { resource } = await users.item(req.user.userId, req.user.userId).read<UserDoc>();

  if (!resource) {
    throw new UnauthorizedError('Usuário não existe mais');
  }

  res.json({
    user: {
      userId: resource.userId,
      email: resource.email,
      name: resource.name,
      role: resource.role,
      createdAt: resource.createdAt,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /change-password (protegida) — troca self-service da própria senha
// ---------------------------------------------------------------------------

router.post('/change-password', authLimiter, requireAuth, async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const users = container('users');
  // Lê o hash FRESCO do Cosmos (não confia no JWT) e exige a senha atual.
  const { resource: user } = await users.item(req.user.userId, req.user.userId).read<UserDoc>();
  if (!user) throw new UnauthorizedError('Usuário não existe mais');
  if (user.active === false) throw new UnauthorizedError('Credenciais inválidas');

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentMatches) {
    // Mensagem genérica; conta para o rate limit (authLimiter).
    throw new UnauthorizedError('Senha atual inválida');
  }

  const nowIso = new Date().toISOString();
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  const updated: UserDoc = { ...user, passwordHash, passwordChangedAt: nowIso, updatedAt: nowIso };
  await users.items.upsert(updated);

  logger.info({ userId: user.userId }, 'user changed own password');

  // Auditoria sem senha/hash — só marcadores temporais.
  void appendAuditEntry({
    performedBy: req.user.userId,
    performedByEmail: req.user.email,
    action: 'password-change' satisfies AuditAction,
    targetType: 'user',
    targetUserId: user.userId,
    targetEmail: user.email,
    previousValue: { passwordChangedAt: user.passwordChangedAt ?? null },
    newValue: { passwordChangedAt: nowIso },
  });

  // Tokens emitidos antes seguem válidos até expirar (revogação = V2).
  res.status(204).end();
});

export { router as authRouter };
