/**
 * lab-open-predictions.ts — LIBERA os palpites no laboratório.
 *
 * Problema: a trava de palpite é computada como `now >= kickoffUtc - 30min`.
 * Como a fase de grupos da Copa 2026 já passou (datas em junho/2026), TODOS os
 * jogos aparecem "Palpite finalizado" e os alunos não conseguem palpitar.
 *
 * Solução: move o kickoffUtc dos 72 jogos de grupo para o FUTURO (relativo a
 * AGORA), espaçados, de modo que fiquem abertos para palpite. Guarda o horário
 * original em `_originalKickoff` (idempotente / reversível).
 *
 * Depois disso o fluxo completo funciona no lab: aluno palpita → admin lança o
 * placar (Admin → Resultados; pode finalizar antes do kickoff p/ teste) →
 * Functions pontuam → leaderboard atualiza.
 *
 * Quão à frente: o 1º jogo abre daqui a N dias (default 30 ≈ 1 mês), dando bastante
 * janela para a turma. Ajuste com --days N ou a env LAB_OPEN_START_DAYS.
 *
 * Uso (precisa de COSMOS_ENDPOINT / COSMOS_KEY / COSMOS_DATABASE no ambiente):
 *   npx tsx scripts/lab-open-predictions.ts                  # dry-run (não grava), +30 dias
 *   npx tsx scripts/lab-open-predictions.ts --apply          # grava, +30 dias
 *   npx tsx scripts/lab-open-predictions.ts --apply --days 45  # grava, +45 dias
 *
 * Reverter ao calendário oficial: `npm run reset` + `npm run seed`.
 */
import { database } from './lib/cosmos-client.js';

const APPLY = process.argv.includes('--apply');
const matches = database.container('matches-cache');

// Dias à frente para o 1º jogo (default 30 ≈ 1 mês). --days N tem prioridade sobre a env.
const daysArgIdx = process.argv.indexOf('--days');
const START_DAYS = daysArgIdx !== -1 && process.argv[daysArgIdx + 1]
  ? Number(process.argv[daysArgIdx + 1])
  : Number(process.env.LAB_OPEN_START_DAYS ?? 30);
// Os 72 jogos ficam espaçados de 1h (≈3 dias de janela a partir do START_DAYS).
const START_OFFSET_MS = START_DAYS * 24 * 60 * 60 * 1000;
const SPACING_MS = 60 * 60 * 1000;

async function main() {
  const { resources } = await matches.items
    .query('SELECT * FROM c WHERE c.phase = "group"')
    .fetchAll();
  resources.sort((a, b) => (a.matchId as number) - (b.matchId as number));
  console.log(`[lab-open] ${resources.length} jogos de grupo | 1º jogo em +${START_DAYS} dias (espaçados de 1h)`);

  const base = Date.now() + START_OFFSET_MS;
  let count = 0;
  for (let i = 0; i < resources.length; i++) {
    const m = resources[i] as Record<string, unknown>;
    const novo = new Date(base + i * SPACING_MS).toISOString();
    const doc = {
      ...m,
      kickoffUtc: novo,
      _originalKickoff: (m._originalKickoff as string) ?? (m.kickoffUtc as string),
      syncedAt: new Date().toISOString(),
    };
    if (i < 3 || i === resources.length - 1) {
      console.log(`  #${m.matchId} ${m.homeTeam} x ${m.awayTeam}: ${m.kickoffUtc} -> ${novo}`);
    }
    if (APPLY) await matches.items.upsert(doc);
    count++;
  }
  console.log(
    APPLY
      ? `\n✓ ${count} jogos liberados (kickoff no futuro). Palpites ABERTOS.`
      : `\n(dry-run) ${count} jogos seriam liberados. Rode com --apply para gravar.`,
  );
}

main().catch((e) => {
  console.error('ERRO:', e.message ?? e);
  process.exit(1);
});
