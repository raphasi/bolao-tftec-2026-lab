/**
 * Wrappers tipados das APIs do bolão (S2).
 * Usa o cliente axios `api` já configurado em lib/api.ts (Bearer auto-inject).
 */
import { api } from './api';
import type {
  MatchPublic,
  MatchPhase,
  NationRef,
  GroupPublic,
  PlayerPublic,
  StandingsResponse,
  PredictionPublic,
  SpecialPredictionPublic,
  SpecialsLockPublic,
  AdminSpecialsLockPublic,
  MatchAdmin,
  TournamentFinalPublic,
  LeaderboardResponse,
  SpecialsBreakdown,
} from './types-domain';

// ---------------------------------------------------------------------------
// Matches (público)
// ---------------------------------------------------------------------------
export async function listMatches(groupCode?: string): Promise<MatchPublic[]> {
  const params = groupCode ? { groupCode } : undefined;
  const { data } = await api.get<{ matches: MatchPublic[]; count: number }>('/matches', { params });
  return data.matches;
}

export async function getMatch(matchId: number): Promise<MatchPublic> {
  const { data } = await api.get<{ match: MatchPublic }>(`/matches/${matchId}`);
  return data.match;
}

// ---------------------------------------------------------------------------
// Groups (público)
// ---------------------------------------------------------------------------
export async function getStandings(): Promise<StandingsResponse> {
  const { data } = await api.get<StandingsResponse>('/standings');
  return data;
}

export async function listPlayers(): Promise<PlayerPublic[]> {
  const { data } = await api.get<{ players: PlayerPublic[]; count: number }>('/players');
  return data.players;
}

export async function listGroups(): Promise<GroupPublic[]> {
  const { data } = await api.get<{ groups: GroupPublic[]; count: number }>('/groups');
  return data.groups;
}

// ---------------------------------------------------------------------------
// Predictions (auth)
// ---------------------------------------------------------------------------
export interface UpsertPredictionInput {
  matchId: number;
  predictedHome: number;
  predictedAway: number;
}

export async function listMyPredictions(): Promise<PredictionPublic[]> {
  const { data } = await api.get<{ predictions: PredictionPublic[]; count: number }>('/predictions');
  return data.predictions;
}

export async function upsertPrediction(input: UpsertPredictionInput): Promise<PredictionPublic> {
  const { data } = await api.post<{ prediction: PredictionPublic }>('/predictions', input);
  return data.prediction;
}

export async function deletePrediction(matchId: number): Promise<void> {
  await api.delete(`/predictions/${matchId}`);
}

// S7.2: palpites de outro usuário em jogos JÁ finalizados+pontuados (transparência)
export async function getUserFinishedPredictions(userId: string): Promise<PredictionPublic[]> {
  const { data } = await api.get<{ predictions: PredictionPublic[]; count: number }>(
    `/predictions/user/${userId}/finished`,
  );
  return data.predictions;
}

// ---------------------------------------------------------------------------
// Specials (auth)
// ---------------------------------------------------------------------------
export interface UpsertSpecialsInput {
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string | null;
}

export async function getMySpecials(): Promise<SpecialPredictionPublic> {
  const { data } = await api.get<{ specials: SpecialPredictionPublic }>('/specials');
  return data.specials;
}

export async function upsertSpecials(input: UpsertSpecialsInput): Promise<SpecialPredictionPublic> {
  const { data } = await api.post<{ specials: SpecialPredictionPublic }>('/specials', input);
  return data.specials;
}

// ---------------------------------------------------------------------------
// Config (auth user — public read)
// ---------------------------------------------------------------------------
export async function getSpecialsLock(): Promise<SpecialsLockPublic> {
  const { data } = await api.get<SpecialsLockPublic>('/config/specials-lock');
  return data;
}

// ---------------------------------------------------------------------------
// Admin (admin only)
// ---------------------------------------------------------------------------
export async function getAdminSpecialsLock(): Promise<AdminSpecialsLockPublic> {
  const { data } = await api.get<AdminSpecialsLockPublic>('/admin/config/specials-lock');
  return data;
}

export interface UpdateAdminLockInput {
  lockUtc: string | null;
  description?: string;
}

export async function updateAdminSpecialsLock(
  input: UpdateAdminLockInput,
): Promise<AdminSpecialsLockPublic> {
  const { data } = await api.put<AdminSpecialsLockPublic>('/admin/config/specials-lock', input);
  return data;
}

// B1.4: toggle do lock manual (aditivo ao time-based)
export async function patchAdminSpecialsLockManual(
  manual: boolean,
  reason?: string,
): Promise<AdminSpecialsLockPublic> {
  const { data } = await api.patch<AdminSpecialsLockPublic>('/admin/config/specials-lock', {
    manual,
    reason,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Admin: Match Results (S3.1)
// ---------------------------------------------------------------------------
export type MatchStatusFilter = 'all' | 'scheduled' | 'finished';

export async function listAdminMatches(status: MatchStatusFilter = 'all'): Promise<MatchAdmin[]> {
  const { data } = await api.get<{ matches: MatchAdmin[]; count: number }>('/admin/matches', {
    params: { status },
  });
  return data.matches;
}

export interface UpdateMatchResultInput {
  homeScore: number;
  awayScore: number;
  status?: 'scheduled' | 'finished';
}

export async function updateMatchResult(
  matchId: number,
  input: UpdateMatchResultInput,
): Promise<MatchAdmin> {
  const { data } = await api.put<{ match: MatchAdmin }>(
    `/admin/matches/${matchId}/result`,
    input,
  );
  return data.match;
}

// S6.3: Admin manual lock — regra aditiva (manual OR time-based)
export async function patchMatchLock(
  matchId: number,
  manual: boolean,
  reason?: string,
): Promise<MatchAdmin> {
  const { data } = await api.patch<{ match: MatchAdmin }>(
    `/admin/matches/${matchId}/lock`,
    { manual, reason },
  );
  return data.match;
}

// S6.4: Permite admin finalizar jogo antes do kickoff (separado do lock)
export async function patchMatchEarlyFinish(
  matchId: number,
  enabled: boolean,
  reason?: string,
): Promise<MatchAdmin> {
  const { data } = await api.patch<{ match: MatchAdmin }>(
    `/admin/matches/${matchId}/early-finish`,
    { enabled, reason },
  );
  return data.match;
}

// ---------------------------------------------------------------------------
// Admin: Chaveamento do mata-mata (motor FIFA + transcrição de confrontos)
// ---------------------------------------------------------------------------
export interface BracketConfronto {
  matchId: number;
  phase: MatchPhase;
  home: NationRef | null;
  away: NationRef | null;
  homeSource: string; // ex: '1E', '2A', '3º (A/B/C/D/F)', 'Vencedor #74'
  awaySource: string;
  note?: string;
}

/** Aviso de divergência do Anexo C (template oficial) — não bloqueante. */
export interface BracketWarning {
  side: 'home' | 'away';
  message: string;
}

export interface BracketProposalResponse {
  proposal: BracketConfronto[];
  current: MatchAdmin[];
  /** matchId → avisos do Anexo C dos confrontos de 16-avos já gravados. */
  warnings: Record<number, BracketWarning[]>;
}

/** Proposta calculada (sem efeito colateral). */
export async function getBracketProposal(): Promise<BracketProposalResponse> {
  const { data } = await api.get<BracketProposalResponse>('/admin/bracket/proposal');
  return data;
}

export interface SetMatchTeamsInput {
  homeTeam: string;
  homeFlag?: string;
  awayTeam: string;
  awayFlag?: string;
  reason?: string;
}

export interface SetMatchTeamsResult {
  match: MatchAdmin;
  warnings: BracketWarning[];
}

/** Grava o confronto (times) de um jogo de mata-mata. */
export async function setMatchTeams(
  matchId: number,
  input: SetMatchTeamsInput,
): Promise<SetMatchTeamsResult> {
  const { data } = await api.patch<SetMatchTeamsResult>(
    `/admin/matches/${matchId}/teams`,
    input,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Admin: Tournament Final (S3.3)
// ---------------------------------------------------------------------------
export async function getTournamentFinal(): Promise<TournamentFinalPublic | null> {
  const { data } = await api.get<{ tournamentFinal: TournamentFinalPublic | null }>(
    '/admin/config/tournament-final',
  );
  return data.tournamentFinal;
}

export interface UpdateTournamentFinalInput {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
  fourthPlace: string;
  topScorer: string;
}

export async function updateTournamentFinal(
  input: UpdateTournamentFinalInput,
): Promise<TournamentFinalPublic> {
  const { data } = await api.put<{ tournamentFinal: TournamentFinalPublic }>(
    '/admin/config/tournament-final',
    input,
  );
  return data.tournamentFinal;
}

// ---------------------------------------------------------------------------
// Leaderboard (S3.4 — público)
// ---------------------------------------------------------------------------
export async function getLeaderboard(): Promise<LeaderboardResponse> {
  const { data } = await api.get<LeaderboardResponse>('/leaderboard');
  return data;
}

// B3.1: breakdown dos pontos de especiais (mostra picks vs reais por categoria).
// Para outros usuários, só funciona após a trava de especiais ativar (backend devolve 403).
export async function getUserSpecialsBreakdown(userId: string): Promise<SpecialsBreakdown> {
  const { data } = await api.get<SpecialsBreakdown>(`/leaderboard/${userId}/specials`);
  return data;
}

// ---------------------------------------------------------------------------
// SignalR negotiate (S3.5 — auth)
// ---------------------------------------------------------------------------
export interface NegotiateResponse {
  url: string;
  accessToken: string;
}

export async function signalRNegotiate(): Promise<NegotiateResponse> {
  const { data } = await api.post<NegotiateResponse>('/negotiate');
  return data;
}
