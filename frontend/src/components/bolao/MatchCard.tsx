/**
 * Card de jogo individual com inputs de placar + lock badge.
 * Usado em Palpites.tsx e (read-only) em Perfil.tsx.
 *
 * Comportamento:
 *  - locked=true: inputs desabilitados, mostra placar predito (se existir)
 *  - locked=false: inputs editáveis, botão Salvar visível se valores diferentes
 *  - Após save: toast via parent; loading via prop isSaving
 */
import { useEffect, useState } from 'react';
import { Calendar, Loader2, MapPin, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LockedBadge } from './LockedBadge';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import { sectionLabel } from '@/lib/phases';
import type { MatchPublic, PredictionPublic } from '@/lib/types-domain';

interface MatchCardProps {
  match: MatchPublic;
  prediction?: PredictionPublic;
  onSave: (homeScore: number, awayScore: number) => void;
  isSaving?: boolean;
  readonly?: boolean;
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `${date} · ${time} BRT`;
}

export function MatchCard({ match, prediction, onSave, isSaving, readonly }: MatchCardProps) {
  // Pré-preenche com '0' quando sem prediction — assim o user vê "0 × 0" e
  // muda apenas o lado que importa (era um bug: state vazio fazia Save sumir
  // se o placar tivesse 0 em um dos lados).
  const initialHome = prediction?.predictedHome != null ? String(prediction.predictedHome) : '0';
  const initialAway = prediction?.predictedAway != null ? String(prediction.predictedAway) : '0';
  const [home, setHome] = useState<string>(initialHome);
  const [away, setAway] = useState<string>(initialAway);

  // Re-sync se prediction trocar (ex: refetch react-query)
  useEffect(() => {
    setHome(prediction?.predictedHome != null ? String(prediction.predictedHome) : '0');
    setAway(prediction?.predictedAway != null ? String(prediction.predictedAway) : '0');
  }, [prediction?.predictedHome, prediction?.predictedAway]);

  const locked = match.locked;
  const disabled = locked || readonly || isSaving;
  // Filtro "Jogos que não palpitei" (readonly + sem prediction): não mostrar
  // "0 × 0" como se fosse um palpite real — exibe um selo neutro de transparência.
  const noPrediction = readonly === true && prediction === undefined;
  // Comparar contra o valor salvo (ou 0 se ainda não salvou)
  const savedHome = prediction?.predictedHome ?? 0;
  const savedAway = prediction?.predictedAway ?? 0;
  const homeNum = Number(home);
  const awayNum = Number(away);
  const hasValidNumbers =
    home !== '' &&
    away !== '' &&
    Number.isFinite(homeNum) &&
    Number.isFinite(awayNum) &&
    homeNum >= 0 &&
    awayNum >= 0 &&
    homeNum <= 20 &&
    awayNum <= 20;
  const hasInvalidInput =
    !disabled &&
    (home !== '' || away !== '') &&
    !hasValidNumbers;
  // B1.1 fix: distingue "nunca palpitou" de "palpitou 0×0".
  // Sem isso, palpite 0×0 (empate sem gols, válido) ficava bloqueado porque
  // o default savedHome/Away=0 fazia hasChanged=false.
  const hasNeverSaved = prediction === undefined;
  const hasChanged =
    !disabled &&
    hasValidNumbers &&
    (hasNeverSaved || homeNum !== savedHome || awayNum !== savedAway);

  const handleSave = () => {
    if (!hasValidNumbers) return;
    onSave(homeNum, awayNum);
  };

  return (
    <Card className={cn('border-border/60', locked && 'opacity-70')}>
      <CardContent className="p-4 md:p-5 space-y-3">
        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            {sectionLabel(match)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatKickoff(match.kickoffUtc)}
          </span>
          {match.venue && (
            <span className="hidden md:flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {match.venue.city}, {match.venue.country}
            </span>
          )}
          <span className="ml-auto">
            <LockedBadge locked={locked} kickoffUtc={match.kickoffUtc} />
          </span>
        </div>

        {/* Times + placar */}
        <div className="flex items-center justify-between gap-3 md:gap-4">
          <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
            {match.homeFlag && (
              <img
                src={flagUrl(match.homeFlag, 80)}
                alt={match.homeTeam}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
                className="h-8 w-12 md:h-10 md:w-14 rounded object-cover ring-1 ring-border shrink-0"
              />
            )}
            <span className="font-display text-sm md:text-lg font-semibold truncate">
              {match.homeTeam}
            </span>
          </div>

          {noPrediction ? (
            <div className="flex flex-col items-center justify-center shrink-0 px-2">
              <span className="text-lg md:text-xl font-display font-bold text-muted-foreground/50">
                — × —
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                sem palpite
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="0"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                disabled={disabled}
                aria-label={`Placar ${match.homeTeam}`}
                className="w-12 md:w-14 h-10 md:h-12 text-center text-lg md:text-xl font-display font-bold"
              />
              <span className="text-muted-foreground text-lg md:text-xl">×</span>
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="0"
                value={away}
                onChange={(e) => setAway(e.target.value)}
                disabled={disabled}
                aria-label={`Placar ${match.awayTeam}`}
                className="w-12 md:w-14 h-10 md:h-12 text-center text-lg md:text-xl font-display font-bold"
              />
            </div>
          )}

          <div className="flex-1 flex items-center gap-2 md:gap-3 justify-end min-w-0">
            <span className="font-display text-sm md:text-lg font-semibold truncate text-right">
              {match.awayTeam}
            </span>
            {match.awayFlag && (
              <img
                src={flagUrl(match.awayFlag, 80)}
                alt={match.awayTeam}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
                className="h-8 w-12 md:h-10 md:w-14 rounded object-cover ring-1 ring-border shrink-0"
              />
            )}
          </div>
        </div>

        {/* Mensagem de erro: placar inválido */}
        {hasInvalidInput && (
          <p className="text-xs text-destructive pt-1 text-right" role="alert">
            Placar deve estar entre 0 e 20.
          </p>
        )}

        {/* Botão Salvar — só aparece se valor mudou e não locked */}
        {hasChanged && !readonly && (
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar palpite
            </Button>
          </div>
        )}

        {/* Pontos exibidos se já calculado */}
        {prediction?.points != null && (
          <div className="text-xs text-muted-foreground border-t pt-2 flex justify-between">
            <span>Resultado: {prediction.actualHome ?? '?'} × {prediction.actualAway ?? '?'}</span>
            <span className="font-medium text-copa-gold">+{prediction.points} pts</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
