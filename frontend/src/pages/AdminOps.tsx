/**
 * Página AdminOps (S8.2) — live event dashboard.
 *
 * Otimizada pra ficar aberta em segundo monitor durante evento.
 * - 4 cards real-time com auto-refresh 10s (pausa em tab oculto)
 * - Threshold alarms com pulsing ring vermelho
 * - Sparkline SVG latência p95 últimos 30min
 *
 * Sinais cobertos: Active Match | Errors 5min | Active Users 5min | Latency p95 30min
 * Não cobertos (v1): Cosmos RU/s, SignalR conn — usar Cosmos Insights Portal.
 */
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Loader2, RadioTower, Users, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { fetchOpsLive, type OpsLiveResponse, type SeriesPoint } from '@/lib/admin-api';
import { getErrorMessage } from '@/lib/api';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

const REFRESH_MS = 10_000;
const ERRORS_ALARM_THRESHOLD = 0; // > 0 → alarm
const LATENCY_P95_ALARM_MS = 1000;
const ACTIVE_USERS_LOW_THRESHOLD = 5; // baseline esperado 30-50; <5 sugere problema

export default function AdminOps() {
  const visible = useDocumentVisible();
  const query = useQuery({
    queryKey: ['admin', 'ops', 'live'],
    queryFn: fetchOpsLive,
    refetchInterval: visible ? REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  const data = query.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-red-500/15 flex items-center justify-center ring-1 ring-red-500/30">
          <RadioTower className="h-7 w-7 text-red-500" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl font-bold">Operação ao Vivo</h1>
          <p className="text-muted-foreground mt-1">
            {data ? (
              <>
                Atualizado {formatRelative(data.fetchedAt)} · refresh {REFRESH_MS / 1000}s
                {!visible && <span className="ml-2 text-amber-500">(pausado — tab oculto)</span>}
              </>
            ) : (
              'Conectando...'
            )}
          </p>
        </div>
        <LiveIndicator visible={visible} fetching={query.isFetching} />
      </header>

      {!data?.appInsightsConfigured && data && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-500">AppInsights não configurado</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Errors / Active Users / Latency não disponíveis. Active Match continua funcional.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {query.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {query.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(query.error)}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActiveMatchCard data={data.activeMatch} />
          <ErrorsCard count={data.errors5min} />
          <ActiveUsersCard count={data.activeUsers5min} />
          <LatencyCard series={data.latencyP95Series30min} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function ActiveMatchCard({ data }: { data: OpsLiveResponse['activeMatch'] }) {
  if (!data) {
    return (
      <BigCard label="Active Match" icon={RadioTower} accent="text-muted-foreground">
        <div className="text-2xl font-semibold text-muted-foreground">Nenhum jogo ao vivo</div>
        <div className="text-xs text-muted-foreground mt-1">
          Janela: -150min ≤ kickoff ≤ +30min
        </div>
      </BigCard>
    );
  }

  const statusColor =
    data.status === 'live'
      ? 'text-red-500'
      : data.status === 'finished'
        ? 'text-emerald-500'
        : 'text-blue-500';

  return (
    <BigCard label="Active Match" icon={RadioTower} accent={statusColor}>
      <div className="text-2xl font-display font-bold leading-tight">
        {data.homeTeam} <span className="text-muted-foreground">×</span> {data.awayTeam}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <Field label="Status" value={data.status.toUpperCase()} valueClass={statusColor} />
        <Field
          label="Lock"
          value={
            data.lockedManually ? '🔒 manual' : data.locked ? '🔒 by kickoff' : 'aberto'
          }
          valueClass={data.locked ? 'text-amber-500' : 'text-emerald-500'}
        />
        <Field
          label="Kickoff"
          value={new Date(data.kickoffUtc).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
        <Field
          label="Minutos"
          value={
            data.minutesSinceKickoff < 0
              ? `falta ${Math.abs(data.minutesSinceKickoff)}min`
              : `${data.minutesSinceKickoff}min`
          }
        />
        <Field label="Match ID" value={`#${data.matchId}`} valueClass="font-mono" />
        <Field label="Palpites" value={data.predictionsCount} valueClass="font-mono" />
      </div>
    </BigCard>
  );
}

function ErrorsCard({ count }: { count: number | null }) {
  const alarm = count !== null && count > ERRORS_ALARM_THRESHOLD;
  return (
    <BigCard
      label="Errors (last 5min)"
      icon={AlertTriangle}
      accent={alarm ? 'text-destructive' : 'text-emerald-500'}
      alarm={alarm}
    >
      <div
        className={cn(
          'text-5xl font-display font-bold tabular-nums',
          count === null ? 'text-muted-foreground' : alarm ? 'text-destructive' : 'text-emerald-500',
        )}
      >
        {count === null ? '—' : count}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        Threshold de alarme: &gt;{ERRORS_ALARM_THRESHOLD} erro durante evento
      </div>
    </BigCard>
  );
}

function ActiveUsersCard({ count }: { count: number | null }) {
  const low = count !== null && count < ACTIVE_USERS_LOW_THRESHOLD;
  return (
    <BigCard
      label="Active Users (last 5min)"
      icon={Users}
      accent={count === null ? 'text-muted-foreground' : low ? 'text-amber-500' : 'text-emerald-500'}
    >
      <div
        className={cn(
          'text-5xl font-display font-bold tabular-nums',
          count === null ? 'text-muted-foreground' : low ? 'text-amber-500' : 'text-emerald-500',
        )}
      >
        {count === null ? '—' : count}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        Baseline esperado durante evento: 30-50 usuários distintos
      </div>
    </BigCard>
  );
}

function LatencyCard({ series }: { series: SeriesPoint[] | null }) {
  const latest = series && series.length > 0 ? series[series.length - 1].v : null;
  const alarm = latest !== null && latest > LATENCY_P95_ALARM_MS;
  return (
    <BigCard
      label="Latency p95 (30min trend)"
      icon={Activity}
      accent={alarm ? 'text-destructive' : 'text-emerald-500'}
      alarm={alarm}
    >
      <div className="flex items-baseline gap-3">
        <div
          className={cn(
            'text-5xl font-display font-bold tabular-nums',
            latest === null
              ? 'text-muted-foreground'
              : alarm
                ? 'text-destructive'
                : 'text-emerald-500',
          )}
        >
          {latest === null ? '—' : latest}
        </div>
        <div className="text-sm text-muted-foreground">ms</div>
      </div>
      <Sparkline series={series} alarmThreshold={LATENCY_P95_ALARM_MS} />
      <div className="text-xs text-muted-foreground mt-1">
        Threshold de alarme: p95 &gt;{LATENCY_P95_ALARM_MS}ms
      </div>
    </BigCard>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function BigCard({
  label,
  icon: Icon,
  accent,
  alarm = false,
  children,
}: {
  label: string;
  icon: typeof Activity;
  accent: string;
  alarm?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'transition-all',
        alarm && 'ring-2 ring-destructive/60 animate-pulse shadow-lg shadow-destructive/20',
      )}
    >
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className={cn('h-4 w-4', accent)} />
          <span className="font-semibold">{label}</span>
        </div>
        <div>{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', valueClass)}>{value}</span>
    </div>
  );
}

function LiveIndicator({ visible, fetching }: { visible: boolean; fetching: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Zap
        className={cn(
          'h-4 w-4',
          !visible
            ? 'text-muted-foreground'
            : fetching
              ? 'text-amber-500 animate-pulse'
              : 'text-emerald-500',
        )}
      />
      <span className="hidden md:inline text-muted-foreground">
        {!visible ? 'pausado' : fetching ? 'sync...' : 'live'}
      </span>
    </div>
  );
}

function Sparkline({
  series,
  alarmThreshold,
}: {
  series: SeriesPoint[] | null;
  alarmThreshold: number;
}) {
  if (!series || series.length < 2) {
    return (
      <div className="h-14 flex items-center text-xs text-muted-foreground">
        {series === null ? '— (AppInsights indisponível)' : 'aguardando datapoints'}
      </div>
    );
  }

  const values = series.map((p) => p.v).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return <div className="h-14 flex items-center text-xs text-muted-foreground">sem dados</div>;
  }

  const max = Math.max(...values, alarmThreshold);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 100;
  const height = 40;

  const points = series
    .map((p, i) => {
      if (p.v === null) return null;
      const x = (i / Math.max(series.length - 1, 1)) * width;
      const y = height - ((p.v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((s): s is string => s !== null)
    .join(' ');

  const alarmY = height - ((alarmThreshold - min) / range) * height;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" preserveAspectRatio="none">
      <line
        x1="0"
        x2={width}
        y1={alarmY}
        y2={alarmY}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        className="text-destructive/40"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-emerald-500"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

