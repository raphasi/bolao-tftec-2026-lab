/**
 * Load Test SignalR — valida cap de conexões concorrentes + degradação graciosa.
 *
 * Cenário: SignalR Service tier `Free_F1` tem hard cap de **20 conexões
 * concorrentes** (Azure docs). Bolão TFTEC espera 30-50 users durante evento.
 * Este script valida:
 *   1) Em qual N as conexões começam a falhar?
 *   2) Falha é graciosa (rejected) ou enfileirada/timeout?
 *   3) REST API (`/api/leaderboard`) continua respondendo enquanto cap está estourado?
 *
 * Estratégia: login UMA vez como admin, abrir N conexões em paralelo usando
 * o mesmo userId (SignalR conta por *connection*, não por user). Não precisa
 * registrar N usuários (evita rate limit 10 reqs/min do /register).
 *
 * Uso:
 *   tsx scripts/load-test-signalr.ts --count=25 --target=local
 *   tsx scripts/load-test-signalr.ts --count=25 --target=prod --i-know-what-im-doing
 *   tsx scripts/load-test-signalr.ts --count=25 --target=prod --i-know-what-im-doing --hold=30
 *
 * Flags:
 *   --count=N           número de conexões a tentar (default 25)
 *   --target=local|prod alvo (default local; prod requer --i-know-what-im-doing)
 *   --hold=N            segundos a segurar conexões antes de desconectar (default 15)
 *   --i-know-what-im-doing  flag de segurança obrigatória pra rodar contra prod
 *
 * Output: tabela com timestamps de cada conexão (success/failure), pivot summary,
 * health check do REST API durante o teste.
 */
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../.env') });

// --- Args ----------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name: string, def?: string): string | undefined {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  if (found) return found.slice(`--${name}=`.length);
  if (args.includes(`--${name}`)) return 'true';
  return def;
}

const COUNT = parseInt(arg('count', '25') ?? '25', 10);
const TARGET = arg('target', 'local') ?? 'local';
const HOLD_SECONDS = parseInt(arg('hold', '15') ?? '15', 10);
const SAFETY = arg('i-know-what-im-doing') === 'true';

const URL_LOCAL = 'http://localhost:3001';
const URL_PROD = 'https://app-fifa-bolao-tftec01.azurewebsites.net';
const URL = TARGET === 'prod' ? URL_PROD : URL_LOCAL;

// --- Logging -------------------------------------------------------------
const log = {
  info: (m: string) => console.log(`\x1b[36mℹ\x1b[0m  ${m}`),
  ok: (m: string) => console.log(`\x1b[32m✓\x1b[0m  ${m}`),
  warn: (m: string) => console.log(`\x1b[33m⚠\x1b[0m  ${m}`),
  error: (m: string) => console.log(`\x1b[31m✗\x1b[0m  ${m}`),
  section: (m: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${m}\x1b[0m`),
};

// --- Pre-flight checks ---------------------------------------------------
if (TARGET === 'prod' && !SAFETY) {
  log.error('Para rodar contra prod, passe --i-know-what-im-doing');
  log.warn('Esse script abre N conexões concorrentes em SignalR Free (cap 20).');
  log.warn('Durante o teste, usuários reais podem perder realtime.');
  process.exit(1);
}

if (!process.env.SEED_ADMIN_PASSWORD) {
  log.error('SEED_ADMIN_PASSWORD não está em .env');
  process.exit(1);
}

// --- Connection state ----------------------------------------------------
interface ConnAttempt {
  index: number;
  status: 'pending' | 'connected' | 'failed';
  connectedAtMs?: number;
  failedAtMs?: number;
  error?: string;
  connectionId?: string;
  eventsReceived: number;
}

const attempts: ConnAttempt[] = [];
const connections: Array<ReturnType<typeof HubConnectionBuilder.prototype.build>> = [];
const T0 = Date.now();

// --- Helpers -------------------------------------------------------------
async function login(): Promise<string> {
  const res = await fetch(`${URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@bolao.tftec.com.br',
      password: process.env.SEED_ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const data = (await res.json()) as { token: string; user: { email: string; role: string } };
  log.ok(`Login OK: ${data.user.email} (${data.user.role})`);
  return data.token;
}

async function negotiate(token: string): Promise<{ url: string; accessToken: string }> {
  const res = await fetch(`${URL}/api/negotiate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`negotiate failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { url: string; accessToken: string };
}

async function openConnection(index: number, token: string): Promise<void> {
  const attempt: ConnAttempt = { index, status: 'pending', eventsReceived: 0 };
  attempts.push(attempt);

  try {
    const { url, accessToken } = await negotiate(token);
    const connection = new HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => accessToken })
      .configureLogging(LogLevel.None) // muito ruidoso em escala
      .build();

    connection.on('leaderboard:update', () => {
      attempt.eventsReceived++;
    });

    await connection.start();
    attempt.status = 'connected';
    attempt.connectedAtMs = Date.now() - T0;
    attempt.connectionId = connection.connectionId ?? '?';
    connections.push(connection);
  } catch (err) {
    attempt.status = 'failed';
    attempt.failedAtMs = Date.now() - T0;
    attempt.error = err instanceof Error ? err.message : String(err);
  }
}

async function checkRestApiHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${URL}/api/health/full`, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as { status: string; dependencies?: { cosmos?: { ok?: boolean } } };
    return {
      ok: data.status === 'ok' && data.dependencies?.cosmos?.ok === true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Main ----------------------------------------------------------------
async function main(): Promise<void> {
  console.log('\n\x1b[1m🧪 Load test SignalR — Bolão TFTEC\x1b[0m');
  log.info(`Target: ${URL}`);
  log.info(`Connections: ${COUNT}`);
  log.info(`Hold: ${HOLD_SECONDS}s`);
  log.info(`SignalR Free cap esperado: 20 conexões concorrentes`);

  log.section('Login admin');
  const token = await login();

  log.section(`Abrindo ${COUNT} conexões em paralelo`);
  // Trigger todas as conexões "ao mesmo tempo" — quem chegar primeiro pega slot
  const before = await checkRestApiHealth();
  log.info(`REST health pré-test: ${before.ok ? 'OK' : 'NOK'} (${before.latencyMs}ms)`);

  await Promise.all(Array.from({ length: COUNT }, (_, i) => openConnection(i + 1, token)));

  const connected = attempts.filter((a) => a.status === 'connected').length;
  const failed = attempts.filter((a) => a.status === 'failed').length;
  log.section(`Após Promise.all: ${connected} connected / ${failed} failed`);

  // REST health durante "carga"
  const during = await checkRestApiHealth();
  log.info(`REST health DURANTE cap: ${during.ok ? 'OK' : 'NOK'} (${during.latencyMs}ms)`);

  log.section(`Segurando conexões por ${HOLD_SECONDS}s`);
  await new Promise((r) => setTimeout(r, HOLD_SECONDS * 1000));

  // --- Detailed report ---
  log.section('Detalhamento das tentativas');
  console.log('idx | status     | t (ms) | events | connId            | error');
  console.log('----|------------|--------|--------|-------------------|----------------------------------');
  for (const a of attempts.sort((x, y) => x.index - y.index)) {
    const t = a.connectedAtMs ?? a.failedAtMs ?? -1;
    const cid = a.connectionId ?? '—';
    const err = a.error ?? '';
    console.log(
      `${String(a.index).padStart(3)} | ${a.status.padEnd(10)} | ${String(t).padStart(6)} | ${String(a.eventsReceived).padStart(6)} | ${cid.padEnd(17)} | ${err.slice(0, 80)}`,
    );
  }

  log.section('Summary');
  log.ok(`Connected: ${connected}`);
  if (failed > 0) {
    log.warn(`Failed:    ${failed}`);
    const errorGroups: Record<string, number> = {};
    for (const a of attempts.filter((x) => x.status === 'failed')) {
      const key = (a.error ?? 'unknown').slice(0, 80);
      errorGroups[key] = (errorGroups[key] ?? 0) + 1;
    }
    log.info('Error breakdown:');
    for (const [msg, n] of Object.entries(errorGroups)) {
      console.log(`     ${n}× ${msg}`);
    }
  }

  // --- Cleanup ---
  log.section('Disconnecting all');
  await Promise.all(
    connections.map((c) =>
      c.state !== HubConnectionState.Disconnected ? c.stop().catch(() => {}) : Promise.resolve(),
    ),
  );
  log.ok(`${connections.length} conexões fechadas`);

  // Final health check
  const after = await checkRestApiHealth();
  log.info(`REST health pós-test: ${after.ok ? 'OK' : 'NOK'} (${after.latencyMs}ms)`);
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m Load test falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
