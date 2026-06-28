/**
 * Cliente Cosmos singleton compartilhado entre routes/services do backend.
 * Helpers tipados para os 5 containers do bolão.
 */
import { Container, CosmosClient, Database } from '@azure/cosmos';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const cosmosClient = new CosmosClient({
  endpoint: env.COSMOS_ENDPOINT,
  key: env.COSMOS_KEY,
  userAgentSuffix: 'fifa2026-bolao-backend',
  connectionPolicy: {
    requestTimeout: 30_000,
    enableEndpointDiscovery: true,
  },
});

const database: Database = cosmosClient.database(env.COSMOS_DATABASE);

// IDs dos containers (mantém em sync com infra/modules/cosmos.bicep)
export const CONTAINERS = {
  users: 'users',
  predictions: 'predictions',
  specials: 'specials',
  matchesCache: 'matches-cache',
  leaderboard: 'leaderboard',
  groups: 'groups',
  players: 'players',
  config: 'config',
  auditLog: 'audit-log',
} as const;

export type ContainerKey = keyof typeof CONTAINERS;

/**
 * Acesso ao Container do Cosmos por chave tipada.
 * Reutiliza a referência (cosmosClient já faz pooling de conexões internamente).
 */
export function container(key: ContainerKey): Container {
  return database.container(CONTAINERS[key]);
}

/**
 * Ping no Cosmos para healthcheck. Faz READ rápido do database (não conta RU).
 */
export async function pingCosmos(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
  const started = Date.now();
  try {
    await database.read();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, 'cosmos ping failed');
    return { ok: false, error: message };
  }
}

export { cosmosClient, database };
