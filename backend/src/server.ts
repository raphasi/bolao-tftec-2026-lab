/**
 * Bolão TFTEC Cloud — Backend Express
 * ====================================
 * Entry point do servidor. Configura middlewares de segurança, parsing,
 * logging, rotas e error handler. Serve API em /api/* e (em produção)
 * arquivos estáticos do frontend build em /.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';

import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { NotFoundError } from './utils/http-errors.js';
import { getErrors24h, isAppInsightsConfigured } from './services/appinsights.js';
import './types/http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// -------------------------------------------------------------------------
// Segurança e parsing
// -------------------------------------------------------------------------

app.disable('x-powered-by');
app.set('trust proxy', 1); // necessário no App Service para rate-limit por IP

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          // S7.4: bandeiras agora são self-hosted em /flags/ (não mais flagcdn.com).
          // CSP mais restritivo agora — só self + data: para img-src.
          // Google Fonts e gstatic mantidos (fontes via @import no CSS).
          useDefaults: true,
          directives: {
            'img-src': ["'self'", 'data:'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
            'connect-src': ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  }),
);

const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// -------------------------------------------------------------------------
// Rate limit global (mais permissivo que o de /auth)
// -------------------------------------------------------------------------

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Limite de requisições excedido' },
    },
  }),
);

// -------------------------------------------------------------------------
// API routes
// -------------------------------------------------------------------------

app.use('/api', apiRouter);

// -------------------------------------------------------------------------
// Frontend estático (produção) — backend/dist/server.js + frontend/dist
// -------------------------------------------------------------------------

if (isProduction) {
  // backend/dist/ -> ../../frontend/dist
  const frontendDist = resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontendDist)) {
    logger.info({ frontendDist }, 'serving static frontend');
    app.use(express.static(frontendDist, { maxAge: '1h', index: false }));
    // Express 5: '*' deprecado. Usa named splat ou middleware catch-all.
    // IMPORTANTE: NÃO capturar /api/* — deixa cair no 404 handler abaixo.
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(resolve(frontendDist, 'index.html'));
    });
  } else {
    logger.warn({ frontendDist }, 'frontend/dist não encontrado — apenas /api responderá');
  }
}

// -------------------------------------------------------------------------
// 404 e error handler (sempre por último)
// -------------------------------------------------------------------------

app.use((req, _res, next) => {
  next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.path}`));
});

app.use(errorHandler);

// -------------------------------------------------------------------------
// Start
// -------------------------------------------------------------------------

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, cosmosDatabase: env.COSMOS_DATABASE },
    `🎯 Bolão backend ouvindo em http://localhost:${env.PORT}`,
  );

  // Pre-warm AppInsights client (S8.2.2): primeira query custa 10-20s
  // (MSI token + LogsQueryClient init). Fire-and-forget no startup garante
  // que primeira request do user já encontra o client warm.
  // Sem crash em falha — graceful fallback do appinsights.ts cuida disso.
  if (isAppInsightsConfigured()) {
    const prewarmStart = Date.now();
    void getErrors24h()
      .then((result) => {
        const elapsed = Date.now() - prewarmStart;
        logger.info(
          { elapsed, result: result === null ? 'null (cold/error)' : 'ok' },
          'appinsights pre-warm complete',
        );
      })
      .catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'appinsights pre-warm failed');
      });
  }
});

// Graceful shutdown — App Service envia SIGTERM antes de reciclar
function shutdown(signal: string): void {
  logger.info({ signal }, 'shutdown signal received');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'erro durante shutdown');
      process.exit(1);
    }
    logger.info('servidor encerrado');
    process.exit(0);
  });
  // Force exit se não fechar em 10s
  setTimeout(() => {
    logger.warn('shutdown forçado após timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
