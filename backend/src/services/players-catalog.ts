/**
 * Catálogo de jogadores (artilheiro) — validação server-side dos ids.
 *
 * O dropdown do frontend é burlável via API (POST cru). Aqui garantimos que o
 * `topScorer` enviado (palpite do aluno OU gabarito do admin) é um id que existe
 * no catálogo `players`. Dataset estático → cache em memória (limpa no restart;
 * após reseed de elencos, reiniciar o app ou aguardar o TTL do cache).
 */
import { container } from './cosmos.js';
import { SEASON, type NationSquadDoc } from '../types/domain.js';

let cache: { ids: Set<string>; loadedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 min — pega reseed sem precisar reiniciar

export async function getValidPlayerIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.ids;
  const { resources } = await container('players')
    .items.query<NationSquadDoc>({
      query: 'SELECT * FROM c WHERE c.season = @s',
      parameters: [{ name: '@s', value: SEASON }],
    })
    .fetchAll();
  const ids = new Set<string>();
  for (const nation of resources) for (const p of nation.players ?? []) ids.add(p.id);
  cache = { ids, loadedAt: Date.now() };
  return ids;
}

export async function isValidPlayerId(id: string): Promise<boolean> {
  return (await getValidPlayerIds()).has(id);
}
