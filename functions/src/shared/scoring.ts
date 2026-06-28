/**
 * Regras de pontuação do bolão.
 *
 * Pontuação por palpite de jogo: 25/15/0 (decisão do owner — 2026-05-15,
 * supersede ADR-014 que era 10/5/0; ver DECISIONS.md ADR-019).
 *   - Placar exato → 25 pts
 *   - Acertou o vencedor OU o empate (sem acertar os gols) → 15 pts
 *   - Errou → 0 pts
 *
 * Pontuação por especiais (S2.5):
 *   - Campeão: 150
 *   - Vice: 75
 *   - 3º: 40
 *   - 4º: 40
 *   - Artilheiro: 120
 *   - Bonus top4 (todos certos em qualquer ordem): 50
 *   Total máximo: 475 pts
 */

function sign(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * Calcula pontos de UM palpite vs UM resultado real.
 */
export function calcMatchPoints(
  predicted: { home: number; away: number },
  actual: { home: number; away: number },
): number {
  // Placar exato
  if (predicted.home === actual.home && predicted.away === actual.away) {
    return 25;
  }
  // Acertou o vencedor (ou empate), sem acertar o placar exato
  const predictedWinner = sign(predicted.home - predicted.away);
  const actualWinner = sign(actual.home - actual.away);
  if (predictedWinner === actualWinner) {
    return 15;
  }
  return 0;
}

/**
 * Normaliza nome para slug/comparação (NFD, sem acento, lowercase, trim).
 * ⚠️ NÃO usar no scoring do artilheiro — desde a feature de dropdown, o
 * artilheiro é comparado por ID de jogador (igualdade exata). Mantida apenas
 * como utilitário (ex.: gerar slug de id na curadoria de elencos).
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (Unicode combining marks)
    .toLowerCase()
    .trim();
}

export interface SpecialsActual {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
  fourthPlace: string;
  topScorer: string;
}

export interface SpecialsGuess {
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
}

/**
 * Calcula pontos dos 5 especiais (sem bonus).
 */
export function calcSpecialsBase(guess: SpecialsGuess, actual: SpecialsActual): {
  champion: number;
  runnerUp: number;
  thirdPlace: number;
  fourthPlace: number;
  topScorer: number;
} {
  return {
    champion: guess.champion === actual.champion ? 150 : 0,
    runnerUp: guess.runnerUp === actual.runnerUp ? 75 : 0,
    thirdPlace: guess.thirdPlace === actual.thirdPlace ? 40 : 0,
    fourthPlace: guess.fourthPlace === actual.fourthPlace ? 40 : 0,
    // Artilheiro por ID de jogador (igualdade exata), igual a champion/runnerUp.
    // Acaba com o problema do texto livre ("Vinicius Jr." ≠ "Vinicius Junior").
    topScorer: guess.topScorer && guess.topScorer === actual.topScorer ? 120 : 0,
  };
}

/**
 * Bonus top4: 50 pts se as 4 seleções (champion, runnerUp, thirdPlace, fourthPlace)
 * estiverem corretas em QUALQUER ordem.
 */
export function calcTop4Bonus(guess: SpecialsGuess, actual: SpecialsActual): number {
  const guessTop4 = [guess.champion, guess.runnerUp, guess.thirdPlace, guess.fourthPlace];
  if (guessTop4.some((v) => v === null)) return 0;

  const actualTop4 = new Set([actual.champion, actual.runnerUp, actual.thirdPlace, actual.fourthPlace]);
  const allMatch = guessTop4.every((g) => actualTop4.has(g as string));
  return allMatch ? 50 : 0;
}
