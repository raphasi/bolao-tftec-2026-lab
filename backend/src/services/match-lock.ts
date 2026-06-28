/**
 * Helper centralizado de lock de jogo (S6.3).
 *
 * Regra aditiva: locked = lockedManually || (time-based 30min antes do kickoff)
 *  - Admin pode adicionar lock antes do auto-lock (operacional + testes)
 *  - Admin NÃO pode burlar o time-based (fairness — sem palpitar tarde)
 */
import type { MatchCacheDoc } from '../types/domain.js';

export const LOCK_BEFORE_KICKOFF_MS = 30 * 60 * 1000;

/**
 * Computa estado `locked` do jogo.
 *
 * Triggers (aditivos):
 *  1. `status === 'finished'` — jogo já tem placar oficial, não admite mais palpite (B6.5 fix)
 *  2. `lockedManually === true` — admin travou explicitamente
 *  3. Time-based: `now >= kickoff - 30min`
 *
 * @param doc Documento do match em Cosmos
 * @param nowMs Optional override (default Date.now()) — útil em testes
 */
export function computeMatchLocked(doc: MatchCacheDoc, nowMs: number = Date.now()): boolean {
  if (doc.status === 'finished') return true;
  if (doc.lockedManually === true) return true;
  const kickoffMs = Date.parse(doc.kickoffUtc);
  return Number.isFinite(kickoffMs) && nowMs >= kickoffMs - LOCK_BEFORE_KICKOFF_MS;
}

/**
 * Indica se o lock está em vigor APENAS por causa do time-based (não manual).
 * Útil pro frontend distinguir "travado pelo admin" vs "travado automaticamente".
 */
export function isTimeBasedLockActive(doc: MatchCacheDoc, nowMs: number = Date.now()): boolean {
  const kickoffMs = Date.parse(doc.kickoffUtc);
  return Number.isFinite(kickoffMs) && nowMs >= kickoffMs - LOCK_BEFORE_KICKOFF_MS;
}
