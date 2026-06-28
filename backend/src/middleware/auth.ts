/**
 * Middlewares de autenticação:
 *  - requireAuth: valida Bearer token + checa user.active (S4.5.3)
 *  - requireAdmin: exige role 'admin' lido fresco do banco (não confia no claim do JWT)
 *  - optionalAuth: anexa req.user se houver token, mas não bloqueia
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyToken } from '../services/jwt.js';
import { container } from '../services/cosmos.js';
import { ForbiddenError, UnauthorizedError } from '../utils/http-errors.js';
import '../types/http.js';
import type { UserDoc } from '../types/domain.js';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

// Cache LRU em-memória pra evitar 1 RU por request.
// TTL 10s (curto pra propagação rápida de soft-delete) + invalidação manual via invalidateUserActive.
// MaxSize 200 (insertion-order LRU: get faz delete+set, eviction da head quando excede).
// Guarda também role e passwordChangedAt (lidos do banco) pra autorização não confiar no JWT.
const ACTIVE_CACHE_TTL_MS = 10_000;
const ACTIVE_CACHE_MAX = 200;
interface UserAuthState {
  active: boolean;
  role: 'user' | 'admin';
  passwordChangedAt?: string;
  expiresAt: number;
}
const activeCache = new Map<string, UserAuthState>();

// Estado fail-closed: inativo + role 'user' (sem privilégios) quando o read falha.
const FAIL_CLOSED_STATE: Omit<UserAuthState, 'expiresAt'> = { active: false, role: 'user' };

/**
 * Lê o UserDoc do Cosmos UMA vez e cacheia (active + role + passwordChangedAt).
 * Mesmo TTL/LRU/invalidação que o cache active. Fail-closed (inativo, role 'user') em erro.
 */
async function getUserAuthState(userId: string): Promise<UserAuthState> {
  const cached = activeCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    // LRU touch: re-insert pra mover pra fim
    activeCache.delete(userId);
    activeCache.set(userId, cached);
    return cached;
  }
  try {
    const { resource } = await container('users').item(userId, userId).read<UserDoc>();
    const active = resource?.active !== false; // default true (legacy users sem field)
    const role = resource?.role === 'admin' ? 'admin' : 'user';
    const state: UserAuthState = {
      active,
      role,
      passwordChangedAt: resource?.passwordChangedAt,
      expiresAt: now + ACTIVE_CACHE_TTL_MS,
    };
    activeCache.set(userId, state);
    // LRU evict: enquanto exceder maxSize, remove a entry mais antiga (head)
    while (activeCache.size > ACTIVE_CACHE_MAX) {
      const oldest = activeCache.keys().next().value;
      if (oldest === undefined) break;
      activeCache.delete(oldest);
    }
    return state;
  } catch {
    // fail-closed se Cosmos der erro: não cacheia (pra reler na próxima)
    return { ...FAIL_CLOSED_STATE, expiresAt: now };
  }
}

async function isUserActive(userId: string): Promise<boolean> {
  const state = await getUserAuthState(userId);
  return state.active;
}

/**
 * Invalida cache active. Chame após mutate user.active (deactivate/reactivate).
 * Sem userId, limpa cache completo (flush manual).
 */
export function invalidateUserActive(userId?: string): void {
  if (userId === undefined) {
    activeCache.clear();
    return;
  }
  activeCache.delete(userId);
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractBearer(req);
  if (!token) {
    return next(new UnauthorizedError('Token Bearer ausente'));
  }
  try {
    req.user = verifyToken(token);
    // S4.5.3 — verifica se user continua ativo (invalida JWT de soft-deleted).
    const state = await getUserAuthState(req.user.userId);
    if (!state.active) {
      return next(new UnauthorizedError('Conta desativada'));
    }
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token inválido';
    next(new UnauthorizedError(message));
  }
};

export const requireAdmin: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    return next(new UnauthorizedError('Não autenticado'));
  }
  try {
    // Autorização não confia no claim 'role' do JWT: relê o role fresco do banco (cacheado).
    const state = await getUserAuthState(req.user.userId);
    if (state.role !== 'admin') {
      return next(new ForbiddenError('Apenas administradores'));
    }
    next();
  } catch {
    // fail-closed: qualquer erro de leitura nega o acesso admin.
    next(new ForbiddenError('Apenas administradores'));
  }
};

export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractBearer(req);
  if (!token) {
    return next();
  }
  try {
    req.user = verifyToken(token);
  } catch {
    // ignora token inválido em rota opcional
  }
  next();
};
