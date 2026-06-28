/**
 * Cliente Cosmos compartilhado entre scripts.
 * Lê credenciais do .env via dotenv.
 */
import { CosmosClient, Database } from '@azure/cosmos';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Carrega .env do root do projeto (scripts/ -> ../.env)
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseName = process.env.COSMOS_DATABASE ?? 'bolao2026';

if (!endpoint || !key) {
  console.error('❌ COSMOS_ENDPOINT e COSMOS_KEY são obrigatórios.');
  console.error('   Configure-os em .env (copie de .env.example).');
  console.error('   Para extrair do Azure após o deploy Bicep:');
  console.error('   az cosmosdb show --name <conta> --resource-group rg-fifa-bolao --query documentEndpoint');
  console.error('   az cosmosdb keys list --name <conta> --resource-group rg-fifa-bolao --query primaryMasterKey');
  process.exit(1);
}

export const cosmos = new CosmosClient({
  endpoint,
  key,
  userAgentSuffix: 'fifa2026-bolao-script',
});

export const database: Database = cosmos.database(databaseName);

export { endpoint, databaseName };

/**
 * Helper pra checar se o database existe (deve existir após `az deployment`).
 */
export async function assertDatabaseExists(): Promise<void> {
  try {
    await database.read();
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 404) {
      console.error(`❌ Database "${databaseName}" não encontrado em ${endpoint}.`);
      console.error('   Rode `az deployment group create ...` primeiro para criar a infra.');
      process.exit(1);
    }
    throw err;
  }
}
