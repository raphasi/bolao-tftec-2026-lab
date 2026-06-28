/**
 * Página Especiais (S2.5) — palpites de campeão, top 4 e artilheiro.
 *
 * Lock: GLOBAL via /api/config/specials-lock — quando travado, tudo fica readonly.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Crown, Lock, Loader2, Medal, Save, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PlayerCombobox } from '@/components/bolao/PlayerCombobox';
import {
  getMySpecials,
  getSpecialsLock,
  listGroups,
  listPlayers,
  upsertSpecials,
  type UpsertSpecialsInput,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import type { NationRef, SpecialPredictionPublic } from '@/lib/types-domain';

interface SpecialsFormState {
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  fourthPlace: string | null;
  topScorer: string;
}

const EMPTY_FORM: SpecialsFormState = {
  champion: null,
  runnerUp: null,
  thirdPlace: null,
  fourthPlace: null,
  topScorer: '',
};

const POSITIONS: Array<{
  key: keyof Omit<SpecialsFormState, 'topScorer'>;
  label: string;
  points: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { key: 'champion', label: 'Campeão', points: 150, icon: Trophy, color: 'text-copa-gold' },
  { key: 'runnerUp', label: 'Vice-campeão', points: 75, icon: Medal, color: 'text-slate-400' },
  { key: 'thirdPlace', label: '3º lugar', points: 40, icon: Award, color: 'text-amber-700' },
  { key: 'fourthPlace', label: '4º lugar', points: 40, icon: Award, color: 'text-muted-foreground' },
];

function formatLockDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export default function Especiais() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SpecialsFormState>(EMPTY_FORM);

  const lockQuery = useQuery({ queryKey: ['specials-lock'], queryFn: getSpecialsLock });
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: listGroups });
  const specialsQuery = useQuery({ queryKey: ['specials', 'mine'], queryFn: getMySpecials });
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: listPlayers });

  // Hidrata form a partir do backend
  useEffect(() => {
    const s = specialsQuery.data;
    if (!s) return;
    setForm({
      champion: s.champion,
      runnerUp: s.runnerUp,
      thirdPlace: s.thirdPlace,
      fourthPlace: s.fourthPlace,
      topScorer: s.topScorer ?? '',
    });
  }, [specialsQuery.data]);

  // 48 seleções únicas, ordenadas
  const allTeams = useMemo<NationRef[]>(() => {
    const groups = groupsQuery.data ?? [];
    const set = new Map<string, NationRef>();
    for (const g of groups) for (const t of g.teams) set.set(t.iso, t);
    return Array.from(set.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [groupsQuery.data]);

  // B1.3 fix: cada select filtra países já escolhidos nos outros slots Top4.
  // O slot atual sempre vê seu próprio pick (pra mostrar selecionado mesmo).
  const top4PickedISOs = useMemo(() => {
    return new Set(
      [form.champion, form.runnerUp, form.thirdPlace, form.fourthPlace].filter(
        (v): v is string => v !== null,
      ),
    );
  }, [form.champion, form.runnerUp, form.thirdPlace, form.fourthPlace]);

  const teamsAvailableFor = (slotKey: keyof Omit<SpecialsFormState, 'topScorer'>): NationRef[] => {
    const currentPick = form[slotKey];
    return allTeams.filter((t) => !top4PickedISOs.has(t.iso) || t.iso === currentPick);
  };

  const saveMutation = useMutation({
    mutationFn: (input: UpsertSpecialsInput) => upsertSpecials(input),
    onSuccess: (saved) => {
      toast.success('Palpite especial salvo!');
      queryClient.setQueryData<SpecialPredictionPublic>(['specials', 'mine'], saved);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const locked = lockQuery.data?.locked ?? false;
  const lockUtc = lockQuery.data?.lockUtc ?? null;
  const isLoading = lockQuery.isLoading || groupsQuery.isLoading || specialsQuery.isLoading;

  const handleSave = () => {
    saveMutation.mutate({
      champion: form.champion,
      runnerUp: form.runnerUp,
      thirdPlace: form.thirdPlace,
      fourthPlace: form.fourthPlace,
      topScorer: form.topScorer || null,
    });
  };

  const hasChanges =
    specialsQuery.data &&
    (form.champion !== specialsQuery.data.champion ||
      form.runnerUp !== specialsQuery.data.runnerUp ||
      form.thirdPlace !== specialsQuery.data.thirdPlace ||
      form.fourthPlace !== specialsQuery.data.fourthPlace ||
      form.topScorer !== (specialsQuery.data.topScorer ?? ''));

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-copa-gold/15 flex items-center justify-center ring-1 ring-copa-gold/30">
          <Trophy className="h-7 w-7 text-copa-gold" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Palpites Especiais</h1>
          <p className="text-muted-foreground mt-1">
            Campeão, top 4 e artilheiro — pontos extras.
          </p>
        </div>
      </header>

      {/* Banner de lock */}
      {!isLoading && locked && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm">
            <span className="font-medium text-destructive">Palpites travados.</span>{' '}
            <span className="text-muted-foreground">
              Lock ativado em {lockUtc ? formatLockDate(lockUtc) : '—'}.
            </span>
          </p>
        </div>
      )}
      {!isLoading && !locked && lockUtc && (
        <div className="rounded-xl border border-copa-gold/40 bg-copa-gold/5 p-4 flex items-center gap-3">
          <Lock className="h-5 w-5 text-copa-gold shrink-0" />
          <p className="text-sm">
            <span className="font-medium text-copa-gold">Travará em {formatLockDate(lockUtc)}.</span>{' '}
            <span className="text-muted-foreground">Após essa data, não poderão ser alterados.</span>
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Form */}
      {!isLoading && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Crown className="h-5 w-5 text-copa-gold" />
              Suas escolhas
            </CardTitle>
            <CardDescription>
              4 seleções para o pódio + artilheiro do torneio. Bônus de 50 pts se acertar o top 4 inteiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {POSITIONS.map(({ key, label, points, icon: Icon, color }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key} className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', color)} />
                  {label}
                  <span className="text-xs text-muted-foreground font-normal ml-auto">+{points} pts</span>
                </Label>
                <div className="flex items-center gap-2">
                  {/* preview da bandeira selecionada */}
                  {form[key] && (
                    <img
                      src={flagUrl(form[key]!, 40)}
                      alt=""
                      className="h-7 w-10 rounded object-cover ring-1 ring-border"
                    />
                  )}
                  <select
                    id={key}
                    value={form[key] ?? ''}
                    disabled={locked}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value || null }))
                    }
                    className={cn(
                      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <option value="">— Selecione —</option>
                    {teamsAvailableFor(key).map((t) => (
                      <option key={t.iso} value={t.iso}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            {/* Artilheiro */}
            <div className="space-y-1.5">
              <Label htmlFor="topScorer" className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-copa-gold" />
                Artilheiro da Chuteira de Ouro
                <span className="text-xs text-muted-foreground font-normal ml-auto">+120 pts</span>
              </Label>
              <PlayerCombobox
                id="topScorer"
                value={form.topScorer || null}
                onChange={(playerId) => setForm((f) => ({ ...f, topScorer: playerId ?? '' }))}
                players={playersQuery.data ?? []}
                loading={playersQuery.isLoading}
                disabled={locked}
                placeholder="Selecione o artilheiro..."
              />
            </div>

            {!locked && (
              <div className="flex justify-end pt-2 border-t">
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !hasChanges}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar palpites especiais
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
