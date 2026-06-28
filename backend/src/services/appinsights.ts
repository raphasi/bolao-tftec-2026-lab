/**
 * Application Insights log queries (S5.2).
 *
 * Wraps @azure/monitor-query LogsQueryClient com graceful fallback:
 *  - Se APPINSIGHTS_RESOURCE_ID não estiver set → todas funções retornam null
 *  - Se query falhar (network, RBAC, timeout) → retorna null + logger.warn
 *  - Cliente é lazy-inicializado uma vez (TokenCredential reusa)
 *
 * Auth:
 *  - DefaultAzureCredential: usa Managed Identity em Azure App Service,
 *    Azure CLI em dev local (após `az login`)
 *  - Requer role "Monitoring Reader" no AI component
 */
import { DefaultAzureCredential } from '@azure/identity';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Timeout 15s (anterior 5s) — cobre cold start de MSI + LogsQueryClient init.
// Empiricamente em prod: 1ª query pós-restart leva 10-20s (token MSI + auth handshake).
// Subsequent queries são <1s. 15s dá headroom sem travar a request indefinidamente.
const QUERY_TIMEOUT_MS = 15_000;
const QUERY_TIMESPAN_24H = 'PT24H';
const QUERY_TIMESPAN_1H = 'PT1H';
const QUERY_TIMESPAN_30M = 'PT30M';
const QUERY_TIMESPAN_5M = 'PT5M';

let client: LogsQueryClient | null = null;

function getClient(): LogsQueryClient | null {
  if (!env.APPINSIGHTS_RESOURCE_ID) return null;
  if (client) return client;
  try {
    const cred = new DefaultAzureCredential();
    client = new LogsQueryClient(cred);
    return client;
  } catch (err) {
    logger.warn({ err }, 'appinsights client init failed');
    return null;
  }
}

async function runQuery(query: string, timespan: string): Promise<number | null> {
  const c = getClient();
  if (!c || !env.APPINSIGHTS_RESOURCE_ID) return null;

  try {
    const result = await Promise.race([
      c.queryResource(env.APPINSIGHTS_RESOURCE_ID, query, { duration: timespan }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('appinsights query timeout')), QUERY_TIMEOUT_MS),
      ),
    ]);

    if (result.status === LogsQueryResultStatus.Success) {
      const table = result.tables[0];
      if (!table || table.rows.length === 0) return 0;
      const value = table.rows[0]?.[0];
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }
    logger.warn({ status: result.status }, 'appinsights query partial result');
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, query: query.slice(0, 60) }, 'appinsights query failed');
    return null;
  }
}

/**
 * Erros (success=false) nas últimas 24h.
 */
export async function getErrors24h(): Promise<number | null> {
  return runQuery(
    'requests | where success == false | count',
    QUERY_TIMESPAN_24H,
  );
}

/**
 * Requisições na última hora.
 */
export async function getRequestsLast1h(): Promise<number | null> {
  return runQuery('requests | count', QUERY_TIMESPAN_1H);
}

/**
 * P95 de latency (ms) na última hora.
 */
export async function getLatencyP95Ms(): Promise<number | null> {
  const value = await runQuery(
    'requests | summarize percentile(duration, 95)',
    QUERY_TIMESPAN_1H,
  );
  if (value === null) return null;
  return Math.round(value);
}

/**
 * Erros (success=false) nos últimos 5 minutos. Usado pelo /admin/ops live dashboard.
 * Alarm threshold: >0 durante evento ao vivo.
 */
export async function getErrors5min(): Promise<number | null> {
  return runQuery('requests | where success == false | count', QUERY_TIMESPAN_5M);
}

/**
 * Usuários únicos ativos nos últimos 5min (distinct user_Id em requests).
 * Baseline esperado durante evento: 30-50.
 */
export async function getActiveUsers5min(): Promise<number | null> {
  return runQuery(
    'requests | summarize dcount(user_Id)',
    QUERY_TIMESPAN_5M,
  );
}

export interface SeriesPoint {
  t: string; // ISO 8601
  v: number | null;
}

/**
 * Latency p95 series (1min buckets) nos últimos 30min — sparkline pro /admin/ops.
 * Retorna array de {t, v} ordenado cronologicamente. null se AppInsights indisponível.
 */
export async function getLatencyP95Series30min(): Promise<SeriesPoint[] | null> {
  const c = getClient();
  if (!c || !env.APPINSIGHTS_RESOURCE_ID) return null;

  const query = `requests
| where timestamp > ago(30m)
| summarize p95 = percentile(duration, 95) by bin(timestamp, 1m)
| order by timestamp asc
| project timestamp, p95`;

  try {
    const result = await Promise.race([
      c.queryResource(env.APPINSIGHTS_RESOURCE_ID, query, { duration: QUERY_TIMESPAN_30M }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('appinsights query timeout')), QUERY_TIMEOUT_MS),
      ),
    ]);

    if (result.status !== LogsQueryResultStatus.Success) {
      logger.warn({ status: result.status }, 'appinsights series partial result');
      return null;
    }
    const table = result.tables[0];
    if (!table) return [];

    return table.rows.map((row) => {
      const t = row[0];
      const v = row[1];
      const tStr =
        t instanceof Date
          ? t.toISOString()
          : typeof t === 'string'
            ? t
            : new Date(String(t)).toISOString();
      const vNum = typeof v === 'number' ? Math.round(v) : v === null ? null : null;
      return { t: tStr, v: vNum };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, 'appinsights p95 series query failed');
    return null;
  }
}

/**
 * Helper: indica se queries vão retornar dados (config presente).
 */
export function isAppInsightsConfigured(): boolean {
  return Boolean(env.APPINSIGHTS_RESOURCE_ID);
}
