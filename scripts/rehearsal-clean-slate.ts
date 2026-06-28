/**
 * rehearsal-clean-slate.ts — apaga TODOS os dados de teste preservando apenas
 * o(s) usuário(s) com role 'admin' (a conta admin é mantida COMO ESTÁ, com a
 * senha atual — não é recriada com a padrão).
 *
 * Limpa: users (não-admin), predictions, specials, leaderboard, audit-log, config.
 * NÃO toca matches-cache/groups — rode `npm run seed` depois para garantir os
 * 72 jogos oficiais (scheduled/null) + 12 grupos (admin é idempotente no seed).
 *
 * Uso:
 *   npx tsx scripts/rehearsal-clean-slate.ts            # dry-run
 *   npx tsx scripts/rehearsal-clean-slate.ts --apply
 */
import { database, endpoint, databaseName } from './lib/cosmos-client.js';

const APPLY = process.argv.includes('--apply');

// container -> campo da partition key (necessário para o delete)
const PK_FIELD: Record<string, string> = {
  users: 'userId',
  predictions: 'userId',
  specials: 'userId',
  leaderboard: 'season',
  'audit-log': 'performedBy',
  config: 'scope',
};

async function purge(containerId: string, keep?: (d: Record<string, any>) => boolean) {
  const c = database.container(containerId);
  const { resources } = await c.items.query('SELECT * FROM c').fetchAll();
  const pk = PK_FIELD[containerId];
  let del = 0;
  let kept = 0;
  for (const d of resources as Record<string, any>[]) {
    if (keep && keep(d)) {
      kept++;
      continue;
    }
    if (APPLY) await c.item(d.id as string, d[pk]).delete();
    del++;
  }
  console.log(`${containerId}: ${APPLY ? 'apagados' : 'a apagar'} ${del}${keep ? `, mantidos ${kept}` : ''}`);
}

async function main() {
  console.log(`Cosmos: ${endpoint} / db=${databaseName} (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  await purge('users', (d) => d.role === 'admin');
  await purge('predictions');
  await purge('specials');
  await purge('leaderboard');
  await purge('audit-log');
  await purge('config');
  console.log(
    APPLY
      ? '\nLimpeza concluída. Rode `npm run seed` (72 jogos + 12 grupos; admin idempotente).'
      : '\nDry-run. Use --apply para apagar.',
  );
}

main().catch((e) => {
  console.error('Falha na limpeza:', e);
  process.exit(1);
});
