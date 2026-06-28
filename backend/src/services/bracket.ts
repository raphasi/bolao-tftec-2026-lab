/**
 * Chaveamento do mata-mata (motor puro, sem I/O) — Copa 2026 (48 seleções).
 *
 * Fonte do template (oficial FIFA, matchId 73–104):
 *   - 16-avos (73–88): vencedores/segundos em slots determinísticos; 8 vagas de
 *     3º colocado, cada uma restrita a um conjunto de grupos elegíveis.
 *   - Árvore R16→final fixa (89–104).
 *
 * Os confrontos dos 16-avos com 3º colocado dependem de QUAIS 8 terceiros se
 * classificam (Anexo C da FIFA = 495 combinações). Aqui fazemos uma atribuição
 * determinística que RESPEITA as vagas elegíveis oficiais; a linha exata do
 * Anexo C pode ser conferida/ajustada pelo admin na tela (rede de segurança).
 */
import type { MatchCacheDoc, MatchPhase, NationRef } from '../types/domain.js';
import { computeGroupStandings, rankBestThirds, type GroupTable } from './standings.js';

export interface Confronto {
  matchId: number;
  phase: MatchPhase;
  home: NationRef | null;
  away: NationRef | null;
  homeSource: string; // rótulo legível da origem (ex: '1E', '2A', '3º (A/B/C/D/F)', 'Vencedor #74')
  awaySource: string;
  note?: string; // ex: 'aguardando resultados', 'empate — definir vencedor'
}

type Slot =
  | { kind: 'winner'; group: string }
  | { kind: 'runnerUp'; group: string }
  | { kind: 'third'; groups: readonly string[] };

const W = (group: string): Slot => ({ kind: 'winner', group });
const R = (group: string): Slot => ({ kind: 'runnerUp', group });
const T3 = (...groups: string[]): Slot => ({ kind: 'third', groups });

/** 16-avos oficiais (73–88). Vagas de 3º com seus grupos elegíveis. */
const R32_SLOTS: Record<number, { home: Slot; away: Slot }> = {
  73: { home: R('A'), away: R('B') },
  74: { home: W('E'), away: T3('A', 'B', 'C', 'D', 'F') },
  75: { home: W('F'), away: R('C') },
  76: { home: W('C'), away: R('F') },
  77: { home: W('I'), away: T3('C', 'D', 'F', 'G', 'H') },
  78: { home: R('E'), away: R('I') },
  79: { home: W('A'), away: T3('C', 'E', 'F', 'H', 'I') },
  80: { home: W('L'), away: T3('E', 'H', 'I', 'J', 'K') },
  81: { home: W('D'), away: T3('B', 'E', 'F', 'I', 'J') },
  82: { home: W('G'), away: T3('A', 'E', 'H', 'I', 'J') },
  83: { home: R('K'), away: R('L') },
  84: { home: W('H'), away: R('J') },
  85: { home: W('B'), away: T3('E', 'F', 'G', 'I', 'J') },
  86: { home: W('J'), away: R('H') },
  87: { home: W('K'), away: T3('D', 'E', 'I', 'J', 'L') },
  88: { home: R('D'), away: R('G') },
};

/** Árvore fixa R16→final: matchId → [feeder1, feeder2] (vencedores). */
const FEEDERS: Record<number, [number, number]> = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102], // final: vencedores das semis
};
// 103 (3º lugar): PERDEDORES das semis 101 e 102.

const PHASE_BY_ID = (id: number): MatchPhase => {
  if (id <= 88) return 'round-of-32';
  if (id <= 96) return 'round-of-16';
  if (id <= 100) return 'quarter';
  if (id <= 102) return 'semi';
  if (id === 103) return 'third-place';
  return 'final';
};

function pos(tables: GroupTable[], group: string, position: number): NationRef | null {
  const t = tables.find((x) => x.groupCode === group);
  const row = t?.rows.find((r) => r.position === position);
  return row ? row.team : null;
}

/**
 * Atribui os 8 terceiros classificados às 8 vagas de 3º, respeitando os grupos
 * elegíveis de cada vaga. Backtracking determinístico: resolve primeiro as vagas
 * mais restritas (menos terceiros elegíveis), e dentro delas escolhe o terceiro
 * de melhor rank. Retorna mapa matchId(da vaga)→groupCode do terceiro, ou null
 * se não houver atribuição completa possível.
 */
export function assignThirds(
  thirdGroups: string[],
): Record<number, string> | null {
  const slots = Object.entries(R32_SLOTS)
    .filter(([, s]) => s.away.kind === 'third')
    .map(([id, s]) => ({
      matchId: Number(id),
      eligible: (s.away as { kind: 'third'; groups: readonly string[] }).groups,
    }));

  const available = [...thirdGroups]; // já em ordem de rank (melhor primeiro)
  const result: Record<number, string> = {};

  const solve = (remaining: typeof slots, pool: string[]): boolean => {
    if (remaining.length === 0) return pool.length === 0;
    // vaga mais restrita primeiro (menos candidatos no pool atual)
    const ranked = [...remaining].sort(
      (a, b) =>
        pool.filter((g) => a.eligible.includes(g)).length -
        pool.filter((g) => b.eligible.includes(g)).length,
    );
    const slot = ranked[0];
    const rest = ranked.slice(1);
    const candidates = pool.filter((g) => slot.eligible.includes(g));
    for (const g of candidates) {
      result[slot.matchId] = g;
      if (solve(rest, pool.filter((x) => x !== g))) return true;
      delete result[slot.matchId];
    }
    return false;
  };

  return solve(slots, available) ? result : null;
}

export interface BracketWarning {
  side: 'home' | 'away';
  message: string;
}

/** Localiza um time nas tabelas dos grupos → grupo + posição (1..4), ou null. */
function locate(team: NationRef, tables: GroupTable[]): { group: string; position: number } | null {
  for (const t of tables) {
    const row = t.rows.find((r) => r.team.name === team.name);
    if (row) return { group: t.groupCode, position: row.position };
  }
  return null;
}

/** Valida um lado contra a vaga oficial; devolve a mensagem de aviso ou null. */
function validateSide(team: NationRef | null, slot: Slot, tables: GroupTable[]): string | null {
  if (!team) return null; // lado a definir: nada a validar
  const loc = locate(team, tables);
  if (!loc) {
    return `"${team.name}" não está nas tabelas dos grupos (classificação incompleta ou seleção fora desta fase).`;
  }
  if (slot.kind === 'winner') {
    if (loc.group !== slot.group || loc.position !== 1) {
      return `o template espera o 1º do grupo ${slot.group}; "${team.name}" é ${loc.position}º do grupo ${loc.group}.`;
    }
  } else if (slot.kind === 'runnerUp') {
    if (loc.group !== slot.group || loc.position !== 2) {
      return `o template espera o 2º do grupo ${slot.group}; "${team.name}" é ${loc.position}º do grupo ${loc.group}.`;
    }
  } else {
    // third
    if (loc.position !== 3) {
      return `o template espera um 3º colocado; "${team.name}" é ${loc.position}º do grupo ${loc.group}.`;
    }
    if (!slot.groups.includes(loc.group)) {
      return `o 3º do grupo ${loc.group} não é elegível para esta vaga (elegíveis: ${slot.groups.join('/')}).`;
    }
  }
  return null;
}

/**
 * Confere se os times atribuídos a um jogo de 16-avos (73–88) batem com o
 * template oficial FIFA (Anexo C), dado o estado atual dos grupos. NÃO bloqueia
 * — só devolve avisos para a UI/admin destacar divergências. Para jogos fora dos
 * 16-avos (R16+, que vêm da árvore fixa) retorna [] (não há checagem por grupo).
 */
export function checkR32Assignment(
  matchId: number,
  home: NationRef | null,
  away: NationRef | null,
  tables: GroupTable[],
): BracketWarning[] {
  const slots = R32_SLOTS[matchId];
  if (!slots) return [];
  const warnings: BracketWarning[] = [];
  const homeMsg = validateSide(home, slots.home, tables);
  if (homeMsg) warnings.push({ side: 'home', message: homeMsg });
  const awayMsg = validateSide(away, slots.away, tables);
  if (awayMsg) warnings.push({ side: 'away', message: awayMsg });
  return warnings;
}

function slotSource(slot: Slot): string {
  if (slot.kind === 'winner') return `1${slot.group}`;
  if (slot.kind === 'runnerUp') return `2${slot.group}`;
  return `3º (${slot.groups.join('/')})`;
}

/** Resolve um lado de 16-avos (winner/runnerUp/third) → NationRef|null. */
function resolveR32Side(
  slot: Slot,
  tables: GroupTable[],
  thirdAssign: Record<number, string> | null,
  matchId: number,
): NationRef | null {
  if (slot.kind === 'winner') return pos(tables, slot.group, 1);
  if (slot.kind === 'runnerUp') return pos(tables, slot.group, 2);
  // third
  const group = thirdAssign?.[matchId];
  return group ? pos(tables, group, 3) : null;
}

/** Vencedor/perdedor de um jogo de mata-mata já finalizado (sem empate). */
function decide(m: MatchCacheDoc | undefined): { winner: NationRef | null; loser: NationRef | null; draw: boolean } {
  if (!m || m.status !== 'finished' || m.homeScore == null || m.awayScore == null) {
    return { winner: null, loser: null, draw: false };
  }
  if (m.homeScore === m.awayScore) {
    return { winner: null, loser: null, draw: true };
  }
  const home: NationRef = { name: m.homeTeam, iso: m.homeFlag ?? '' };
  const away: NationRef = { name: m.awayTeam, iso: m.awayFlag ?? '' };
  const homeWon = m.homeScore > m.awayScore;
  return {
    winner: homeWon ? home : away,
    loser: homeWon ? away : home,
    draw: false,
  };
}

/**
 * Proposta de chaveamento para TODOS os jogos de mata-mata (73–104):
 *  - 16-avos a partir das tabelas de grupo + 8 melhores terceiros;
 *  - fases seguintes pela árvore fixa, derivando vencedores dos resultados já
 *    lançados (empate vira nota "definir vencedor").
 * Não tem efeito colateral — só calcula.
 */
export function buildKnockoutProposal(matches: MatchCacheDoc[]): Confronto[] {
  const tables = computeGroupStandings(matches);
  const thirds = rankBestThirds(tables, 8);
  const thirdAssign = assignThirds(thirds.map((t) => t.groupCode));

  const byId = new Map<number, MatchCacheDoc>();
  for (const m of matches) byId.set(m.matchId, m);

  const proposal: Confronto[] = [];

  // 16-avos (73–88)
  for (let id = 73; id <= 88; id++) {
    const slots = R32_SLOTS[id];
    const home = resolveR32Side(slots.home, tables, thirdAssign, id);
    const away = resolveR32Side(slots.away, tables, thirdAssign, id);
    const note = !home || !away ? 'aguardando classificação dos grupos' : undefined;
    proposal.push({
      matchId: id,
      phase: 'round-of-32',
      home,
      away,
      homeSource: slotSource(slots.home),
      awaySource: slotSource(slots.away),
      note,
    });
  }

  // R16 → final (89–104) pela árvore fixa
  for (let id = 89; id <= 104; id++) {
    const phase = PHASE_BY_ID(id);
    if (id === 103) {
      // 3º lugar: perdedores das semis
      const s1 = decide(byId.get(101));
      const s2 = decide(byId.get(102));
      proposal.push({
        matchId: 103,
        phase,
        home: s1.loser,
        away: s2.loser,
        homeSource: 'Perdedor #101',
        awaySource: 'Perdedor #102',
        note: !s1.loser || !s2.loser ? noteForPair(s1, s2) : undefined,
      });
      continue;
    }
    const feeders = FEEDERS[id];
    if (!feeders) continue;
    const [f1, f2] = feeders;
    const d1 = decide(byId.get(f1));
    const d2 = decide(byId.get(f2));
    proposal.push({
      matchId: id,
      phase,
      home: d1.winner,
      away: d2.winner,
      homeSource: `Vencedor #${f1}`,
      awaySource: `Vencedor #${f2}`,
      note: !d1.winner || !d2.winner ? noteForPair(d1, d2) : undefined,
    });
  }

  return proposal;
}

function noteForPair(
  a: { draw: boolean },
  b: { draw: boolean },
): string {
  if (a.draw || b.draw) return 'empate em fase anterior — definir vencedor';
  return 'aguardando resultados da fase anterior';
}
