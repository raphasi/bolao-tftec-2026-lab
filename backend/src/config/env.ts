/**
 * Centraliza leitura e validação de variáveis de ambiente.
 * Falha rápido se alguma variável obrigatória estiver faltando.
 */
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Carrega .env localizado em backend/.env OU ../.env (root)
loadEnv();
loadEnv({ path: '../.env' });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Cosmos DB
  COSMOS_ENDPOINT: z.string().url(),
  COSMOS_KEY: z.string().min(20),
  COSMOS_DATABASE: z.string().default('bolao2026'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),

  // Integração com main app.
  // preprocess: trata string vazia como ausente. No self-host esse campo é
  // opcional e o aluno pode deixar em branco; sem isto, um MAIN_API_BASE_URL=""
  // (app setting vazio) falharia em .url() e derrubaria o boot ("Application Error").
  MAIN_API_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),

  // SignalR (opcional no dev)
  SIGNALR_CONNECTION_STRING: z.string().optional(),

  // Observability
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  // Resource ID do App Insights component (S5.2) — quando set, /admin/system queries observability.
  // Formato: /subscriptions/{sub}/resourceGroups/{rg}/providers/microsoft.insights/components/{name}
  // Em prod requer Managed Identity do App Service + role "Monitoring Reader" no recurso.
  APPINSIGHTS_RESOURCE_ID: z.string().optional(),

  // Rate limiting.
  // O limiter GLOBAL chaveia por IP; atrás do Front Door a turma sai por 1 IP
  // (NAT) → a sala inteira soma no MESMO balde. Default 100/min derrubava a
  // sala (429 em massa) na estreia. 5000/min cobre ~300 alunos ativos
  // (~15 req/min cada) com folga; o WAF de borda faz o rate-limit per-IP-real.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5000),

  // CORS
  CORS_ORIGINS: z.string().default('*'),
});

export type AppEnv = z.infer<typeof schema>;

function parseEnv(): AppEnv {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Variáveis de ambiente inválidas:');
    for (const issue of result.error.issues) {
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\nCopie backend/.env.example para backend/.env e ajuste os valores.');
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
