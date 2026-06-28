/**
 * Function: calc-predictions (S3.2)
 *
 * Trigger: Cosmos Change Feed do container 'matches-cache'.
 * Quando admin marca match como 'finished', esta function:
 *   1. Detecta o doc atualizado (status='finished' E pointsCalculatedAt nulo)
 *   2. Query predictions WHERE matchId = doc.matchId
 *   3. Para cada prediction: calcula points (25/15/0), seta actualHome/actualAway
 *   4. Update match.pointsCalculatedAt = now (idempotência)
 *
 * Idempotência: pointsCalculatedAt evita reprocessar. Admin re-editar resultado
 * reseta o campo no backend route → dispara recálculo aqui.
 */
import { app, type CosmosDBv4FunctionOptions, type InvocationContext } from '@azure/functions';
import { container } from '../shared/cosmos.js';
import { calcMatchPoints } from '../shared/scoring.js';
import type { MatchCacheDoc, PredictionDoc } from '../shared/types.js';

async function calcPredictionsHandler(
  documents: unknown,
  context: InvocationContext,
): Promise<void> {
  const docs = Array.isArray(documents) ? (documents as MatchCacheDoc[]) : [];
  if (docs.length === 0) {
    context.log('No documents in changefeed batch');
    return;
  }

  context.log(`Processing ${docs.length} match doc(s) from changefeed`);
  const matches = container('matches-cache');
  const predictions = container('predictions');

  for (const match of docs) {
    // Skip se não finalizado OU sem scores
    if (match.status !== 'finished' || match.homeScore == null || match.awayScore == null) {
      context.log(`Match ${match.matchId} skipped (status=${match.status}, scores=${match.homeScore}/${match.awayScore})`);
      continue;
    }

    // Skip se já calculado E não foi re-editado (pointsCalculatedAt >= finishedAt seria mais robusto)
    if (match.pointsCalculatedAt) {
      context.log(`Match ${match.matchId} já calculado em ${match.pointsCalculatedAt}, pulando`);
      continue;
    }

    context.log(
      `Calculating points for match ${match.matchId}: ${match.homeTeam} ${match.homeScore}×${match.awayScore} ${match.awayTeam}`,
    );

    // Query predictions deste match (cross-partition por matchId)
    const { resources: relevantPredictions } = await predictions.items
      .query<PredictionDoc>({
        query: 'SELECT * FROM c WHERE c.matchId = @id',
        parameters: [{ name: '@id', value: match.matchId }],
      })
      .fetchAll();

    context.log(`Found ${relevantPredictions.length} predictions for match ${match.matchId}`);

    let updated = 0;
    for (const p of relevantPredictions) {
      const points = calcMatchPoints(
        { home: p.predictedHome, away: p.predictedAway },
        { home: match.homeScore, away: match.awayScore },
      );

      const updatedPrediction: PredictionDoc = {
        ...p,
        actualHome: match.homeScore,
        actualAway: match.awayScore,
        points,
        updatedAt: new Date().toISOString(),
      };
      await predictions.items.upsert(updatedPrediction);
      updated++;
    }

    // Marca match como calculado
    const nowIso = new Date().toISOString();
    await matches.items.upsert<MatchCacheDoc>({
      ...match,
      pointsCalculatedAt: nowIso,
    });

    context.log(
      `Match ${match.matchId} done: ${updated} predictions scored, pointsCalculatedAt=${nowIso}`,
    );
  }
}

const options: CosmosDBv4FunctionOptions = {
  connection: 'AzureWebJobsCosmosDBConnection',
  databaseName: process.env.COSMOS_DATABASE ?? 'bolao2026',
  containerName: 'matches-cache',
  leaseContainerName: 'leases-calc',
  createLeaseContainerIfNotExists: false,
  startFromBeginning: false,
  handler: calcPredictionsHandler,
};

app.cosmosDB('calc-predictions', options);
