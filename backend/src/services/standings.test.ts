import { describe, it, expect } from 'vitest';
import {
  computeGroupStandings,
  rankBestThirds,
  type GroupTable,
  type TeamStanding,
} from './standings.js';
import type { MatchCacheDoc } from '../types/domain.js';

let counter = 0;
function mkMatch(
  group: string,
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
): MatchCacheDoc {
  counter += 1;
  return {
    id: String(counter),
    matchId: counter,
    groupCode: group,
    phase: 'group',
    homeTeam: home,
    homeFlag: home.toLowerCase().slice(0, 2),
    awayTeam: away,
    awayFlag: away.toLowerCase().slice(0, 2),
    kickoffUtc: '2026-06-01T00:00:00.000Z',
    homeScore: hs,
    awayScore: as,
    status: hs != null && as != null ? 'finished' : 'scheduled',
    pointsCalculatedAt: null,
    syncedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('computeGroupStandings', () => {
  it('ordena por pontos (caso simples)', () => {
    const ms = [
      mkMatch('A', 'T1', 'T2', 1, 0),
      mkMatch('A', 'T1', 'T3', 1, 0),
      mkMatch('A', 'T1', 'T4', 1, 0),
      mkMatch('A', 'T2', 'T3', 1, 0),
      mkMatch('A', 'T2', 'T4', 1, 0),
      mkMatch('A', 'T3', 'T4', 1, 0),
    ];
    const [g] = computeGroupStandings(ms);
    expect(g.complete).toBe(true);
    expect(g.rows.map((r) => r.team.name)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(g.rows[0].points).toBe(9);
    expect(g.rows[0].position).toBe(1);
  });

  it('desempata por saldo e gols pró', () => {
    // X e Y empatam em pontos (6); X tem saldo melhor.
    const ms = [
      mkMatch('B', 'X', 'Z', 3, 0), // X +3
      mkMatch('B', 'Y', 'Z', 1, 0), // Y +1
      mkMatch('B', 'X', 'W', 0, 1), // X perde
      mkMatch('B', 'Y', 'W', 0, 1), // Y perde
      mkMatch('B', 'X', 'Y', 2, 2), // empate direto, não decide aqui
      mkMatch('B', 'Z', 'W', 0, 0),
    ];
    const [g] = computeGroupStandings(ms);
    const x = g.rows.find((r) => r.team.name === 'X')!;
    const y = g.rows.find((r) => r.team.name === 'Y')!;
    expect(x.points).toBe(y.points); // ambos 4 (W + D)
    expect(x.goalDiff).toBeGreaterThan(y.goalDiff);
    expect(x.position).toBeLessThan(y.position);
  });

  it('aplica confronto direto quando pontos/saldo/gols pró são iguais', () => {
    // A e B: ambos 6 pts, GF 4, GA 3, GD +1 — A venceu B 1-0 (H2H decide).
    const ms = [
      mkMatch('C', 'A', 'B', 1, 0),
      mkMatch('C', 'A', 'C3', 2, 1),
      mkMatch('C', 'A', 'D4', 1, 2),
      mkMatch('C', 'B', 'C3', 2, 1),
      mkMatch('C', 'B', 'D4', 2, 1),
      mkMatch('C', 'C3', 'D4', 1, 1),
    ];
    const [g] = computeGroupStandings(ms);
    const a = g.rows.find((r) => r.team.name === 'A')!;
    const b = g.rows.find((r) => r.team.name === 'B')!;
    expect(a.points).toBe(6);
    expect(b.points).toBe(6);
    expect(a.goalDiff).toBe(b.goalDiff);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(a.position).toBe(1); // H2H: A venceu B
    expect(b.position).toBe(2);
  });

  it('marca complete=false se faltam jogos', () => {
    const ms = [mkMatch('D', 'P', 'Q', 1, 0), mkMatch('D', 'P', 'R', null, null)];
    const [g] = computeGroupStandings(ms);
    expect(g.complete).toBe(false);
  });
});

describe('rankBestThirds', () => {
  function mkThirdTable(code: string, points: number, gd: number, gf: number): GroupTable {
    const third: TeamStanding = {
      team: { name: `3-${code}`, iso: code.toLowerCase() },
      groupCode: code,
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: gf,
      goalsAgainst: gf - gd,
      goalDiff: gd,
      points,
      position: 3,
    };
    return { groupCode: code, rows: [third], complete: true };
  }

  it('pega os 8 melhores terceiros por pontos→saldo→gols', () => {
    // 12 grupos A..L com pontuações decrescentes; A..H melhores, I..L caem.
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const tables = codes.map((c, i) => mkThirdTable(c, 12 - i, 0, 5));
    const best = rankBestThirds(tables, 8);
    expect(best).toHaveLength(8);
    expect(best.map((b) => b.groupCode)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(best[0].rank).toBe(1);
    expect(best[7].rank).toBe(8);
  });

  it('desempata terceiros por saldo quando pontos iguais', () => {
    const tables = [
      mkThirdTable('A', 4, 1, 3),
      mkThirdTable('B', 4, 5, 7), // mesmo pts, saldo melhor → vem antes
    ];
    const best = rankBestThirds(tables, 2);
    expect(best.map((b) => b.groupCode)).toEqual(['B', 'A']);
  });
});
