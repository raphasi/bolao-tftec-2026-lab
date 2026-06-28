/**
 * Rotação de senha do admin
 * ==========================
 * Troca APENAS a senha do usuário admin no Cosmos DB, sem tocar em nenhum
 * outro documento. Pensado para a troca da senha padrão (`TFTEC@2026!`) em
 * PRODUÇÃO antes de abrir a aplicação ao público.
 *
 * Diferente do seed (que faz upsert de tudo e é idempotente sobre os dados),
 * este script lê o doc do admin, recalcula o `passwordHash` (bcrypt) com a nova
 * senha e regrava SÓ esse doc — preservando id/userId/role/createdAt.
 *
 * A nova senha é lida de env (NÃO de argumento, pra não vazar no histórico do
 * shell). O script nunca imprime a senha nem o hash.
 *
 * Uso (PowerShell):
 *   $env:NEW_ADMIN_PASSWORD = 'SuaSenhaForte!'
 *   npm run rotate-admin -- --dry-run    # mostra o que faria, sem gravar
 *   npm run rotate-admin                 # aplica
 *   Remove-Item Env:\NEW_ADMIN_PASSWORD  # limpa a senha da sessão
 *
 * Pré-requisitos: COSMOS_ENDPOINT / COSMOS_KEY no .env apontando pra PROD e o
 * firewall do Cosmos liberado pro IP da máquina que roda o script.
 */
import bcrypt from 'bcryptjs';
import { database, assertDatabaseExists, endpoint, databaseName } from './lib/cosmos-client.js';
import type { UserDocument } from './lib/cosmos-types.js';

// O doc do admin pode ganhar `updatedAt` (não está no tipo base, é schemaless).
type AdminDoc = UserDocument & { updatedAt?: string };

// ---------------------------------------------------------------------------
// CLI flags / config via env
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@bolao.tftec.com.br';
const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD ?? '';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? '10');
const DEFAULT_PASSWORD = 'TFTEC@2026!';

// ---------------------------------------------------------------------------
// Helpers de logging (mesmo estilo do seed)
// ---------------------------------------------------------------------------
const log = {
  info:    (msg: string) => console.log(`\x1b[36mℹ\x1b[0m  ${msg}`),
  ok:      (msg: string) => console.log(`\x1b[32m✓\x1b[0m  ${msg}`),
  warn:    (msg: string) => console.log(`\x1b[33m⚠\x1b[0m  ${msg}`),
  error:   (msg: string) => console.log(`\x1b[31m✗\x1b[0m  ${msg}`),
  section: (msg: string) => console.log(`\n\x1b[1m\x1b[35m▸ ${msg}\x1b[0m`),
};

// ---------------------------------------------------------------------------
// Validação da nova senha (falha cedo, antes de tocar no Cosmos)
// ---------------------------------------------------------------------------
function validatePassword(pwd: string): void {
  const problems: string[] = [];
  if (!pwd) problems.push('NEW_ADMIN_PASSWORD não definida (export antes de rodar).');
  if (pwd && pwd.length < 12) problems.push('senha muito curta (mínimo 12 caracteres).');
  if (pwd === DEFAULT_PASSWORD) problems.push('a nova senha é igual ao padrão público — escolha outra.');
  if (pwd && !/[a-z]/.test(pwd)) problems.push('inclua ao menos uma letra minúscula.');
  if (pwd && !/[A-Z]/.test(pwd)) problems.push('inclua ao menos uma letra maiúscula.');
  if (pwd && !/[0-9]/.test(pwd)) problems.push('inclua ao menos um número.');
  if (pwd && !/[^A-Za-z0-9]/.test(pwd)) problems.push('inclua ao menos um caractere especial.');
  if (!Number.isInteger(BCRYPT_ROUNDS) || BCRYPT_ROUNDS < 8 || BCRYPT_ROUNDS > 14) {
    problems.push(`BCRYPT_ROUNDS inválido (${process.env.BCRYPT_ROUNDS}) — use 8..14.`);
  }
  if (problems.length > 0) {
    log.error('Não foi possível continuar:');
    for (const p of problems) log.error(`  • ${p}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('\n\x1b[1m🔐 Bolão TFTEC Cloud — Rotação de senha do admin\x1b[0m');
  console.log(`   Modo: ${dryRun ? 'DRY-RUN (não grava)' : 'APLICAR'}\n`);

  validatePassword(NEW_PASSWORD);

  log.section('Pre-flight');
  log.info(`Endpoint:  ${endpoint}`);
  log.info(`Database:  ${databaseName}`);
  log.info(`Admin:     ${ADMIN_EMAIL}`);
  await assertDatabaseExists();
  log.ok('Database encontrado');

  const users = database.container('users');
  const { resources } = await users.items
    .query<AdminDoc>({
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: ADMIN_EMAIL }],
    })
    .fetchAll();

  if (resources.length === 0) {
    log.error(`Nenhum usuário com email ${ADMIN_EMAIL} encontrado. Abortando.`);
    process.exit(1);
  }
  if (resources.length > 1) {
    log.error(`Mais de um usuário com email ${ADMIN_EMAIL} (${resources.length}) — situação inesperada. Abortando.`);
    process.exit(1);
  }

  const admin = resources[0];
  if (admin.role !== 'admin') {
    log.warn(`O usuário ${ADMIN_EMAIL} tem role "${admin.role}" (esperado "admin"). Prosseguindo mesmo assim.`);
  }
  log.ok(`Admin encontrado (id=${admin.id}, role=${admin.role})`);

  const usingDefault = await bcrypt.compare(DEFAULT_PASSWORD, admin.passwordHash);
  log.info(`Senha atual é o padrão público? ${usingDefault ? 'SIM — rotação recomendada' : 'não'}`);

  const nowIso = new Date().toISOString();
  const newHash = await bcrypt.hash(NEW_PASSWORD, BCRYPT_ROUNDS);

  if (dryRun) {
    log.section('Dry-run');
    log.info('Mudanças que SERIAM aplicadas (nada foi gravado):');
    log.info(`  • passwordHash → novo hash bcrypt (rounds=${BCRYPT_ROUNDS})`);
    log.info(`  • updatedAt    → ${nowIso}`);
    log.info('  • demais campos (id, userId, email, name, role, createdAt) preservados');
    log.ok('Dry-run concluído. Rode sem --dry-run para aplicar.');
    return;
  }

  log.section('Aplicando');
  const updated: AdminDoc = { ...admin, passwordHash: newHash, updatedAt: nowIso };
  // PK do container users é /userId.
  await users.item(admin.id, admin.userId).replace(updated);
  log.ok('Documento do admin regravado.');

  // Verificação: relê e confere que a nova senha bate (e que nada além disso mudou).
  const { resource: check } = await users.item(admin.id, admin.userId).read<AdminDoc>();
  if (!check) {
    log.error('Falha ao reler o doc do admin após a gravação. Verifique manualmente.');
    process.exit(1);
  }
  const matches = await bcrypt.compare(NEW_PASSWORD, check.passwordHash);
  if (!matches) {
    log.error('VERIFICAÇÃO FALHOU: a nova senha não confere com o hash gravado. NÃO confie nesta troca — investigue.');
    process.exit(1);
  }

  log.section('Resumo');
  log.ok('Senha do admin trocada e verificada com sucesso.');
  log.warn('Próximos passos manuais:');
  console.log(`
   1. Testar login real: POST /api/auth/login com ${ADMIN_EMAIL} + nova senha → espera 200 + token.
   2. Atualizar o App Settings SEED_ADMIN_PASSWORD (ou o secret no Key Vault) na PROD,
      para um eventual re-seed futuro NÃO reverter a senha pro padrão.
   3. Atualizar o .env local (SEED_ADMIN_PASSWORD) se for usar este ambiente.
   4. Limpar a env temporária: Remove-Item Env:\\NEW_ADMIN_PASSWORD
   5. Fechar o firewall do Cosmos (remover a regra de IP temporária).
  `);
}

main().catch((err) => {
  log.error(`Rotação falhou: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
