/**
 * useNow — relógio compartilhado que re-renderiza quem assina a cada 1s.
 *
 * Um único setInterval global serve todos os assinantes (ex.: dezenas de
 * LockedBadge), evitando N timers independentes. O timer só roda enquanto
 * houver pelo menos um componente montado usando o hook.
 */
import { useEffect, useState } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    for (const l of listeners) l();
  }, 1000);
}

/** Retorna `Date.now()` atualizado a cada segundo (tick compartilhado). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const listener: Listener = () => setNow(Date.now());
    listeners.add(listener);
    ensureTimer();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return now;
}
