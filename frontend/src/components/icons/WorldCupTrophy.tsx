/**
 * Taça estilizada genérica — design original próprio.
 * NÃO copia o trofeu FIFA oficial. Inspiração: silhueta clássica de troféu
 * de futebol com alças laterais e base.
 */
interface WorldCupTrophyProps {
  className?: string;
}

export function WorldCupTrophy({ className = 'h-6 w-6' }: WorldCupTrophyProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Taça da Copa"
      role="img"
    >
      {/* Alças laterais */}
      <path
        d="M9 8H5a2 2 0 0 0-2 2v3a4 4 0 0 0 4 4h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <path
        d="M23 8h4a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.15"
      />

      {/* Copo principal */}
      <path
        d="M9 4h14v9a7 7 0 0 1-14 0V4z"
        fill="currentColor"
        fillOpacity="0.85"
      />

      {/* Detalhe brilho no copo */}
      <path
        d="M11 6v5a4 4 0 0 0 2 3.5"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* Estrela decorativa no copo */}
      <path
        d="M16 8l0.9 1.8 2 0.3-1.45 1.4 0.35 2L16 12.6l-1.8 0.95 0.35-2L13.1 10.1l2-0.3z"
        fill="white"
        opacity="0.6"
      />

      {/* Pescoço */}
      <path d="M13 20h6v3h-6z" fill="currentColor" />

      {/* Base */}
      <rect x="10" y="23" width="12" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="8" y="25.5" width="16" height="3" rx="0.5" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}
