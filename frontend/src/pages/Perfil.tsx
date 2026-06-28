/**
 * Página Perfil (S2.6) — tabs com Meus Palpites, Especiais e Conta.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  Crown,
  Hash,
  KeyRound,
  LogOut,
  ListChecks,
  Medal,
  Percent,
  Target,
  Trophy,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LockedBadge } from '@/components/bolao/LockedBadge';
import { StatsCard } from '@/components/bolao/StatsCard';
import { useAuth } from '@/contexts/AuthContext';
import { listMyPredictions, getMySpecials, getSpecialsLock, getLeaderboard } from '@/lib/bolao-api';
import { changePassword } from '@/lib/auth-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import { codeLabel } from '@/lib/phases';

type TabKey = 'palpites' | 'especiais' | 'conta';

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'palpites', label: 'Meus Palpites', icon: ListChecks },
  { key: 'especiais', label: 'Especiais', icon: Crown },
  { key: 'conta', label: 'Conta', icon: UserIcon },
];

export default function Perfil() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('palpites');

  if (!user) return null;

  const handleLogout = () => {
    logout();
    toast.success('Você saiu da conta.');
    navigate('/');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <UserIcon className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground mt-1">{user.email}</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      {tab === 'palpites' && <MyPredictionsTab />}
      {tab === 'especiais' && <MySpecialsTab />}
      {tab === 'conta' && <MyAccountTab onLogout={handleLogout} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Meus Palpites (com stats S3.6)
// ───────────────────────────────────────────────────────────────────────────
function MyPredictionsTab() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['predictions', 'mine'],
    queryFn: listMyPredictions,
  });
  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Erro ao carregar palpites.
        </CardContent>
      </Card>
    );
  }

  const predictions = data ?? [];

  if (predictions.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center text-muted-foreground space-y-2">
          <ListChecks className="h-10 w-10 mx-auto opacity-50" />
          <p>Você ainda não palpitou em nenhum jogo.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href="/palpites">Ir para Palpites</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // S3.6 Stats agregadas
  const totalPredictions = predictions.length;
  const totalPoints = predictions.reduce((sum, p) => sum + (p.points ?? 0), 0);
  const perfectScores = predictions.filter((p) => p.points === 25).length; // placar exato (ver scoring.ts)
  const scoredPredictions = predictions.filter((p) => p.points !== null);
  const correctPredictions = predictions.filter((p) => (p.points ?? 0) > 0).length;
  const accuracyPct =
    scoredPredictions.length > 0
      ? Math.round((correctPredictions / scoredPredictions.length) * 100)
      : null;
  const myRank = leaderboardQuery.data?.ranking.find((r) => r.userId === user?.userId)?.rank;

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatsCard label="Palpites" value={totalPredictions} icon={ListChecks} color="muted" />
        <StatsCard label="Pontos" value={totalPoints} icon={Trophy} color="gold" />
        <StatsCard label="Placar exato" value={perfectScores} icon={Target} color="pitch" />
        <StatsCard
          label="% acerto"
          value={accuracyPct !== null ? `${accuracyPct}%` : '—'}
          icon={Percent}
          color="purple"
          hint={
            scoredPredictions.length > 0
              ? `${correctPredictions}/${scoredPredictions.length} pontuados`
              : 'sem jogos finalizados'
          }
        />
        <StatsCard
          label="Posição"
          value={myRank ? `#${myRank}` : '—'}
          icon={Hash}
          color="muted"
          hint={leaderboardQuery.data?.count ? `de ${leaderboardQuery.data.count}` : undefined}
        />
      </div>

      <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{predictions.length} palpites</CardTitle>
        <CardDescription>
          Total de pontos até agora: <strong className="text-copa-gold">{totalPoints}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border/60">
        {predictions.map((p) => (
          <div key={p.matchId} className="px-6 py-3 flex items-center gap-3 text-sm">
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground whitespace-nowrap">
              {codeLabel(p.groupCode)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="truncate">
                <span className="font-medium">{p.homeTeam}</span>
                <span className="text-muted-foreground mx-1">×</span>
                <span className="font-medium">{p.awayTeam}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(p.kickoffUtc).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
            <div className="font-mono text-base font-bold">
              {p.predictedHome} × {p.predictedAway}
            </div>
            {p.points != null ? (
              <span className="text-copa-gold font-semibold text-sm">+{p.points}</span>
            ) : (
              <LockedBadge locked={p.locked} kickoffUtc={p.kickoffUtc} className="hidden sm:inline-flex" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Especiais
// ───────────────────────────────────────────────────────────────────────────
function MySpecialsTab() {
  const specialsQuery = useQuery({ queryKey: ['specials', 'mine'], queryFn: getMySpecials });
  const lockQuery = useQuery({ queryKey: ['specials-lock'], queryFn: getSpecialsLock });

  const isLoading = specialsQuery.isLoading || lockQuery.isLoading;
  const specials = specialsQuery.data;
  const lock = lockQuery.data;

  const rows = useMemo(() => {
    if (!specials) return [];
    return [
      { label: 'Campeão', iso: specials.champion, points: specials.points.champion, max: 150 },
      { label: 'Vice', iso: specials.runnerUp, points: specials.points.runnerUp, max: 75 },
      { label: '3º lugar', iso: specials.thirdPlace, points: specials.points.thirdPlace, max: 40 },
      { label: '4º lugar', iso: specials.fourthPlace, points: specials.points.fourthPlace, max: 40 },
    ];
  }, [specials]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty = !specials || (
    !specials.champion && !specials.runnerUp && !specials.thirdPlace && !specials.fourthPlace && !specials.topScorer
  );

  if (isEmpty) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center text-muted-foreground space-y-2">
          <Crown className="h-10 w-10 mx-auto opacity-50" />
          <p>Você ainda não cadastrou palpites especiais.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href="/especiais">Ir para Especiais</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Crown className="h-5 w-5 text-copa-gold" />
          Pódio + Artilheiro
        </CardTitle>
        {lock?.locked ? (
          <CardDescription className="text-destructive">
            Travado em {lock.lockUtc ? new Date(lock.lockUtc).toLocaleString('pt-BR') : '—'}
          </CardDescription>
        ) : (
          <CardDescription>
            {lock?.lockUtc
              ? `Travará em ${new Date(lock.lockUtc).toLocaleString('pt-BR')}`
              : 'Sem data de lock configurada'}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border/60">
        {rows.map((r) => (
          <div key={r.label} className="px-6 py-3 flex items-center gap-3 text-sm">
            <span className="w-24 text-muted-foreground">{r.label}</span>
            {r.iso ? (
              <>
                <img
                  src={flagUrl(r.iso, 40)}
                  alt=""
                  className="h-6 w-9 rounded object-cover ring-1 ring-border"
                />
                <span className="font-medium flex-1 truncate uppercase">{r.iso}</span>
              </>
            ) : (
              <span className="text-muted-foreground italic flex-1">— vazio —</span>
            )}
            <span className="text-xs text-muted-foreground">
              {r.points > 0 ? <span className="text-copa-gold">+{r.points}</span> : `máx +${r.max}`}
            </span>
          </div>
        ))}
        <div className="px-6 py-3 flex items-center gap-3 text-sm">
          <span className="w-24 text-muted-foreground">Artilheiro</span>
          <span className={cn('flex-1 font-medium truncate', !specials?.topScorer && 'italic text-muted-foreground')}>
            {specials?.topScorer || '— vazio —'}
          </span>
          <span className="text-xs text-muted-foreground">
            {specials && specials.points.topScorer > 0
              ? <span className="text-copa-gold">+{specials.points.topScorer}</span>
              : 'máx +120'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab: Conta
// ───────────────────────────────────────────────────────────────────────────
function MyAccountTab({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-6">
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">Informações da conta</CardTitle>
        <CardDescription>Dados do seu cadastro no bolão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Nome" value={user.name} />
        <Row label="E-mail" value={user.email} />
        <Row label="Papel" value={user.role === 'admin' ? 'Administrador' : 'Usuário'} />
        <Row label="ID" value={<code className="text-xs">{user.userId}</code>} />
        {user.createdAt && (
          <Row label="Cadastro" value={new Date(user.createdAt).toLocaleDateString('pt-BR')} />
        )}
        {user.role === 'admin' && (
          <div className="pt-3 border-t flex flex-wrap justify-start gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/admin/results">📊 Resultados oficiais</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/admin/config">⚙️ Console administrativo</a>
            </Button>
          </div>
        )}
        <div className="pt-3 border-t flex justify-end">
          <Button variant="destructive" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </div>
      </CardContent>
    </Card>

    <ChangePasswordCard />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Card: Trocar senha (self-service)
// ───────────────────────────────────────────────────────────────────────────
function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !sameAsCurrent &&
    !mutation.isPending;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-purple" />
          Trocar senha
        </CardTitle>
        <CardDescription>
          Informe a senha atual e escolha uma nova (mínimo 8 caracteres).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4 max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {tooShort && (
              <p className="text-xs text-destructive">Mínimo 8 caracteres.</p>
            )}
            {sameAsCurrent && (
              <p className="text-xs text-destructive">A nova senha deve ser diferente da atual.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">As senhas não coincidem.</p>}
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Trocar senha
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-border/40 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
