/**
 * Marquee horizontal de bandeiras das seleções.
 * Anima scroll lento usando CSS animation (sem JS).
 * Bandeiras carregadas via flagcdn.com (CC0).
 */
import { WORLD_CUP_2026_FLAGS, flagUrl, type FlagRef } from '@/lib/flags';
import { cn } from '@/lib/utils';

interface FlagMarqueeProps {
  flags?: FlagRef[];
  className?: string;
}

export function FlagMarquee({ flags = WORLD_CUP_2026_FLAGS, className }: FlagMarqueeProps) {
  // Duplica a lista pra criar loop infinito sem gap visual.
  const doubled = [...flags, ...flags];

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        // Máscara de fade nas pontas pra suavizar entrada/saída
        '[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]',
        className,
      )}
      aria-label="Bandeiras das seleções da Copa 2026"
    >
      <div className="flex gap-6 animate-marquee whitespace-nowrap py-1">
        {doubled.map((f, i) => (
          <img
            key={`${f.iso}-${i}`}
            src={flagUrl(f.iso, 80)}
            alt={f.name}
            title={f.name}
            className="h-8 w-12 rounded-sm object-cover shrink-0 ring-1 ring-border/30"
            loading="lazy"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
