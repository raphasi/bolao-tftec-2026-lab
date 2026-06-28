/**
 * JWT sign/verify centralizado.
 * Payload mínimo do bolão: userId + email + role.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'fifa2026-bolao',
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: 'fifa2026-bolao',
    algorithms: ['HS256'],
  });

  if (
    typeof decoded === 'object' &&
    decoded !== null &&
    'userId' in decoded &&
    'email' in decoded &&
    'role' in decoded
  ) {
    return {
      userId: String(decoded.userId),
      email: String(decoded.email),
      role: decoded.role === 'admin' ? 'admin' : 'user',
    };
  }
  throw new Error('Token inválido: payload incompleto');
}
