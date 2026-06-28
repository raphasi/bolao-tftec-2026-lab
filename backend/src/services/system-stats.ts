/**
 * System Stats service (S4.5.2).
 * Agrega KPIs do bolão + status infra.
 * Cache em-memória 30s pra evitar carga repetida Cosmos.
 */
import { container, pingCosmos } from './cosmos.js';
import { env } from '../config/env.js';
import { SEASON } from '../types/domain.js';
import {
  getErrors24h,
  getLatencyP95Ms,
  getRequestsLast1h,
} from './appinsights.js';

export interface SystemStatsResponse {
  bolao: {
    users: { total: number; admins: number; active: number; inactive: number };
    predictions: { total: number; scored: number; perfect: number };
    matches: { total: number; finished: number; scheduled: number };
    leaderboard: {
      count: number;
      leader: { userName: string; totalPoints: number } | null;
    };
  };
  infrastructure: {
    cosmos: { ok: boolean; latencyMs: number; containers: number; database: string };
    functionApp: {
      name: string;
      state: string;
      functionsRegistered: number;
      functionsList: string[];
    };
    appService: { name: string; uptimeSeconds: number };
    signalR: { name: string; tier: string };
  };
  observability: {
    errors24h: number | null;
    requestsLast1h: number | null;
    latencyP95Ms: number | null;
  };
  fetchedAt: string;
}

// Cache em-memória (TTL 30s) — system stats mudam lentamente
const cache: { data: SystemStatsResponse | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};
const CACHE_TTL_MS = 30_000;
const SERVER_STARTED_AT = Date.now();

// 6 Functions hardcoded — alinhar com functions/src/functions/*.ts
// Em S5+ podemos buscar via Azure REST API se necessário
const KNOWN_FUNCTIONS = [
  'calc-predictions',
  'calc-specials',
  'aggregate-from-predictions',
  'aggregate-from-specials',
  'emit-leaderboard-update',
  'health-check-cron',
];

async function gatherBolaoStats(): Promise<SystemStatsResponse['bolao']> {
  // Users
  const usersTotal = await queryUsersCount();
  const usersAdmins = await queryUsersCountByFilter('c.role = "admin"');
  const usersActive = await queryUsersCountByFilter('c.active = true');
  const usersInactive = await queryUsersCountByFilter('c.active = false');

  // Predictions
  const predTotal = await queryPredictionsCount();
  const predScored = await queryPredictionsCountByFilter('c.points != null');
  const predPerfect = await queryPredictionsCountByFilter('c.points = 25'); // placar exato (ver scoring.ts)

  // Matches
  const matchesFinished = await queryMatchesCountByFilter('c.status = "finished"');
  const matchesScheduled = await queryMatchesCountByFilter('c.status = "scheduled"');

  // Leaderboard
  const lbContainer = container('leaderboard');
  const { resources: lbCountResult } = await lbContainer.items
    .query<number>({
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.season = @season',
      parameters: [{ name: '@season', value: SEASON }],
    })
    .fetchAll();
  const lbCount = lbCountResult[0] ?? 0;

  const { resources: leaderResult } = await lbContainer.items
    .query<{ userName: string; totalPoints: number }>({
      query:
        'SELECT TOP 1 c.userName, c.totalPoints FROM c WHERE c.season = @season ORDER BY c.totalPoints DESC',
      parameters: [{ name: '@season', value: SEASON }],
    })
    .fetchAll();
  const leader = leaderResult[0] && leaderResult[0].totalPoints > 0 ? leaderResult[0] : null;

  return {
    users: { total: usersTotal, admins: usersAdmins, active: usersActive, inactive: usersInactive },
    predictions: { total: predTotal, scored: predScored, perfect: predPerfect },
    matches: { total: 72, finished: matchesFinished, scheduled: matchesScheduled },
    leaderboard: { count: lbCount, leader },
  };
}

async function queryUsersCount(): Promise<number> {
  const { resources } = await container('users')
    .items.query<number>('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  return resources[0] ?? 0;
}

async function queryUsersCountByFilter(filter: string): Promise<number> {
  const { resources } = await container('users')
    .items.query<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${filter}`)
    .fetchAll();
  return resources[0] ?? 0;
}

async function queryPredictionsCount(): Promise<number> {
  const { resources } = await container('predictions')
    .items.query<number>('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  return resources[0] ?? 0;
}

async function queryPredictionsCountByFilter(filter: string): Promise<number> {
  const { resources } = await container('predictions')
    .items.query<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${filter}`)
    .fetchAll();
  return resources[0] ?? 0;
}

async function queryMatchesCountByFilter(filter: string): Promise<number> {
  const { resources } = await container('matchesCache')
    .items.query<number>(`SELECT VALUE COUNT(1) FROM c WHERE ${filter}`)
    .fetchAll();
  return resources[0] ?? 0;
}

async function gatherInfrastructure(): Promise<SystemStatsResponse['infrastructure']> {
  const cosmosPing = await pingCosmos();

  // Nomes derivados do App Service real: o Azure seta WEBSITE_SITE_NAME
  // automaticamente com o nome do app. Evita hardcode de um ambiente especifico
  // e funciona em qualquer self-host (override opcional via env).
  const siteName = process.env.WEBSITE_SITE_NAME ?? 'app-fifa-bolao-local';
  const suffix = siteName.replace(/^app-fifa-bolao-/, '');

  return {
    cosmos: {
      ok: cosmosPing.ok,
      latencyMs: cosmosPing.ok ? cosmosPing.latencyMs : -1,
      containers: 13, // hardcoded — Bicep deploys mantém em sync
      database: env.COSMOS_DATABASE,
    },
    functionApp: {
      name: process.env.FUNCTION_APP_NAME ?? `func-fifa-bolao-${suffix}`,
      state: 'Running', // hardcoded — em S5 podemos consultar via SCM API
      functionsRegistered: KNOWN_FUNCTIONS.length,
      functionsList: KNOWN_FUNCTIONS,
    },
    appService: {
      name: siteName,
      uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
    },
    signalR: {
      name: process.env.SIGNALR_NAME ?? `signalr-fifa-bolao-${suffix}`,
      tier: 'Free',
    },
  };
}

/**
 * GET SystemStatsResponse — cached 30s.
 */
export async function getSystemStats(): Promise<SystemStatsResponse> {
  const now = Date.now();
  if (cache.data && now < cache.expiresAt) {
    return cache.data;
  }

  const [bolao, infrastructure, errors24h, requestsLast1h, latencyP95Ms] = await Promise.all([
    gatherBolaoStats(),
    gatherInfrastructure(),
    getErrors24h(),
    getRequestsLast1h(),
    getLatencyP95Ms(),
  ]);

  const stats: SystemStatsResponse = {
    bolao,
    infrastructure,
    observability: {
      // S5.2: populados via App Insights se APPINSIGHTS_RESOURCE_ID configurado.
      // null = não-configurado OU query falhou (graceful fallback).
      errors24h,
      requestsLast1h,
      latencyP95Ms,
    },
    fetchedAt: new Date().toISOString(),
  };

  cache.data = stats;
  cache.expiresAt = now + CACHE_TTL_MS;
  return stats;
}
