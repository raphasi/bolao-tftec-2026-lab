/**
 * Página Palpites (S2.4) — CRUD palpites dos 72 jogos da fase de grupos.
 *
 * Layout:
 *   - Header com título
 *   - Filtros: todos / por grupo (A-L) / só não-palpitados
 *   - Lista agrupada por grupo, ordenada por kickoff
 *   - Cada jogo = MatchCard
 *
 * Estado:
 *   - React Query gerencia matches + predictions
 *   - Mutação otimista por matchId via upsertPrediction
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
// B6.4: sync entre abas/clientes via polling 30s (admin lock, finished, etc).
import { Loader2, Lock, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/bolao/MatchCard';
import { SoccerBall } from '@/components/icons/SoccerBall';
import {
  listMatches,
  listMyPredictions,
  upsertPrediction,
  type UpsertPredictionInput,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  PHASE_LABELS,
  KNOCKOUT_ORDER,
  isKnockout,
  sectionKey,
  sectionLabel,
  sectionWeight,
} from '@/lib/phases';
import type { PredictionPublic } from '@/lib/types-domain';

const GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
// 'all' | 'mine' | 'missed' | 'pending' | 'upcoming' | grupo (A-L) | fase (round-of-16, …)
//  - missed  = travado E sem palpite (read-only; "o que perdi")
//  - pending = aberto E sem palpite (acionável)
type SectionFilter = string;

/** Formata um ISO em "DD/MM às HH:mm" no horário de Brasília (UTC-3). */
function fmtOpensBrt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function Palpites() {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [filter, setFilter] = useState<SectionFilter>('all');

  const matchesQuery = useQuery({
    queryKey: ['matches'],
    queryFn: () => listMatches(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const predictionsQuery = useQuery({
    queryKey: ['predictions', 'mine'],
    queryFn: () => listMyPredictions(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // B1.2 fix: tracking explícito de matchIds in-flight evita race condition
  // onde clicar Salvar em B faz isSaving de A virar false e botão piscar.
  const [savingMatchIds, setSavingMatchIds] = useState<Set<number>>(new Set());

  const predictionsByMatchId = useMemo(() => {
    const map = new Map<number, PredictionPublic>();
    for (const p of predictionsQuery.data ?? []) map.set(p.matchId, p);
    return map;
  }, [predictionsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: UpsertPredictionInput) => upsertPrediction(input),
    onMutate: ({ matchId }) => {
      setSavingMatchIds((prev) => {
        const next = new Set(prev);
        next.add(matchId);
        return next;
      });
    },
    onSettled: (_data, _err, { matchId }) => {
      setSavingMatchIds((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    },
    onSuccess: (saved) => {
      toast.success(`Palpite salvo: ${saved.homeTeam} ${saved.predictedHome} × ${saved.predictedAway} ${saved.awayTeam}`);
      // Atualiza cache local sem refetch
      queryClient.setQueryData<PredictionPublic[]>(['predictions', 'mine'], (old) => {
        const list = old ?? [];
        const idx = list.findIndex((p) => p.matchId === saved.matchId);
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = saved;
          return copy;
        }
        return [...list, saved];
      });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const isLoading = matchesQuery.isLoading || predictionsQuery.isLoading;
  const isError = matchesQuery.isError || predictionsQuery.isError;

  const matches = matchesQuery.data ?? [];

  // Filtragem (grupo via groupCode, mata-mata via phase). Fase não aberta
  // (predictionsOpen===false) não conta como "sem palpite".
  const filteredMatches = useMemo(() => {
    if (filter === 'all') return matches;
    if (filter === 'pending')
      return matches.filter(
        (m) => !predictionsByMatchId.has(m.matchId) && !m.locked && m.predictionsOpen !== false,
      );
    if (filter === 'missed')
      // Travado E sem palpite = "perdi a janela" (read-only/transparência).
      // predictionsOpen===false (fase não aberta) tem locked===false → fica fora.
      return matches.filter((m) => m.locked === true && !predictionsByMatchId.has(m.matchId));
    if (filter === 'mine') return matches.filter((m) => predictionsByMatchId.has(m.matchId));
    if (filter === 'upcoming')
      return [...matches]
        .filter((m) => !m.locked && m.predictionsOpen !== false && Date.parse(m.kickoffUtc) > Date.now())
        .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc))
        .slice(0, 10);
    return matches.filter((m) => m.groupCode === filter || m.phase === filter);
  }, [matches, filter, predictionsByMatchId]);

  // Fases de mata-mata presentes nos dados (para exibir os chips dinamicamente)
  const knockoutPhases = useMemo(() => {
    const present = new Set<string>();
    for (const m of matches) if (isKnockout(m.phase)) present.add(m.phase as string);
    return KNOCKOUT_ORDER.filter((p) => present.has(p));
  }, [matches]);

  // Fases (mata-mata) ainda bloqueadas — para destacar o chip em "tom de bloqueado".
  const lockedPhases = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) if (isKnockout(m.phase) && m.predictionsOpen === false) s.add(m.phase as string);
    return s;
  }, [matches]);

  // Agrupar por seção (grupos A-L primeiro, depois mata-mata em ordem de chave).
  // Seção "bloqueada" = fase ainda não aberta (predictionsOpen===false): vira
  // banner com cadeado, SEM mostrar os cards de jogo (evita confronto fictício).
  const sections = useMemo(() => {
    const map = new Map<
      string,
      { label: string; weight: number; locked: boolean; opensUtc?: string; matches: typeof filteredMatches }
    >();
    for (const m of filteredMatches) {
      const key = sectionKey(m);
      const entry =
        map.get(key) ??
        {
          label: sectionLabel(m),
          weight: sectionWeight(m),
          locked: m.predictionsOpen === false,
          opensUtc: m.opensUtc,
          matches: [] as typeof filteredMatches,
        };
      entry.matches.push(m);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.weight - b.weight);
  }, [filteredMatches]);

  const totalPredictions = predictionsQuery.data?.length ?? 0;
  const totalMatches = matches.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-copa-pitch/15 flex items-center justify-center ring-1 ring-copa-pitch/30">
          <SoccerBall className="h-7 w-7 text-copa-pitch" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Palpites</h1>
          <p className="text-muted-foreground mt-1">
            {totalPredictions}/{totalMatches} jogos palpitados.
          </p>
        </div>
      </header>

      {/* Filtros — quebrados em 3 linhas para facilitar a navegação */}
      <div className="space-y-2">
        {/* Linha 1: status */}
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos
          </FilterChip>
          <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>
            Meus palpites
          </FilterChip>
          <FilterChip active={filter === 'missed'} onClick={() => setFilter('missed')}>
            Jogos que não palpitei
          </FilterChip>
          <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>
            Palpites pendentes
          </FilterChip>
          <FilterChip active={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>
            Próximos jogos
          </FilterChip>
        </div>

        {/* Linha 2: grupos A–L */}
        <div className="flex flex-wrap gap-2">
          {GROUP_CODES.map((code) => (
            <FilterChip key={code} active={filter === code} onClick={() => setFilter(code)}>
              Grupo {code}
            </FilterChip>
          ))}
        </div>

        {/* Linha 3: mata-mata (16-avos → final). Chips bloqueados em tom dourado + cadeado. */}
        {knockoutPhases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {knockoutPhases.map((phase) => (
              <FilterChip
                key={phase}
                active={filter === phase}
                locked={lockedPhases.has(phase)}
                onClick={() => setFilter(phase)}
              >
                {PHASE_LABELS[phase] ?? phase}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <p className="text-destructive font-medium">Erro ao carregar jogos.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {getErrorMessage(matchesQuery.error ?? predictionsQuery.error)}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => {
                matchesQuery.refetch();
                predictionsQuery.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty filter — B6.2 fix: distingue empty real de offline */}
      {!isLoading && !isError && filteredMatches.length === 0 && (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center text-muted-foreground space-y-2">
            <Trophy className="h-10 w-10 mx-auto opacity-50" />
            <p>
              {!online
                ? 'Sem conexão — dados não carregaram. Volte ao online e atualize a página.'
                : filter === 'missed'
                  ? 'Você não perdeu nenhum jogo — palpitou em tudo que já fechou. 🎉'
                  : filter === 'pending'
                    ? 'Nenhum palpite pendente — você está em dia com os jogos abertos. 🎉'
                    : filter === 'mine'
                      ? 'Você ainda não palpitou em nenhum jogo.'
                      : filter === 'upcoming'
                        ? 'Nenhum jogo próximo em aberto.'
                        : 'Nenhum jogo neste filtro.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* "Próximos jogos": lista plana por data/hora (não agrupada por fase) */}
      {!isLoading && !isError && filteredMatches.length > 0 && filter === 'upcoming' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Os {filteredMatches.length} próximos jogos por horário — palpite primeiro o que trava antes.
          </p>
          {filteredMatches.map((m) => (
            <MatchCard
              key={m.matchId}
              match={m}
              prediction={predictionsByMatchId.get(m.matchId)}
              onSave={(home, away) =>
                saveMutation.mutate({ matchId: m.matchId, predictedHome: home, predictedAway: away })
              }
              isSaving={savingMatchIds.has(m.matchId)}
            />
          ))}
        </div>
      )}

      {/* Lista de jogos agrupados (demais filtros) */}
      {!isLoading && !isError && filteredMatches.length > 0 && filter !== 'upcoming' && (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.label} className="space-y-3">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-brand-purple/15 text-brand-purple text-sm">
                  {section.label}
                </span>
                {section.locked ? (
                  <span className="inline-flex items-center gap-1 text-copa-gold text-sm font-normal">
                    <Lock className="h-3.5 w-3.5" /> bloqueada
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm font-normal">
                    {section.matches.length} {section.matches.length === 1 ? 'jogo' : 'jogos'}
                  </span>
                )}
              </h2>

              {section.locked ? (
                // Fase ainda não liberada: banner com cadeado, sem cards, sem clique.
                <div
                  className="flex items-start gap-3 rounded-xl border border-copa-gold/30 bg-copa-gold/10 p-4 cursor-not-allowed select-none"
                  title={section.opensUtc ? `Libera em ${fmtOpensBrt(section.opensUtc)}` : 'Aguardando liberação'}
                >
                  <Lock className="h-5 w-5 text-copa-gold mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      {section.opensUtc
                        ? `Abre em ${fmtOpensBrt(section.opensUtc)}`
                        : 'Ainda não liberada'}
                    </div>
                    <div className="text-muted-foreground">
                      Os confrontos desta fase são definidos após a fase de grupos. Volte na data de
                      abertura para palpitar.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {section.matches.map((m) => (
                    <MatchCard
                      key={m.matchId}
                      match={m}
                      prediction={predictionsByMatchId.get(m.matchId)}
                      readonly={filter === 'missed'}
                      onSave={(home, away) =>
                        saveMutation.mutate({ matchId: m.matchId, predictedHome: home, predictedAway: away })
                      }
                      isSaving={savingMatchIds.has(m.matchId)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  locked = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        active
          ? 'bg-brand-purple text-white'
          : locked
            ? // tom de bloqueado (dourado) — chama atenção de que a fase ainda não abriu
              'bg-copa-gold/15 text-copa-gold ring-1 ring-copa-gold/40 hover:bg-copa-gold/25'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      )}
    >
      {locked && <Lock className="h-3 w-3" />}
      {children}
    </button>
  );
}
