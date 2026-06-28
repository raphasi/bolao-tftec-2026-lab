/**
 * Página Leaderboard (S7.1 + S7.2) — ranking real do bolão, layout tabular.
 *
 * Layout:
 *  - Tabela única com colunas: #, Nome, Pontos, Palpites, Exatos
 *  - Top 3 com medalha emoji 🥇🥈🥉 prefix no nome
 *  - Highlight do user logado (linha brand-purple)
 *  - SignalR (S3.5) atualiza realtime via useLeaderboardSignal
 *  - Click numa linha (autenticado): abre modal com palpites do user em jogos finalizados
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Crown, HelpCircle, Loader2, Trophy, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboardSignal } from '@/hooks/useLeaderboardSignal';
import {
  getLeaderboard,
  getUserFinishedPredictions,
  getUserSpecialsBreakdown,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import type {
  LeaderboardEntry,
  PredictionPublic,
  SpecialsBreakdown,
} from '@/lib/types-domain';

const MEDAL_BY_RANK: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

export default function Leaderboard() {
  const { user, isAuthenticated } = useAuth();
  const myUserId = user?.userId;

  // SignalR realtime: invalida ['leaderboard'] no evento leaderboard:update
  useLeaderboardSignal();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    staleTime: 30_000,
  });

  // S7.2: state pra modal com palpites do user clicado
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);

  const ranking = data?.ranking ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-copa-gold/15 flex items-center justify-center ring-1 ring-copa-gold/30">
          <Trophy className="h-7 w-7 text-copa-gold" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">
            {ranking.length === 0
              ? 'Aguardando primeiros pontos...'
              : `${ranking.length} ${ranking.length === 1 ? 'participante' : 'participantes'}.`}
            {data?.lastUpdated && (
              <span className="text-xs ml-2 opacity-60">
                · Atualizado {new Date(data.lastUpdated).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <Link
          to="/regras"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-purple hover:text-brand-purple/80 rounded-md px-2 py-1 hover:bg-brand-purple/10 transition-colors"
          title="Como funcionam os pontos?"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Como pontuar?</span>
        </Link>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(error)}
            <button onClick={() => refetch()} className="ml-2 underline">
              Tentar novamente
            </button>
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !isError && ranking.length === 0 && (
        <Card className="border-border/60">
          <CardContent className="p-12 text-center text-muted-foreground space-y-3">
            <Trophy className="h-12 w-12 mx-auto opacity-40" />
            <p className="text-base">Ninguém pontuou ainda.</p>
            <p className="text-sm">
              Os pontos aparecem aqui quando o admin finalizar os primeiros jogos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      {ranking.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-right px-3 py-3 font-medium w-14">#</th>
                  <th className="text-left px-3 py-3 font-medium">Nome</th>
                  <th className="text-right px-3 py-3 font-medium w-20">Pontos</th>
                  <th
                    className="text-right px-3 py-3 font-medium w-28 hidden sm:table-cell"
                    title="Palpites de jogos já encerrados e pontuados"
                  >
                    Processados
                  </th>
                  <th
                    className="text-right px-3 py-3 font-medium w-28 hidden sm:table-cell"
                    title="Palpites salvos de jogos que ainda não encerraram"
                  >
                    Pendentes
                  </th>
                  <th className="text-right px-3 py-3 font-medium w-20 hidden sm:table-cell">Exatos</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => (
                  <RankRow
                    key={entry.userId}
                    entry={entry}
                    isMe={entry.userId === myUserId}
                    clickable={isAuthenticated}
                    onClick={() => isAuthenticated && setSelectedUser(entry)}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* S7.2: Modal com palpites do user clicado */}
      {selectedUser && (
        <UserPredictionsModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

function RankRow({
  entry,
  isMe,
  clickable,
  onClick,
}: {
  entry: LeaderboardEntry;
  isMe: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const medal = MEDAL_BY_RANK[entry.rank];
  return (
    <tr
      onClick={clickable ? onClick : undefined}
      className={cn(
        'border-t border-border/60 transition-colors',
        clickable && 'cursor-pointer hover:bg-secondary/30',
        isMe && 'bg-brand-purple/10 border-l-4 border-l-brand-purple',
      )}
      title={clickable ? 'Ver palpites em jogos já encerrados' : undefined}
    >
      <td className="px-3 py-3 text-right font-mono text-muted-foreground">
        {entry.rank}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {medal && <span className="text-lg leading-none" aria-hidden>{medal}</span>}
          <span className="font-medium truncate">
            {entry.userName}
            {isMe && (
              <span className="ml-2 text-[10px] text-brand-purple uppercase font-semibold">
                Você
              </span>
            )}
          </span>
        </div>
        <div className="text-xs text-muted-foreground sm:hidden mt-0.5">
          {entry.predictionsCount} proc · {entry.pendingCount ?? 0} pend · {entry.perfectScores} exatos
        </div>
      </td>
      <td className={cn(
        'px-3 py-3 text-right font-display font-bold text-lg',
        entry.rank === 1 ? 'text-copa-gold' : 'text-foreground',
      )}>
        {entry.totalPoints}
      </td>
      <td className="px-3 py-3 text-right text-muted-foreground hidden sm:table-cell">
        {entry.predictionsCount}
      </td>
      <td className="px-3 py-3 text-right text-muted-foreground hidden sm:table-cell">
        {entry.pendingCount ?? 0}
      </td>
      <td className="px-3 py-3 text-right text-muted-foreground hidden sm:table-cell">
        {entry.perfectScores}
      </td>
    </tr>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// S7.2: Modal de palpites finalizados (transparência)
// ───────────────────────────────────────────────────────────────────────────
function UserPredictionsModal({
  user,
  onClose,
}: {
  user: LeaderboardEntry;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const predictionsQuery = useQuery({
    queryKey: ['user-finished-predictions', user.userId],
    queryFn: () => getUserFinishedPredictions(user.userId),
    staleTime: 30_000,
  });

  // B3.1: breakdown dos especiais (403 esperado p/ outros users até o término da Copa)
  const breakdownQuery = useQuery({
    queryKey: ['user-specials-breakdown', user.userId],
    queryFn: () => getUserSpecialsBreakdown(user.userId),
    staleTime: 30_000,
    retry: false,
  });

  const predictions = predictionsQuery.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-6 flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-4 shrink-0">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                {MEDAL_BY_RANK[user.rank] && (
                  <span className="text-2xl" aria-hidden>{MEDAL_BY_RANK[user.rank]}</span>
                )}
                {user.userName}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Rank #{user.rank} · {user.totalPoints} pts ({user.matchPoints} jogos
                {user.specialPoints > 0 && <span> + {user.specialPoints} especiais</span>})
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Loading */}
          {predictionsQuery.isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {predictionsQuery.isError && (
            <p className="text-sm text-destructive py-4">
              {getErrorMessage(predictionsQuery.error)}
            </p>
          )}

          {/* Empty — só mostra se nem palpites de jogos nem especiais com picks */}
          {!predictionsQuery.isLoading && !predictionsQuery.isError && predictions.length === 0 &&
            !breakdownQuery.isLoading && !breakdownQuery.data?.hasPicks && (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Trophy className="h-10 w-10 mx-auto opacity-40 mb-2" />
              Este usuário ainda não tem palpites em jogos finalizados.
            </div>
          )}

          {/* Conteúdo scrollável: especiais + jogos */}
          {(predictions.length > 0 || breakdownQuery.data?.hasPicks) && (
            <div className="flex-1 overflow-y-auto -mx-2 space-y-4">
              {/* B3.1: Breakdown dos palpites especiais */}
              <SpecialsBreakdownSection query={breakdownQuery} />

              {predictions.length > 0 && (
                <div>
                  <div className="px-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Jogos finalizados
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Jogo</th>
                        <th className="text-center px-2 py-2 font-medium w-20">Palpite</th>
                        <th className="text-center px-2 py-2 font-medium w-20">Real</th>
                        <th className="text-right px-3 py-2 font-medium w-16">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictions.map((p) => (
                        <PredictionRow key={p.matchId} prediction={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// B3.1: Breakdown dos pontos de especiais
// ───────────────────────────────────────────────────────────────────────────
function SpecialsBreakdownSection({
  query,
}: {
  query: ReturnType<typeof useQuery<SpecialsBreakdown, Error>>;
}) {
  if (query.isLoading) {
    return (
      <div className="px-3 py-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando especiais…
      </div>
    );
  }

  // 403 = palpites especiais de outro usuário só após o término da Copa — não é erro
  if (query.isError) {
    const status = (query.error as { response?: { status?: number } } | undefined)?.response?.status;
    if (status === 403) {
      return (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Crown className="h-4 w-4 inline-block mr-1.5 opacity-60" />
          Os palpites especiais deste usuário só ficam visíveis após o término da Copa.
        </div>
      );
    }
    return null;
  }

  const data = query.data;
  if (!data || !data.hasPicks) return null;

  const rows: Array<{ label: string; pickIso: string | null; actualIso: string | null; points: number }> = [
    {
      label: 'Campeão',
      pickIso: data.picks.champion,
      actualIso: data.actuals?.champion ?? null,
      points: data.points.champion,
    },
    {
      label: 'Vice',
      pickIso: data.picks.runnerUp,
      actualIso: data.actuals?.runnerUp ?? null,
      points: data.points.runnerUp,
    },
    {
      label: '3º lugar',
      pickIso: data.picks.thirdPlace,
      actualIso: data.actuals?.thirdPlace ?? null,
      points: data.points.thirdPlace,
    },
    {
      label: '4º lugar',
      pickIso: data.picks.fourthPlace,
      actualIso: data.actuals?.fourthPlace ?? null,
      points: data.points.fourthPlace,
    },
  ];

  return (
    <div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
          <Crown className="h-3.5 w-3.5 text-copa-gold" />
          Palpites especiais
        </span>
        <span className="text-xs font-display font-bold text-copa-gold">
          {data.points.total} pts
        </span>
      </div>
      <div className="rounded-lg border border-border/60 divide-y divide-border/60 overflow-hidden">
        {rows.map((r) => (
          <SpecialsBreakdownRow key={r.label} {...r} />
        ))}
        {/* Artilheiro: nome (não iso) */}
        <SpecialsBreakdownTextRow
          label="Artilheiro"
          pick={data.picks.topScorer}
          actual={data.actuals?.topScorer ?? null}
          points={data.points.topScorer}
        />
        {/* Bônus top 4 (sem palpite/real específico) */}
        {data.points.top4Bonus > 0 && (
          <div className="px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground italic">Bônus top 4 (3 acertos)</span>
            <span className="font-display font-bold text-emerald-500">+{data.points.top4Bonus}</span>
          </div>
        )}
      </div>
      {!data.actuals && (
        <p className="px-3 pt-1.5 text-[10px] text-muted-foreground italic">
          Resultados oficiais ainda não cadastrados — pontos podem mudar.
        </p>
      )}
    </div>
  );
}

function SpecialsBreakdownRow({
  label,
  pickIso,
  actualIso,
  points,
}: {
  label: string;
  pickIso: string | null;
  actualIso: string | null;
  points: number;
}) {
  const matched = !!pickIso && pickIso === actualIso;
  return (
    <div className="px-3 py-2 flex items-center gap-3 text-sm">
      <span className="w-20 text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {pickIso ? (
          <>
            <img
              src={flagUrl(pickIso, 40)}
              alt=""
              className="h-4 w-6 rounded-sm object-cover ring-1 ring-border/60 shrink-0"
            />
            <span className={cn('font-mono uppercase text-xs', matched && 'text-emerald-500 font-semibold')}>
              {pickIso}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
        {actualIso && actualIso !== pickIso && (
          <span className="text-xs text-muted-foreground ml-1">
            (real: <span className="font-mono uppercase">{actualIso}</span>)
          </span>
        )}
      </div>
      <span
        className={cn(
          'font-display font-bold text-sm w-12 text-right',
          points > 0 ? 'text-copa-gold' : 'text-muted-foreground',
        )}
      >
        +{points}
      </span>
    </div>
  );
}

function SpecialsBreakdownTextRow({
  label,
  pick,
  actual,
  points,
}: {
  label: string;
  pick: string | null;
  actual: string | null;
  points: number;
}) {
  const matched =
    !!pick && !!actual && pick.trim().toLowerCase() === actual.trim().toLowerCase();
  return (
    <div className="px-3 py-2 flex items-center gap-3 text-sm">
      <span className="w-20 text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {pick ? (
          <span className={cn('text-xs truncate', matched && 'text-emerald-500 font-semibold')}>
            {pick}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
        {actual && !matched && (
          <span className="text-xs text-muted-foreground ml-1 truncate">
            (real: {actual})
          </span>
        )}
      </div>
      <span
        className={cn(
          'font-display font-bold text-sm w-12 text-right',
          points > 0 ? 'text-copa-gold' : 'text-muted-foreground',
        )}
      >
        +{points}
      </span>
    </div>
  );
}

function PredictionRow({ prediction: p }: { prediction: PredictionPublic }) {
  const pts = p.points ?? 0;
  // Cor da pontuação (ver scoring.ts):
  //  25 = placar exato → gold
  //  15 = vencedor/empate sem placar → green
  //   0 = errou → muted
  const ptsColor =
    pts === 25 ? 'text-copa-gold' : pts > 0 ? 'text-emerald-500' : 'text-muted-foreground';

  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2">
        <div className="font-medium text-xs md:text-sm truncate">
          {p.homeTeam} × {p.awayTeam}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {new Date(p.kickoffUtc).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </div>
      </td>
      <td className="px-2 py-2 text-center font-mono">
        {p.predictedHome}–{p.predictedAway}
      </td>
      <td className="px-2 py-2 text-center font-mono">
        {p.actualHome ?? '?'}–{p.actualAway ?? '?'}
      </td>
      <td className={cn('px-3 py-2 text-right font-display font-bold', ptsColor)}>
        +{pts}
      </td>
    </tr>
  );
}
