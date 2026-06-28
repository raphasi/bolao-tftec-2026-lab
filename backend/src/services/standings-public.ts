/**
 * Serializer público da Tabela da Copa (motor puro, sem I/O).
 *
 * Reusa `computeGroupStandings` + `rankBestThirds` (standings.ts — NÃO tocado) e
 * deriva a flag de qualificação por seleção, AQUI no backend, pra a UI ser burra:
 *   - 'undecided'   grupo sem nenhum jogo finalizado (evita falso classificado).
 *   - 'direct'      1º/2º de grupo.
 *   - 'best-third'  3º entre os 8 melhores terceiros (corte global dinâmico).
 *   - 'eliminated'  demais.
 * `provisional` indica que a posição ainda pode mudar (grupo incompleto, ou 3º
 * colocado antes da fase de grupos fechar — o corte dos 8 pode virar).
 */
import { computeGroupStandings, rankBestThirds } from './standings.js';
import type {
  MatchCacheDoc,
  Qualification,
  StandingsResponse,
  StandingRowPublic,
} from '../types/domain.js';

const CUTOFF = 8;

export function buildStandingsResponse(
  matches: MatchCacheDoc[],
  computedAt: string,
): StandingsResponse {
  const tables = computeGroupStandings(matches); // já filtra phase='group' e ordena A→L
  const bestThirds = rankBestThirds(tables, CUTOFF);
  const thirdRankByGroup = new Map(bestThirds.map((t) => [t.groupCode, t.rank]));
  const allComplete = tables.length > 0 && tables.every((t) => t.complete);

  const groups = tables.map((t) => {
    const gms = matches.filter((m) => m.phase === 'group' && m.groupCode === t.groupCode);
    const totalCount = gms.length;
    const playedCount = gms.filter(
      (m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null,
    ).length;
    const noneFinished = t.rows.every((r) => r.played === 0);

    const rows: StandingRowPublic[] = t.rows.map((r) => {
      let qualification: Qualification;
      if (noneFinished) qualification = 'undecided';
      else if (r.position <= 2) qualification = 'direct';
      else if (r.position === 3 && thirdRankByGroup.has(t.groupCode)) qualification = 'best-third';
      else qualification = 'eliminated';

      return {
        team: r.team,
        position: r.position,
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        goalDiff: r.goalDiff,
        points: r.points,
        qualification,
        ...(qualification === 'best-third'
          ? { thirdRank: thirdRankByGroup.get(t.groupCode) }
          : {}),
        // Posição 1/2 de grupo encerrado é definitiva; 3º depende do corte global.
        provisional: !t.complete || (r.position === 3 && !allComplete),
      };
    });

    return { groupCode: t.groupCode, complete: t.complete, playedCount, totalCount, rows };
  });

  return {
    groups,
    bestThirds: bestThirds.map((t) => ({
      groupCode: t.groupCode,
      team: t.team,
      rank: t.rank,
      points: t.points,
      goalDiff: t.goalDiff,
      goalsFor: t.goalsFor,
    })),
    cutoffRank: CUTOFF,
    allComplete,
    computedAt,
  };
}
