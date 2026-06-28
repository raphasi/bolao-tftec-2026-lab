import { describe, it, expect } from 'vitest';
import { buildStandingsResponse } from './standings-public.js';
import type {
  MatchCacheDoc,
  MatchPhase,
  GroupStandingPublic,
  StandingRowPublic,
} from '../types/domain.js';

let mc = 0;
function m(
  group: string,
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
  phase: MatchPhase = 'group',
): MatchCacheDoc {
  mc += 1;
  return {
    id: String(mc),
    matchId: mc,
    groupCode: group,
    phase,
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

/** Grupo completo: t1 (9pts) > t2 (6) > t3 (3, vence t4 por `margin`) > t4 (0). */
function fullGroup(code: string, margin = 3): MatchCacheDoc[] {
  const t = [`${code}1`, `${code}2`, `${code}3`, `${code}4`];
  return [
    m(code, t[0], t[1], 1, 0),
    m(code, t[0], t[2], 1, 0),
    m(code, t[0], t[3], 1, 0),
    m(code, t[1], t[2], 1, 0),
    m(code, t[1], t[3], 1, 0),
    m(code, t[2], t[3], margin, 0),
  ];
}

const ISO = '2026-06-05T12:00:00.000Z';
const rowByPos = (g: GroupStandingPublic, pos: number): StandingRowPublic =>
  g.rows.find((r) => r.position === pos)!;

describe('buildStandingsResponse', () => {
  it('vazio → 200-shape sem 500', () => {
    const res = buildStandingsResponse([], ISO);
    expect(res.groups).toEqual([]);
    expect(res.bestThirds).toEqual([]);
    expect(res.allComplete).toBe(false);
    expect(res.cutoffRank).toBe(8);
    expect(res.computedAt).toBe(ISO);
  });

  it('ignora jogos de mata-mata (não vaza no payload)', () => {
    const matches = [
      ...fullGroup('A'),
      m('round-of-32', 'Brasil', 'Chile', 2, 1, 'round-of-32'),
      m('final', 'Argentina', 'França', 0, 0, 'final'),
    ];
    const res = buildStandingsResponse(matches, ISO);
    expect(res.groups.map((g) => g.groupCode)).toEqual(['A']);
    expect(res.groups[0].rows).toHaveLength(4);
  });

  it('grupo sem jogos finalizados → undecided e sem badge', () => {
    const matches = [m('B', 'B1', 'B2', null, null), m('B', 'B3', 'B4', null, null)];
    const res = buildStandingsResponse(matches, ISO);
    const g = res.groups[0];
    expect(g.complete).toBe(false);
    expect(g.playedCount).toBe(0);
    expect(g.rows.every((r) => r.qualification === 'undecided')).toBe(true);
  });

  it('mapeia direct/best-third/eliminated + thirdRank + provisional', () => {
    // A e B completos; C ainda sem jogos → allComplete=false.
    const matches = [
      ...fullGroup('A'),
      ...fullGroup('B'),
      m('C', 'C1', 'C2', null, null),
      m('C', 'C3', 'C4', null, null),
    ];
    const res = buildStandingsResponse(matches, ISO);
    expect(res.allComplete).toBe(false);

    const A = res.groups.find((g) => g.groupCode === 'A')!;
    expect(A.complete).toBe(true);
    expect(A.playedCount).toBe(6);
    expect(A.totalCount).toBe(6);

    expect(rowByPos(A, 1).qualification).toBe('direct');
    expect(rowByPos(A, 2).qualification).toBe('direct');
    expect(rowByPos(A, 3).qualification).toBe('best-third'); // só 2 grupos → cabe nos 8
    expect(rowByPos(A, 3).thirdRank).toBeGreaterThanOrEqual(1);
    expect(rowByPos(A, 4).qualification).toBe('eliminated');

    // provisional: 1º/2º de grupo completo NÃO; 3º SIM (corte global ainda aberto)
    expect(rowByPos(A, 1).provisional).toBe(false);
    expect(rowByPos(A, 3).provisional).toBe(true);

    // grupo C: undecided + provisional
    const C = res.groups.find((g) => g.groupCode === 'C')!;
    expect(C.rows.every((r) => r.qualification === 'undecided')).toBe(true);
    expect(C.rows.every((r) => r.provisional)).toBe(true);
  });

  it('aplica o corte dos 8 melhores 3º (9 grupos → 1 eliminado)', () => {
    // 8 grupos com 3º forte (margin 3, SG +1) + 1 grupo (I) com 3º fraco (margin 1, SG -1).
    const strong = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((c) => fullGroup(c, 3));
    const weak = fullGroup('I', 1);
    const res = buildStandingsResponse([...strong, ...weak], ISO);

    expect(res.bestThirds).toHaveLength(8);
    expect(res.bestThirds.some((b) => b.groupCode === 'I')).toBe(false);

    const I = res.groups.find((g) => g.groupCode === 'I')!;
    expect(rowByPos(I, 3).qualification).toBe('eliminated'); // 9º melhor 3º → cortado
    const A = res.groups.find((g) => g.groupCode === 'A')!;
    expect(rowByPos(A, 3).qualification).toBe('best-third');
  });

  it('grupos ordenados A→L', () => {
    const res = buildStandingsResponse([...fullGroup('C'), ...fullGroup('A'), ...fullGroup('B')], ISO);
    expect(res.groups.map((g) => g.groupCode)).toEqual(['A', 'B', 'C']);
  });
});
