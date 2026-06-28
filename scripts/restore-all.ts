/**
 * restore-all.ts — restaura containers a partir de um backup do backup-all.ts.
 * Upsert idempotente (PK-aware), removendo campos de sistema do Cosmos.
 *
 * Uso:
 *   npx tsx scripts/restore-all.ts backups/<stamp>            # dry-run (só lista)
 *   npx tsx scripts/restore-all.ts backups/<stamp> --apply    # grava
 *   npx tsx scripts/restore-all.ts backups/<stamp> --apply --only=users,config
 *
 * Observação: upsert NÃO apaga docs criados após o backup — para um estado
 * limpo, rode `npm run reset` (soft) antes do restore quando necessário.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { database, endpoint, databaseName } from './lib/cosmos-client.js';

const APPLY = process.argv.includes('--apply');
const dirArg = process.argv.find((a) => !a.startsWith('--') && !a.endsWith('.ts'));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;

function strip(doc: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...doc };
  for (const k of ['_rid', '_self', '_etag', '_attachments', '_ts']) delete clean[k];
  return clean;
}

async function main() {
  if (!dirArg) {
    console.error('Uso: npx tsx scripts/restore-all.ts <backups/dir> [--apply] [--only=a,b]');
    process.exit(1);
  }
  const dir = resolve(process.cwd(), dirArg);
  if (!existsSync(dir)) {
    console.error(`Pasta não encontrada: ${dir}`);
    process.exit(1);
  }
  console.log(`Cosmos: ${endpoint} / db=${databaseName}`);
  console.log(`Restore de: ${dir}  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (only && !only.includes(id)) continue;
    const docs = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as Record<string, unknown>[];
    console.log(`${APPLY ? 'APPLY' : '[dry]'} ${id}: ${docs.length} docs`);
    if (!APPLY) continue;
    const c = database.container(id);
    for (const d of docs) await c.items.upsert(strip(d));
  }
  console.log(APPLY ? '\nRestore concluído.' : '\nDry-run (use --apply para gravar).');
}

main().catch((e) => {
  console.error('Falha no restore:', e);
  process.exit(1);
});
