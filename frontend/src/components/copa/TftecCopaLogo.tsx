import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-5 w-auto', // footer (~20px tall)
  md: 'h-8 w-auto', // navbar (~32px)
  lg: 'h-14 w-auto', // login/register card header (~56px)
};

interface TftecCopaLogoProps {
  /** Tamanho visual do logo. Mapeia para height + width-auto preserva aspect ratio. */
  size?: Size;
  /** Classes extras (ex.: `opacity-60`, hover effects). */
  className?: string;
}

/**
 * Logo oficial **TFTEC Copa do Mundo Azure** (branco sobre transparente).
 *
 * Substitui o antigo `<span className="tftec-mark">` (genérico TFTEC Cloud) nos
 * pontos de uso do app — Story 9.1. Pensado para fundos escuros (dark-first).
 *
 * @see frontend/public/copa/tftec-copa-logo.png
 */
export function TftecCopaLogo({ size = 'md', className }: TftecCopaLogoProps) {
  return (
    <img
      src="/copa/tftec-copa-logo.png"
      alt="TFTEC Prime — Copa do Mundo Azure"
      loading="eager"
      decoding="async"
      className={cn(SIZE_CLASSES[size], className)}
    />
  );
}
