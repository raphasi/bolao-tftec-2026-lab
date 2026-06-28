import { describe, it, expect } from 'vitest';
import { assignThirds, buildKnockoutProposal, checkR32Assignment, type Confronto } from './bracket.js';
import { computeGroupStandings } from './standings.js';
import type { MatchCacheDoc, MatchPhase } from '../types/domain.js';

// Vagas de 3º e seus grupos elegíveis (espelho do template oficial em bracket.ts).
const THIRD_SLOTS: Record<number, string[]> = {
  74: ['A', 'B', 'C', 'D', 'F'],
  77: ['C', 'D', 'F', 'G', 'H'],
  79: ['C', 'E', 'F', 'H', 'I'],
  80: ['E', 'H', 'I', 'J', 'K'],
  81: ['B', 'E', 'F', 'I', 'J'],
  82: ['A', 'E', 'H', 'I', 'J'],
  85: ['E', 'F', 'G', 'I', 'J'],
  87: ['D', 'E', 'I', 'J', 'L'],
};

describe('assignThirds', () => {
  it('atribui 8 terceiros respeitando as vagas elegíveis (bijeção)', () => {
    const groups = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const res = assignThirds(groups);
    expect(res).not.toBeNull();
    const assigned = Object.values(res!);
    expect(assigned).toHaveLength(8);
    expect(new Set(assigned).size).toBe(8); // todos distintos
    expect(new Set(assigned)).toEqual(new Set(groups)); // exatamente os 8 grupos
    for (const [matchId, group] of Object.entries(res!)) {
      expect(THIRD_SLOTS[Number(matchId)]).toContain(group);
    }
  });

  it('funciona para outra combinação (A,B,C,D,F,G,H,I)', () => {
    const groups = ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'];
    const res = assignThirds(groups);
    expect(res).not.toBeNull();
    for (const [matchId, group] of Object.entries(res!)) {
      expect(THIRD_SLOTS[Number(matchId)]).toContain(group);
    }
    expect(new Set(Object.values(res!))).toEqual(new Set(groups));
  });
});

// ── helper para jogos de mata-mata já finalizados ──
function mkKo(
  matchId: number,
  phase: MatchPhase,
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
): MatchCacheDoc {
  return {
    id: String(matchId),
    matchId,
    groupCode: phase,
    phase,
    homeTeam: home,
    homeFlag: home.toLowerCase().slice(0, 2),
    awayTeam: away,
    awayFlag: away.toLowerCase().slice(0, 2),
    kickoffUtc: '2026-06-10T00:00:00.000Z',
    homeScore: hs,
    awayScore: as,
    status: hs != null && as != null ? 'finished' : 'scheduled',
    pointsCalculatedAt: null,
    syncedAt: '2026-06-10T00:00:00.000Z',
  };
}

const find = (p: Confronto[], id: number) => p.find((c) => c.matchId === id)!;

describe('buildKnockoutProposal — árvore R16+', () => {
  it('deriva o vencedor da fase anterior (89 = vencedor 74 vs vencedor 77)', () => {
    const matches = [
      mkKo(74, 'round-of-32', 'Brasil', 'Chile', 2, 0), // Brasil vence
      mkKo(77, 'round-of-32', 'França', 'Gana', 0, 1), // Gana vence
    ];
    const proposal = buildKnockoutProposal(matches);
    const m89 = find(proposal, 89);
    expect(m89.phase).toBe('round-of-16');
    expect(m89.home?.name).toBe('Brasil');
    expect(m89.away?.name).toBe('Gana');
    expect(m89.note).toBeUndefined();
  });

  it('marca nota quando há empate em fase anterior', () => {
    const matches = [mkKo(74, 'round-of-32', 'Brasil', 'Chile', 1, 1)];
    const proposal = buildKnockoutProposal(matches);
    const m89 = find(proposal, 89);
    expect(m89.home).toBeNull();
    expect(m89.note).toMatch(/empate/i);
  });

  it('3º lugar (103) usa os PERDEDORES das semis', () => {
    const matches = [
      mkKo(101, 'semi', 'Brasil', 'Argentina', 2, 1), // Argentina perde
      mkKo(102, 'semi', 'França', 'Espanha', 0, 3), // França perde
    ];
    const proposal = buildKnockoutProposal(matches);
    const m103 = find(proposal, 103);
    expect(m103.phase).toBe('third-place');
    expect(new Set([m103.home?.name, m103.away?.name])).toEqual(new Set(['Argentina', 'França']));
    const m104 = find(proposal, 104);
    expect(new Set([m104.home?.name, m104.away?.name])).toEqual(new Set(['Brasil', 'Espanha']));
  });
});

describe('buildKnockoutProposal — R32 a partir das tabelas', () => {
  // grupo completo de 4 times com ordem determinística por pontos
  function group(code: string, t: [string, string, string, string]): MatchCacheDoc[] {
    const [a, b, c, d] = t; // a>b>c>d
    let n = code.charCodeAt(0) * 100;
    const mk = (h: string, aw: string, hs: number, as: number): MatchCacheDoc => ({
      id: String(++n),
      matchId: n,
      groupCode: code,
      phase: 'group',
      homeTeam: h,
      homeFlag: h.toLowerCase().slice(0, 2),
      awayTeam: aw,
      awayFlag: aw.toLowerCase().slice(0, 2),
      kickoffUtc: '2026-06-01T00:00:00.000Z',
      homeScore: hs,
      awayScore: as,
      status: 'finished',
      pointsCalculatedAt: null,
      syncedAt: '2026-06-01T00:00:00.000Z',
    });
    // a vence todos; b vence c,d; c vence d
    return [
      mk(a, b, 1, 0),
      mk(a, c, 1, 0),
      mk(a, d, 1, 0),
      mk(b, c, 1, 0),
      mk(b, d, 1, 0),
      mk(c, d, 1, 0),
    ];
  }

  it('coloca 2A vs 2B no jogo 73 e 1E como mandante do 74', () => {
    const matches = [
      ...group('A', ['A1', 'A2', 'A3', 'A4']),
      ...group('B', ['B1', 'B2', 'B3', 'B4']),
      ...group('E', ['E1', 'E2', 'E3', 'E4']),
    ];
    const proposal = buildKnockoutProposal(matches);
    const m73 = find(proposal, 73);
    expect(m73.home?.name).toBe('A2'); // 2A
    expect(m73.away?.name).toBe('B2'); // 2B
    expect(m73.homeSource).toBe('2A');
    expect(m73.awaySource).toBe('2B');
    const m74 = find(proposal, 74);
    expect(m74.home?.name).toBe('E1'); // 1E
    expect(m74.homeSource).toBe('1E');
  });

  describe('checkR32Assignment — validação do Anexo C', () => {
    // grupos A, B, E completos: X1>X2>X3>X4
    const tables = computeGroupStandings([
      ...group('A', ['A1', 'A2', 'A3', 'A4']),
      ...group('B', ['B1', 'B2', 'B3', 'B4']),
      ...group('E', ['E1', 'E2', 'E3', 'E4']),
    ]);
    const ref = (name: string) => ({ name, iso: name.toLowerCase().slice(0, 2) });

    it('não acusa nada quando o confronto bate com o template (74 = 1E vs 3A)', () => {
      // jogo 74: home = W(E), away = T3(A,B,C,D,F) → 3º do A é elegível
      expect(checkR32Assignment(74, ref('E1'), ref('A3'), tables)).toEqual([]);
    });

    it('avisa quando o mandante não é o 1º do grupo esperado', () => {
      const w = checkR32Assignment(74, ref('E2'), ref('A3'), tables);
      expect(w).toHaveLength(1);
      expect(w[0].side).toBe('home');
      expect(w[0].message).toMatch(/1º do grupo E/);
    });

    it('avisa quando o 3º colocado não é elegível para a vaga', () => {
      // 3º do E não está no pool da vaga 74 {A,B,C,D,F}
      const w = checkR32Assignment(74, ref('E1'), ref('E3'), tables);
      expect(w).toHaveLength(1);
      expect(w[0].side).toBe('away');
      expect(w[0].message).toMatch(/não é elegível/);
    });

    it('avisa quando o time da vaga de 3º não é um 3º colocado', () => {
      // A2 é 2º do A — vaga de 3º espera um 3º colocado
      const w = checkR32Assignment(74, ref('E1'), ref('A2'), tables);
      expect(w).toHaveLength(1);
      expect(w[0].side).toBe('away');
      expect(w[0].message).toMatch(/3º colocado/);
    });

    it('não valida jogos fora dos 16-avos (árvore R16+)', () => {
      expect(checkR32Assignment(97, ref('A1'), ref('B1'), tables)).toEqual([]);
    });

    it('lado a definir (null) não gera aviso', () => {
      expect(checkR32Assignment(74, null, null, tables)).toEqual([]);
    });
  });
});
