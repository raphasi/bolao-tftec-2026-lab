/**
 * Página AdminResults (S3.1) — admin registra placar oficial dos jogos.
 *
 * Fluxo:
 *  - Lista 72 jogos com filtros (todos/agendados/finalizados)
 *  - Cada jogo: inputs placar + botão Finalizar
 *  - Finalizar dispara PUT → Cosmos changefeed → Function calc-predictions
 *  - Re-edição de jogo finalizado é permitida (reseta pointsCalculatedAt)
 *  - Tournament Final form: campeão/top4/artilheiro (visível quando >= 64 jogos finalizados)
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Flag,
  Loader2,
  Lock,
  LockOpen,
  Play,
  Save,
  Settings,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LockedBadge } from '@/components/bolao/LockedBadge';
import { PlayerCombobox } from '@/components/bolao/PlayerCombobox';
import {
  getTournamentFinal,
  listAdminMatches,
  listGroups,
  listPlayers,
  patchMatchEarlyFinish,
  patchMatchLock,
  updateMatchResult,
  updateTournamentFinal,
  type MatchStatusFilter,
  type UpdateMatchResultInput,
  type UpdateTournamentFinalInput,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import type { MatchAdmin, NationRef, TournamentFinalPublic } from '@/lib/types-domain';

export default function AdminResults() {
  const [filter, setFilter] = useState<MatchStatusFilter>('all');

  const matchesQuery = useQuery({
    queryKey: ['admin', 'matches', filter],
    queryFn: () => listAdminMatches(filter),
  });

  const matches = matchesQuery.data ?? [];
  const finishedCount = useMemo(() => matches.filter((m) => m.status === 'finished').length, [matches]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <Settings className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Resultados Oficiais</h1>
          <p className="text-muted-foreground mt-1">
            {finishedCount}/{matches.length || 72} jogos finalizados.
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos
        </FilterChip>
        <FilterChip active={filter === 'scheduled'} onClick={() => setFilter('scheduled')}>
          Agendados
        </FilterChip>
        <FilterChip active={filter === 'finished'} onClick={() => setFilter('finished')}>
          Finalizados
        </FilterChip>
      </div>

      {/* Loading */}
      {matchesQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {matchesQuery.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(matchesQuery.error)}
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {!matchesQuery.isLoading && !matchesQuery.isError && (
        <div className="grid gap-3">
          {matches.map((m) => (
            <AdminMatchRow key={m.matchId} match={m} />
          ))}
          {matches.length === 0 && (
            <Card className="border-border/60">
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum jogo neste filtro.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tournament Final form — visível sempre, mas só faz sentido depois de todos jogos */}
      <TournamentFinalSection />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Match Row — editor por linha
// ───────────────────────────────────────────────────────────────────────────
function AdminMatchRow({ match }: { match: MatchAdmin }) {
  const queryClient = useQueryClient();
  const [home, setHome] = useState<string>(match.homeScore?.toString() ?? '');
  const [away, setAway] = useState<string>(match.awayScore?.toString() ?? '');

  useEffect(() => {
    setHome(match.homeScore?.toString() ?? '');
    setAway(match.awayScore?.toString() ?? '');
  }, [match.homeScore, match.awayScore]);

  const mutation = useMutation({
    mutationFn: (input: UpdateMatchResultInput) => updateMatchResult(match.matchId, input),
    onSuccess: () => {
      toast.success(`Jogo ${match.matchId}: ${match.homeTeam} ${home} × ${away} ${match.awayTeam}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] }); // /api/matches público
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // S6.3: lock manual aditivo
  const lockMutation = useMutation({
    mutationFn: (manual: boolean) => patchMatchLock(match.matchId, manual),
    onSuccess: (updated) => {
      toast.success(updated.lockedManually ? 'Jogo travado pelo admin' : 'Lock manual removido');
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleToggleLock = () => {
    const next = !match.lockedManually;
    if (next) {
      if (!window.confirm(
        `Travar palpites do jogo ${match.matchId} (${match.homeTeam} × ${match.awayTeam})?\n\n` +
        `Usuários não poderão registrar/alterar palpites enquanto travado.`,
      )) return;
    }
    lockMutation.mutate(next);
  };

  // S6.4: toggle pra permitir finalizar antes do kickoff
  const earlyFinishMutation = useMutation({
    mutationFn: (enabled: boolean) => patchMatchEarlyFinish(match.matchId, enabled),
    onSuccess: (updated) => {
      toast.success(updated.allowEarlyFinish ? 'Finalização antecipada permitida' : 'Finalização antecipada bloqueada');
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleToggleEarlyFinish = () => {
    const next = !match.allowEarlyFinish;
    if (next) {
      if (!window.confirm(
        `Permitir finalizar jogo ${match.matchId} (${match.homeTeam} × ${match.awayTeam}) ANTES do kickoff?\n\n` +
        `Use isso pra testar o cálculo de pontos ou simular um jogo. Só funciona se você for inserir o resultado deliberadamente.`,
      )) return;
    }
    earlyFinishMutation.mutate(next);
  };

  const kickoffMs = Date.parse(match.kickoffUtc);
  const notStartedYet = Number.isFinite(kickoffMs) && Date.now() < kickoffMs;
  // S6.4: se admin liberou early-finish, libera input mesmo antes do kickoff
  const canInputResult = !notStartedYet || match.allowEarlyFinish === true;
  const isFinished = match.status === 'finished';

  const h = Number(home);
  const a = Number(away);
  const valid =
    home !== '' &&
    away !== '' &&
    Number.isFinite(h) &&
    Number.isFinite(a) &&
    h >= 0 &&
    a >= 0 &&
    h <= 20 &&
    a <= 20;
  const hasChanged = valid && (h !== match.homeScore || a !== match.awayScore || !isFinished);

  const handleFinish = () => {
    if (!valid) return;
    if (notStartedYet && !match.allowEarlyFinish) {
      toast.error('Jogo ainda não começou. Habilite "Permitir finalizar" para forçar.');
      return;
    }
    if (isFinished && !window.confirm('Re-editar placar irá recalcular pontos de todos os usuários. Continuar?')) {
      return;
    }
    mutation.mutate({ homeScore: h, awayScore: a, status: 'finished' });
  };

  return (
    <Card className={cn('border-border/60', isFinished && 'bg-copa-pitch/[0.03]')}>
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            #{match.matchId} · Grupo {match.groupCode}
          </span>
          <span>
            {new Date(match.kickoffUtc).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            })} BRT
          </span>
          {match.venue && <span className="hidden md:inline">{match.venue.city}</span>}
          <span className="ml-auto flex items-center gap-2 flex-wrap">
            {match.lockedManually && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                title={match.lockedManuallyAt ? `Travado em ${new Date(match.lockedManuallyAt).toLocaleString('pt-BR')}` : 'Travado pelo admin'}
              >
                <Lock className="h-3 w-3" /> Travado pelo admin
              </span>
            )}
            {match.allowEarlyFinish && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30"
                title={match.allowEarlyFinishAt ? `Liberado em ${new Date(match.allowEarlyFinishAt).toLocaleString('pt-BR')}` : 'Finalização antecipada liberada'}
              >
                <Play className="h-3 w-3" /> Finalização liberada
              </span>
            )}
            {isFinished ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-copa-pitch/15 text-copa-pitch ring-1 ring-copa-pitch/30">
                <CheckCircle2 className="h-3 w-3" /> Finalizado
              </span>
            ) : notStartedYet ? (
              <LockedBadge locked={false} kickoffUtc={match.kickoffUtc} />
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-copa-gold/15 text-copa-gold ring-1 ring-copa-gold/30">
                <AlertTriangle className="h-3 w-3" /> Aguardando resultado
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 md:gap-4">
          <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
            {match.homeFlag && (
              <img
                src={flagUrl(match.homeFlag, 80)}
                alt={match.homeTeam}
                className="h-8 w-12 md:h-10 md:w-14 rounded object-cover ring-1 ring-border shrink-0"
              />
            )}
            <span className="font-display text-sm md:text-lg font-semibold truncate">
              {match.homeTeam}
            </span>
          </div>

          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <Input
              type="number"
              min={0}
              max={20}
              placeholder="—"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              disabled={!canInputResult || mutation.isPending}
              aria-label={`Placar ${match.homeTeam}`}
              className="w-12 md:w-14 h-10 md:h-12 text-center text-lg md:text-xl font-display font-bold"
            />
            <span className="text-muted-foreground text-lg md:text-xl">×</span>
            <Input
              type="number"
              min={0}
              max={20}
              placeholder="—"
              value={away}
              onChange={(e) => setAway(e.target.value)}
              disabled={!canInputResult || mutation.isPending}
              aria-label={`Placar ${match.awayTeam}`}
              className="w-12 md:w-14 h-10 md:h-12 text-center text-lg md:text-xl font-display font-bold"
            />
          </div>

          <div className="flex-1 flex items-center gap-2 md:gap-3 justify-end min-w-0">
            <span className="font-display text-sm md:text-lg font-semibold truncate text-right">
              {match.awayTeam}
            </span>
            {match.awayFlag && (
              <img
                src={flagUrl(match.awayFlag, 80)}
                alt={match.awayTeam}
                className="h-8 w-12 md:h-10 md:w-14 rounded object-cover ring-1 ring-border shrink-0"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {/* Toggle de lock manual — sempre visível enquanto jogo não finalizado */}
          {!isFinished && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleLock}
              disabled={lockMutation.isPending}
              title={match.lockedManually ? 'Destravar palpites (time-based ainda pode estar ativo)' : 'Travar palpites manualmente'}
            >
              {lockMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : match.lockedManually ? (
                <LockOpen className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {match.lockedManually ? 'Destravar' : 'Travar'}
            </Button>
          )}
          {/* S6.4: Toggle pra permitir finalizar — só faz sentido se ainda não começou */}
          {!isFinished && notStartedYet && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleEarlyFinish}
              disabled={earlyFinishMutation.isPending}
              title={match.allowEarlyFinish ? 'Bloquear finalização antecipada' : 'Permitir finalizar antes do kickoff'}
              className={match.allowEarlyFinish ? 'border-amber-500/40' : undefined}
            >
              {earlyFinishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : match.allowEarlyFinish ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {match.allowEarlyFinish ? 'Bloquear finalizar' : 'Permitir finalizar'}
            </Button>
          )}
          {hasChanged && canInputResult && (
            <Button size="sm" onClick={handleFinish} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isFinished ? 'Salvar correção' : 'Finalizar jogo'}
            </Button>
          )}
        </div>

        {isFinished && match.finishedAt && (
          <div className="text-xs text-muted-foreground border-t pt-2 flex flex-wrap justify-between gap-2">
            <span>Finalizado em {new Date(match.finishedAt).toLocaleString('pt-BR')}</span>
            <span>
              {match.pointsCalculatedAt
                ? `Pontos calculados em ${new Date(match.pointsCalculatedAt).toLocaleString('pt-BR')}`
                : '⏳ Aguardando cálculo de pontos (~10s)...'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tournament Final form
// ───────────────────────────────────────────────────────────────────────────
function TournamentFinalSection() {
  const queryClient = useQueryClient();
  const finalQuery = useQuery({
    queryKey: ['admin', 'tournament-final'],
    queryFn: getTournamentFinal,
  });
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: listGroups });
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: listPlayers });

  const [form, setForm] = useState<UpdateTournamentFinalInput>({
    champion: '',
    runnerUp: '',
    thirdPlace: '',
    fourthPlace: '',
    topScorer: '',
  });

  useEffect(() => {
    if (!finalQuery.data) return;
    setForm({
      champion: finalQuery.data.champion,
      runnerUp: finalQuery.data.runnerUp,
      thirdPlace: finalQuery.data.thirdPlace,
      fourthPlace: finalQuery.data.fourthPlace,
      topScorer: finalQuery.data.topScorer,
    });
  }, [finalQuery.data]);

  const allTeams = useMemo<NationRef[]>(() => {
    const groups = groupsQuery.data ?? [];
    const set = new Map<string, NationRef>();
    for (const g of groups) for (const t of g.teams) set.set(t.iso, t);
    return Array.from(set.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [groupsQuery.data]);

  const mutation = useMutation({
    mutationFn: (input: UpdateTournamentFinalInput) => updateTournamentFinal(input),
    onSuccess: (saved) => {
      toast.success('Resultado final salvo. Cálculo de especiais será disparado.');
      queryClient.setQueryData<TournamentFinalPublic>(['admin', 'tournament-final'], saved);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isComplete =
    form.champion &&
    form.runnerUp &&
    form.thirdPlace &&
    form.fourthPlace &&
    form.topScorer.length > 0;

  // Verifica duplicatas no top4
  const top4 = [form.champion, form.runnerUp, form.thirdPlace, form.fourthPlace].filter(Boolean);
  const hasDuplicates = new Set(top4).size !== top4.length;

  return (
    <Card className="border-border/60 mt-8">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-copa-gold" />
          Resultado Final do Torneio
        </CardTitle>
        <CardDescription>
          Registrar campeão, vice, 3º, 4º e artilheiro dispara cálculo de pontos dos palpites especiais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(['champion', 'runnerUp', 'thirdPlace', 'fourthPlace'] as const).map((key) => {
          const labels: Record<typeof key, string> = {
            champion: 'Campeão (+150 pts)',
            runnerUp: 'Vice (+75 pts)',
            thirdPlace: '3º lugar (+40 pts)',
            fourthPlace: '4º lugar (+40 pts)',
          };
          const icons: Record<typeof key, React.ComponentType<{ className?: string }>> = {
            champion: Crown,
            runnerUp: Trophy,
            thirdPlace: Flag,
            fourthPlace: Flag,
          };
          const Icon = icons[key];
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-copa-gold" />
                {labels[key]}
              </Label>
              <div className="flex items-center gap-2">
                {form[key] && (
                  <img
                    src={flagUrl(form[key], 40)}
                    alt=""
                    className="h-7 w-10 rounded object-cover ring-1 ring-border"
                  />
                )}
                <select
                  id={key}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                >
                  <option value="">— Selecione —</option>
                  {allTeams.map((t) => (
                    <option key={t.iso} value={t.iso}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}

        <div className="space-y-1.5">
          <Label htmlFor="topScorer" className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-copa-gold" />
            Artilheiro (+120 pts)
          </Label>
          <PlayerCombobox
            id="topScorer"
            value={form.topScorer || null}
            onChange={(playerId) => setForm((f) => ({ ...f, topScorer: playerId ?? '' }))}
            players={playersQuery.data ?? []}
            loading={playersQuery.isLoading}
            placeholder="Selecione o artilheiro..."
          />
        </div>

        {hasDuplicates && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Seleções duplicadas no top 4 — corrija antes de salvar.
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!isComplete || hasDuplicates || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar resultado final
          </Button>
        </div>

        {finalQuery.data && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Última atualização: {finalQuery.data.updatedAt ? new Date(finalQuery.data.updatedAt).toLocaleString('pt-BR') : '—'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// FilterChip helper
// ───────────────────────────────────────────────────────────────────────────
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        active
          ? 'bg-brand-purple text-white'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      )}
    >
      {children}
    </button>
  );
}
