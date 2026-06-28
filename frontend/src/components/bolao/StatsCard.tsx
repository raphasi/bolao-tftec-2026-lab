/**
 * Card de estatística reutilizável (S3.6).
 */
import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'gold' | 'pitch' | 'purple' | 'muted';
  hint?: string;
}

const COLOR_STYLES = {
  gold: { bg: 'bg-copa-gold/10', text: 'text-copa-gold', ring: 'ring-copa-gold/30' },
  pitch: { bg: 'bg-copa-pitch/10', text: 'text-copa-pitch', ring: 'ring-copa-pitch/30' },
  purple: { bg: 'bg-brand-purple/10', text: 'text-brand-purple', ring: 'ring-brand-purple/30' },
  muted: { bg: 'bg-muted/40', text: 'text-foreground', ring: 'ring-border' },
} as const;

export function StatsCard({ label, value, icon: Icon, color = 'muted', hint }: StatsCardProps) {
  const style = COLOR_STYLES[color];
  return (
    <div
      className={cn(
        'rounded-lg p-3 ring-1 flex items-center gap-3',
        style.bg,
        style.ring,
      )}
    >
      <Icon className={cn('h-6 w-6 shrink-0', style.text)} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn('font-display text-2xl font-bold leading-tight', style.text)}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
