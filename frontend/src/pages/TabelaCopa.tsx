/**
 * Página pública "Tabela da Copa" — classificação ao vivo da fase de grupos.
 *
 * Consome GET /api/standings (já traz a flag de qualificação por seleção, sem
 * recálculo no front). Auto-refresh por polling (10s), pausa em aba oculta e
 * para quando a fase de grupos encerra. Somente leitura.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, LayoutGrid, Zap } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getStandings } from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { formatRelative } from '@/lib/format';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { cn } from '@/lib/utils';
import type {
  GroupStandingPublic,
  Qualification,
  StandingRowPublic,
  StandingsResponse,
} from '@/lib/types-domain';

const REFRESH_MS = 10_000;

const QUAL_DOT: Record<Qualification, string> = {
  direct: 'bg-emerald-500',
  'best-third': 'bg-amber-500',
  eliminated: 'bg-muted-foreground/40',
  undecided: 'bg-muted-foreground/20',
};
const QUAL_TEXT: Record<Qualification, string> = {
  direct: 'text-emerald-600 dark:text-emerald-400',
  'best-third': 'text-amber-600 dark:text-amber-400',
  eliminated: 'text-muted-foreground',
  undecided: 'text-muted-foreground',
};

export default function TabelaCopa() {
  const visible = useDocumentVisible();
  const query = useQuery({
    queryKey: ['standings'],
    queryFn: getStandings,
    refetchInterval: (q) =>
      !visible || q.state.data?.allComplete ? false : REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const data = query.data as StandingsResponse | undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-copa-gold/15 flex items-center justify-center ring-1 ring-copa-gold/30">
          <LayoutGrid className="h-7 w-7 text-copa-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-bold">Tabela da Copa</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Classificação ao vivo · fase de grupos
            {data && (
              <>
                {' · '}atualizado {formatRelative(data.computedAt)}
                {data.allComplete ? (
                  <span className="ml-1 text-emerald-500">· encerrada</span>
                ) : (
                  <span className="ml-1">· refresh {REFRESH_MS / 1000}s</span>
                )}
                {!visible && <span className="ml-1 text-amber-500">(pausado)</span>}
              </>
            )}
          </p>
        </div>
        <LiveIndicator
          visible={visible}
          fetching={query.isFetching}
          done={data?.allComplete ?? false}
        />
      </header>

      <Legend />

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

      {data && data.groups.length === 0 && !query.isLoading && (
        <Card className="border-border/60">
          <CardContent className="p-10 text-center text-muted-foreground">
            Os grupos ainda não foram carregados. Volte quando os jogos começarem.
          </CardContent>
        </Card>
      )}

      {data && data.groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.groups.map((g) => (
            <GroupCard key={g.groupCode} group={g} />
          ))}
        </div>
      )}

      {data && data.bestThirds.length > 0 && <BestThirdsPanel data={data} />}
    </div>
  );
}

function GroupCard({ group }: { group: GroupStandingPublic }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="font-display">Grupo {group.groupCode}</span>
          <GroupStateBadge group={group} />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50">
              <th className="text-left font-medium py-1.5 pl-3">#</th>
              <th className="text-left font-medium py-1.5">Seleção</th>
              <th className="text-center font-medium py-1.5 hidden sm:table-cell">P</th>
              <th className="text-center font-medium py-1.5 hidden sm:table-cell">V</th>
              <th className="text-center font-medium py-1.5 hidden sm:table-cell">E</th>
              <th className="text-center font-medium py-1.5 hidden sm:table-cell">D</th>
              <th className="text-center font-medium py-1.5 hidden md:table-cell">GP</th>
              <th className="text-center font-medium py-1.5 hidden md:table-cell">GC</th>
              <th className="text-center font-medium py-1.5">SG</th>
              <th className="text-center font-medium py-1.5 pr-3">Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => (
              <StandingRow key={`${group.groupCode}-${r.position}-${r.team.name}`} row={r} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function StandingRow({ row }: { row: StandingRowPublic }) {
  const sg = row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff);
  return (
    <tr
      className={cn(
        'border-b border-border/30 last:border-0',
        row.qualification === 'eliminated' && row.played > 0 && 'opacity-70',
      )}
      title={
        row.qualification === 'best-third'
          ? `Melhor 3º (#${row.thirdRank})${row.provisional ? ' — provisório' : ''}`
          : undefined
      }
    >
      <td className="py-1.5 pl-3">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full shrink-0', QUAL_DOT[row.qualification])} />
          <span className="tabular-nums text-muted-foreground">{row.position}</span>
        </span>
      </td>
      <td className="py-1.5">
        <span className="flex items-center gap-2 min-w-0">
          <img
            src={flagUrl(row.team.iso || 'xx', 40)}
            alt=""
            className="h-4 w-6 rounded-sm object-cover ring-1 ring-border/40 shrink-0"
          />
          <span className={cn('truncate', QUAL_TEXT[row.qualification])}>
            {row.team.name}
            {row.qualification === 'best-third' && (
              <span className="ml-1 text-[10px] text-amber-500">3º{row.provisional ? '?' : ''}</span>
            )}
          </span>
        </span>
      </td>
      <td className="text-center tabular-nums hidden sm:table-cell">{row.played}</td>
      <td className="text-center tabular-nums hidden sm:table-cell">{row.won}</td>
      <td className="text-center tabular-nums hidden sm:table-cell">{row.drawn}</td>
      <td className="text-center tabular-nums hidden sm:table-cell">{row.lost}</td>
      <td className="text-center tabular-nums hidden md:table-cell">{row.goalsFor}</td>
      <td className="text-center tabular-nums hidden md:table-cell">{row.goalsAgainst}</td>
      <td className="text-center tabular-nums">{sg}</td>
      <td className="text-center tabular-nums font-semibold pr-3">{row.points}</td>
    </tr>
  );
}

function GroupStateBadge({ group }: { group: GroupStandingPublic }) {
  if (group.playedCount === 0) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
        Aguardando jogos
      </span>
    );
  }
  if (group.complete) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30">
        Encerrado
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
      Em andamento · {group.playedCount}/{group.totalCount}
    </span>
  );
}

function BestThirdsPanel({ data }: { data: StandingsResponse }) {
  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Disputa dos {data.cutoffRank} melhores 3º colocados
          {!data.allComplete && (
            <span className="text-[10px] font-normal text-muted-foreground">(provisório)</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.bestThirds.map((b) => (
            <div
              key={b.groupCode}
              className="flex items-center gap-2 rounded-md bg-amber-500/5 ring-1 ring-amber-500/20 px-2 py-1.5 text-sm"
            >
              <span className="text-xs text-muted-foreground tabular-nums w-4">{b.rank}º</span>
              <img
                src={flagUrl(b.team.iso || 'xx', 40)}
                alt=""
                className="h-4 w-6 rounded-sm object-cover ring-1 ring-border/40 shrink-0"
              />
              <span className="truncate">{b.team.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{b.points}pt</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend() {
  const items: { dot: string; label: string }[] = [
    { dot: 'bg-emerald-500', label: '1º/2º — classificado' },
    { dot: 'bg-amber-500', label: 'melhor 3º — entre os 8' },
    { dot: 'bg-muted-foreground/40', label: 'eliminado' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', i.dot)} />
          {i.label}
        </span>
      ))}
      <span className="text-muted-foreground/70">· desempate: pontos → saldo → gols → confronto direto</span>
    </div>
  );
}

function LiveIndicator({
  visible,
  fetching,
  done,
}: {
  visible: boolean;
  fetching: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Zap
        className={cn(
          'h-4 w-4',
          done
            ? 'text-emerald-500'
            : !visible
              ? 'text-muted-foreground'
              : fetching
                ? 'text-amber-500 animate-pulse'
                : 'text-emerald-500',
        )}
      />
      <span className="hidden md:inline text-muted-foreground">
        {done ? 'encerrada' : !visible ? 'pausado' : fetching ? 'sync...' : 'ao vivo'}
      </span>
    </div>
  );
}
