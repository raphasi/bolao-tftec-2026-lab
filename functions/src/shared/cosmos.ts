/**
 * Cliente Cosmos singleton para Functions.
 * Lê connection string de AzureWebJobsCosmosDBConnection (formato:
 * AccountEndpoint=...;AccountKey=...;).
 */
import { CosmosClient, Container, Database } from '@azure/cosmos';

function parseConnectionString(conn: string): { endpoint: string; key: string } {
  const parts = conn.split(';').filter(Boolean);
  let endpoint = '';
  let key = '';
  for (const p of parts) {
    const [k, ...v] = p.split('=');
    const value = v.join('=');
    if (k === 'AccountEndpoint') endpoint = value;
    else if (k === 'AccountKey') key = value;
  }
  if (!endpoint || !key) {
    throw new Error(
      'AzureWebJobsCosmosDBConnection inválido — esperado "AccountEndpoint=...;AccountKey=...;"',
    );
  }
  return { endpoint, key };
}

let _client: CosmosClient | null = null;
let _db: Database | null = null;

export function getCosmosClient(): CosmosClient {
  if (_client) return _client;
  const conn = process.env.AzureWebJobsCosmosDBConnection ?? process.env.COSMOS_CONNECTION;
  if (!conn) {
    throw new Error('AzureWebJobsCosmosDBConnection não configurado');
  }
  const { endpoint, key } = parseConnectionString(conn);
  _client = new CosmosClient({
    endpoint,
    key,
    userAgentSuffix: 'fifa2026-bolao-functions',
  });
  return _client;
}

export function getDatabase(): Database {
  if (_db) return _db;
  const dbName = process.env.COSMOS_DATABASE ?? 'bolao2026';
  _db = getCosmosClient().database(dbName);
  return _db;
}

export type ContainerId =
  | 'users'
  | 'predictions'
  | 'specials'
  | 'matches-cache'
  | 'leaderboard'
  | 'groups'
  | 'config';

export function container(id: ContainerId): Container {
  return getDatabase().container(id);
}
