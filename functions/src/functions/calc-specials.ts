/**
 * Function: calc-specials (S3.3)
 *
 * Trigger: Cosmos Change Feed do container 'config'.
 * Quando admin grava 'tournament-final', esta function:
 *   1. Detecta o doc com id='tournament-final'
 *   2. Lê resultado real (champion, top4, topScorer)
 *   3. Para cada doc em 'specials': calcula 5 pontos + bonus top4
 *   4. Upsert specials doc com points populado
 */
import { app, type CosmosDBv4FunctionOptions, type InvocationContext } from '@azure/functions';
import { container } from '../shared/cosmos.js';
import { calcSpecialsBase, calcTop4Bonus } from '../shared/scoring.js';
import type { SpecialPredictionDoc, TournamentFinalConfigDoc } from '../shared/types.js';

async function calcSpecialsHandler(
  documents: unknown,
  context: InvocationContext,
): Promise<void> {
  const docs = Array.isArray(documents) ? (documents as unknown[]) : [];
  if (docs.length === 0) return;

  // Filtra apenas docs com id='tournament-final'
  const tournamentDocs = docs.filter(
    (d): d is TournamentFinalConfigDoc =>
      typeof d === 'object' && d !== null && (d as { id?: string }).id === 'tournament-final',
  );

  if (tournamentDocs.length === 0) {
    context.log('No tournament-final doc in batch, skipping');
    return;
  }

  const tournament = tournamentDocs[tournamentDocs.length - 1]; // pega o mais recente do batch
  context.log(
    `Tournament final: champion=${tournament.value.champion}, topScorer=${tournament.value.topScorer}`,
  );

  const actual = {
    champion: tournament.value.champion,
    runnerUp: tournament.value.runnerUp,
    thirdPlace: tournament.value.thirdPlace,
    fourthPlace: tournament.value.fourthPlace,
    topScorer: tournament.value.topScorer,
  };

  // Query TODOS os specials (cross-partition)
  const specials = container('specials');
  const { resources: allSpecials } = await specials.items
    .query<SpecialPredictionDoc>({ query: 'SELECT * FROM c' })
    .fetchAll();

  context.log(`Processing ${allSpecials.length} specials docs`);

  let updated = 0;
  for (const s of allSpecials) {
    const guess = {
      champion: s.champion,
      runnerUp: s.runnerUp,
      thirdPlace: s.thirdPlace,
      fourthPlace: s.fourthPlace,
      topScorer: s.topScorer,
    };
    const base = calcSpecialsBase(guess, actual);
    const top4Bonus = calcTop4Bonus(guess, actual);

    const updatedDoc: SpecialPredictionDoc = {
      ...s,
      points: {
        ...base,
        top4Bonus,
      },
      updatedAt: new Date().toISOString(),
    };
    await specials.items.upsert(updatedDoc);
    updated++;
  }

  context.log(`Specials scoring complete: ${updated} docs updated`);
}

const options: CosmosDBv4FunctionOptions = {
  connection: 'AzureWebJobsCosmosDBConnection',
  databaseName: process.env.COSMOS_DATABASE ?? 'bolao2026',
  containerName: 'config',
  leaseContainerName: 'leases-specials',
  createLeaseContainerIfNotExists: false,
  startFromBeginning: false,
  handler: calcSpecialsHandler,
};

app.cosmosDB('calc-specials', options);
