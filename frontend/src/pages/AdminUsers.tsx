/**
 * Página AdminUsers (S4.5.5) — CRUD admin de usuários.
 * - Tabela paginated com filtros (role, active, search)
 * - Ações: edit name, promote/demote role, deactivate/reactivate, audit log
 * - Self-guards: admin não pode demote/deactivate a si mesmo
 * - Audit drawer com últimas entries do user
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  History,
  KeyRound,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Search,
  Shield,
  ShieldOff,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  deactivateUser,
  listAdminUsers,
  listAuditLog,
  patchUserName,
  patchUserRole,
  reactivateUser,
  resetUserPassword,
  AUDIT_ACTION_LABELS,
  formatAuditValue,
  type AdminUserPublic,
  type AdminUserRole,
  type AuditLogEntry,
} from '@/lib/admin-api';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type RoleFilter = 'all' | AdminUserRole;
type ActiveFilter = 'all' | 'true' | 'false';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [role, setRole] = useState<RoleFilter>('all');
  const [active, setActive] = useState<ActiveFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { page, pageSize, role, active, search }],
    queryFn: () =>
      listAdminUsers({
        page,
        pageSize,
        role,
        active,
        search: search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const hasMore = usersQuery.data?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function invalidateList() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  // ---- Edit name modal state ----
  const [editTarget, setEditTarget] = useState<AdminUserPublic | null>(null);
  const [editName, setEditName] = useState('');
  const editNameMut = useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) => patchUserName(userId, name),
    onSuccess: () => {
      toast.success('Nome atualizado');
      invalidateList();
      setEditTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ---- Role mutation ----
  const roleMut = useMutation({
    mutationFn: ({
      userId,
      role: newRole,
    }: {
      userId: string;
      role: AdminUserRole;
    }) => patchUserRole(userId, newRole),
    onSuccess: (updated) => {
      toast.success(updated.role === 'admin' ? 'Promovido a admin' : 'Rebaixado para usuário');
      invalidateList();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ---- Active mutation ----
  const deactivateMut = useMutation({
    mutationFn: (userId: string) => deactivateUser(userId),
    onSuccess: () => {
      toast.success('Usuário desativado');
      invalidateList();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const reactivateMut = useMutation({
    mutationFn: (userId: string) => reactivateUser(userId),
    onSuccess: () => {
      toast.success('Usuário reativado');
      invalidateList();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ---- Reset password ----
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const resetPwMut = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (res) => {
      setResetResult({ email: res.user.email, tempPassword: res.tempPassword });
      invalidateList();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ---- Audit drawer state ----
  const [auditTarget, setAuditTarget] = useState<AdminUserPublic | null>(null);

  function openEdit(u: AdminUserPublic) {
    setEditTarget(u);
    setEditName(u.name);
  }

  function handleToggleRole(u: AdminUserPublic) {
    const next: AdminUserRole = u.role === 'admin' ? 'user' : 'admin';
    const verb = next === 'admin' ? 'promover' : 'rebaixar';
    if (!confirm(`Confirmar ${verb} ${u.email} → ${next}?`)) return;
    roleMut.mutate({ userId: u.userId, role: next });
  }

  function handleToggleActive(u: AdminUserPublic) {
    if (u.active) {
      if (!confirm(`Desativar ${u.email}? Conta não poderá fazer login.`)) return;
      deactivateMut.mutate(u.userId);
    } else {
      if (!confirm(`Reativar ${u.email}?`)) return;
      reactivateMut.mutate(u.userId);
    }
  }

  function handleResetPassword(u: AdminUserPublic) {
    if (!confirm(`Resetar a senha de ${u.email}? Uma senha temporária será gerada para você repassar.`))
      return;
    resetPwMut.mutate(u.userId);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <UsersIcon className="h-7 w-7 text-brand-purple" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl font-bold">Usuários</h1>
          <p className="text-muted-foreground mt-1">
            {total} usuário{total === 1 ? '' : 's'} cadastrado{total === 1 ? '' : 's'}.
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email ou nome..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <Segmented
          options={[
            { value: 'all', label: 'Todos roles' },
            { value: 'admin', label: 'Admin' },
            { value: 'user', label: 'User' },
          ]}
          value={role}
          onChange={(v) => {
            setRole(v as RoleFilter);
            setPage(1);
          }}
        />
        <Segmented
          options={[
            { value: 'all', label: 'Todos status' },
            { value: 'true', label: 'Ativos' },
            { value: 'false', label: 'Inativos' },
          ]}
          value={active}
          onChange={(v) => {
            setActive(v as ActiveFilter);
            setPage(1);
          }}
        />
      </div>

      {/* Loading skeleton */}
      {usersQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {usersQuery.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(usersQuery.error)}
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado com esses filtros.
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {users.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Criado em</th>
                  <th className="text-right px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = me?.userId === u.userId;
                  return (
                    <tr
                      key={u.userId}
                      className={cn(
                        'border-t border-border/60 transition-colors',
                        !u.active && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.name}
                        {isSelf && (
                          <span className="ml-2 text-[10px] text-brand-purple uppercase font-semibold">
                            (você)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={u.active} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn
                            title="Editar nome"
                            onClick={() => openEdit(u)}
                            disabled={editNameMut.isPending}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title={
                              isSelf
                                ? 'Você não pode alterar o próprio role'
                                : u.role === 'admin'
                                  ? 'Rebaixar para user'
                                  : 'Promover a admin'
                            }
                            onClick={() => handleToggleRole(u)}
                            disabled={isSelf || roleMut.isPending}
                          >
                            {u.role === 'admin' ? (
                              <ShieldOff className="h-4 w-4" />
                            ) : (
                              <Shield className="h-4 w-4" />
                            )}
                          </IconBtn>
                          <IconBtn
                            title={
                              isSelf
                                ? 'Você não pode desativar a si mesmo'
                                : u.active
                                  ? 'Desativar'
                                  : 'Reativar'
                            }
                            onClick={() => handleToggleActive(u)}
                            disabled={
                              isSelf || deactivateMut.isPending || reactivateMut.isPending
                            }
                          >
                            {u.active ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </IconBtn>
                          <IconBtn
                            title="Resetar senha (gera temporária)"
                            onClick={() => handleResetPassword(u)}
                            disabled={resetPwMut.isPending}
                          >
                            <KeyRound className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn title="Ver audit log" onClick={() => setAuditTarget(u)}>
                            <History className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {users.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Página {page} de {totalPages} · {total} total
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pageSize" className="text-xs text-muted-foreground">
              Por página:
            </Label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit name modal */}
      {editTarget && (
        <Modal title="Editar nome" onClose={() => setEditTarget(null)}>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Email (imutável)</Label>
              <div className="font-mono text-sm py-1">{editTarget.email}</div>
            </div>
            <div>
              <Label htmlFor="editName">Nome</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  editNameMut.mutate({ userId: editTarget.userId, name: editName.trim() })
                }
                disabled={editNameMut.isPending || editName.trim().length < 2 || editName.trim() === editTarget.name}
              >
                {editNameMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Audit drawer */}
      {auditTarget && (
        <AuditDrawer user={auditTarget} onClose={() => setAuditTarget(null)} />
      )}

      {/* Reset password result modal */}
      {resetResult && (
        <Modal title="Senha temporária gerada" onClose={() => setResetResult(null)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Repasse esta senha temporária para{' '}
              <strong className="text-foreground">{resetResult.email}</strong>. Ela é exibida{' '}
              <strong>apenas uma vez</strong>. Peça que troque no primeiro acesso (Perfil → Conta →
              Trocar senha).
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-muted rounded-md px-3 py-2 break-all select-all">
                {resetResult.tempPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(resetResult.tempPassword);
                  toast.success('Senha copiada');
                }}
              >
                Copiar
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setResetResult(null)}>Fechar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// Subcomponents
// ===========================================================================

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            value === opt.value
              ? 'bg-brand-purple text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUserRole }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-purple/15 text-brand-purple text-xs font-medium ring-1 ring-brand-purple/30">
        <Shield className="h-3 w-3" /> Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs">
      User
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Ativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      Inativo
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors',
        'hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

type AuditMode = 'on-user' | 'by-user';

function AuditDrawer({ user, onClose }: { user: AdminUserPublic; onClose: () => void }) {
  const [mode, setMode] = useState<AuditMode>('on-user');

  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', user.userId, mode],
    queryFn: () =>
      listAuditLog(
        mode === 'on-user'
          ? { targetUserId: user.userId, pageSize: 50 }
          : { performedBy: user.userId, pageSize: 50 },
      ),
  });

  const emptyMsg =
    mode === 'on-user'
      ? 'Nenhuma ação administrativa sobre este usuário.'
      : 'Nenhuma atividade deste usuário (palpites etc.).';

  return (
    <Modal title={`Auditoria: ${user.email}`} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {(
          [
            { key: 'on-user', label: 'Ações sobre o usuário' },
            { key: 'by-user', label: 'Atividade do usuário' },
          ] as { key: AuditMode; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition-colors ${
              mode === key
                ? 'bg-brand-purple/15 text-brand-purple ring-brand-purple/40'
                : 'text-muted-foreground ring-border/60 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {auditQuery.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {auditQuery.isError && (
        <div className="text-sm text-destructive">{getErrorMessage(auditQuery.error)}</div>
      )}
      {auditQuery.data && auditQuery.data.entries.length === 0 && (
        <div className="text-sm text-muted-foreground py-4">{emptyMsg}</div>
      )}
      {auditQuery.data && auditQuery.data.entries.length > 0 && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {auditQuery.data.entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const date = new Date(entry.timestamp).toLocaleString('pt-BR');
  return (
    <div className="border border-border/60 rounded-md p-3 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
        </span>
        <span className="text-muted-foreground">{date}</span>
      </div>
      {entry.targetLabel && (
        <div className="text-muted-foreground">
          Alvo: <span className="font-medium text-foreground/90">{entry.targetLabel}</span>
        </div>
      )}
      <div className="text-muted-foreground">
        Por: <span className="font-mono">{entry.performedByEmail}</span>
      </div>
      <div className="font-mono break-all">
        <span className="line-through text-muted-foreground">
          {formatAuditValue(entry.previousValue)}
        </span>
        {' → '}
        <span className="text-foreground">{formatAuditValue(entry.newValue)}</span>
      </div>
      {entry.reason && (
        <div className="text-muted-foreground italic">"{entry.reason}"</div>
      )}
    </div>
  );
}
