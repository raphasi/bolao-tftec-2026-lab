/**
 * Augment do Express.Request para anexar usuário autenticado.
 * Usado pelo middleware/auth.ts após verificar o JWT.
 */
import type { JwtPayload } from '../services/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
