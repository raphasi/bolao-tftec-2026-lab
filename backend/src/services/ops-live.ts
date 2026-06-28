/**
 * Ops Live aggregator (S8.2) — alimenta o /admin/ops dashboard.
 *
 * Coleta em paralelo 4 sinais real-time:
 *  - Active match (Cosmos matches-cache)
 *  - Errors last 5min (AppInsights)
 *  - Active users last 5min (AppInsights)
 *  - Latency p95 series 30min (AppInsights)
 *
 * Cache em-memória 10s — granularidade adequada pra live ops sem martelar Cosmos/AI.
 * Graceful fallback: campos AppInsights null se não configurado, active match null
 * se nenhum jogo em janela [kickoff, kickoff+150min].
 */
import { container } from './cosmos.js';
import { computeMatchLocked } from './match-lock.js';
import {
  getActiveUsers5min,
  getErrors5min,
  getLatencyP95Series30min,
  isAppInsightsConfigured,
  type SeriesPoint,
} from './appinsights.js';
import { logger } from '../config/logger.js';
import type { MatchCacheDoc } from '../types/domain.js';

const CACHE_TTL_MS = 10_000;
const MATCH_WINDOW_MS = 150 * 60 * 1000; // 150min = 90 jogo + intervalos + acréscimos + folga

export interface ActiveMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: 'scheduled' | 'live' | 'finished';
  locked: boolean;
  lockedManually: boolean;
  predictionsCount: number;
  minutesSinceKickoff: number;
}

export interface OpsLiveResponse {
  activeMatch: ActiveMatch | null;
  errors5min: number | null;
  activeUsers5min: number | null;
  latencyP95Series30min: SeriesPoint[] | null;
  appInsightsConfigured: boolean;
  fetchedAt: string;
}

const cache: { data: OpsLiveResponse | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};

async function findActiveMatch(): Promise<ActiveMatch | null> {
  const nowMs = Date.now();
  const windowStart = new Date(nowMs - MATCH_WINDOW_MS).toISOString();
  const windowEnd = new Date(nowMs + 30 * 60 * 1000).toISOString(); // ainda nos próximos 30min é "in scope"

  try {
    // Busca jogos com kickoff entre [now-150min, now+30min]
    // Prioriza: live > scheduled próximo > finished recente
    const { resources } = await container('matchesCache')
      .items.query<MatchCacheDoc>({
        query: `SELECT * FROM c
                WHERE c.kickoffUtc >= @start AND c.kickoffUtc <= @end
                ORDER BY c.kickoffUtc ASC`,
        parameters: [
          { name: '@start', value: windowStart },
          { name: '@end', value: windowEnd },
        ],
      })
      .fetchAll();

    if (resources.length === 0) return null;

    // Escolhe o "mais relevante": preferir status=live, senão o que tem kickoff mais próximo de agora
    const live = resources.find((m) => m.status === 'live');
    const candidate =
      live ??
      resources.reduce((closest, m) => {
        const dClosest = Math.abs(new Date(closest.kickoffUtc).getTime() - nowMs);
        const dM = Math.abs(new Date(m.kickoffUtc).getTime() - nowMs);
        return dM < dClosest ? m : closest;
      });

    const predictionsCount = await queryPredictionsCount(candidate.matchId);
    const locked = computeMatchLocked(candidate, nowMs);
    const minutesSinceKickoff = Math.floor(
      (nowMs - new Date(candidate.kickoffUtc).getTime()) / 60_000,
    );

    return {
      matchId: candidate.matchId,
      homeTeam: candidate.homeTeam,
      awayTeam: candidate.awayTeam,
      kickoffUtc: candidate.kickoffUtc,
      status: candidate.status,
      locked,
      lockedManually: candidate.lockedManually === true,
      predictionsCount,
      minutesSinceKickoff,
    };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'ops-live findActiveMatch failed');
    return null;
  }
}

async function queryPredictionsCount(matchId: number): Promise<number> {
  try {
    const { resources } = await container('predictions')
      .items.query<number>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.matchId = @matchId',
        parameters: [{ name: '@matchId', value: matchId }],
      })
      .fetchAll();
    return resources[0] ?? 0;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, matchId }, 'predictions count failed');
    return 0;
  }
}

export async function getOpsLive(): Promise<OpsLiveResponse> {
  const now = Date.now();
  if (cache.data && now < cache.expiresAt) {
    return cache.data;
  }

  const [activeMatch, errors5min, activeUsers5min, latencyP95Series30min] = await Promise.all([
    findActiveMatch(),
    getErrors5min(),
    getActiveUsers5min(),
    getLatencyP95Series30min(),
  ]);

  const response: OpsLiveResponse = {
    activeMatch,
    errors5min,
    activeUsers5min,
    latencyP95Series30min,
    appInsightsConfigured: isAppInsightsConfigured(),
    fetchedAt: new Date().toISOString(),
  };

  cache.data = response;
  cache.expiresAt = now + CACHE_TTL_MS;
  return response;
}
