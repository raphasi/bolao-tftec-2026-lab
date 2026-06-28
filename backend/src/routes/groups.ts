/**
 * Rotas de grupos (S2.2 — API groups).
 *  - GET /api/groups        lista 12 grupos da fase de grupos
 *  - GET /api/groups/:code  1 grupo (A..L)
 *
 * Dados servidos do container Cosmos 'groups' (populado por seed-cosmos.ts).
 */
import { Router } from 'express';
import { z } from 'zod';
import { container } from '../services/cosmos.js';
import { NotFoundError } from '../utils/http-errors.js';
import {
  SEASON,
  type GroupDoc,
  type GroupPublic,
} from '../types/domain.js';

const router = Router();

function toPublic(doc: GroupDoc): GroupPublic {
  return {
    code: doc.code,
    teams: doc.teams,
  };
}

// ---------------------------------------------------------------------------
// GET /api/groups  (público)
// ---------------------------------------------------------------------------
router.get('/', async (_req, res) => {
  const groups = container('groups');

  const { resources } = await groups.items
    .query<GroupDoc>({
      query: 'SELECT * FROM c WHERE c.season = @season ORDER BY c.code',
      parameters: [{ name: '@season', value: SEASON }],
    })
    .fetchAll();

  res.json({ groups: resources.map(toPublic), count: resources.length });
});

// ---------------------------------------------------------------------------
// GET /api/groups/:code  (público)
// ---------------------------------------------------------------------------
const codeParamSchema = z.object({
  code: z
    .string()
    .regex(/^[A-L]$/i, 'groupCode deve ser A-L')
    .transform((s) => s.toUpperCase()),
});

router.get('/:code', async (req, res) => {
  const { code } = codeParamSchema.parse(req.params);
  const groups = container('groups');

  // id determinístico: `${SEASON}_${code}`, PK = season
  const docId = `${SEASON}_${code}`;
  try {
    const { resource } = await groups.item(docId, SEASON).read<GroupDoc>();
    if (!resource) {
      throw new NotFoundError(`Grupo ${code} não encontrado`);
    }
    res.json({ group: toPublic(resource) });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) {
      throw new NotFoundError(`Grupo ${code} não encontrado`);
    }
    throw err;
  }
});

export { router as groupsRouter };
