/**
 * Cosmos DB Seed Script
 * =====================
 * Popula dados iniciais no Cosmos DB do Bolão TFTEC Cloud.
 *
 * O que faz:
 *  1. Verifica que database e containers existem (criados via Bicep)
 *  2. Cria 1 usuário admin (idempotente)
 *  3. Popula matches-cache com 72 jogos da fase de grupos
 *     (matches-2026-official.json — dataset curado do sorteio FIFA Dec/2025)
 *  4. Popula container groups com 12 grupos × 4 seleções
 *     (groups-2026.json — composição oficial do sorteio)
 *  5. Popula container players com as 48 seleções / ~1247 jogadores
 *     (players-2026.json — catálogo do artilheiro)
 *  6. Inicializa leaderboard zerado para season=2026
 *
 * Uso:
 *   npm run seed                       # tudo
 *   npm run seed -- --matches-only     # só recarrega matches-cache
 *   npm run seed -- --groups-only      # só recarrega groups
 *   npm run seed -- --players-only     # só recarrega o catálogo de jogadores
 *   npm run seed -- --skip-admin       # pula criação do admin
 *
 * Idempotente: rodar várias vezes não duplica dados.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { database, assertDatabaseExists, endpoint, databaseName } from './lib/cosmos-client.js';
import type {
  UserDocument,
  MatchCacheDocument,
  LeaderboardDocument,
  GroupDocument,
  NationSquadDocument,
  NationRef,
  VenueRef,
  ContainerId,
} from './lib/cosmos-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {
  matchesOnly: argv.includes('--matches-only'),
  groupsOnly: argv.includes('--groups-only'),
  playersOnly: argv.includes('--players-only'),
  skipAdmin:
    argv.includes('--skip-admin') ||
    argv.includes('--matches-only') ||
    argv.includes('--groups-only') ||
    argv.includes('--players-only'),
};
const seedAll = !flags.matchesOnly && !flags.groupsOnly && !flags.playersOnly;

// ---------------------------------------------------------------------------
// Configuração via env
// ---------------------------------------------------------------------------
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@bolao.tftec.com.br';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'TFTEC@2026!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Admin TFTEC Cloud';
const SEASON = 2026;

// ---------------------------------------------------------------------------
// Helpers de logging
// ---------------------------------------------------------------------------
const log = {
  info:    (msg: string) => console.log(`\x1b[36mℹ\x1b[0m  ${msg}`),
  ok:      (msg: string) => console.log(`\x1b[32m✓\x1b[0m  ${msg}`),
  warn:    (msg: string) => console.log(`\x1b[33m⚠\x1b[0m  ${msg}`),
  error:   (msg: string) => console.log(`\x1b[31m✗\x1b[0m  ${msg}`),
  section: (msg: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${msg}\x1b[0m`),
};

// ---------------------------------------------------------------------------
// Pre-flight: containers existem?
// ---------------------------------------------------------------------------
async function preflight(): Promise<void> {
  log.section('Pre-flight checks');
  log.info(`Endpoint:  ${endpoint}`);
  log.info(`Database:  ${databaseName}`);

  await assertDatabaseExists();
  log.ok('Database encontrado');

  const requiredContainers: ContainerId[] = ['users', 'predictions', 'specials', 'matches-cache', 'leaderboard', 'groups', 'players'];
  for (const id of requiredContainers) {
    try {
      await database.container(id).read();
      log.ok(`Container "${id}" encontrado`);
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 404) {
        log.error(`Container "${id}" não existe. Rode o Bicep deploy primeiro.`);
        process.exit(1);
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Seed: usuário admin (upsert idempotente)
// ---------------------------------------------------------------------------
async function seedAdminUser(): Promise<UserDocument> {
  log.section('Seeding admin user');
  const users = database.container('users');

  const { resources: existing } = await users.items
    .query<UserDocument>({
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: ADMIN_EMAIL }],
    })
    .fetchAll();

  if (existing.length > 0) {
    log.info(`Admin já existe (${ADMIN_EMAIL}). Pulando criação.`);
    return existing[0];
  }

  const adminId = randomUUID();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin: UserDocument = {
    id: adminId,
    userId: adminId,
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    passwordHash,
    role: 'admin',
    createdAt: new Date().toISOString(),
  };

  await users.items.create(admin);
  log.ok(`Admin criado: ${ADMIN_EMAIL}`);
  log.warn(`Senha temporária: ${ADMIN_PASSWORD} — trocar no primeiro acesso!`);
  return admin;
}

// ---------------------------------------------------------------------------
// Seed: matches-cache (72 jogos oficiais Copa 2026 fase de grupos)
// ---------------------------------------------------------------------------
interface OfficialMatch {
  matchId: number;
  groupCode: string;
  phase: 'group';
  homeTeam: string;
  homeFlag: string;
  awayTeam: string;
  awayFlag: string;
  kickoffUtc: string;
  venue: VenueRef;
}

interface MatchesFixture {
  _meta: Record<string, unknown>;
  matches: OfficialMatch[];
}

function loadOfficialMatches(): OfficialMatch[] {
  const fixturePath = resolve(__dirname, 'fixtures/matches-2026-official.json');
  const content = readFileSync(fixturePath, 'utf-8');
  const parsed = JSON.parse(content) as MatchesFixture;
  if (!Array.isArray(parsed.matches) || parsed.matches.length !== 72) {
    throw new Error(
      `matches-2026-official.json deve conter exatamente 72 jogos (encontrado: ${parsed.matches?.length ?? 0})`
    );
  }
  return parsed.matches;
}

async function seedMatches(): Promise<number> {
  log.section('Seeding matches-cache');
  const matches = database.container('matches-cache');

  const officialMatches = loadOfficialMatches();
  log.info(`Carregando 72 jogos oficiais da Copa 2026 (fase de grupos)`);

  let inserted = 0;
  let updated = 0;

  for (const m of officialMatches) {
    const doc: MatchCacheDocument = {
      id: m.matchId.toString(),
      matchId: m.matchId,
      groupCode: m.groupCode,
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
      syncedAt: new Date().toISOString(),
    };

    const { statusCode } = await matches.items.upsert(doc);
    if (statusCode === 201) inserted++;
    else updated++;
  }

  log.ok(`${inserted} jogos novos, ${updated} atualizados`);
  return officialMatches.length;
}

// ---------------------------------------------------------------------------
// Seed: groups (12 grupos × 4 seleções)
// ---------------------------------------------------------------------------
interface OfficialGroup {
  code: string;
  teams: NationRef[];
}

interface GroupsFixture {
  _meta: Record<string, unknown>;
  groups: OfficialGroup[];
}

function loadOfficialGroups(): OfficialGroup[] {
  const fixturePath = resolve(__dirname, 'fixtures/groups-2026.json');
  const content = readFileSync(fixturePath, 'utf-8');
  const parsed = JSON.parse(content) as GroupsFixture;
  if (!Array.isArray(parsed.groups) || parsed.groups.length !== 12) {
    throw new Error(
      `groups-2026.json deve conter exatamente 12 grupos (encontrado: ${parsed.groups?.length ?? 0})`
    );
  }
  const totalTeams = parsed.groups.reduce((sum, g) => sum + g.teams.length, 0);
  if (totalTeams !== 48) {
    throw new Error(`Esperado 48 seleções total (12×4); encontrado: ${totalTeams}`);
  }
  return parsed.groups;
}

async function seedGroups(): Promise<number> {
  log.section('Seeding groups');
  const groups = database.container('groups');

  const officialGroups = loadOfficialGroups();
  log.info(`Carregando 12 grupos × 4 seleções (48 total)`);

  let inserted = 0;
  let updated = 0;

  for (const g of officialGroups) {
    const doc: GroupDocument = {
      id: `${SEASON}_${g.code}`,
      season: SEASON,
      code: g.code,
      teams: g.teams,
      updatedAt: new Date().toISOString(),
    };

    const { statusCode } = await groups.items.upsert(doc);
    if (statusCode === 201) inserted++;
    else updated++;
  }

  log.ok(`${inserted} grupos novos, ${updated} atualizados`);
  return officialGroups.length;
}

// ---------------------------------------------------------------------------
// Seed: players (catálogo do artilheiro — 48 seleções)
// ---------------------------------------------------------------------------
interface PlayersFixture {
  _meta: Record<string, unknown>;
  nations: { iso: string; name: string; players: { id: string; name: string }[] }[];
}

function loadPlayers(): PlayersFixture['nations'] {
  const fixturePath = resolve(__dirname, 'fixtures/players-2026.json');
  const parsed = JSON.parse(readFileSync(fixturePath, 'utf-8')) as PlayersFixture;
  if (!Array.isArray(parsed.nations) || parsed.nations.length !== 48) {
    throw new Error(`players-2026.json deve ter 48 seleções (achou ${parsed.nations?.length ?? 0})`);
  }
  const ids = new Set<string>();
  for (const n of parsed.nations) {
    if (!n.players?.length) throw new Error(`Seleção ${n.iso} sem jogadores`);
    for (const p of n.players) {
      if (!p.id || !p.id.startsWith(`${n.iso}-`)) {
        throw new Error(`Id "${p.id}" (${n.iso}) deve começar com "${n.iso}-"`);
      }
      if (ids.has(p.id)) throw new Error(`Id de jogador duplicado: ${p.id}`);
      ids.add(p.id);
    }
  }
  return parsed.nations;
}

async function seedPlayers(): Promise<number> {
  log.section('Seeding players (catálogo do artilheiro)');
  const players = database.container('players');

  const nations = loadPlayers();
  let inserted = 0;
  let updated = 0;
  let totalPlayers = 0;

  for (const n of nations) {
    const doc: NationSquadDocument = {
      id: `${SEASON}_${n.iso}`,
      season: SEASON,
      iso: n.iso,
      name: n.name,
      players: n.players,
      updatedAt: new Date().toISOString(),
    };
    const { statusCode } = await players.items.upsert(doc);
    if (statusCode === 201) inserted++;
    else updated++;
    totalPlayers += n.players.length;
  }

  log.ok(`${nations.length} seleções (${totalPlayers} jogadores): ${inserted} novas, ${updated} atualizadas`);
  return totalPlayers;
}

// ---------------------------------------------------------------------------
// Seed: leaderboard placeholder
// ---------------------------------------------------------------------------
async function seedLeaderboard(admin: UserDocument): Promise<void> {
  log.section('Seeding leaderboard (season 2026)');
  const leaderboard = database.container('leaderboard');

  const adminEntry: LeaderboardDocument = {
    id: `${SEASON}_${admin.userId}`,
    season: SEASON,
    userId: admin.userId,
    userName: admin.name,
    totalPoints: 0,
    matchPoints: 0,
    specialPoints: 0,
    predictionsCount: 0,
    perfectScores: 0,
    rank: null,
    lastUpdated: new Date().toISOString(),
  };

  await leaderboard.items.upsert(adminEntry);
  log.ok(`Entrada do admin no leaderboard 2026 criada`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('\n\x1b[1m🎯 Bolão TFTEC Cloud — Cosmos Seed\x1b[0m');
  if (flags.matchesOnly) console.log('   Modo: --matches-only\n');
  else if (flags.groupsOnly) console.log('   Modo: --groups-only\n');
  else if (flags.playersOnly) console.log('   Modo: --players-only\n');
  else console.log('   Modo: full (admin + matches + groups + players + leaderboard)\n');

  await preflight();

  let admin: UserDocument | null = null;
  let matchCount = 0;
  let groupCount = 0;
  let playerCount = 0;

  if (seedAll || !flags.skipAdmin) {
    if (seedAll) {
      admin = await seedAdminUser();
    }
  }

  if (seedAll || flags.matchesOnly) {
    matchCount = await seedMatches();
  }

  if (seedAll || flags.groupsOnly) {
    groupCount = await seedGroups();
  }

  if (seedAll || flags.playersOnly) {
    playerCount = await seedPlayers();
  }

  if (seedAll && admin) {
    await seedLeaderboard(admin);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  log.section('Resumo');
  log.ok(`Seed completo em ${elapsed}s`);
  console.log(`
   📊 Estado final:
      ${seedAll ? `• 1 admin user        (${ADMIN_EMAIL})` : ''}
      ${(seedAll || flags.matchesOnly) ? `• ${matchCount} matches em matches-cache (fase de grupos)` : ''}
      ${(seedAll || flags.groupsOnly) ? `• ${groupCount} grupos em groups (12 × 4 seleções)` : ''}
      ${(seedAll || flags.playersOnly) ? `• ${playerCount} jogadores em players (catálogo do artilheiro)` : ''}
      ${seedAll ? `• 1 entrada inicial no leaderboard` : ''}

   👉 Próximos passos:
      • Faça login com as credenciais admin acima (se seedou tudo)
      • Acesse /admin para gerenciar o bolão
      • Usuários comuns devem se cadastrar em /register
  `);
}

main().catch((err) => {
  log.error(`Seed falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
