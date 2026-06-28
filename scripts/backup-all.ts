/**
 * backup-all.ts — export JSON de TODOS os containers de dados (rede de segurança
 * do ensaio em produção). Read-only. NÃO inclui leases-* (checkpoints do change-feed).
 *
 * Uso:  npx tsx scripts/backup-all.ts
 * Saída: backups/<ISO-stamp>/<container>.json  (gitignored — contém PII/hashes)
 *
 * IMPORTANTE: inclui `config` e `audit-log`, que o `reset-cosmos.ts` NÃO limpa.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { database, endpoint, databaseName } from './lib/cosmos-client.js';

const DATA_CONTAINERS = [
  'users',
  'predictions',
  'specials',
  'matches-cache',
  'leaderboard',
  'groups',
  'config',
  'audit-log',
];

async function main() {
  console.log(`Cosmos: ${endpoint} / db=${databaseName}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolve(process.cwd(), 'backups', stamp);
  mkdirSync(dir, { recursive: true });

  let total = 0;
  for (const id of DATA_CONTAINERS) {
    try {
      const { resources } = await database.container(id).items
        .query('SELECT * FROM c')
        .fetchAll();
      writeFileSync(resolve(dir, `${id}.json`), JSON.stringify(resources, null, 2));
      console.log(`✓ ${id}: ${resources.length} docs`);
      total += resources.length;
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 404) {
        console.warn(`· ${id}: container ausente — pulando`);
        continue;
      }
      throw err;
    }
  }
  console.log(`\nBackup concluído → ${dir} (${total} docs)`);
  console.log('Copie esta pasta para fora da máquina (blob privado) antes de mutar a prod.');
}

main().catch((e) => {
  console.error('Falha no backup:', e);
  process.exit(1);
});
