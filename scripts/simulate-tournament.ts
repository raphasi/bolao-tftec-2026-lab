/**
 * Tournament Simulator (S3.7) — popula usuários, palpites e resultados de
 * teste pra demonstrar o fluxo end-to-end do bolão (calculator, leaderboard,
 * SignalR).
 *
 * Uso:
 *   tsx scripts/simulate-tournament.ts --users 5 --finish-matches 6
 *   tsx scripts/simulate-tournament.ts --users 3 --finish-matches 3 --tournament-final
 *   tsx scripts/simulate-tournament.ts --reset
 *
 * Args:
 *   --users N             (default 5)   cria N users de teste
 *   --predict-rate P      (default 0.7) % chance de cada user palpitar cada jogo finalizado
 *   --finish-matches M    (default 6)   quantos jogos finalizar (matchIds 1..M)
 *   --tournament-final               também grava resultado final (champion/top4/topScorer)
 *   --reset                          remove users de teste antes de criar
 *   --api-url URL                    default http://localhost:4090/api
 *
 * Pré-requisitos:
 *   - Backend rodando localmente (npm run dev:backend OR prod-mode)
 *   - Admin user existente (admin@bolao.tftec.com.br / TFTEC@2026!)
 *   - Cosmos populado com 72 matches (S2.1 seed)
 *   - .env com COSMOS_ENDPOINT + COSMOS_KEY (pra mockar kickoff passado)
 */
import { CosmosClient } from '@azure/cosmos';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../.env') });

// ─── Args ───
const argv = process.argv.slice(2);
function getArg(flag: string, defaultVal: string): string {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : defaultVal;
}
function getBoolArg(flag: string): boolean {
  return argv.includes(flag);
}

const N_USERS = parseInt(getArg('--users', '5'), 10);
const PREDICT_RATE = parseFloat(getArg('--predict-rate', '0.7'));
const N_FINISH = parseInt(getArg('--finish-matches', '6'), 10);
const TOURNAMENT_FINAL = getBoolArg('--tournament-final');
const RESET = getBoolArg('--reset');
const API_URL = getArg('--api-url', 'http://localhost:4090/api');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@bolao.tftec.com.br';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'TFTEC@2026!';

// ─── Logging ───
const log = {
  info: (m: string) => console.log(`\x1b[36mℹ\x1b[0m  ${m}`),
  ok: (m: string) => console.log(`\x1b[32m✓\x1b[0m  ${m}`),
  warn: (m: string) => console.log(`\x1b[33m⚠\x1b[0m  ${m}`),
  error: (m: string) => console.log(`\x1b[31m✗\x1b[0m  ${m}`),
  section: (m: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${m}\x1b[0m`),
};

// ─── Cosmos client ───
const cosmos = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT!,
  key: process.env.COSMOS_KEY!,
});
const db = cosmos.database(process.env.COSMOS_DATABASE ?? 'bolao2026');

// ─── HTTP helpers ───
async function api<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ─── Reset: limpar users de teste ───
async function resetTestUsers(): Promise<void> {
  log.section('Reset: removendo users com prefix simulate-');
  const users = db.container('users');
  const { resources } = await users.items
    .query<{ id: string; userId: string; email: string }>({
      query: "SELECT * FROM c WHERE STARTSWITH(c.email, 'simulate-')",
    })
    .fetchAll();
  log.info(`Encontrados ${resources.length} users de teste`);

  const predictions = db.container('predictions');
  const specials = db.container('specials');
  const leaderboard = db.container('leaderboard');
  for (const u of resources) {
    // Deletar predictions
    const { resources: preds } = await predictions.items
      .query<{ id: string; userId: string }>({
        query: 'SELECT c.id, c.userId FROM c WHERE c.userId = @uid',
        parameters: [{ name: '@uid', value: u.userId }],
      })
      .fetchAll();
    for (const p of preds) await predictions.item(p.id, p.userId).delete();
    // Deletar specials
    try {
      await specials.item(`${u.userId}_2026`, u.userId).delete();
    } catch {
      /* ignore 404 */
    }
    // Deletar leaderboard
    try {
      await leaderboard.item(`2026_${u.userId}`, 2026).delete();
    } catch {
      /* ignore 404 */
    }
    await users.item(u.id, u.userId).delete();
  }
  log.ok(`Removidos ${resources.length} users de teste + dados relacionados`);
}

// ─── Criar N users ───
interface TestUser {
  token: string;
  userId: string;
  name: string;
}

async function createUsers(n: number): Promise<TestUser[]> {
  log.section(`Criando ${n} users de teste`);
  const users: TestUser[] = [];
  const ts = Date.now();
  for (let i = 1; i <= n; i++) {
    const email = `simulate-${ts}-${i}@test.com`;
    try {
      const reg = await api<{ token: string; user: { userId: string; name: string } }>(
        'POST',
        '/auth/register',
        { body: { email, password: 'simulate12345', name: `Aluno ${i}` } },
      );
      users.push({ token: reg.token, userId: reg.user.userId, name: reg.user.name });
      log.ok(`User ${i}: ${reg.user.name} (${reg.user.userId.slice(0, 8)}...)`);
    } catch (e) {
      log.error(`Falha user ${i}: ${(e as Error).message}`);
    }
  }
  return users;
}

// ─── Palpitar randomicamente ───
function randomScore(): number {
  // Distribuição realista (mais 0-2 que 3+)
  return Math.floor(Math.random() ** 1.5 * 4);
}

async function predictRandomly(user: TestUser, finishedMatchIds: number[]): Promise<number> {
  let made = 0;
  for (const matchId of finishedMatchIds) {
    if (Math.random() > PREDICT_RATE) continue;
    try {
      await api('POST', '/predictions', {
        token: user.token,
        body: {
          matchId,
          predictedHome: randomScore(),
          predictedAway: randomScore(),
        },
      });
      made++;
    } catch (e) {
      // pode ser 409 lock — ignora
    }
  }
  return made;
}

// ─── Mockar kickoff passado para permitir finalizar ───
async function mockMatchKickoffPast(matchId: number): Promise<void> {
  const matches = db.container('matches-cache');
  const { resources } = await matches.items
    .query<{ id: string; kickoffUtc: string; groupCode: string }>({
      query: 'SELECT * FROM c WHERE c.matchId = @id',
      parameters: [{ name: '@id', value: matchId }],
    })
    .fetchAll();
  if (!resources[0]) throw new Error(`Match ${matchId} não encontrado`);
  const m = resources[0] as any;
  if (m._originalKickoff) return; // já mockado
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await matches.items.upsert({ ...m, kickoffUtc: past, _originalKickoff: m.kickoffUtc });
}

// ─── Revert mocks ao final ───
async function revertMockedKickoffs(matchIds: number[]): Promise<void> {
  const matches = db.container('matches-cache');
  for (const matchId of matchIds) {
    const { resources } = await matches.items
      .query<{ id: string; groupCode: string; _originalKickoff?: string }>({
        query: 'SELECT * FROM c WHERE c.matchId = @id',
        parameters: [{ name: '@id', value: matchId }],
      })
      .fetchAll();
    const m = resources[0] as any;
    if (!m?._originalKickoff) continue;
    const reverted: any = { ...m, kickoffUtc: m._originalKickoff };
    delete reverted._originalKickoff;
    // NÃO mexer em status/scores/finishedAt — admin já finalizou via API
    await matches.items.upsert(reverted);
  }
}

// ─── Finalizar M matches via admin ───
async function loginAdmin(): Promise<string> {
  const res = await api<{ token: string }>('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return res.token;
}

async function finishMatches(adminToken: string, n: number): Promise<number[]> {
  log.section(`Finalizando primeiros ${n} matches`);
  const finished: number[] = [];
  for (let matchId = 1; matchId <= n; matchId++) {
    await mockMatchKickoffPast(matchId);
    const homeScore = randomScore();
    const awayScore = randomScore();
    try {
      await api('PUT', `/admin/matches/${matchId}/result`, {
        token: adminToken,
        body: { homeScore, awayScore, status: 'finished' },
      });
      finished.push(matchId);
      log.ok(`Match ${matchId} finalizado: ${homeScore}×${awayScore}`);
    } catch (e) {
      log.error(`Match ${matchId} falhou: ${(e as Error).message}`);
    }
  }
  return finished;
}

// ─── Tournament Final (especiais) ───
async function setTournamentFinal(adminToken: string, allTeams: string[]): Promise<void> {
  log.section('Tournament Final (champion/top4/topScorer)');
  const [a, b, c, d] = allTeams.slice(0, 4);
  await api('PUT', '/admin/config/tournament-final', {
    token: adminToken,
    body: {
      champion: a,
      runnerUp: b,
      thirdPlace: c,
      fourthPlace: d,
      topScorer: 'Mbappé',
    },
  });
  log.ok(`Final salvo: ${a} > ${b} > ${c} > ${d}, topScorer Mbappé`);
}

// ─── Validar leaderboard final ───
async function validateLeaderboard(expectedUsers: number): Promise<void> {
  log.section('Validando leaderboard');
  log.info('Aguardando 15s para changefeed + Function processarem...');
  await new Promise((r) => setTimeout(r, 15_000));

  const lb = await api<{ ranking: Array<{ userName: string; totalPoints: number; rank: number }>; count: number }>('GET', '/leaderboard');
  log.info(`Leaderboard count: ${lb.count}`);
  log.info(`Top 5:`);
  for (const e of lb.ranking.slice(0, 5)) {
    console.log(`    #${e.rank} ${e.userName} — ${e.totalPoints} pts`);
  }
  if (lb.count >= expectedUsers) {
    log.ok(`Leaderboard tem ${lb.count} entries (esperado >= ${expectedUsers})`);
  } else {
    log.warn(`Leaderboard tem só ${lb.count} entries — Function pode não ter rodado ainda (deploy?)`);
  }
}

// ─── Main ───
async function main(): Promise<void> {
  console.log('\n\x1b[1m🎲 Tournament Simulator — Bolão TFTEC Cloud\x1b[0m');
  console.log(`  API: ${API_URL}`);
  console.log(`  Users: ${N_USERS}, Predict rate: ${PREDICT_RATE * 100}%, Finish: ${N_FINISH} matches`);
  console.log(`  Reset: ${RESET}, Tournament final: ${TOURNAMENT_FINAL}\n`);

  if (RESET) {
    await resetTestUsers();
    return;
  }

  const adminToken = await loginAdmin();
  log.ok('Admin login OK');

  // 1. Cria N users
  const users = await createUsers(N_USERS);
  if (users.length === 0) {
    log.error('Nenhum user criado, abortando');
    return;
  }

  // 2. Mocka kickoff dos primeiros N matches + finaliza
  const finishedMatchIds = await finishMatches(adminToken, N_FINISH);

  // 3. Cada user palpita randomicamente (em matches NOVOS, mas como já estão finished
  // o lock vai bloquear. Precisamos palpitar ANTES de finalizar OU usar matches diferentes.)
  // Decisão: cada user palpita nos matches finished com placar aleatório direto via Cosmos
  // (bypassing lock-by-kickoff) pra simular o cenário "user palpitou antes do jogo"
  log.section('Inserindo palpites de teste diretos no Cosmos (bypass lock)');
  const predictionsContainer = db.container('predictions');
  const matchesContainer = db.container('matches-cache');
  const { resources: finishedDocs } = await matchesContainer.items
    .query<{ matchId: number; groupCode: string; homeTeam: string; awayTeam: string; kickoffUtc: string }>({
      query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.matchId)',
      parameters: [{ name: '@ids', value: finishedMatchIds }],
    })
    .fetchAll();

  for (const u of users) {
    let count = 0;
    for (const m of finishedDocs) {
      if (Math.random() > PREDICT_RATE) continue;
      const nowIso = new Date().toISOString();
      await predictionsContainer.items.upsert({
        id: `${u.userId}_${m.matchId}`,
        userId: u.userId,
        matchId: m.matchId,
        groupCode: m.groupCode,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoffUtc: m.kickoffUtc,
        predictedHome: randomScore(),
        predictedAway: randomScore(),
        actualHome: null,
        actualAway: null,
        points: null,
        lockedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      count++;
    }
    log.ok(`${u.name}: ${count} palpites inseridos`);
  }

  // 4. Re-trigger calculator: zerar pointsCalculatedAt nos matches finalizados
  log.section('Re-disparando calculator (reset pointsCalculatedAt)');
  for (const matchId of finishedMatchIds) {
    const { resources } = await matchesContainer.items
      .query<any>({
        query: 'SELECT * FROM c WHERE c.matchId = @id',
        parameters: [{ name: '@id', value: matchId }],
      })
      .fetchAll();
    if (resources[0]) {
      await matchesContainer.items.upsert({
        ...resources[0],
        pointsCalculatedAt: null,
      });
    }
  }
  log.ok(`pointsCalculatedAt resetado em ${finishedMatchIds.length} matches`);

  // 5. Tournament final (opcional)
  if (TOURNAMENT_FINAL) {
    const groupsRes = await api<{ groups: Array<{ teams: Array<{ iso: string }> }> }>('GET', '/groups');
    const allTeams = groupsRes.groups.flatMap((g) => g.teams.map((t) => t.iso));
    await setTournamentFinal(adminToken, allTeams);

    // Cada user palpita especiais aleatórios
    log.section('Palpites especiais de teste');
    const specialsContainer = db.container('specials');
    for (const u of users) {
      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      const nowIso = new Date().toISOString();
      await specialsContainer.items.upsert({
        id: `${u.userId}_2026`,
        userId: u.userId,
        season: 2026,
        champion: pick(allTeams),
        runnerUp: pick(allTeams),
        thirdPlace: pick(allTeams),
        fourthPlace: pick(allTeams),
        topScorer: pick(['Mbappé', 'Messi', 'Haaland', 'Vinicius Jr.']),
        lockedAt: null,
        points: { champion: 0, runnerUp: 0, thirdPlace: 0, fourthPlace: 0, topScorer: 0, top4Bonus: 0 },
        updatedAt: nowIso,
      });
    }
    log.ok(`${users.length} specials inseridos`);
  }

  // 6. Aguardar Function processar + validar
  await validateLeaderboard(users.length);

  // 7. Revert mocks (opcional — deixa pra debug visual no /admin/results)
  log.section('Cleanup');
  log.info('NOTA: mocks de kickoff NÃO revertidos (deixa scoring visível em /perfil)');
  log.info('Para limpar tudo: tsx scripts/simulate-tournament.ts --reset');

  console.log('\n\x1b[1m✓ Simulação completa\x1b[0m\n');
  console.log(`  Users criados: ${users.length}`);
  console.log(`  Matches finalizados: ${finishedMatchIds.length}`);
  console.log(`  Ver leaderboard: ${API_URL.replace('/api', '')}/leaderboard\n`);
}

main().catch((err) => {
  log.error(`Simulador falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
