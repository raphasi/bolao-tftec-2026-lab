/**
 * recalc-finished-matches — força recálculo de pontos dos matches já finalizados.
 *
 * Zera `pointsCalculatedAt` nos matches `status='finished'`. O Function
 * `calc-predictions` (changefeed-triggered) detecta a mudança e reprocessa
 * todas as predictions daquele match com a engine ATUAL (25/15/0 — ADR-019),
 * e `aggregate-leaderboard` atualiza o leaderboard.
 *
 * Idempotente: só toca matches cujo `pointsCalculatedAt != null` (já pontuados).
 * Seguro por padrão: **dry-run**; passe `--apply` para efetivar.
 *
 * Conexão: COSMOS_ENDPOINT + COSMOS_KEY (env — do Key Vault; nunca commitar).
 *
 *   tsx scripts/recalc-finished-matches.ts            # dry-run (lista, não escreve)
 *   tsx scripts/recalc-finished-matches.ts --apply    # efetiva o reset
 */
import { database } from './lib/cosmos-client.js';

const APPLY = process.argv.slice(2).includes('--apply');
const CONTAINER = 'matches-cache';

async function main(): Promise<void> {
  console.log(`\n[recalc-finished-matches] modo: ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN (somente lista)'}\n`);

  const container = database.container(CONTAINER);
  const { resources: finished } = await container.items
    .query<{ id: string; matchId?: string; status: string; pointsCalculatedAt: string | null }>({
      query: "SELECT * FROM c WHERE c.status = 'finished'",
    })
    .fetchAll();

  const scored = finished.filter((m) => m.pointsCalculatedAt != null);

  console.log(`Matches finished: ${finished.length} | já pontuados (alvo): ${scored.length}`);
  if (scored.length === 0) {
    console.log('Nada a recalcular — nenhum match finished com pointsCalculatedAt.\n');
    return;
  }

  for (const m of scored) {
    const tag = m.matchId ?? m.id;
    if (APPLY) {
      await container.items.upsert({ ...m, pointsCalculatedAt: null });
      console.log(`  ✓ reset pointsCalculatedAt → null  (match ${tag})`);
    } else {
      console.log(`  • [dry] resetaria pointsCalculatedAt  (match ${tag}, era ${m.pointsCalculatedAt})`);
    }
  }

  if (APPLY) {
    console.log(
      `\n✓ ${scored.length} matches resetados. ` +
        `O Function calc-predictions (changefeed) vai reprocessar com 25/15/0; ` +
        `aggregate-leaderboard atualiza o leaderboard em seguida (~segundos).\n` +
        `Verifique: GET /api/leaderboard (matchPoints devem refletir 25/15).\n`,
    );
  } else {
    console.log(`\nDry-run — nada escrito. Rode com --apply para efetivar.\n`);
  }
}

main().catch((err) => {
  console.error('❌ Falha no recalc:', err);
  process.exit(1);
});
