/**
 * Healthchecks:
 *  - GET /api/health       liveness simples (uptime, version)
 *  - GET /api/health/full  inclui ping no Cosmos DB
 *
 * O App Service Plan B1 usa `/api/health` configurado em appservice.bicep
 * para detectar instâncias unhealthy e reciclar.
 */
import { Router } from 'express';
import { pingCosmos } from '../services/cosmos.js';

const router = Router();

const STARTED_AT = Date.now();
const VERSION = process.env.npm_package_version ?? '0.1.0';

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'bolao-backend',
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    timestamp: new Date().toISOString(),
  });
});

router.get('/full', async (_req, res) => {
  const cosmos = await pingCosmos();
  const healthy = cosmos.ok;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'bolao-backend',
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    dependencies: {
      cosmos,
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
