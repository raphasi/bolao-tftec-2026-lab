/**
 * Rótulos e ordenação das fases dos jogos (grupos + mata-mata).
 *
 * Os jogos de mata-mata são semeados na mesma `matches-cache` com `phase`
 * eliminatória e `groupCode` = nome da fase. O motor (palpite/trava/pontuação)
 * é agnóstico de fase; este helper cuida apenas da APRESENTAÇÃO — para que o
 * mata-mata apareça como "Oitavas de final" etc., e não "Grupo round-of-16".
 */

export const PHASE_LABELS: Record<string, string> = {
  'round-of-32': '16-avos de final',
  'round-of-16': 'Oitavas de final',
  quarter: 'Quartas de final',
  semi: 'Semifinal',
  'third-place': 'Disputa de 3º lugar',
  final: 'Final',
};

/** Ordem canônica das fases eliminatórias (para ordenar seções/chips). */
export const KNOCKOUT_ORDER = ['round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final'] as const;

type MatchLike = { phase?: string; groupCode: string };

export function isKnockout(phase?: string): boolean {
  return !!phase && phase !== 'group';
}

/** Rótulo da seção/etiqueta de um jogo: "Grupo X" ou a fase eliminatória. */
export function sectionLabel(match: MatchLike): string {
  return isKnockout(match.phase)
    ? PHASE_LABELS[match.phase as string] ?? (match.phase as string)
    : `Grupo ${match.groupCode}`;
}

/** Chave estável para agrupar jogos por seção. */
export function sectionKey(match: MatchLike): string {
  return isKnockout(match.phase) ? (match.phase as string) : match.groupCode;
}

/**
 * Rótulo a partir só do código (grupos guardam 'A'..'L'; mata-mata guarda o
 * nome da fase em groupCode). Usado onde só temos o código denormalizado
 * (ex.: lista de palpites no Perfil). Grupos ficam como o código puro.
 */
export function codeLabel(code: string): string {
  return PHASE_LABELS[code] ?? code;
}

/** Peso de ordenação: grupos A..L primeiro, depois mata-mata em ordem de chave. */
export function sectionWeight(match: MatchLike): number {
  if (isKnockout(match.phase)) {
    const idx = KNOCKOUT_ORDER.indexOf(match.phase as (typeof KNOCKOUT_ORDER)[number]);
    return 1000 + (idx < 0 ? 99 : idx);
  }
  return match.groupCode.charCodeAt(0); // 'A'=65 … 'L'=76
}
