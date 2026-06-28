/**
 * Function: aggregate-leaderboard (S3.3)
 *
 * Trigger: Cosmos Change Feed do container 'predictions' OU 'specials'.
 * Cada vez que predictions.points OU specials.points muda, recalcula o
 * leaderboard agregando totalPoints, matchPoints, specialPoints,
 * predictionsCount, perfectScores por user.
 *
 * Estratégia: para cada doc no batch, identifica userId e recalcula APENAS
 * o leaderboard daquele user (não recalcula todo mundo). Eficiente.
 *
 * Esta function tem 2 triggers (registramos a mesma handler 2x com leases
 * diferentes).
 */
import { app, type CosmosDBv4FunctionOptions, type InvocationContext } from '@azure/functions';
import pLimit from 'p-limit';
import { container } from '../shared/cosmos.js';
import type {
  LeaderboardDoc,
  PredictionDoc,
  SpecialPredictionDoc,
  UserDoc,
} from '../shared/types.js';
import { SEASON } from '../shared/types.js';

// S4.6 (E-3): paralelismo controlado pra batch grande de users
// Limit 5 concurrent — evita spike de RU no Cosmos
const PARALLEL_LIMIT = 5;

async function recalcUser(userId: string, context: InvocationContext): Promise<void> {
  // Buscar user pra pegar userName
  const usersContainer = container('users');
  const { resource: user } = await usersContainer.item(userId, userId).read<UserDoc>();
  if (!user) {
    context.log(`User ${userId} não encontrado, pulando leaderboard recalc`);
    return;
  }

  // Busca TODOS os palpites do user (não só os pontuados) pra separar
  // processados (jogo encerrado + pontuado) de pendentes (jogo ainda não encerrado).
  const predictions = container('predictions');
  const { resources: userPredictions } = await predictions.items
    .query<PredictionDoc>({
      query: 'SELECT * FROM c WHERE c.userId = @uid',
      parameters: [{ name: '@uid', value: userId }],
    })
    .fetchAll();

  const scored = userPredictions.filter((p) => p.points != null);
  const matchPoints = scored.reduce((sum, p) => sum + (p.points ?? 0), 0);
  const predictionsCount = scored.length; // processados (compat: mantém o sentido anterior)
  const pendingCount = userPredictions.length - scored.length; // não processados
  // Placar exato = 25 pts (ver scoring.ts; usado no critério de desempate)
  const perfectScores = scored.filter((p) => p.points === 25).length;

  // Sum specialPoints
  const specials = container('specials');
  let specialPoints = 0;
  try {
    const docId = `${userId}_${SEASON}`;
    const { resource: spec } = await specials.item(docId, userId).read<SpecialPredictionDoc>();
    if (spec) {
      specialPoints =
        spec.points.champion +
        spec.points.runnerUp +
        spec.points.thirdPlace +
        spec.points.fourthPlace +
        spec.points.topScorer +
        spec.points.top4Bonus;
    }
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }

  // Upsert leaderboard doc
  const totalPoints = matchPoints + specialPoints;
  const leaderboard = container('leaderboard');
  const doc: LeaderboardDoc = {
    id: `${SEASON}_${userId}`,
    season: SEASON,
    userId,
    userName: user.name,
    totalPoints,
    matchPoints,
    specialPoints,
    predictionsCount,
    pendingCount,
    perfectScores,
    rank: null, // rank é computado server-side no GET /leaderboard
    createdAt: user.createdAt, // critério terciário de desempate
    lastUpdated: new Date().toISOString(),
  };
  await leaderboard.items.upsert(doc);

  context.log(
    `User ${user.name} (${userId.slice(0, 8)}...) → total=${totalPoints} (match=${matchPoints}, special=${specialPoints}, perfect=${perfectScores})`,
  );
}

async function aggregateHandler(
  documents: unknown,
  context: InvocationContext,
): Promise<void> {
  const docs = Array.isArray(documents) ? (documents as { userId?: string }[]) : [];
  if (docs.length === 0) return;

  // Dedupe userIds afetados
  const userIds = new Set<string>();
  for (const d of docs) {
    if (typeof d.userId === 'string') userIds.add(d.userId);
  }

  context.log(`Aggregating leaderboard for ${userIds.size} affected users (concurrency=${PARALLEL_LIMIT})`);

  const limit = pLimit(PARALLEL_LIMIT);
  const tasks = Array.from(userIds).map((uid) => limit(() => recalcUser(uid, context)));
  await Promise.all(tasks);

  context.log(`Leaderboard aggregation complete (${userIds.size} users processed in parallel)`);
}

// Trigger 1: predictions changefeed
const predictionsOptions: CosmosDBv4FunctionOptions = {
  connection: 'AzureWebJobsCosmosDBConnection',
  databaseName: process.env.COSMOS_DATABASE ?? 'bolao2026',
  containerName: 'predictions',
  leaseContainerName: 'leases-aggregate-predictions',
  createLeaseContainerIfNotExists: false,
  startFromBeginning: false,
  handler: aggregateHandler,
};

// Trigger 2: specials changefeed
const specialsOptions: CosmosDBv4FunctionOptions = {
  connection: 'AzureWebJobsCosmosDBConnection',
  databaseName: process.env.COSMOS_DATABASE ?? 'bolao2026',
  containerName: 'specials',
  leaseContainerName: 'leases-aggregate-specials',
  createLeaseContainerIfNotExists: false,
  startFromBeginning: false,
  handler: aggregateHandler,
};

app.cosmosDB('aggregate-from-predictions', predictionsOptions);
app.cosmosDB('aggregate-from-specials', specialsOptions);
