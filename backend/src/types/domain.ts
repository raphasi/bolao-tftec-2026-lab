/**
 * Tipos de domínio do bolão (Cosmos docs + DTOs públicos).
 * Refletem os containers definidos em infra/modules/cosmos.bicep e os
 * shapes que vão pro frontend via API.
 */

// ---------------------------------------------------------------------------
// Refs comuns
// ---------------------------------------------------------------------------
export interface NationRef {
  iso: string;          // ISO 3166 lowercase (ex: 'br', 'gb-eng')
  name: string;
}

export interface VenueRef {
  city: string;
  stadium: string;
  country: 'USA' | 'Canada' | 'Mexico';
}

export type MatchPhase = 'group' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'third-place' | 'final';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

// ---------------------------------------------------------------------------
// Cosmos: matches-cache (PK /groupCode)
// ---------------------------------------------------------------------------
export interface MatchCacheDoc {
  id: string;                  // = matchId.toString()
  matchId: number;
  groupCode: string;           // partition key
  phase: MatchPhase;
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
  kickoffUtc: string;          // ISO 8601
  venue?: VenueRef;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  finishedAt?: string | null;  // ISO 8601 quando admin marcou finished (S3.1)
  pointsCalculatedAt: string | null;
  // S6.3: admin pode lockar manualmente (aditivo — time-based lock continua valendo).
  // undefined/false = sem override; true = locked pelo admin.
  lockedManually?: boolean;
  lockedManuallyBy?: string;   // userId do admin
  lockedManuallyAt?: string;   // ISO 8601
  // S6.4: admin pode permitir finalizar jogo antes do kickoff (testes + emergency override).
  // Independente do lock — toggle separado.
  allowEarlyFinish?: boolean;
  allowEarlyFinishBy?: string;
  allowEarlyFinishAt?: string;
  syncedAt: string;
}

/**
 * DTO admin de jogo — inclui campos admin-only.
 */
export interface MatchAdmin extends MatchPublic {
  finishedAt?: string | null;
  pointsCalculatedAt: string | null;
  // S6.3: distingue lock manual vs time-based no frontend admin
  lockedManually?: boolean;
  lockedManuallyAt?: string;
  // S6.4: admin liberou finalizar antes do kickoff
  allowEarlyFinish?: boolean;
  allowEarlyFinishAt?: string;
}

// ---------------------------------------------------------------------------
// Cosmos: config — tournament final result (S3.3)
// ---------------------------------------------------------------------------
export interface TournamentFinalConfigDoc {
  id: 'tournament-final';
  scope: 'global';
  value: {
    champion: string;       // iso
    runnerUp: string;
    thirdPlace: string;
    fourthPlace: string;
    topScorer: string;      // id de jogador (ex.: 'br-vinicius-junior') — match exato
  };
  updatedBy?: string;
  updatedAt: string;
}

/**
 * DTO público de um jogo (resposta da API /matches).
 * Adiciona campo `locked` computado: now >= kickoffUtc - 30min.
 */
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
  // Feature phase-windows: false só quando a fase do jogo ainda não abriu para palpite.
  // Ausência de janela => true (grupos e compat). opensUtc presente quando há janela.
  // Opcional: o DTO admin (MatchAdmin) não popula (admin vê tudo); undefined = aberto.
  predictionsOpen?: boolean;
  opensUtc?: string;
}

// ---------------------------------------------------------------------------
// Cosmos: groups (PK /season)
// ---------------------------------------------------------------------------
export interface GroupDoc {
  id: string;                  // = `${season}_${code}` (ex: '2026_A')
  season: number;              // partition key
  code: string;                // 'A' | 'B' | ... | 'L'
  teams: NationRef[];
  updatedAt: string;
}

export interface GroupPublic {
  code: string;
  teams: NationRef[];
}

// ---------------------------------------------------------------------------
// Cosmos: players (PK /season) — catálogo de jogadores p/ o artilheiro
// ---------------------------------------------------------------------------
export interface PlayerRef {
  id: string; // `${iso}-${slug}`, ex.: 'br-vinicius-junior', 'gb-eng-harry-kane'
  name: string;
}

export interface NationSquadDoc {
  id: string; // = `${season}_${iso}` (ex.: '2026_br')
  season: number; // partition key
  iso: string;
  name: string;
  players: PlayerRef[];
  updatedAt?: string;
}

// DTO público (GET /api/players) — achatado p/ o combobox.
export interface PlayerPublic {
  id: string;
  name: string;
  iso: string;
  nation: string;
  label: string; // `${name} (${nation})` → "Vinícius Júnior (Brasil)"
}

// ---------------------------------------------------------------------------
// Cosmos: predictions (PK /userId)
// ---------------------------------------------------------------------------
export interface PredictionDoc {
  id: string;                  // = `${userId}_${matchId}`
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

// ---------------------------------------------------------------------------
// Cosmos: specials (PK /userId) — 1 doc por user
// ---------------------------------------------------------------------------
export interface SpecialPredictionDoc {
  id: string;                  // = `${userId}_${season}`
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

export interface SpecialPredictionPublic {
  season: number;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
  locked: boolean;
  points: SpecialPredictionDoc['points'];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cosmos: leaderboard (PK /season)
// ---------------------------------------------------------------------------
export interface LeaderboardDocument {
  id: string;                  // = `${season}_${userId}`
  season: number;              // partition key
  userId: string;
  userName: string;
  totalPoints: number;
  matchPoints: number;
  specialPoints: number;
  predictionsCount: number;     // processados (jogo encerrado + pontuado)
  pendingCount?: number;        // não processados (opcional p/ docs antigos)
  perfectScores: number;
  rank: number | null;
  // Critério terciário de desempate (cadastro mais antigo). Opcional para
  // tolerar docs antigos gravados antes do fix; a agregação sempre popula.
  createdAt?: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Cosmos: config (PK /scope)
// ---------------------------------------------------------------------------
export interface SpecialsLockConfigDoc {
  id: 'specials-lock';
  scope: 'global';             // partition key
  value: {
    lockUtc: string | null;    // ISO 8601 ou null
    description?: string;
    // B1.4: admin pode travar manualmente — aditivo ao time-based.
    // Quando lockedManually=true, palpites especiais ficam travados independente de lockUtc.
    lockedManually?: boolean;
    lockedManuallyBy?: string; // userId do admin que ativou
    lockedManuallyAt?: string; // ISO 8601 quando ativou
  };
  updatedBy?: string;          // userId do admin que setou (qualquer mutação)
  updatedAt: string;
}

export interface SpecialsLockPublic {
  lockUtc: string | null;
  locked: boolean;             // computed: now >= lockUtc OR lockedManually
  description?: string;
}

// Feature phase-windows: data de abertura de palpite por fase (mata-mata).
// Fase ausente em `value` => aberta (grupos nunca são listados).
export interface PhaseWindowsConfigDoc {
  id: 'phase-windows';
  scope: 'global';                            // partition key
  value: Partial<Record<MatchPhase, string>>; // fase -> openUtc (ISO 8601)
  updatedBy?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cosmos: users (PK /userId) — schema centralizado em S4.5.3
// ---------------------------------------------------------------------------
export interface UserDoc {
  id: string;                  // = userId
  userId: string;              // partition key
  email: string;               // unique
  name: string;
  passwordHash: string;        // bcrypt — NUNCA expor
  role: 'user' | 'admin';
  active: boolean;             // S4.5.3: soft delete via active=false
  createdAt: string;
  updatedAt: string;           // S4.5.3: tracked em todas mutations
  passwordChangedAt?: string;  // set na troca/reset de senha; base p/ revogação de sessão (V2)
}

/**
 * DTO público de usuário pra views admin — omite passwordHash.
 */
export interface UserAdminPublic {
  userId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cosmos: audit-log (PK /performedBy) — S4.5.3
// ---------------------------------------------------------------------------
export type AuditAction =
  // Gestão de usuários (S4.5.3)
  | 'role-change'
  | 'soft-delete'
  | 'reactivate'
  | 'name-change'
  | 'password-change'
  | 'password-reset'
  // Ações operacionais do evento (auditoria de resultado/lock/liberação de fase)
  | 'match-result-set'
  | 'match-lock'
  | 'match-early-finish'
  | 'match-teams-set'
  | 'phase-window-set'
  | 'specials-lock-set'
  | 'tournament-final-set'
  // Atividade do jogador (palpites de jogo e especiais) — resguardo de disputas
  | 'prediction-set'
  | 'prediction-delete'
  | 'prediction-rejected'
  | 'special-set'
  | 'special-rejected';

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'role-change',
  'soft-delete',
  'reactivate',
  'name-change',
  'password-change',
  'password-reset',
  'match-result-set',
  'match-lock',
  'match-early-finish',
  'match-teams-set',
  'phase-window-set',
  'specials-lock-set',
  'tournament-final-set',
  'prediction-set',
  'prediction-delete',
  'prediction-rejected',
  'special-set',
  'special-rejected',
] as const;

export type AuditTargetType = 'user' | 'match' | 'config' | 'prediction' | 'special';

export interface AuditLogDoc {
  id: string;                  // = uuid
  performedBy: string;         // userId admin (partition key)
  performedByEmail: string;    // denormalizado pra UI
  action: AuditAction;
  targetType?: AuditTargetType; // 'user' (legacy default), 'match' ou 'config'
  targetUserId?: string;        // ações de usuário (legacy)
  targetEmail?: string;         // ações de usuário (legacy)
  targetId?: string;            // genérico: matchId, scope de config
  targetLabel?: string;         // rótulo legível (ex.: "Brasil x Marrocos")
  previousValue: unknown;
  newValue: unknown;
  reason?: string;
  timestamp: string;           // ISO 8601
}

// ---------------------------------------------------------------------------
// DTOs públicos: Tabela da Copa (GET /api/standings)
// ---------------------------------------------------------------------------
export type Qualification = 'direct' | 'best-third' | 'eliminated' | 'undecided';

export interface StandingRowPublic {
  team: NationRef;
  position: number; // 1..4
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  qualification: Qualification;
  thirdRank?: number; // presente só quando qualification === 'best-third'
  provisional: boolean; // posição ainda pode mudar (grupo incompleto ou 3º antes do corte fechar)
}

export interface GroupStandingPublic {
  groupCode: string; // 'A'..'L'
  complete: boolean;
  playedCount: number; // jogos finalizados no grupo
  totalCount: number; // jogos do grupo (normalmente 6)
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
  groups: GroupStandingPublic[]; // 12, ordenados A→L
  bestThirds: BestThirdPublic[];
  cutoffRank: number; // 8 (fixo v1)
  allComplete: boolean;
  computedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export const LOCK_WINDOW_MS = 30 * 60 * 1000; // 30 min antes do kickoff
export const SEASON = 2026;
