/**
 * Tipos de domínio do bolão (frontend).
 * Espelha os DTOs públicos do backend (backend/src/types/domain.ts).
 */

export interface NationRef {
  iso: string;          // 'br', 'gb-eng'
  name: string;
}

export interface VenueRef {
  city: string;
  stadium: string;
  country: 'USA' | 'Canada' | 'Mexico';
}

export type MatchPhase = 'group' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'third-place' | 'final';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface MatchPublic {
  matchId: number;
  groupCode: string;
  phase: MatchPhase;
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
  kickoffUtc: string;
  venue?: VenueRef;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  locked: boolean;
  // Feature phase-windows: false quando a fase ainda não abriu (mata-mata).
  // undefined/true = aberta. opensUtc = quando abre (ISO).
  predictionsOpen?: boolean;
  opensUtc?: string;
}

export interface GroupPublic {
  code: string;
  teams: NationRef[];
}

// Catálogo de jogadores (GET /api/players) — para o artilheiro.
export interface PlayerPublic {
  id: string;
  name: string;
  iso: string;
  nation: string;
  label: string; // "Nome (Seleção)"
}

// Tabela da Copa (GET /api/standings) — espelho dos DTOs do backend.
export type Qualification = 'direct' | 'best-third' | 'eliminated' | 'undecided';

export interface StandingRowPublic {
  team: NationRef;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  qualification: Qualification;
  thirdRank?: number;
  provisional: boolean;
}

export interface GroupStandingPublic {
  groupCode: string;
  complete: boolean;
  playedCount: number;
  totalCount: number;
  rows: StandingRowPublic[];
}

export interface BestThirdPublic {
  groupCode: string;
  team: NationRef;
  rank: number;
  points: number;
  goalDiff: number;
  goalsFor: number;
}

export interface StandingsResponse {
  groups: GroupStandingPublic[];
  bestThirds: BestThirdPublic[];
  cutoffRank: number;
  allComplete: boolean;
  computedAt: string;
}

export interface PredictionPublic {
  matchId: number;
  groupCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
  points: number | null;
  locked: boolean;
  updatedAt: string;
}

export interface SpecialPredictionPublic {
  season: number;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
  locked: boolean;
  points: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    topScorer: number;
    top4Bonus: number;
  };
  updatedAt: string;
}

export interface SpecialsLockPublic {
  lockUtc: string | null;
  locked: boolean;
  description?: string;
}

export interface AdminSpecialsLockPublic {
  lockUtc: string | null;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  locked: boolean;
  // B1.4: lock manual aditivo
  lockedManually: boolean;
  lockedManuallyAt: string | null;
}

export interface MatchAdmin extends MatchPublic {
  finishedAt: string | null;
  pointsCalculatedAt: string | null;
  lockedManually?: boolean;
  lockedManuallyAt?: string;
  allowEarlyFinish?: boolean;
  allowEarlyFinishAt?: string;
}

export interface TournamentFinalPublic {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
  fourthPlace: string;
  topScorer: string;
  updatedBy?: string | null;
  updatedAt?: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  totalPoints: number;
  matchPoints: number;
  specialPoints: number;
  predictionsCount: number;
  pendingCount?: number;
  perfectScores: number;
  rank: number;
}

export interface LeaderboardResponse {
  ranking: LeaderboardEntry[];
  count: number;
  lastUpdated: string | null;
}

// B3.1: breakdown dos pontos de especiais de um user (modal leaderboard)
export interface SpecialsBreakdown {
  userId: string;
  picks: {
    champion: string | null;
    runnerUp: string | null;
    thirdPlace: string | null;
    fourthPlace: string | null;
    topScorer: string | null;
  };
  actuals: {
    champion: string;
    runnerUp: string;
    thirdPlace: string;
    fourthPlace: string;
    topScorer: string;
  } | null;
  points: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    topScorer: number;
    top4Bonus: number;
    total: number;
  };
  hasPicks: boolean;
}

export const SEASON = 2026;
