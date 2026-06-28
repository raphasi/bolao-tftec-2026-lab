/**
 * Tipos espelho de backend/src/types/domain.ts.
 * Duplicado para evitar dependência cross-workspace (decisão sprint planning S3).
 * Refactor para package compartilhado é backlog.
 */

export interface VenueRef {
  city: string;
  stadium: string;
  country: 'USA' | 'Canada' | 'Mexico';
}

export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface MatchCacheDoc {
  id: string;
  matchId: number;
  groupCode: string;
  phase: string;
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
  kickoffUtc: string;
  venue?: VenueRef;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  finishedAt?: string | null;
  pointsCalculatedAt: string | null;
  syncedAt: string;
}

export interface PredictionDoc {
  id: string;
  userId: string;
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
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpecialPredictionDoc {
  id: string;
  userId: string;
  season: number;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
  lockedAt: string | null;
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

export interface UserDoc {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  active: boolean;             // S4.5.3 — soft delete
  createdAt: string;
  updatedAt: string;           // S4.5.3
  passwordHash?: string;       // omitted em queries normais; Functions não devem usar
}

export interface LeaderboardDoc {
  id: string;
  season: number;
  userId: string;
  userName: string;
  totalPoints: number;
  matchPoints: number;
  specialPoints: number;
  predictionsCount: number; // processados (jogo encerrado + pontuado)
  pendingCount: number;     // não processados (jogo ainda não encerrado)
  perfectScores: number;
  rank: number | null;
  createdAt: string; // critério terciário de desempate (cadastro mais antigo)
  lastUpdated: string;
}

export interface TournamentFinalConfigDoc {
  id: 'tournament-final';
  scope: 'global';
  value: {
    champion: string;
    runnerUp: string;
    thirdPlace: string;
    fourthPlace: string;
    topScorer: string;
  };
  updatedBy?: string;
  updatedAt: string;
}

export const SEASON = 2026;
