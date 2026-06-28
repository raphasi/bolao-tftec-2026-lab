/**
 * Function: emit-leaderboard-update (S3.5)
 *
 * Trigger: Cosmos Change Feed do container 'leaderboard'.
 * Quando aggregate-leaderboard atualiza um doc, este function emite evento
 * 'leaderboard:update' via SignalR REST API para todos os clientes conectados.
 *
 * Output binding SignalR usaria @azure/functions output binding nativo, mas
 * fazemos via REST direto pra evitar dependência extra no extension bundle.
 * Payload mínimo (só timestamp) — cliente refetcha o leaderboard inteiro.
 */
import { app, type CosmosDBv4FunctionOptions, type InvocationContext } from '@azure/functions';
import { createHmac } from 'node:crypto';

const HUB_NAME = 'leaderboard';

interface SignalRConn {
  endpoint: string;
  accessKey: string;
}

function parseConn(conn: string): SignalRConn {
  const parts = conn.split(';').filter(Boolean);
  let endpoint = '';
  let accessKey = '';
  for (const p of parts) {
    const [k, ...v] = p.split('=');
    const value = v.join('=');
    if (k === 'Endpoint') endpoint = value;
    else if (k === 'AccessKey') accessKey = value;
  }
  return { endpoint, accessKey };
}

function signJwt(audience: string, accessKey: string, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { aud: audience, exp: now + ttlSeconds, iat: now };

  const b64url = (obj: object): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = b64url(header);
  const payloadB64 = b64url(payload);
  const sig = createHmac('sha256', accessKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${sig}`;
}

async function emitHandler(documents: unknown, context: InvocationContext): Promise<void> {
  const docs = Array.isArray(documents) ? documents : [];
  if (docs.length === 0) return;

  const conn = process.env.SIGNALR_CONNECTION_STRING;
  if (!conn) {
    context.warn('SIGNALR_CONNECTION_STRING não configurado — skip emit');
    return;
  }

  const { endpoint, accessKey } = parseConn(conn);
  if (!endpoint || !accessKey) {
    context.warn('SIGNALR_CONNECTION_STRING malformado');
    return;
  }

  // Broadcast para o hub inteiro via REST API v1 do Azure SignalR: POST /api/v1/hubs/{hub}
  // (a URL anterior misturava o prefixo legado /api/v1/ com a ação GA :send +
  //  ?api-version, o que retornava 404 e impedia QUALQUER push de chegar aos clientes —
  //  leaderboard ficava congelado até reload. Ver signalr.ts:getSignalRBroadcastInfo,
  //  que usa exatamente este caminho. Sem query string → aud do JWT == url, sem ambiguidade.)
  const url = `${endpoint}/api/v1/hubs/${HUB_NAME}`;
  const token = signJwt(url, accessKey);

  const message = {
    target: 'leaderboard:update',
    arguments: [
      {
        timestamp: new Date().toISOString(),
        affectedCount: docs.length,
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      context.error(`SignalR broadcast failed ${response.status}: ${text}`);
      return;
    }
    context.log(`leaderboard:update broadcast OK (${docs.length} affected)`);
  } catch (err) {
    context.error(`SignalR broadcast error: ${(err as Error).message}`);
  }
}

const options: CosmosDBv4FunctionOptions = {
  connection: 'AzureWebJobsCosmosDBConnection',
  databaseName: process.env.COSMOS_DATABASE ?? 'bolao2026',
  containerName: 'leaderboard',
  leaseContainerName: 'leases-emit-leaderboard',
  createLeaseContainerIfNotExists: false,
  startFromBeginning: false,
  handler: emitHandler,
};

app.cosmosDB('emit-leaderboard-update', options);
