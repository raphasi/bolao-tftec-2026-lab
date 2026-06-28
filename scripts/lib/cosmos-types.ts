/**
 * Tipos compartilhados dos documentos no Cosmos DB.
 * Refletem exatamente os containers definidos em infra/modules/cosmos.bicep.
 */

// ---------------------------------------------------------------------------
// Refs comuns
// ---------------------------------------------------------------------------
export interface NationRef {
  iso: string;
  name: string;
}

export interface VenueRef {
  city: string;
  stadium: string;
  country: 'USA' | 'Canada' | 'Mexico';
}

// ---------------------------------------------------------------------------
// users (PK: /userId)
// ---------------------------------------------------------------------------
export interface UserDocument {
  id: string;            // = userId
  userId: string;        // partition key
  email: string;         // unique
  name: string;
  passwordHash: string;  // bcrypt
  role: 'user' | 'admin';
  createdAt: string;     // ISO 8601
}

// ---------------------------------------------------------------------------
// predictions (PK: /userId)
// ---------------------------------------------------------------------------
export interface PredictionDocument {
  id: string;                  // = `${userId}_${matchId}`
  userId: string;              // partition key
  matchId: number;
  groupCode: string;           // A, B, C... (denormalizado pra evitar join)
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;          // ISO 8601
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
  points: number | null;       // null até o jogo terminar e ser calculado
  lockedAt: string | null;     // ISO 8601 quando o palpite foi congelado
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// specials (PK: /userId)
// ---------------------------------------------------------------------------
export interface SpecialPredictionDocument {
  id: string;                  // = `${userId}_${season}`
  userId: string;              // partition key
  season: number;              // 2026
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
  lockedAt: string | null;     // congela na abertura da Copa
  points: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    topScorer: number;
    top4Bonus: number;         // +50 se acertar os 4 (qualquer ordem)
  };
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// matches-cache (PK: /groupCode)
// ---------------------------------------------------------------------------
export interface MatchCacheDocument {
  id: string;                  // = matchId.toString()
  matchId: number;
  groupCode: string;           // partition key
  phase: 'group' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'third-place' | 'final';
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
  kickoffUtc: string;
  venue?: VenueRef;            // objeto estruturado (city/stadium/country)
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  pointsCalculatedAt: string | null;  // controle pra recalcular só o que mudou
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// leaderboard (PK: /season)
// ---------------------------------------------------------------------------
export interface LeaderboardDocument {
  id: string;                  // = `${season}_${userId}`
  season: number;              // partition key
  userId: string;
  userName: string;
  totalPoints: number;
  matchPoints: number;
  specialPoints: number;
  predictionsCount: number;
  perfectScores: number;       // quantos placares exatos
  rank: number | null;         // calculado periodicamente
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// groups (PK: /season) — adicionado em S2.1
// ---------------------------------------------------------------------------
export interface GroupDocument {
  id: string;                  // = `${season}_${code}` (ex: '2026_A')
  season: number;              // partition key (2026)
  code: string;                // 'A' | 'B' | ... | 'L'
  teams: NationRef[];          // 4 seleções do grupo
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// players (PK: /season) — catálogo de jogadores p/ o artilheiro
// ---------------------------------------------------------------------------
export interface PlayerRef {
  id: string;            // `${iso}-${slug}` (ex: 'br-vinicius-junior')
  name: string;
}

export interface NationSquadDocument {
  id: string;            // = `${season}_${iso}` (ex: '2026_br')
  season: number;        // partition key
  iso: string;
  name: string;
  players: PlayerRef[];
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Configuração dos containers — usado pelo setup/reset
// ---------------------------------------------------------------------------
export const CONTAINER_CONFIG = [
  { id: 'users',         partitionKey: '/userId' },
  { id: 'predictions',   partitionKey: '/userId' },
  { id: 'specials',      partitionKey: '/userId' },
  { id: 'matches-cache', partitionKey: '/groupCode' },
  { id: 'leaderboard',   partitionKey: '/season' },
  { id: 'groups',        partitionKey: '/season' },
  { id: 'players',       partitionKey: '/season' },
] as const;

export type ContainerId = (typeof CONTAINER_CONFIG)[number]['id'];
