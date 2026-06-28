/**
 * Badge visual de lock status.
 * - locked=true  → "Palpite finalizado" (vermelho)
 * - locked=false → "Palpite finaliza em …" (verde) baseado no kickoff
 */
import { Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';

interface LockedBadgeProps {
  locked: boolean;
  kickoffUtc?: string;
  className?: string;
}

const LOCK_OFFSET_MS = 30 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Formata o tempo até a trava (kickoff - 30min) a partir de `nowMs`.
 * - >= 1 dia  → "Palpite finaliza em Xd Xh"
 * - >= 1 hora → "Palpite finaliza em Xh Xm"
 * - < 1 hora  → "Palpite finaliza em MM:SS" (countdown vivo)
 * - <= 0      → "Palpite finalizando…" (servidor ainda vai confirmar o lock)
 */
function formatTimeUntilLock(kickoffUtc: string | undefined, nowMs: number): string | null {
  if (!kickoffUtc) return null;
  const kickoffMs = Date.parse(kickoffUtc);
  if (!Number.isFinite(kickoffMs)) return null;
  const lockMs = kickoffMs - LOCK_OFFSET_MS;
  const diffMs = lockMs - nowMs;
  if (diffMs <= 0) return 'Palpite finalizando…';

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `Palpite finaliza em ${days}d ${hours}h`;
  if (hours > 0) return `Palpite finaliza em ${hours}h ${pad(mins)}m`;
  return `Palpite finaliza em ${pad(mins)}:${pad(secs)}`;
}

export function LockedBadge({ locked, kickoffUtc, className }: LockedBadgeProps) {
  // Tick compartilhado: re-renderiza a cada 1s pro countdown andar sozinho
  // (hook chamado incondicionalmente, como exige o React).
  const now = useNow();

  if (locked) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md',
          'bg-destructive/15 text-destructive ring-1 ring-destructive/30',
          className,
        )}
      >
        <Lock className="h-3 w-3" />
        Palpite finalizado
      </span>
    );
  }

  const countdown = formatTimeUntilLock(kickoffUtc, now);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md',
        'bg-copa-pitch/15 text-copa-pitch ring-1 ring-copa-pitch/30',
        className,
      )}
    >
      <Unlock className="h-3 w-3" />
      {countdown ?? 'Aberto'}
    </span>
  );
}
