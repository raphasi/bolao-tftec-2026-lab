/**
 * Página AdminSystem (S4.5.6) — read-only dashboard KPIs + status infra.
 * - Auto-refresh 30s (alinhado com cache backend)
 * - Botão força flush cache + re-fetch
 * - 3 sections: Bolão (KPIs), Infrastructure (cards de status), Observability (null states MVP)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Signal,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchSystemStats, invalidateActiveCache, type SystemStatsResponse } from '@/lib/admin-api';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function AdminSystem() {
  const queryClient = useQueryClient();
  const statsQuery = useQuery({
    queryKey: ['admin', 'system', 'stats'],
    queryFn: fetchSystemStats,
    refetchInterval: 30_000,
  });

  const flushMut = useMutation({
    mutationFn: () => invalidateActiveCache(),
    onSuccess: () => {
      toast.success('Cache active invalidado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'stats'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const stats = statsQuery.data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30">
          <Cpu className="h-7 w-7 text-emerald-500" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl font-bold">Sistema</h1>
          <p className="text-muted-foreground mt-1">
            {stats ? (
              <>Atualizado {formatRelative(stats.fetchedAt)} · cache 30s</>
            ) : (
              'Carregando KPIs e status...'
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => flushMut.mutate()}
          disabled={flushMut.isPending || statsQuery.isFetching}
          className="gap-2"
        >
          <RefreshCw
            className={cn('h-4 w-4', (flushMut.isPending || statsQuery.isFetching) && 'animate-spin')}
          />
          Forçar atualização
        </Button>
      </header>

      {statsQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {statsQuery.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(statsQuery.error)}
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          <BolaoSection stats={stats} />
          <InfraSection stats={stats} />
          <ObservabilitySection stats={stats} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function BolaoSection({ stats }: { stats: SystemStatsResponse }) {
  const { users, predictions, matches, leaderboard } = stats.bolao;
  return (
    <section className="space-y-3">
      <SectionTitle icon={Users}>Bolão</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Usuários"
          primary={users.total}
          extras={[
            { label: 'admins', value: users.admins },
            { label: 'ativos', value: users.active },
            { label: 'inativos', value: users.inactive },
          ]}
        />
        <StatCard
          label="Palpites"
          primary={predictions.total}
          extras={[
            { label: 'pontuados', value: predictions.scored },
            { label: 'placar exato', value: predictions.perfect },
          ]}
        />
        <StatCard
          label="Jogos"
          primary={matches.total}
          extras={[
            { label: 'finalizados', value: matches.finished },
            { label: 'agendados', value: matches.scheduled },
          ]}
        />
        <StatCard
          label="Leaderboard"
          primary={leaderboard.count}
          highlight={leaderboard.leader ? `🏆 ${leaderboard.leader.userName}` : 'Sem líder ainda'}
          extras={
            leaderboard.leader
              ? [{ label: 'pontos', value: leaderboard.leader.totalPoints }]
              : []
          }
        />
      </div>
    </section>
  );
}

function InfraSection({ stats }: { stats: SystemStatsResponse }) {
  const { cosmos, functionApp, appService, signalR } = stats.infrastructure;
  return (
    <section className="space-y-3">
      <SectionTitle icon={Server}>Infraestrutura</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">Cosmos DB</span>
              <StatusDot ok={cosmos.ok} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Database: <span className="font-mono">{cosmos.database}</span></div>
              <div>Containers: {cosmos.containers}</div>
              <div>
                Latência:{' '}
                <span
                  className={cn(
                    cosmos.latencyMs < 100 && 'text-emerald-500',
                    cosmos.latencyMs >= 100 && cosmos.latencyMs < 500 && 'text-amber-500',
                    cosmos.latencyMs >= 500 && 'text-destructive',
                  )}
                >
                  {cosmos.latencyMs}ms
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-500" />
              <span className="font-semibold">Function App</span>
              <StatusDot ok={functionApp.state === 'Running'} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="font-mono">{functionApp.name}</div>
              <div>Estado: {functionApp.state}</div>
              <div>
                Functions: {functionApp.functionsRegistered}/6 registered
              </div>
              <ul className="mt-1 space-y-0.5 pl-3 list-disc text-[10px]">
                {functionApp.functionsList.map((fn) => (
                  <li key={fn} className="font-mono">{fn}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold">App Service</span>
              <StatusDot ok={appService.uptimeSeconds > 0} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="font-mono">{appService.name}</div>
              <div>Uptime: {formatUptime(appService.uptimeSeconds)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-pink-500" />
              <span className="font-semibold">SignalR</span>
              <StatusDot ok={true} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="font-mono">{signalR.name}</div>
              <div>Tier: {signalR.tier}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ObservabilitySection({ stats }: { stats: SystemStatsResponse }) {
  const { errors24h, requestsLast1h, latencyP95Ms } = stats.observability;
  return (
    <section className="space-y-3">
      <SectionTitle icon={Activity}>Observabilidade</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ObservabilityCard label="Errors 24h" value={errors24h} suffix="erros" />
        <ObservabilityCard label="Requests 1h" value={requestsLast1h} suffix="reqs" />
        <ObservabilityCard label="Latency P95" value={latencyP95Ms} suffix="ms" />
      </div>
      <p className="text-xs text-muted-foreground italic">
        Métricas detalhadas serão wiradas via Application Insights em S5+.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SectionTitle({ icon: Icon, children }: { icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {children}
    </h2>
  );
}

function StatCard({
  label,
  primary,
  extras,
  highlight,
}: {
  label: string;
  primary: number;
  extras: { label: string; value: number | string }[];
  highlight?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="mt-1 text-3xl font-display font-bold">{primary}</div>
        {highlight && (
          <div className="mt-1 text-sm text-brand-purple font-medium">{highlight}</div>
        )}
        {extras.length > 0 && (
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {extras.map((e) => (
              <div key={e.label} className="flex justify-between">
                <span>{e.label}</span>
                <span className="font-mono">{e.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ObservabilityCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix: string;
}) {
  return (
    <Card className="opacity-70">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="mt-1 text-2xl font-display font-semibold text-muted-foreground">
          {value === null ? '—' : `${value} ${suffix}`}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-500">
          Disponível em S5+
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'h-2 w-2 rounded-full inline-block ml-auto',
        ok ? 'bg-emerald-500' : 'bg-destructive',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m ${seconds % 60}s`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatRelative(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed < 30_000) return 'agora';
  if (elapsed < 60_000) return `há ${Math.floor(elapsed / 1000)}s`;
  if (elapsed < 3_600_000) return `há ${Math.floor(elapsed / 60_000)}min`;
  return new Date(iso).toLocaleTimeString('pt-BR');
}
