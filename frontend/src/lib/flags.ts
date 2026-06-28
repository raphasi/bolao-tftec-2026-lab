/**
 * 48 seleções classificadas para a FIFA World Cup 2026 (USA/Canadá/México).
 * Atualizado em 2026-05-11 (Story S2.1 — Dataset oficial FIFA 2026).
 *
 * Fonte: FIFA Final Draw, Las Vegas, 2025-12-05.
 * Verificada via Wikipedia "2026 FIFA World Cup qualification" e páginas
 * dos grupos individuais.
 *
 * Distribuição por confederação:
 *   Hosts (3):       USA, Canadá, México
 *   CONMEBOL (6):    América do Sul
 *   UEFA (16):       Europa
 *   AFC (8):         Ásia
 *   CAF (9):         África
 *   CONCACAF (3):    além dos 3 hosts
 *   OFC (1):         Oceania
 *   Playoff inter-confederação (2)
 *   Total = 48
 *
 * Bandeiras via flagcdn.com (CC0). Códigos ISO 3166-1 lowercase + casos
 * especiais Reino Unido (gb-eng, gb-sct).
 *
 * Histórico:
 *   - S1.6: 30→48 países baseado em copas históricas (com erros).
 *   - S2.1: corrigido para 48 reais do sorteio de Las Vegas.
 *     Removidos: Itália, Dinamarca, Polônia, Gales, Costa Rica, Venezuela, Bolívia.
 *     Adicionados: Czech, Bósnia, Escócia, Suécia, Catar, Curaçao, RD Congo.
 */
export interface FlagRef {
  iso: string;
  name: string;
  region: 'hosts' | 'uefa' | 'conmebol' | 'afc' | 'caf' | 'concacaf' | 'ofc' | 'playoff';
}

export const WORLD_CUP_2026_FLAGS: FlagRef[] = [
  // ───── Hosts 2026 (3) ─────
  { iso: 'us', name: 'Estados Unidos', region: 'hosts' },
  { iso: 'ca', name: 'Canadá', region: 'hosts' },
  { iso: 'mx', name: 'México', region: 'hosts' },

  // ───── CONMEBOL — América do Sul (6) ─────
  { iso: 'br', name: 'Brasil', region: 'conmebol' },
  { iso: 'ar', name: 'Argentina', region: 'conmebol' },
  { iso: 'uy', name: 'Uruguai', region: 'conmebol' },
  { iso: 'co', name: 'Colômbia', region: 'conmebol' },
  { iso: 'ec', name: 'Equador', region: 'conmebol' },
  { iso: 'py', name: 'Paraguai', region: 'conmebol' },

  // ───── UEFA — Europa (16) ─────
  { iso: 'es', name: 'Espanha', region: 'uefa' },
  { iso: 'fr', name: 'França', region: 'uefa' },
  { iso: 'gb-eng', name: 'Inglaterra', region: 'uefa' },
  { iso: 'de', name: 'Alemanha', region: 'uefa' },
  { iso: 'pt', name: 'Portugal', region: 'uefa' },
  { iso: 'nl', name: 'Países Baixos', region: 'uefa' },
  { iso: 'be', name: 'Bélgica', region: 'uefa' },
  { iso: 'hr', name: 'Croácia', region: 'uefa' },
  { iso: 'ch', name: 'Suíça', region: 'uefa' },
  { iso: 'at', name: 'Áustria', region: 'uefa' },
  { iso: 'no', name: 'Noruega', region: 'uefa' },
  { iso: 'gb-sct', name: 'Escócia', region: 'uefa' },
  { iso: 'tr', name: 'Turquia', region: 'uefa' },
  { iso: 'ba', name: 'Bósnia e Herzegovina', region: 'uefa' },
  { iso: 'se', name: 'Suécia', region: 'uefa' },
  { iso: 'cz', name: 'República Tcheca', region: 'uefa' },

  // ───── AFC — Ásia (8) ─────
  { iso: 'jp', name: 'Japão', region: 'afc' },
  { iso: 'kr', name: 'Coreia do Sul', region: 'afc' },
  { iso: 'ir', name: 'Irã', region: 'afc' },
  { iso: 'au', name: 'Austrália', region: 'afc' },
  { iso: 'sa', name: 'Arábia Saudita', region: 'afc' },
  { iso: 'uz', name: 'Uzbequistão', region: 'afc' },
  { iso: 'jo', name: 'Jordânia', region: 'afc' },
  { iso: 'qa', name: 'Catar', region: 'afc' },

  // ───── CAF — África (9) ─────
  { iso: 'ma', name: 'Marrocos', region: 'caf' },
  { iso: 'sn', name: 'Senegal', region: 'caf' },
  { iso: 'dz', name: 'Argélia', region: 'caf' },
  { iso: 'tn', name: 'Tunísia', region: 'caf' },
  { iso: 'eg', name: 'Egito', region: 'caf' },
  { iso: 'gh', name: 'Gana', region: 'caf' },
  { iso: 'ci', name: 'Costa do Marfim', region: 'caf' },
  { iso: 'cv', name: 'Cabo Verde', region: 'caf' },
  { iso: 'za', name: 'África do Sul', region: 'caf' },

  // ───── CONCACAF — além dos 3 hosts (3) ─────
  { iso: 'pa', name: 'Panamá', region: 'concacaf' },
  { iso: 'ht', name: 'Haiti', region: 'concacaf' },
  { iso: 'cw', name: 'Curaçao', region: 'concacaf' },

  // ───── OFC — Oceania (1) ─────
  { iso: 'nz', name: 'Nova Zelândia', region: 'ofc' },

  // ───── Playoff inter-confederação (2) ─────
  { iso: 'cd', name: 'RD Congo', region: 'playoff' },
  { iso: 'iq', name: 'Iraque', region: 'playoff' },
];

/**
 * URL da bandeira em tamanho específico (S7.4 — self-host).
 *
 * Antes: https://flagcdn.com/w{N}/{iso}.png (dependência externa, sumia intermitente)
 * Agora: /flags/{iso}-w{N}.png (servido pelo próprio app, precached pelo SW)
 *
 * Tamanhos disponíveis: 40, 80, 160 (gerados via scripts/download-flags.cjs).
 * 320/640 mantidos no tipo mas caem no fallback 160 — usar 160 e deixar CSS scaler.
 *
 * @param iso código ISO 3166 lowercase (ex: 'br', 'gb-eng')
 * @param width largura em px (40, 80, 160)
 */
export function flagUrl(iso: string, width: 40 | 80 | 160 | 320 | 640 = 80): string {
  // Fallback pra 160 se pedirem tamanhos maiores (não temos esses arquivos).
  const w = width <= 40 ? 40 : width <= 80 ? 80 : 160;
  return `/flags/${iso}-w${w}.png`;
}
