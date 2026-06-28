/**
 * Ordenação oficial do leaderboard, incluindo os critérios de DESEMPATE.
 *
 * Fonte da verdade: docs/scoring-rules.md (§ "Ranking / desempate"):
 *   1) totalPoints   DESC  — pontuação total
 *   2) perfectScores DESC  — quem acertou mais placares exatos (25 pts)
 *   3) createdAt     ASC   — quem se cadastrou primeiro
 *   4) userId        ASC   — desempate determinístico final (evita a ordem
 *                            arbitrária do Cosmos quando tudo mais empata)
 *
 * Implementado em código (e não via `ORDER BY` do Cosmos) porque ordenar por
 * múltiplos campos no Cosmos exigiria um índice composto; além disso o
 * GET /leaderboard já carrega todos os docs (fetchAll) e atribui o rank.
 */

export interface LeaderboardSortable {
  totalPoints: number;
  perfectScores: number;
  createdAt?: string;
  userId: string;
}

/** Comparador estável conforme os critérios oficiais de desempate. */
export function compareLeaderboard(a: LeaderboardSortable, b: LeaderboardSortable): number {
  return (
    b.totalPoints - a.totalPoints ||
    b.perfectScores - a.perfectScores ||
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
    a.userId.localeCompare(b.userId)
  );
}

/** Retorna uma nova lista ordenada (não muta a original). */
export function rankLeaderboard<T extends LeaderboardSortable>(docs: readonly T[]): T[] {
  return [...docs].sort(compareLeaderboard);
}
