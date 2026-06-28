/**
 * SignalR negotiate endpoint (S3.5).
 *
 * Fluxo:
 *  1. Cliente (frontend) chama POST /api/negotiate com Bearer JWT
 *  2. Backend gera client access token via REST API do Azure SignalR Service
 *  3. Retorna { url, accessToken } pro cliente conectar diretamente no SignalR
 *
 * Modo: Default (não-serverless). Backend negotia, cliente conecta. Function
 * separada faz o broadcast via output binding.
 *
 * SIGNALR_CONNECTION_STRING formato:
 *   Endpoint=https://<service>.service.signalr.net;AccessKey=<key>;Version=1.0;
 */
import { Router } from 'express';
import { createHmac, createHash } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { BadRequestError, UnauthorizedError } from '../utils/http-errors.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

const HUB_NAME = 'leaderboard';

interface SignalRConnInfo {
  endpoint: string;
  accessKey: string;
}

function parseSignalRConnection(conn: string): SignalRConnInfo {
  const parts = conn.split(';').filter(Boolean);
  let endpoint = '';
  let accessKey = '';
  for (const p of parts) {
    const [k, ...v] = p.split('=');
    const value = v.join('=');
    if (k === 'Endpoint') endpoint = value;
    else if (k === 'AccessKey') accessKey = value;
  }
  if (!endpoint || !accessKey) {
    throw new Error('SIGNALR_CONNECTION_STRING inválido — esperado "Endpoint=...;AccessKey=...;"');
  }
  return { endpoint, accessKey };
}

/**
 * Gera JWT assinado pra autenticar no Azure SignalR Service.
 * Formato custom do SignalR Service (não o JWT comum do JWT.io).
 *
 * Header: { alg:'HS256', typ:'JWT' }
 * Payload: { aud: <url>, exp: <unix>, iat: <unix>, nameid: <userId> }
 * Sig: HMAC-SHA256(b64url(header) + '.' + b64url(payload), accessKey)
 */
function signSignalRToken(audience: string, accessKey: string, userId: string, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: audience,
    exp: now + ttlSeconds,
    iat: now,
    nameid: userId,
  };

  const b64url = (obj: object): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = b64url(header);
  const payloadB64 = b64url(payload);
  const signature = createHmac('sha256', accessKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${signature}`;
}

router.post('/', requireAuth, (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  if (!env.SIGNALR_CONNECTION_STRING) {
    throw new BadRequestError(
      'SignalR não configurado (SIGNALR_CONNECTION_STRING ausente). Realtime indisponível.',
    );
  }

  const { endpoint, accessKey } = parseSignalRConnection(env.SIGNALR_CONNECTION_STRING);

  // Cliente conecta nesse URL pra ESTABELECER conexão
  const clientUrl = `${endpoint}/client/?hub=${HUB_NAME}`;
  // Token autoriza o cliente a se conectar (auth via JWT signed pela accessKey)
  const accessToken = signSignalRToken(clientUrl, accessKey, req.user.userId);

  logger.info({ userId: req.user.userId, hub: HUB_NAME }, 'SignalR negotiate issued');

  res.json({
    url: clientUrl,
    accessToken,
  });
});

/**
 * Helper para uso interno: gera URL + token para chamadas REST de broadcast.
 * Usado pelas Functions (mas em S3.5 a Function usa output binding, não REST direto).
 */
export function getSignalRBroadcastInfo(): { url: string; token: string } | null {
  if (!env.SIGNALR_CONNECTION_STRING) return null;
  const { endpoint, accessKey } = parseSignalRConnection(env.SIGNALR_CONNECTION_STRING);
  const url = `${endpoint}/api/v1/hubs/${HUB_NAME}`;
  const token = signSignalRToken(url, accessKey, 'system', 60);
  return { url, token };
}

export { router as signalrRouter };
