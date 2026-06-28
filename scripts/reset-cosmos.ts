/**
 * Cosmos DB Reset Script
 * ======================
 * Limpa dados do Cosmos para re-demo. Tem 2 modos:
 *
 *   --soft (padrão):  deleta todos os documents dos containers
 *                     (mais rápido, mantém os containers)
 *
 *   --hard:           deleta os containers e recria
 *                     (último recurso, demora ~30s)
 *
 * Uso:
 *   npm run reset           # soft reset
 *   npm run reset:hard      # hard reset
 *
 * ⚠️  AÇÃO DESTRUTIVA — pede confirmação a menos que --force seja passado.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PartitionKeyKind } from '@azure/cosmos';
import { database, assertDatabaseExists, endpoint, databaseName } from './lib/cosmos-client.js';
import { CONTAINER_CONFIG, type ContainerId } from './lib/cosmos-types.js';

const args = new Set(process.argv.slice(2));
const HARD = args.has('--hard');
const FORCE = args.has('--force') || args.has('-y');

const log = {
  info:    (msg: string) => console.log(`\x1b[36mℹ\x1b[0m  ${msg}`),
  ok:      (msg: string) => console.log(`\x1b[32m✓\x1b[0m  ${msg}`),
  warn:    (msg: string) => console.log(`\x1b[33m⚠\x1b[0m  ${msg}`),
  error:   (msg: string) => console.log(`\x1b[31m✗\x1b[0m  ${msg}`),
  section: (msg: string) => console.log(`\n\x1b[1m\x1b[31m▸ ${msg}\x1b[0m`),
};

async function confirmAction(): Promise<void> {
  if (FORCE) return;

  log.section('⚠️  CUIDADO — Ação destrutiva');
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Database: ${databaseName}`);
  console.log(`   Modo: ${HARD ? '\x1b[31mHARD (deleta containers)\x1b[0m' : '\x1b[33mSOFT (deleta documents)\x1b[0m'}`);
  console.log();

  const rl = createInterface({ input, output });
  const answer = await rl.question('Digite "CONFIRMAR" para prosseguir: ');
  rl.close();

  if (answer.trim() !== 'CONFIRMAR') {
    log.error('Reset cancelado pelo usuário.');
    process.exit(0);
  }
}

async function softReset(): Promise<void> {
  log.section('Soft reset — deletando documents');
  for (const { id: containerId, partitionKey } of CONTAINER_CONFIG) {
    const container = database.container(containerId);
    const pkPath = partitionKey.replace('/', '');

    // Query todos os ids+pks
    const { resources: docs } = await container.items
      .query<Record<string, string>>({
        query: `SELECT c.id, c.${pkPath} as pk FROM c`,
      })
      .fetchAll();

    if (docs.length === 0) {
      log.info(`${containerId}: já vazio`);
      continue;
    }

    let deleted = 0;
    for (const doc of docs) {
      await container.item(doc.id, doc.pk).delete();
      deleted++;
    }
    log.ok(`${containerId}: ${deleted} documents deletados`);
  }
}

async function hardReset(): Promise<void> {
  log.section('Hard reset — deletando e recriando containers');
  for (const { id: containerId, partitionKey } of CONTAINER_CONFIG) {
    try {
      await database.container(containerId).delete();
      log.warn(`${containerId}: deletado`);
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code !== 404) throw err;
    }

    await database.containers.create({
      id: containerId,
      partitionKey: { paths: [partitionKey], kind: PartitionKeyKind.Hash, version: 2 },
    });
    log.ok(`${containerId}: recriado com PK ${partitionKey}`);
  }
  log.warn('Hard reset não restaura composite indexes — rode o Bicep deployment se precisar deles.');
}

async function main(): Promise<void> {
  console.log('\n\x1b[1m🧹 Bolão TFTEC Cloud — Cosmos Reset\x1b[0m');

  await assertDatabaseExists();
  await confirmAction();

  if (HARD) {
    await hardReset();
  } else {
    await softReset();
  }

  log.section('Reset completo');
  log.info('Para repopular: npm run seed');
}

main().catch((err) => {
  log.error(`Reset falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
