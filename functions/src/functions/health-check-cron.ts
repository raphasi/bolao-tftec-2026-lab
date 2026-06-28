/**
 * Function: health-check-cron (S4.8)
 *
 * Self-monitoring: pinga /api/health/full a cada 5min.
 * Logs ficam em Application Insights — facilita detectar:
 *   - App Service down (5xx ou timeout)
 *   - Cosmos disconnect (cosmos.ok=false)
 *   - High latency (latencyMs > threshold)
 *
 * Sem email/alerts nesta versão (S5 adiciona action group quando SendGrid OK).
 */
import { app, type InvocationContext, type Timer } from '@azure/functions';

// Deriva a URL do backend do nome do proprio Function App (WEBSITE_SITE_NAME e
// setado pelo Azure: func-fifa-bolao-<suffix> -> app-fifa-bolao-<suffix>). Evita
// hardcode de um ambiente especifico; override explicito via APP_URL.
const siteName = process.env.WEBSITE_SITE_NAME;
const derivedAppUrl = siteName
  ? `https://${siteName.replace(/^func-/, 'app-')}.azurewebsites.net`
  : 'http://localhost:3001';
const APP_URL = process.env.APP_URL ?? derivedAppUrl;
const LATENCY_WARN_MS = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

interface HealthFull {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  dependencies: {
    cosmos: { ok: boolean; latencyMs?: number; error?: string };
  };
  timestamp: string;
}

async function healthCheckHandler(_timer: Timer, context: InvocationContext): Promise<void> {
  const startMs = Date.now();
  context.log(`Health check cron start — target: ${APP_URL}/api/health/full`);

  let response: Response | null = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    response = await fetch(`${APP_URL}/api/health/full`, { signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (err) {
    context.error(`Health check FAILED — fetch error: ${(err as Error).message}`);
    return;
  }

  const elapsedMs = Date.now() - startMs;

  if (!response.ok) {
    context.error(`Health check FAILED — HTTP ${response.status} in ${elapsedMs}ms`);
    return;
  }

  let body: HealthFull;
  try {
    body = (await response.json()) as HealthFull;
  } catch (err) {
    context.error(`Health check FAILED — invalid JSON: ${(err as Error).message}`);
    return;
  }

  // Status check
  if (body.status !== 'ok') {
    context.warn(
      `Health DEGRADED — status=${body.status}, cosmos.ok=${body.dependencies.cosmos.ok}, latency=${elapsedMs}ms`,
    );
    return;
  }

  // Cosmos check
  if (!body.dependencies.cosmos.ok) {
    context.warn(
      `Cosmos UNHEALTHY — error=${body.dependencies.cosmos.error}, http latency=${elapsedMs}ms`,
    );
    return;
  }

  // Latency check
  if (elapsedMs > LATENCY_WARN_MS) {
    context.warn(
      `Health OK but SLOW — latency ${elapsedMs}ms > ${LATENCY_WARN_MS}ms threshold (cold start?)`,
    );
    return;
  }

  context.log(
    `Health OK — version=${body.version}, uptime=${body.uptimeSeconds}s, cosmos.latency=${body.dependencies.cosmos.latencyMs}ms, http_latency=${elapsedMs}ms`,
  );
}

app.timer('health-check-cron', {
  // A cada 5 minutos
  schedule: '0 */5 * * * *',
  handler: healthCheckHandler,
});
