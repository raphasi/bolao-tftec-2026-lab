import { describe, it, expect } from 'vitest';
import {
  calcMatchPoints,
  normalizeName,
  calcSpecialsBase,
  calcTop4Bonus,
  type SpecialsActual,
  type SpecialsGuess,
} from './scoring.js';

// Regra canônica (ADR-019): placar exato=25, vencedor/empate sem placar=15, errou=0.
describe('calcMatchPoints (25/15/0)', () => {
  it('placar exato (vitória) → 25', () => {
    expect(calcMatchPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(25);
  });

  it('placar exato (empate) → 25', () => {
    expect(calcMatchPoints({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(25);
    expect(calcMatchPoints({ home: 2, away: 2 }, { home: 2, away: 2 })).toBe(25);
  });

  it('acertou o vencedor sem o placar → 15', () => {
    expect(calcMatchPoints({ home: 2, away: 1 }, { home: 3, away: 0 })).toBe(15);
    expect(calcMatchPoints({ home: 1, away: 0 }, { home: 2, away: 1 })).toBe(15);
    // goleada: vencedor certo, placar diferente
    expect(calcMatchPoints({ home: 1, away: 0 }, { home: 5, away: 0 })).toBe(15);
  });

  it('acertou o empate sem o placar → 15', () => {
    expect(calcMatchPoints({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(15);
    expect(calcMatchPoints({ home: 0, away: 0 }, { home: 1, away: 1 })).toBe(15);
  });

  it('errou o vencedor → 0', () => {
    expect(calcMatchPoints({ home: 2, away: 1 }, { home: 1, away: 2 })).toBe(0);
  });

  it('palpitou empate, foi vitória → 0', () => {
    expect(calcMatchPoints({ home: 0, away: 0 }, { home: 1, away: 0 })).toBe(0);
  });

  it('palpitou vitória, foi empate → 0', () => {
    expect(calcMatchPoints({ home: 2, away: 1 }, { home: 1, away: 1 })).toBe(0);
  });

  it('vitória do visitante: placar exato vs só vencedor', () => {
    expect(calcMatchPoints({ home: 0, away: 2 }, { home: 0, away: 2 })).toBe(25);
    expect(calcMatchPoints({ home: 0, away: 2 }, { home: 1, away: 3 })).toBe(15);
  });
});

describe('normalizeName', () => {
  it('remove acentos', () => {
    expect(normalizeName('Mbappé')).toBe('mbappe');
    expect(normalizeName('Müller')).toBe('muller');
    expect(normalizeName('Suárez')).toBe('suarez');
  });

  it('case-insensitive e trim', () => {
    expect(normalizeName('  MESSI  ')).toBe('messi');
    expect(normalizeName('HaAlAnD')).toBe('haaland');
  });

  it('idempotente em nome já normalizado', () => {
    expect(normalizeName('neymar')).toBe('neymar');
  });
});

const ACTUAL: SpecialsActual = {
  champion: 'Brasil',
  runnerUp: 'Argentina',
  thirdPlace: 'França',
  fourthPlace: 'Inglaterra',
  topScorer: 'no-haaland', // agora é ID de jogador, não nome
};

describe('calcSpecialsBase', () => {
  it('tudo certo → 150/75/40/40/120', () => {
    const g: SpecialsGuess = { ...ACTUAL };
    expect(calcSpecialsBase(g, ACTUAL)).toEqual({
      champion: 150,
      runnerUp: 75,
      thirdPlace: 40,
      fourthPlace: 40,
      topScorer: 120,
    });
  });

  it('tudo errado → zeros', () => {
    const g: SpecialsGuess = {
      champion: 'Espanha',
      runnerUp: 'Portugal',
      thirdPlace: 'Itália',
      fourthPlace: 'Bélgica',
      topScorer: 'Messi',
    };
    expect(calcSpecialsBase(g, ACTUAL)).toEqual({
      champion: 0,
      runnerUp: 0,
      thirdPlace: 0,
      fourthPlace: 0,
      topScorer: 0,
    });
  });

  it('artilheiro por ID exato (sem normalização de nome)', () => {
    expect(calcSpecialsBase({ ...ACTUAL, topScorer: 'no-haaland' }, ACTUAL).topScorer).toBe(120);
    // formatação/caixa diferente NÃO casa mais — exige id idêntico
    expect(calcSpecialsBase({ ...ACTUAL, topScorer: 'NO-HAALAND' }, ACTUAL).topScorer).toBe(0);
    expect(calcSpecialsBase({ ...ACTUAL, topScorer: 'Haaland' }, ACTUAL).topScorer).toBe(0);
  });

  it('topScorer null → 0 (sem crash)', () => {
    const g: SpecialsGuess = { ...ACTUAL, topScorer: null };
    expect(calcSpecialsBase(g, ACTUAL).topScorer).toBe(0);
  });

  it('parcial: só campeão certo', () => {
    const g: SpecialsGuess = {
      champion: 'Brasil',
      runnerUp: 'Espanha',
      thirdPlace: 'Espanha',
      fourthPlace: 'Espanha',
      topScorer: 'Messi',
    };
    const r = calcSpecialsBase(g, ACTUAL);
    expect(r.champion).toBe(150);
    expect(r.runnerUp + r.thirdPlace + r.fourthPlace + r.topScorer).toBe(0);
  });
});

describe('calcTop4Bonus', () => {
  it('4 certos na ordem exata → 50', () => {
    expect(calcTop4Bonus({ ...ACTUAL }, ACTUAL)).toBe(50);
  });

  it('4 certos em qualquer ordem → 50', () => {
    const g: SpecialsGuess = {
      champion: 'Inglaterra',
      runnerUp: 'França',
      thirdPlace: 'Argentina',
      fourthPlace: 'Brasil',
      topScorer: 'Messi', // irrelevante p/ bonus
    };
    expect(calcTop4Bonus(g, ACTUAL)).toBe(50);
  });

  it('3 de 4 → 0', () => {
    const g: SpecialsGuess = {
      champion: 'Brasil',
      runnerUp: 'Argentina',
      thirdPlace: 'França',
      fourthPlace: 'Espanha',
      topScorer: 'Haaland',
    };
    expect(calcTop4Bonus(g, ACTUAL)).toBe(0);
  });

  it('algum top4 null → 0', () => {
    const g: SpecialsGuess = {
      champion: 'Brasil',
      runnerUp: 'Argentina',
      thirdPlace: 'França',
      fourthPlace: null,
      topScorer: 'Haaland',
    };
    expect(calcTop4Bonus(g, ACTUAL)).toBe(0);
  });
});
