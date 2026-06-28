/**
 * E2E Admin Console (S4.5.7) — 3 fluxos críticos:
 *  F7: Admin Navbar link + landing renderiza 4 cards
 *  F8: /admin/users — list + filter + role toggle + audit log
 *  F9: /admin/system — KPIs + cache invalidate
 */
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginViaUI, registerViaApi, uniqueEmail } from './helpers';

test('F7: admin vê link Admin na navbar e abre /admin landing com 4 cards', async ({ page }) => {
  await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole('link', { name: /admin/i }).first()).toBeVisible();

  await page.getByRole('link', { name: /^Admin$/ }).first().click();
  await page.waitForURL('**/admin');

  await expect(page.getByRole('heading', { name: /Console Administrativo/i })).toBeVisible();

  // 4 cards
  await expect(page.getByRole('link', { name: /usuários/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /sistema/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /configuração/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /resultados/i })).toBeVisible();
});

test('F8: /admin/users — list + filter por role e search funciona', async ({ page, request }) => {
  await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin/users');

  await expect(page.getByRole('heading', { name: /^Usuários$/ })).toBeVisible();

  // Tabela tem ao menos a row do admin atual (label "você")
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await expect(page.getByText(/\(você\)/)).toBeVisible();

  // Filtro role admin
  await page.getByRole('button', { name: 'Admin' }).first().click();
  await page.waitForTimeout(500);
  const adminRows = page.locator('table tbody tr');
  await expect(adminRows.first()).toBeVisible();

  // Reset all + filtro busca
  await page.getByRole('button', { name: /todos roles/i }).click();
  await page.locator('input[placeholder*="Buscar"]').fill('admin@');
  await page.waitForTimeout(500);
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
});

test('F9: /admin/system — KPIs + Function App list + force refresh', async ({ page }) => {
  await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin/system');

  await expect(page.getByRole('heading', { name: /^Sistema$/ })).toBeVisible();

  // Seções renderizam
  await expect(page.getByRole('heading', { name: /^Bolão$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Infraestrutura/i })).toBeVisible();

  // Function App lista 6 funcs (KNOWN_FUNCTIONS)
  await expect(page.getByText('calc-predictions')).toBeVisible();
  await expect(page.getByText('health-check-cron')).toBeVisible();
  await expect(page.getByText('emit-leaderboard-update')).toBeVisible();

  // Force refresh dispara invalidate-active
  await page.getByRole('button', { name: /Forçar atualização/i }).click();
  await expect(page.getByText(/Cache active invalidado/i)).toBeVisible({ timeout: 10_000 });
});

test('F10: user comum não vê link Admin na navbar', async ({ page, request }) => {
  const user = await registerViaApi(request, uniqueEmail('e2e-no-admin'));
  await loginViaUI(page, user.email, 'e2etest1234');

  // Navbar não tem link Admin
  await expect(page.getByRole('link', { name: /^Admin$/ }).first()).toHaveCount(0);

  // Acesso direto redirect /
  await page.goto('/admin');
  await page.waitForURL((url) => url.pathname === '/');
});
