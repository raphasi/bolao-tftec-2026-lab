/**
 * Definição de confronto (times) de um jogo de mata-mata (motor puro).
 *
 * Usado pelo endpoint admin PATCH /api/admin/matches/:id/teams para transcrever
 * o chaveamento. Guards garantem que só se altera confronto de jogo de
 * mata-mata, antes de travar/finalizar e ANTES de existir qualquer palpite
 * (senão orfanaria palpites feitos sobre o confronto antigo).
 */
import { computeMatchLocked } from './match-lock.js';
import { BadRequestError, ConflictError } from '../utils/http-errors.js';
import type { MatchCacheDoc } from '../types/domain.js';

export interface SetTeamsInput {
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
}

/**
 * Valida se o confronto do jogo pode ser (re)definido agora.
 * @throws BadRequestError se for jogo de grupo.
 * @throws ConflictError se finalizado, travado, ou já com palpites.
 */
export function assertCanSetTeams(match: MatchCacheDoc, predictionsCount: number): void {
  if (match.phase === 'group') {
    throw new BadRequestError('Confrontos da fase de grupos não podem ser alterados.');
  }
  if (match.status === 'finished') {
    throw new ConflictError(`Jogo ${match.matchId} já finalizado — o confronto não pode mudar.`);
  }
  if (computeMatchLocked(match)) {
    throw new ConflictError(`Jogo ${match.matchId} travado — o confronto não pode mudar.`);
  }
  if (predictionsCount > 0) {
    throw new ConflictError(
      `Jogo ${match.matchId} já tem ${predictionsCount} palpite(s) — defina o confronto antes de abrir os palpites da fase.`,
    );
  }
}

/** Devolve uma cópia do doc com o novo confronto, preservando o resto. */
export function applyTeams(
  match: MatchCacheDoc,
  input: SetTeamsInput,
  nowIso: string,
): MatchCacheDoc {
  return {
    ...match,
    homeTeam: input.homeTeam,
    homeFlag: input.homeFlag,
    awayTeam: input.awayTeam,
    awayFlag: input.awayFlag,
    syncedAt: nowIso,
  };
}
