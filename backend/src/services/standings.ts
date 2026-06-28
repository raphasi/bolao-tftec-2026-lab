/**
 * Classificação da fase de grupos (motor puro, sem I/O).
 *
 * Calcula a tabela de cada grupo a partir dos jogos `phase='group'` finalizados
 * e aplica os critérios de desempate oficiais FIFA, na ordem:
 *   1. pontos  2. saldo de gols  3. gols pró
 *   4. confronto direto entre os empatados (pontos → saldo → gols pró)
 *   5. fallback determinístico estável (nome) — substitui fair play/sorteio,
 *      que o app não modela.
 *
 * Também rankeia os 12 terceiros colocados (mesmos critérios globais) para
 * definir os 8 melhores que avançam aos 16-avos (Copa de 48 seleções).
 */
import type { MatchCacheDoc, NationRef } from '../types/domain.js';

export interface TeamStanding {
  team: NationRef;
  groupCode: string; // 'A'..'L'
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  position: number; // 1..4 dentro do grupo (após ordenação)
}

export interface GroupTable {
  groupCode: string;
  rows: TeamStanding[]; // ordenado; position preenchida
  complete: boolean; // todos os jogos do grupo finalizados
}

const WIN = 3;
const DRAW = 1;

/** Cria um standing zerado para um time. */
function blank(team: NationRef, groupCode: string): TeamStanding {
  return {
    team,
    groupCode,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    position: 0,
  };
}

function isFinishedWithScore(m: MatchCacheDoc): boolean {
  return m.status === 'finished' && m.homeScore != null && m.awayScore != null;
}

function nationOf(name: string, flag?: string): NationRef {
  return { name, iso: flag ?? '' };
}

/** Aplica um resultado a um standing (lado: home/away). */
function applyResult(s: TeamStanding, gf: number, ga: number): void {
  s.played += 1;
  s.goalsFor += gf;
  s.goalsAgainst += ga;
  s.goalDiff = s.goalsFor - s.goalsAgainst;
  if (gf > ga) {
    s.won += 1;
    s.points += WIN;
  } else if (gf === ga) {
    s.drawn += 1;
    s.points += DRAW;
  } else {
    s.lost += 1;
  }
}

/**
 * Mini-tabela do confronto direto entre um conjunto de times empatados:
 * considera SÓ os jogos entre eles. Retorna mapa nome→{pts,gd,gf}.
 */
function headToHead(
  tiedNames: Set<string>,
  groupMatches: MatchCacheDoc[],
): Map<string, { points: number; goalDiff: number; goalsFor: number }> {
  const mini = new Map<string, { points: number; goalDiff: number; goalsFor: number }>();
  for (const name of tiedNames) mini.set(name, { points: 0, goalDiff: 0, goalsFor: 0 });
  for (const m of groupMatches) {
    if (!isFinishedWithScore(m)) continue;
    if (!tiedNames.has(m.homeTeam) || !tiedNames.has(m.awayTeam)) continue;
    const h = mini.get(m.homeTeam)!;
    const a = mini.get(m.awayTeam)!;
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    h.goalsFor += hs;
    a.goalsFor += as;
    h.goalDiff += hs - as;
    a.goalDiff += as - hs;
    if (hs > as) h.points += WIN;
    else if (hs === as) {
      h.points += DRAW;
      a.points += DRAW;
    } else a.points += WIN;
  }
  return mini;
}

/**
 * Comparador FIFA. `groupMatches` é usado para o critério de confronto direto
 * quando dois (ou mais) times empatam nos critérios globais.
 */
function compareStandings(
  a: TeamStanding,
  b: TeamStanding,
  groupMatches: MatchCacheDoc[],
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  // Confronto direto entre os empatados (a e b empataram nos critérios globais).
  const mini = headToHead(new Set([a.team.name, b.team.name]), groupMatches);
  const ma = mini.get(a.team.name)!;
  const mb = mini.get(b.team.name)!;
  if (mb.points !== ma.points) return mb.points - ma.points;
  if (mb.goalDiff !== ma.goalDiff) return mb.goalDiff - ma.goalDiff;
  if (mb.goalsFor !== ma.goalsFor) return mb.goalsFor - ma.goalsFor;
  // Fallback estável (sem fair play): ordem alfabética do nome.
  return a.team.name.localeCompare(b.team.name);
}

/**
 * Calcula as tabelas de todos os grupos a partir dos jogos fornecidos.
 * Considera só jogos `phase='group'`. Times são descobertos pelos próprios
 * jogos (home/away). Estatística vem só dos finalizados; `complete` indica se
 * os 6 jogos do grupo (4 times) já terminaram.
 */
export function computeGroupStandings(matches: MatchCacheDoc[]): GroupTable[] {
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const byGroup = new Map<string, MatchCacheDoc[]>();
  for (const m of groupMatches) {
    const arr = byGroup.get(m.groupCode) ?? [];
    arr.push(m);
    byGroup.set(m.groupCode, arr);
  }

  const tables: GroupTable[] = [];
  for (const [groupCode, gms] of byGroup) {
    const standings = new Map<string, TeamStanding>();
    const ensure = (name: string, flag?: string): TeamStanding => {
      let s = standings.get(name);
      if (!s) {
        s = blank(nationOf(name, flag), groupCode);
        standings.set(name, s);
      } else if (!s.team.iso && flag) {
        s.team.iso = flag;
      }
      return s;
    };

    for (const m of gms) {
      const home = ensure(m.homeTeam, m.homeFlag);
      const away = ensure(m.awayTeam, m.awayFlag);
      if (!isFinishedWithScore(m)) continue;
      applyResult(home, m.homeScore as number, m.awayScore as number);
      applyResult(away, m.awayScore as number, m.homeScore as number);
    }

    const rows = [...standings.values()].sort((a, b) => compareStandings(a, b, gms));
    rows.forEach((r, i) => (r.position = i + 1));
    const complete = gms.length > 0 && gms.every(isFinishedWithScore);
    tables.push({ groupCode, rows, complete });
  }

  tables.sort((a, b) => a.groupCode.localeCompare(b.groupCode));
  return tables;
}

export interface ThirdPlaceEntry extends TeamStanding {
  rank: number; // 1..N entre os terceiros (1 = melhor)
}

/**
 * Rankeia os terceiros colocados de cada grupo e devolve os `topN` melhores
 * (default 8). Critérios globais: pontos → saldo → gols pró → nome.
 */
export function rankBestThirds(tables: GroupTable[], topN = 8): ThirdPlaceEntry[] {
  const thirds = tables
    .map((t) => t.rows.find((r) => r.position === 3))
    .filter((r): r is TeamStanding => Boolean(r));

  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.name.localeCompare(b.team.name);
  });

  return thirds.slice(0, topN).map((t, i) => ({ ...t, rank: i + 1 }));
}
