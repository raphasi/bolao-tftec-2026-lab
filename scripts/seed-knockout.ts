/**
 * seed-knockout.ts — semeia os 32 jogos do mata-mata (matchId 73–104) em
 * produção a partir de fixtures/knockout-2026-official.json.
 *
 * POR QUE ISSO EXISTE
 * -------------------
 * O seed oficial (`npm run seed`) só popula os 72 jogos da fase de grupos. Os
 * jogos do mata-mata nunca eram criados em prod (só o `rehearsal-setup.ts`, de
 * ensaio, os criava — com times aleatórios — e era revertido). Sem esses docs,
 * a tela /admin/bracket calcula a proposta em memória mas NÃO consegue salvar:
 * o PATCH /matches/:id/teams busca `WHERE c.matchId = 73`, não acha, e devolve
 * "Jogo 73 não encontrado". Este script cria os docs 73–104 com o cronograma
 * oficial (horários em UTC → a UI mostra em BRT) e as sedes.
 *
 * - 16-avos (73–88): já vêm com os times OFICIAIS confirmados pós-fase de grupos.
 * - Oitavas→final (89–104): vêm "a definir" (times vazios) — o admin confirma
 *   conforme os resultados saem, pela própria tela do chaveamento.
 *
 * Idempotente: purga qualquer jogo de mata-mata existente (por id+groupCode,
 * que é a PK) ANTES de semear — evita duplicata em partição quando a fase de um
 * matchId muda entre execuções (mesma proteção do rehearsal-setup).
 *
 * Uso:
 *   npx tsx scripts/seed-knockout.ts            # dry-run (não grava) + prévia BRT
 *   npx tsx scripts/seed-knockout.ts --apply    # grava na prod
 *   npm run seed:knockout:dry  /  npm run seed:knockout
 *
 * Reversão: os docs ficam com phase != 'group'. Para remover, rode de novo (a
 * purga apaga e re-cria) ou `npm run reset` (limpa a matches-cache inteira).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { database, endpoint, databaseName, assertDatabaseExists } from './lib/cosmos-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const matches = database.container('matches-cache');

interface VenueRef {
  city: string;
  stadium: string;
  country: string;
}
interface KnockoutFixture {
  matchId: number;
  groupCode: string;
  phase: string;
  homeTeam: string;
  homeFlag: string;
  awayTeam: string;
  awayFlag: string;
  kickoffUtc: string;
  venue: VenueRef;
}

function loadFixture(): KnockoutFixture[] {
  const path = resolve(__dirname, 'fixtures/knockout-2026-official.json');
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { matches: KnockoutFixture[] };
  const list = parsed.matches;
  // Sanidade: 32 jogos, ids contíguos 73–104.
  if (!Array.isArray(list) || list.length !== 32) {
    throw new Error(`Esperado 32 jogos no fixture; encontrado ${list?.length ?? 0}`);
  }
  const ids = list.map((m) => m.matchId).sort((a, b) => a - b);
  for (let i = 0; i < 32; i++) {
    if (ids[i] !== 73 + i) throw new Error(`matchId esperado ${73 + i}, encontrado ${ids[i]}`);
  }
  return list;
}

/** Formata um kickoffUtc no fuso de Brasília, só para o log de conferência. */
function brt(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

async function purgeExistingKnockout(): Promise<number> {
  const { resources } = await matches.items
    .query<{ id: string; groupCode: string }>('SELECT c.id, c.groupCode FROM c WHERE c.phase != "group"')
    .fetchAll();
  for (const m of resources) {
    if (APPLY) await matches.item(m.id, m.groupCode).delete();
  }
  console.log(`${APPLY ? '✓ removidos' : '[dry] a remover'} ${resources.length} jogo(s) de mata-mata pré-existentes`);
  return resources.length;
}

async function seed(): Promise<void> {
  const fixture = loadFixture();
  const nowIso = new Date().toISOString();

  await purgeExistingKnockout();

  let withTeams = 0;
  let tbd = 0;
  for (const m of fixture) {
    const doc = {
      id: String(m.matchId),
      matchId: m.matchId,
      groupCode: m.groupCode, // PK — mata-mata usa o nome da fase
      phase: m.phase,
      homeTeam: m.homeTeam,
      homeFlag: m.homeFlag,
      awayTeam: m.awayTeam,
      awayFlag: m.awayFlag,
      kickoffUtc: m.kickoffUtc,
      venue: m.venue,
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
      pointsCalculatedAt: null,
      syncedAt: nowIso,
    };
    if (APPLY) await matches.items.upsert(doc);
    if (m.homeTeam && m.awayTeam) withTeams++;
    else tbd++;
  }

  console.log('\n— Prévia do cronograma (horário de Brasília) —');
  for (const m of fixture) {
    const confronto = m.homeTeam && m.awayTeam ? `${m.homeTeam} x ${m.awayTeam}` : '(a definir)';
    console.log(
      `  #${String(m.matchId).padEnd(3)} ${m.phase.padEnd(12)} ${brt(m.kickoffUtc)} BRT  ${m.venue.stadium}, ${m.venue.city} — ${confronto}`,
    );
  }

  console.log(
    `\n${APPLY ? '✓ APLICADO' : '[dry-run]'} ${fixture.length} jogos de mata-mata ` +
      `(${withTeams} com times oficiais nos 16-avos, ${tbd} a definir).`,
  );
}

async function main(): Promise<void> {
  console.log(`Cosmos: ${endpoint} / db=${databaseName}  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  await assertDatabaseExists();
  await seed();
  if (!APPLY) console.log('\nDry-run. Revise a prévia acima e rode com --apply para gravar na prod.');
}

main().catch((e) => {
  console.error('Falha no seed do mata-mata:', e);
  process.exit(1);
});
