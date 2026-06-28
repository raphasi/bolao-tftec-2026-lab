/**
 * Error handler centralizado.
 * Converte HttpError, ZodError e Error em JSON consistente.
 * Express 5 propaga erros assíncronos automaticamente — basta este middleware no fim.
 */
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-errors.js';
import { logger } from '../config/logger.js';
import { isDevelopment } from '../config/env.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Erros de validação Zod
  if (err instanceof ZodError) {
    logger.warn({ path: req.path, issues: err.issues }, 'validation error');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados de entrada inválidos',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    } satisfies ErrorBody);
    return;
  }

  // HttpError tipado nosso
  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'server error');
    } else {
      logger.warn({ statusCode: err.statusCode, path: req.path, message: err.message }, 'client error');
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? 'ERROR',
        message: err.message,
        details: err.details,
      },
    } satisfies ErrorBody);
    return;
  }

  // Erro de parse do body (express.json com JSON malformado) — é erro do cliente (400),
  // não falha de servidor. body-parser lança um SyntaxError com a propriedade `body`.
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({ path: req.path }, 'malformed JSON body');
    res.status(400).json({
      error: {
        code: 'BAD_JSON',
        message: 'JSON inválido no corpo da requisição',
      },
    } satisfies ErrorBody);
    return;
  }

  // Fallback — erro inesperado
  logger.error({ err, path: req.path }, 'unhandled error');
  const message = err instanceof Error ? err.message : 'Erro interno';
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: isDevelopment ? message : 'Erro interno do servidor',
      stack: isDevelopment && err instanceof Error ? err.stack : undefined,
    },
  } satisfies ErrorBody);
};
