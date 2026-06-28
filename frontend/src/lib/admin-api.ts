/**
 * Wrappers tipados das APIs admin (S4.5).
 * Endpoints sob /api/admin/* — exigem role=admin no backend.
 */
import { api } from './api';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AdminUserRole = 'user' | 'admin';

export interface AdminUserPublic {
  userId: string;
  email: string;
  name: string;
  role: AdminUserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  role?: 'all' | AdminUserRole;
  active?: 'all' | 'true' | 'false';
  search?: string;
}

export interface ListUsersResponse {
  users: AdminUserPublic[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type AuditAction =
  | 'role-change'
  | 'soft-delete'
  | 'reactivate'
  | 'name-change'
  | 'password-change'
  | 'password-reset'
  | 'match-result-set'
  | 'match-lock'
  | 'match-early-finish'
  | 'match-teams-set'
  | 'phase-window-set'
  | 'specials-lock-set'
  | 'tournament-final-set'
  | 'prediction-set'
  | 'prediction-delete'
  | 'prediction-rejected'
  | 'special-set'
  | 'special-rejected';

export type AuditTargetType = 'user' | 'match' | 'config' | 'prediction' | 'special';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'role-change': 'Alteração de papel',
  'soft-delete': 'Usuário desativado',
  'reactivate': 'Usuário reativado',
  'name-change': 'Alteração de nome',
  'password-change': 'Troca de senha',
  'password-reset': 'Reset de senha (admin)',
  'match-result-set': 'Resultado de jogo',
  'match-lock': 'Trava de jogo',
  'match-early-finish': 'Finalização antecipada',
  'match-teams-set': 'Confronto definido',
  'phase-window-set': 'Liberação de fase',
  'specials-lock-set': 'Trava de especiais',
  'tournament-final-set': 'Resultado final do torneio',
  'prediction-set': 'Palpite (jogo)',
  'prediction-delete': 'Palpite removido',
  'prediction-rejected': 'Palpite recusado',
  'special-set': 'Palpite especial',
  'special-rejected': 'Especial recusado',
};

/** Render seguro de previousValue/newValue (objetos viram JSON, null vira "—"). */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface AuditLogEntry {
  id: string;
  performedBy: string;
  performedByEmail: string;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetUserId?: string;
  targetEmail?: string;
  targetId?: string;
  targetLabel?: string;
  previousValue: unknown;
  newValue: unknown;
  reason?: string;
  timestamp: string;
}

export interface ListAuditLogParams {
  page?: number;
  pageSize?: number;
  targetUserId?: string;
  performedBy?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
}

export interface ListAuditLogResponse {
  entries: AuditLogEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SystemStatsResponse {
  bolao: {
    users: { total: number; admins: number; active: number; inactive: number };
    predictions: { total: number; scored: number; perfect: number };
    matches: { total: number; finished: number; scheduled: number };
    leaderboard: {
      count: number;
      leader: { userName: string; totalPoints: number } | null;
    };
  };
  infrastructure: {
    cosmos: { ok: boolean; latencyMs: number; containers: number; database: string };
    functionApp: {
      name: string;
      state: string;
      functionsRegistered: number;
      functionsList: string[];
    };
    appService: { name: string; uptimeSeconds: number };
    signalR: { name: string; tier: string };
  };
  observability: {
    errors24h: number | null;
    requestsLast1h: number | null;
    latencyP95Ms: number | null;
  };
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Users CRUD
// ---------------------------------------------------------------------------

export async function listAdminUsers(params: ListUsersParams = {}): Promise<ListUsersResponse> {
  const { data } = await api.get<ListUsersResponse>('/admin/users', { params });
  return data;
}

export async function patchUserRole(
  userId: string,
  role: AdminUserRole,
  reason?: string,
): Promise<AdminUserPublic> {
  const { data } = await api.patch<{ user: AdminUserPublic }>(`/admin/users/${userId}/role`, {
    role,
    reason,
  });
  return data.user;
}

export async function deactivateUser(userId: string, reason?: string): Promise<AdminUserPublic> {
  const { data } = await api.patch<{ user: AdminUserPublic }>(
    `/admin/users/${userId}/deactivate`,
    { reason },
  );
  return data.user;
}

export async function reactivateUser(userId: string, reason?: string): Promise<AdminUserPublic> {
  const { data } = await api.patch<{ user: AdminUserPublic }>(
    `/admin/users/${userId}/reactivate`,
    { reason },
  );
  return data.user;
}

export async function patchUserName(userId: string, name: string): Promise<AdminUserPublic> {
  const { data } = await api.patch<{ user: AdminUserPublic }>(`/admin/users/${userId}`, { name });
  return data.user;
}

export interface ResetPasswordResult {
  user: AdminUserPublic;
  tempPassword: string;
}

/** Reseta a senha do usuário; retorna a senha temporária (em claro) p/ repasse. */
export async function resetUserPassword(
  userId: string,
  reason?: string,
): Promise<ResetPasswordResult> {
  const { data } = await api.patch<ResetPasswordResult>(
    `/admin/users/${userId}/reset-password`,
    { reason },
  );
  return data;
}

export async function listAuditLog(
  params: ListAuditLogParams = {},
): Promise<ListAuditLogResponse> {
  const { data } = await api.get<ListAuditLogResponse>('/admin/users/audit-log', { params });
  return data;
}

// ---------------------------------------------------------------------------
// System Stats
// ---------------------------------------------------------------------------

export async function fetchSystemStats(): Promise<SystemStatsResponse> {
  const { data } = await api.get<SystemStatsResponse>('/admin/system/stats');
  return data;
}

export async function invalidateActiveCache(userId?: string): Promise<{ ok: boolean; scope: string }> {
  const { data } = await api.post<{ ok: boolean; scope: string }>(
    '/admin/system/cache/invalidate-active',
    userId ? { userId } : {},
  );
  return data;
}

// ---------------------------------------------------------------------------
// Ops Live (S8.2)
// ---------------------------------------------------------------------------

export interface ActiveMatchSummary {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: 'scheduled' | 'live' | 'finished';
  locked: boolean;
  lockedManually: boolean;
  predictionsCount: number;
  minutesSinceKickoff: number;
}

export interface SeriesPoint {
  t: string;
  v: number | null;
}

export interface OpsLiveResponse {
  activeMatch: ActiveMatchSummary | null;
  errors5min: number | null;
  activeUsers5min: number | null;
  latencyP95Series30min: SeriesPoint[] | null;
  appInsightsConfigured: boolean;
  fetchedAt: string;
}

export async function fetchOpsLive(): Promise<OpsLiveResponse> {
  const { data } = await api.get<OpsLiveResponse>('/admin/ops/live');
  return data;
}
