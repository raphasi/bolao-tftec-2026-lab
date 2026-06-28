/**
 * Rota pública GET /api/players — catálogo de jogadores para o artilheiro.
 *
 * Achata os 48 docs de seleção (container `players`) numa lista pronta pro
 * combobox, com label "Nome (Seleção)". Somente leitura, sem auth (igual groups).
 */
import { Router } from 'express';
import { container } from '../services/cosmos.js';
import { SEASON, type NationSquadDoc, type PlayerPublic } from '../types/domain.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { resources } = await container('players')
    .items.query<NationSquadDoc>({
      query: 'SELECT * FROM c WHERE c.season = @s',
      parameters: [{ name: '@s', value: SEASON }],
    })
    .fetchAll();

  const players: PlayerPublic[] = [];
  for (const nation of resources) {
    for (const p of nation.players ?? []) {
      players.push({
        id: p.id,
        name: p.name,
        iso: nation.iso,
        nation: nation.name,
        label: `${p.name} (${nation.name})`,
      });
    }
  }
  players.sort(
    (a, b) => a.nation.localeCompare(b.nation, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'),
  );

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ players, count: players.length });
});

export { router as playersRouter };
