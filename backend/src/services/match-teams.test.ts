import { describe, it, expect } from 'vitest';
import { assertCanSetTeams, applyTeams } from './match-teams.js';
import { BadRequestError, ConflictError } from '../utils/http-errors.js';
import type { MatchCacheDoc, MatchPhase } from '../types/domain.js';

function mk(overrides: Partial<MatchCacheDoc> = {}): MatchCacheDoc {
  return {
    id: '89',
    matchId: 89,
    groupCode: 'round-of-16',
    phase: 'round-of-16' as MatchPhase,
    homeTeam: 'A definir',
    awayTeam: 'A definir',
    kickoffUtc: '2031-01-01T00:00:00.000Z', // futuro distante → não travado
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    pointsCalculatedAt: null,
    syncedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('assertCanSetTeams', () => {
  it('rejeita jogo de grupo (400)', () => {
    expect(() => assertCanSetTeams(mk({ phase: 'group' }), 0)).toThrow(BadRequestError);
  });

  it('rejeita jogo finalizado (409)', () => {
    expect(() => assertCanSetTeams(mk({ status: 'finished' }), 0)).toThrow(ConflictError);
  });

  it('rejeita jogo travado por kickoff passado (409)', () => {
    expect(() =>
      assertCanSetTeams(mk({ kickoffUtc: '2020-01-01T00:00:00.000Z' }), 0),
    ).toThrow(ConflictError);
  });

  it('rejeita quando já existem palpites (409)', () => {
    expect(() => assertCanSetTeams(mk(), 3)).toThrow(ConflictError);
  });

  it('permite jogo de mata-mata futuro, sem palpites', () => {
    expect(() => assertCanSetTeams(mk(), 0)).not.toThrow();
  });
});

describe('applyTeams', () => {
  it('atualiza o confronto preservando os demais campos', () => {
    const original = mk();
    const updated = applyTeams(
      original,
      { homeTeam: 'Brasil', homeFlag: 'br', awayTeam: 'Argentina', awayFlag: 'ar' },
      '2026-06-05T12:00:00.000Z',
    );
    expect(updated.homeTeam).toBe('Brasil');
    expect(updated.homeFlag).toBe('br');
    expect(updated.awayTeam).toBe('Argentina');
    expect(updated.awayFlag).toBe('ar');
    expect(updated.syncedAt).toBe('2026-06-05T12:00:00.000Z');
    // preserva
    expect(updated.matchId).toBe(89);
    expect(updated.groupCode).toBe('round-of-16');
    expect(updated.phase).toBe('round-of-16');
    expect(updated.kickoffUtc).toBe(original.kickoffUtc);
    expect(updated.status).toBe('scheduled');
  });
});
