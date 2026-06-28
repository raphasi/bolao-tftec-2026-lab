/**
 * rehearsal-setup.ts — prepara o ensaio em produção (Fase 2 do rehearsal-plan):
 *   1) embaralha o kickoffUtc dos 72 jogos de grupo em horários ALEATÓRIOS
 *      (08h–23h BRT) distribuídos em 03–05/06, guardando `_originalKickoff`;
 *   2) semeia o mata-mata (oitavas→final, 16 jogos, matchId 73–88) em 06–07/06.
 *
 * Horários aleatórios fazem a trava automática (kickoff−30min) disparar ao
 * natural durante o ensaio. O fuso é BRT (UTC−3): kickoffUtc = horário BRT +3h.
 *
 * Uso:
 *   npx tsx scripts/rehearsal-setup.ts            # dry-run (não grava)
 *   npx tsx scripts/rehearsal-setup.ts --apply    # grava na prod
 *
 * Reversão: `npm run reset` (soft) + `npm run seed` restaura os 72 oficiais e
 * remove o mata-mata semeado (reset limpa a matches-cache inteira).
 */
import { database, endpoint, databaseName } from './lib/cosmos-client.js';

const APPLY = process.argv.includes('--apply');
const matches = database.container('matches-cache');

const BRT_OFFSET_H = 3; // BRT = UTC-3
const GROUP_DAYS = ['2026-06-03', '2026-06-04', '2026-06-05'];
const KO_DAYS = ['2026-06-06', '2026-06-07'];
// HOJE (03/06) o 1º jogo é às 13:00 BRT e nenhum antes disso — dá tempo de
// avisar o time antes da 1ª trava (12:30 BRT). Demais dias começam às 08h.
const FIRST_HOUR_TODAY = 13;

/** kickoffUtc aleatório num dia BRT, entre minHour e maxHour (BRT). */
function randomKickoffUtc(brtDay: string, minHour = 8, maxHour = 22): string {
  const hourBrt = minHour + Math.floor(Math.random() * (maxHour - minHour + 1));
  const min = Math.floor(Math.random() * 60);
  return brtTimeUtc(brtDay, hourBrt, min);
}

/** kickoffUtc para um horário BRT exato. */
function brtTimeUtc(brtDay: string, hourBrt: number, min = 0): string {
  const d = new Date(`${brtDay}T00:00:00Z`);
  d.setUTCHours(hourBrt + BRT_OFFSET_H, min, 0, 0); // overflow rola o dia em UTC — ok (UI mostra BRT)
  return d.toISOString();
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pool de seleções para o mata-mata do ensaio (nome + ISO flag).
const POOL: ReadonlyArray<[string, string]> = [
  ['Brasil', 'br'], ['Argentina', 'ar'], ['França', 'fr'], ['Inglaterra', 'gb-eng'],
  ['Espanha', 'es'], ['Portugal', 'pt'], ['Alemanha', 'de'], ['Holanda', 'nl'],
  ['Croácia', 'hr'], ['Uruguai', 'uy'], ['Bélgica', 'be'], ['Marrocos', 'ma'],
  ['EUA', 'us'], ['México', 'mx'], ['Japão', 'jp'], ['Senegal', 'sn'],
  ['Colômbia', 'co'], ['Equador', 'ec'], ['Coreia do Sul', 'kr'], ['Austrália', 'au'],
  ['Suíça', 'ch'], ['Dinamarca', 'dk'], ['Polônia', 'pl'], ['Sérvia', 'rs'],
  ['Catar', 'qa'], ['Canadá', 'ca'], ['Gana', 'gh'], ['Camarões', 'cm'],
  ['Nigéria', 'ng'], ['Costa Rica', 'cr'], ['Arábia Saudita', 'sa'], ['Irã', 'ir'],
];

// Copa de 48 seleções: mata-mata começa nos 16-avos (Rodada de 32). 32 jogos no total.
const KO_ROUNDS = [
  { phase: 'round-of-32', count: 16, start: 73, dayIdx: 0 },  // 73–88  (06/06)
  { phase: 'round-of-16', count: 8, start: 89, dayIdx: 0 },   // 89–96  (06/06)
  { phase: 'quarter', count: 4, start: 97, dayIdx: 1 },       // 97–100 (07/06)
  { phase: 'semi', count: 2, start: 101, dayIdx: 1 },         // 101–102
  { phase: 'third-place', count: 1, start: 103, dayIdx: 1 },  // 103
  { phase: 'final', count: 1, start: 104, dayIdx: 1 },        // 104
] as const;

async function shiftGroupDates() {
  const { resources } = await matches.items
    .query('SELECT * FROM c WHERE c.phase = "group"')
    .fetchAll();
  const today = GROUP_DAYS[0];
  console.log(`\n[grupos] ${resources.length} jogos encontrados`);
  // 1ª passada: gera horários (hoje a partir de 13h; demais dias a partir de 08h)
  const planned = (resources as Record<string, unknown>[]).map((m) => {
    const day = pick(GROUP_DAYS);
    const minHour = day === today ? FIRST_HOUR_TODAY : 8;
    return {
      day,
      doc: {
        ...m,
        kickoffUtc: randomKickoffUtc(day, minHour, 22),
        _originalKickoff: m._originalKickoff ?? m.kickoffUtc,
        syncedAt: new Date().toISOString(),
      },
    };
  });
  // garante o 1º jogo de HOJE exatamente às 13:00 BRT
  const todays = planned.filter((p) => p.day === today);
  if (todays.length) {
    const earliest = todays.reduce((a, b) =>
      Date.parse(a.doc.kickoffUtc as string) <= Date.parse(b.doc.kickoffUtc as string) ? a : b,
    );
    earliest.doc.kickoffUtc = brtTimeUtc(today, FIRST_HOUR_TODAY, 0);
  }
  for (const { doc } of planned) if (APPLY) await matches.items.upsert(doc);
  console.log(
    `${APPLY ? '✓ APLICADO' : '[dry]'} datas de grupo: hoje ${todays.length} jogos (1º às 13:00 BRT), demais 08–23h BRT`,
  );
}

async function seedKnockout() {
  console.log('\n[mata-mata]');
  // Purga qualquer jogo de mata-mata existente ANTES de semear. Necessário
  // porque a PK é groupCode (= nome da fase): se a fase de um matchId muda
  // entre execuções, o upsert criaria um doc novo noutra partição (duplicata).
  const { resources: existing } = await matches.items
    .query('SELECT c.id, c.groupCode FROM c WHERE c.phase != "group"')
    .fetchAll();
  for (const m of existing as Array<{ id: string; groupCode: string }>) {
    if (APPLY) await matches.item(m.id, m.groupCode).delete();
  }
  console.log(`${APPLY ? '✓ removidos' : '[dry] a remover'} ${existing.length} jogos de mata-mata existentes`);

  let t = 0;
  let created = 0;
  for (const round of KO_ROUNDS) {
    for (let i = 0; i < round.count; i++) {
      const id = round.start + i;
      const [homeTeam, homeFlag] = POOL[t++ % POOL.length];
      const [awayTeam, awayFlag] = POOL[t++ % POOL.length];
      const doc = {
        id: String(id),
        matchId: id,
        groupCode: round.phase, // PK — knockout usa o nome da fase
        phase: round.phase,
        homeTeam, homeFlag, awayTeam, awayFlag,
        kickoffUtc: randomKickoffUtc(KO_DAYS[round.dayIdx]),
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        pointsCalculatedAt: null,
        syncedAt: new Date().toISOString(),
      };
      if (APPLY) await matches.items.upsert(doc);
      created++;
    }
    console.log(`  ${round.phase}: ${round.count} jogo(s)`);
  }
  console.log(`${APPLY ? '✓ APLICADO' : '[dry]'} mata-mata semeado (${created} jogos, matchId 73–104) em ${KO_DAYS.join(', ')}`);
}

async function main() {
  console.log(`Cosmos: ${endpoint} / db=${databaseName}  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  await shiftGroupDates();
  await seedKnockout();
  if (!APPLY) console.log('\nDry-run. Use --apply para gravar na prod (com Functions PAUSADAS).');
}

main().catch((e) => {
  console.error('Falha no setup do ensaio:', e);
  process.exit(1);
});
