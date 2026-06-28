/**
 * Página AdminBracket — Chaveamento do mata-mata.
 *
 * O backend calcula a proposta pelas regras e pelo template OFICIAL da Copa 2026
 * (standings dos grupos + 8 melhores 3º + árvore fixa). Esta tela exibe a
 * proposta, deixa o admin CONFERIR e AJUSTAR cada confronto (dropdown das 48
 * seleções) e CONFIRMAR — gravando os times no jogo (PATCH /matches/:id/teams).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, GitBranch, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getBracketProposal,
  listGroups,
  setMatchTeams,
  type BracketConfronto,
  type BracketWarning,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import type { MatchAdmin, MatchPhase, NationRef } from '@/lib/types-domain';

const PHASE_ORDER: MatchPhase[] = [
  'round-of-32',
  'round-of-16',
  'quarter',
  'semi',
  'third-place',
  'final',
];
const PHASE_LABEL: Record<MatchPhase, string> = {
  group: 'Grupos',
  'round-of-32': '16-avos de final',
  'round-of-16': 'Oitavas de final',
  quarter: 'Quartas de final',
  semi: 'Semifinais',
  'third-place': 'Disputa de 3º lugar',
  final: 'Final',
};

export default function AdminBracket() {
  const proposalQuery = useQuery({
    queryKey: ['admin', 'bracket'],
    queryFn: getBracketProposal,
  });
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: listGroups });

  const nations = useMemo<NationRef[]>(() => {
    const map = new Map<string, NationRef>();
    for (const g of groupsQuery.data ?? []) for (const t of g.teams) map.set(t.iso, t);
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [groupsQuery.data]);

  const currentById = useMemo(() => {
    const map = new Map<number, MatchAdmin>();
    for (const m of proposalQuery.data?.current ?? []) map.set(m.matchId, m);
    return map;
  }, [proposalQuery.data]);

  const byPhase = useMemo(() => {
    const map = new Map<MatchPhase, BracketConfronto[]>();
    for (const c of proposalQuery.data?.proposal ?? []) {
      const arr = map.get(c.phase) ?? [];
      arr.push(c);
      map.set(c.phase, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.matchId - b.matchId);
    return map;
  }, [proposalQuery.data]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <GitBranch className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Chaveamento</h1>
          <p className="text-muted-foreground mt-1">
            Proposta oficial (FIFA 2026) calculada dos resultados. Confira, ajuste e confirme cada confronto.
          </p>
        </div>
      </header>

      <Card className="border-copa-gold/30 bg-copa-gold/5">
        <CardContent className="p-4 text-sm text-muted-foreground flex gap-2">
          <AlertTriangle className="h-4 w-4 text-copa-gold shrink-0 mt-0.5" />
          <span>
            Os 16-avos vêm da classificação dos grupos + 8 melhores terceiros (template oficial).
            As fases seguintes seguem a árvore fixa, derivando o vencedor dos resultados já lançados.
            <strong> A atribuição exata dos terceiros (Anexo C) pode ser ajustada aqui</strong> — confirme antes de abrir os palpites da fase.
          </span>
        </CardContent>
      </Card>

      {proposalQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {proposalQuery.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {getErrorMessage(proposalQuery.error)}
          </CardContent>
        </Card>
      )}

      {!proposalQuery.isLoading &&
        !proposalQuery.isError &&
        PHASE_ORDER.map((phase) => {
          const confrontos = byPhase.get(phase) ?? [];
          if (confrontos.length === 0) return null;
          return (
            <section key={phase} className="space-y-3">
              <h2 className="font-display text-xl font-semibold">{PHASE_LABEL[phase]}</h2>
              <div className="grid gap-3">
                {confrontos.map((c) => (
                  <ConfrontoRow
                    key={c.matchId}
                    confronto={c}
                    nations={nations}
                    current={currentById.get(c.matchId)}
                    savedWarnings={proposalQuery.data?.warnings?.[c.matchId]}
                  />
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}

function ConfrontoRow({
  confronto,
  nations,
  current,
  savedWarnings,
}: {
  confronto: BracketConfronto;
  nations: NationRef[];
  current?: MatchAdmin;
  savedWarnings?: BracketWarning[];
}) {
  const queryClient = useQueryClient();
  const [homeIso, setHomeIso] = useState(confronto.home?.iso ?? '');
  const [awayIso, setAwayIso] = useState(confronto.away?.iso ?? '');

  // Re-sincroniza quando a proposta muda (ex: resultados de fase anterior chegaram).
  useEffect(() => {
    setHomeIso(confronto.home?.iso ?? '');
    setAwayIso(confronto.away?.iso ?? '');
  }, [confronto.home?.iso, confronto.away?.iso]);

  const byIso = useMemo(() => {
    const map = new Map<string, NationRef>();
    for (const n of nations) map.set(n.iso, n);
    return map;
  }, [nations]);

  const mutation = useMutation({
    mutationFn: () => {
      const home = byIso.get(homeIso);
      const away = byIso.get(awayIso);
      if (!home || !away) throw new Error('Selecione as duas seleções.');
      return setMatchTeams(confronto.matchId, {
        homeTeam: home.name,
        homeFlag: home.iso,
        awayTeam: away.name,
        awayFlag: away.iso,
      });
    },
    onSuccess: (result) => {
      if (result.warnings.length > 0) {
        toast.warning(`Jogo ${confronto.matchId} gravado — diverge do Anexo C`, {
          description: result.warnings.map((w) => w.message).join(' '),
        });
      } else {
        toast.success(`Jogo ${confronto.matchId}: confronto gravado.`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'bracket'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const finished = current?.status === 'finished';
  const savedMatches =
    !!current &&
    byIso.get(homeIso)?.name === current.homeTeam &&
    byIso.get(awayIso)?.name === current.awayTeam;
  const sameTeam = homeIso !== '' && homeIso === awayIso;
  const canConfirm = homeIso !== '' && awayIso !== '' && !sameTeam && !finished && !mutation.isPending;

  // Divergência ao vivo: a seleção atual difere da proposta oficial (template).
  const divergesHome = !!confronto.home && homeIso !== '' && homeIso !== confronto.home.iso;
  const divergesAway = !!confronto.away && awayIso !== '' && awayIso !== confronto.away.iso;
  const divergesFromProposal = divergesHome || divergesAway;

  return (
    <Card className={cn('border-border/60', savedMatches && 'bg-copa-pitch/[0.03]')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            #{confronto.matchId}
          </span>
          <span>
            {confronto.homeSource} <span className="text-muted-foreground/60">vs</span>{' '}
            {confronto.awaySource}
          </span>
          {confronto.note && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" /> {confronto.note}
            </span>
          )}
          {finished && (
            <span className="ml-auto inline-flex items-center gap-1 text-copa-pitch">
              <CheckCircle2 className="h-3 w-3" /> jogo finalizado
            </span>
          )}
          {!finished && savedMatches &&
            ((savedWarnings?.length ?? 0) > 0 ? (
              <span
                className="ml-auto inline-flex items-center gap-1 text-amber-600"
                title={savedWarnings!.map((w) => w.message).join(' ')}
              >
                <AlertTriangle className="h-3 w-3" /> gravado — diverge do Anexo C
              </span>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1 text-copa-pitch">
                <CheckCircle2 className="h-3 w-3" /> confronto gravado
              </span>
            ))}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <TeamSelect
            value={homeIso}
            onChange={setHomeIso}
            nations={nations}
            disabled={finished}
          />
          <span className="text-muted-foreground font-display shrink-0">×</span>
          <TeamSelect
            value={awayIso}
            onChange={setAwayIso}
            nations={nations}
            disabled={finished}
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => mutation.mutate()}
            disabled={!canConfirm}
            title={sameTeam ? 'Selecione seleções diferentes' : 'Gravar confronto'}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Confirmar
          </Button>
        </div>

        {sameTeam && (
          <p className="text-xs text-destructive">As duas seleções não podem ser iguais.</p>
        )}

        {!sameTeam && divergesFromProposal && !savedMatches && (
          <p className="text-xs text-amber-600 inline-flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            Difere da proposta oficial (template FIFA). Confirme apenas se for um ajuste
            intencional do Anexo C.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSelect({
  value,
  onChange,
  nations,
  disabled,
}: {
  value: string;
  onChange: (iso: string) => void;
  nations: NationRef[];
  disabled?: boolean;
}) {
  return (
    <div className="flex-1 flex items-center gap-2 min-w-0">
      {value && (
        <img
          src={flagUrl(value, 40)}
          alt=""
          className="h-7 w-10 rounded object-cover ring-1 ring-border shrink-0"
        />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm min-w-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-60',
        )}
      >
        <option value="">— A definir —</option>
        {nations.map((n) => (
          <option key={n.iso} value={n.iso}>
            {n.name}
          </option>
        ))}
      </select>
    </div>
  );
}
