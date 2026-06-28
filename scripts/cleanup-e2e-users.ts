/**
 * Cleanup E2E Users — remove users de teste acumulados.
 *
 * Tests Playwright criam usuários com email prefix `e2e-` (ver tests/e2e/helpers.ts).
 * Como não há DELETE API exposed para users, eles acumulam ao longo do tempo.
 *
 * Este script é o cleanup batch referenciado no event-day-runbook (passo D-7).
 *
 * Comportamento:
 *  - Busca users WHERE STARTSWITH(email, 'e2e-')
 *  - Para cada user encontrado: hard-delete users + predictions + specials + leaderboard
 *  - Idempotente (re-rodar é safe)
 *  - Por padrão pede confirmação interativa (digite "CONFIRMAR")
 *
 * Flags:
 *  --dry-run   apenas lista sem deletar (sempre seguro)
 *  --force/-y  pula confirmação interativa
 *  --prefix=X  custom prefix (default: e2e-)
 *
 * Uso:
 *   tsx scripts/cleanup-e2e-users.ts --dry-run       # ver o que seria deletado
 *   tsx scripts/cleanup-e2e-users.ts                  # deletar com confirmação
 *   tsx scripts/cleanup-e2e-users.ts --force          # deletar sem perguntar (CI)
 */
import { CosmosClient } from '@azure/cosmos';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force') || args.has('-y');
const PREFIX_ARG = Array.from(args).find((a) => a.startsWith('--prefix='));
const PREFIX = PREFIX_ARG ? PREFIX_ARG.slice('--prefix='.length) : 'e2e-';

const log = {
  info: (m: string) => console.log(`\x1b[36mℹ\x1b[0m  ${m}`),
  ok: (m: string) => console.log(`\x1b[32m✓\x1b[0m  ${m}`),
  warn: (m: string) => console.log(`\x1b[33m⚠\x1b[0m  ${m}`),
  error: (m: string) => console.log(`\x1b[31m✗\x1b[0m  ${m}`),
  section: (m: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${m}\x1b[0m`),
};

interface UserDoc {
  id: string;
  userId: string;
  email: string;
  name?: string;
  createdAt?: string;
}

async function confirmAction(count: number, dbName: string): Promise<void> {
  if (FORCE || DRY_RUN) return;

  log.section('⚠️  CUIDADO — Hard delete');
  console.log(`   Database: ${dbName}`);
  console.log(`   Prefix:   "${PREFIX}"`);
  console.log(`   Users a deletar: ${count}`);
  console.log(`   Também deleta: predictions, specials, leaderboard desses users`);
  console.log();

  const rl = createInterface({ input, output });
  const answer = await rl.question('Digite "CONFIRMAR" para prosseguir: ');
  rl.close();

  if (answer.trim() !== 'CONFIRMAR') {
    log.error('Cleanup cancelado pelo usuário.');
    process.exit(0);
  }
}

interface DocWithPK {
  id: string;
  userId?: string;
  season?: number;
}

/**
 * Deleta docs correlatos a um userId num container específico.
 * pkField determina qual campo é o PK do container:
 *  - 'userId' para containers com PK /userId (predictions, specials)
 *  - 'season' para containers com PK /season (leaderboard)
 *
 * Fix do @qa gate: antes usava `doc.userId ?? doc.season` que falhava em
 * leaderboard (doc tem userId como campo regular mas PK é season).
 */
async function deleteByUserId(
  container: ReturnType<ReturnType<CosmosClient['database']>['container']>,
  userId: string,
  containerLabel: string,
  pkField: 'userId' | 'season',
): Promise<number> {
  const { resources } = await container.items
    .query<DocWithPK>({
      query: 'SELECT c.id, c.userId, c.season FROM c WHERE c.userId = @uid',
      parameters: [{ name: '@uid', value: userId }],
    })
    .fetchAll();

  let deleted = 0;
  for (const doc of resources) {
    const pk = doc[pkField];
    if (pk === undefined || pk === null) {
      log.warn(`${containerLabel} doc ${doc.id} sem PK (${pkField}) — pulando`);
      continue;
    }
    if (DRY_RUN) {
      deleted++;
      continue;
    }
    try {
      await container.item(doc.id, pk).delete();
      deleted++;
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code !== 404) {
        log.warn(`${containerLabel} delete ${doc.id} falhou: ${(err as Error).message}`);
      }
    }
  }
  return deleted;
}

async function main(): Promise<void> {
  console.log('\n\x1b[1m🧹 Bolão TFTEC — Cleanup E2E Users\x1b[0m');
  if (DRY_RUN) log.warn('Modo DRY-RUN — nada será deletado');
  log.info(`Prefix: "${PREFIX}"`);

  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
    log.error('COSMOS_ENDPOINT e COSMOS_KEY são obrigatórios em .env');
    process.exit(1);
  }

  const cosmos = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
  });
  const dbName = process.env.COSMOS_DATABASE ?? 'bolao2026';
  const db = cosmos.database(dbName);
  log.info(`Database: ${dbName}`);

  log.section('Buscando users com prefix');
  const users = db.container('users');
  const { resources: matched } = await users.items
    .query<UserDoc>({
      query: 'SELECT * FROM c WHERE STARTSWITH(c.email, @prefix)',
      parameters: [{ name: '@prefix', value: PREFIX }],
    })
    .fetchAll();

  if (matched.length === 0) {
    log.ok('Nenhum user de teste encontrado — nada a fazer.');
    return;
  }

  log.info(`Encontrados ${matched.length} users com prefix "${PREFIX}":`);
  for (const u of matched) {
    console.log(`   - ${u.email} (userId: ${u.userId.slice(0, 12)}...)`);
  }

  await confirmAction(matched.length, dbName);

  log.section(DRY_RUN ? 'Dry-run — listando o que seria deletado' : 'Deletando');

  const predictions = db.container('predictions');
  const specials = db.container('specials');
  const leaderboard = db.container('leaderboard');

  let totals = { users: 0, predictions: 0, specials: 0, leaderboard: 0 };

  for (const user of matched) {
    const predCount = await deleteByUserId(predictions, user.userId, 'predictions', 'userId');
    const specCount = await deleteByUserId(specials, user.userId, 'specials', 'userId');
    const lbCount = await deleteByUserId(leaderboard, user.userId, 'leaderboard', 'season');

    if (!DRY_RUN) {
      try {
        await users.item(user.id, user.userId).delete();
        totals.users++;
        log.ok(`${user.email}: user + ${predCount} predictions + ${specCount} specials + ${lbCount} lb`);
      } catch (err: unknown) {
        const e = err as { code?: number };
        if (e.code !== 404) {
          log.warn(`Delete user ${user.email} falhou: ${(err as Error).message}`);
        }
      }
    } else {
      totals.users++;
      log.info(`${user.email}: would delete user + ${predCount} predictions + ${specCount} specials + ${lbCount} lb`);
    }

    totals.predictions += predCount;
    totals.specials += specCount;
    totals.leaderboard += lbCount;
  }

  log.section('Resumo');
  log.ok(
    DRY_RUN
      ? `[DRY-RUN] Deletaria: ${totals.users} users, ${totals.predictions} predictions, ${totals.specials} specials, ${totals.leaderboard} leaderboard`
      : `Deletado: ${totals.users} users, ${totals.predictions} predictions, ${totals.specials} specials, ${totals.leaderboard} leaderboard`,
  );
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m Cleanup falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
