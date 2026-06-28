/**
 * Helpers compartilhados pra E2E Bolão (S4.4).
 */
import type { Page, APIRequestContext } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@bolao.tftec.com.br';
export const ADMIN_PASSWORD = 'TFTEC@2026!';

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/**
 * Login via UI — preenche form e aguarda navegação.
 */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  await page.locator('button[type="submit"]').click();
  // Aguarda redirect (não volta pra /login)
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

/**
 * Register via API — retorna token + userId (cleanup mais rápido que UI).
 */
export async function registerViaApi(
  request: APIRequestContext,
  email: string,
  password = 'e2etest1234',
  name = 'E2E User',
): Promise<{ token: string; userId: string; email: string }> {
  const resp = await request.post('/api/auth/register', {
    data: { email, password, name },
  });
  if (!resp.ok()) {
    throw new Error(`Register failed ${resp.status()}: ${await resp.text()}`);
  }
  const body = (await resp.json()) as { token: string; user: { userId: string; email: string } };
  return { token: body.token, userId: body.user.userId, email: body.user.email };
}

/**
 * Cleanup user de teste via Cosmos REST (DELETE não exposed na API).
 * NOTA: requer COSMOS_KEY env var; usado apenas localmente — não em CI.
 * Fallback: deixa user "lixo" (idempotente, próxima execução cria novo).
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  // Sem API DELETE exposed — users de teste ficam acumulados.
  // Mitigação: emails prefix 'e2e-' permite cleanup em batch via script separado.
  void userId;
}
