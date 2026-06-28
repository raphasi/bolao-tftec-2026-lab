/**
 * Migration script (S4.5.3) — popula campo `active: true` e `updatedAt`
 * em users existentes que foram criados antes do field existir.
 *
 * Idempotente: rodar 2x não causa harm. Pula users que já têm `active` definido.
 *
 * Uso:
 *   tsx scripts/migrate-users-active.ts
 */
import { CosmosClient } from '@azure/cosmos';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../.env') });

const log = {
  info: (m: string) => console.log(`\x1b[36mℹ\x1b[0m  ${m}`),
  ok: (m: string) => console.log(`\x1b[32m✓\x1b[0m  ${m}`),
  warn: (m: string) => console.log(`\x1b[33m⚠\x1b[0m  ${m}`),
  section: (m: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${m}\x1b[0m`),
};

interface UserDoc {
  id: string;
  userId: string;
  email: string;
  active?: boolean;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const cosmos = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
  });
  const users = cosmos.database(process.env.COSMOS_DATABASE ?? 'bolao2026').container('users');

  log.section('Buscando users existentes');
  const { resources } = await users.items.query<UserDoc>('SELECT * FROM c').fetchAll();
  log.info(`Total users: ${resources.length}`);

  let updated = 0;
  let skipped = 0;

  for (const user of resources) {
    if (user.active !== undefined && user.updatedAt !== undefined) {
      skipped++;
      continue;
    }
    const nowIso = new Date().toISOString();
    await users.items.upsert<UserDoc>({
      ...user,
      active: user.active ?? true,
      updatedAt: user.updatedAt ?? user.createdAt ?? nowIso,
    });
    log.ok(`Migrated ${user.email} (active=true, updatedAt populated)`);
    updated++;
  }

  console.log('');
  log.section('Resumo');
  log.ok(`${updated} users migrados, ${skipped} já tinham fields`);
}

main().catch((err) => {
  console.error(`✗ Migration falhou: ${(err as Error).message}`);
  process.exit(1);
});
