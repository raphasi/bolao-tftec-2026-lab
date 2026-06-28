/**
 * Bola de futebol estilizada — design original próprio.
 * NÃO copia bola oficial Adidas. Padrão genérico preto-branco com pentágonos.
 */
interface SoccerBallProps {
  className?: string;
}

export function SoccerBall({ className = 'h-6 w-6' }: SoccerBallProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Bola de futebol"
      role="img"
    >
      {/* Esfera externa */}
      <circle cx="16" cy="16" r="14" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.5" />

      {/* Pentágono central preto */}
      <path
        d="M16 9.5 L20.5 12.5 L18.8 17.5 L13.2 17.5 L11.5 12.5 Z"
        fill="currentColor"
        fillOpacity="0.85"
      />

      {/* Triângulos brancos ao redor (conexões) */}
      {/* topo */}
      <path
        d="M16 9.5 L16 4 L20.5 6.5 L20.5 12.5 Z"
        fill="currentColor"
        fillOpacity="0.0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5 L16 4 L11.5 6.5 L11.5 12.5 Z"
        fill="currentColor"
        fillOpacity="0.0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* lateral direita */}
      <path
        d="M20.5 12.5 L26 12 L25 17 L18.8 17.5 Z"
        fill="currentColor"
        fillOpacity="0.0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* lateral esquerda */}
      <path
        d="M11.5 12.5 L6 12 L7 17 L13.2 17.5 Z"
        fill="currentColor"
        fillOpacity="0.0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* base */}
      <path
        d="M13.2 17.5 L18.8 17.5 L20 23 L16 25.5 L12 23 Z"
        fill="currentColor"
        fillOpacity="0.0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Pequenos pentágonos pretos nos extremos */}
      <circle cx="16" cy="4" r="1.5" fill="currentColor" fillOpacity="0.7" />
      <circle cx="6" cy="12" r="1.2" fill="currentColor" fillOpacity="0.7" />
      <circle cx="26" cy="12" r="1.2" fill="currentColor" fillOpacity="0.7" />
      <circle cx="12" cy="23" r="1.2" fill="currentColor" fillOpacity="0.7" />
      <circle cx="20" cy="23" r="1.2" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}
