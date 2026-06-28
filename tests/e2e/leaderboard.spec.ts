/**
 * E2E leaderboard flow (S4.4 — flow 4).
 * Público — não exige login.
 */
import { test, expect } from '@playwright/test';

test('F4: leaderboard público renderiza sem erro', async ({ page }) => {
  const response = await page.goto('/leaderboard');
  // SPA serve 200
  expect(response?.status()).toBe(200);

  // Header sempre presente (acessível por role)
  await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible({ timeout: 10_000 });

  // Página não está quebrada — sem texto de erro
  const errorText = await page.locator('text=/erro|failed|cannot/i').first().isVisible().catch(() => false);
  expect(errorText).toBe(false);
});

test('F4b: GET /api/leaderboard retorna ranking', async ({ request }) => {
  const resp = await request.get('/api/leaderboard');
  expect(resp.ok()).toBeTruthy();
  const body = (await resp.json()) as { ranking: Array<{ rank: number; totalPoints: number }>; count: number };
  expect(typeof body.count).toBe('number');
  expect(Array.isArray(body.ranking)).toBe(true);
  // Se houver entries, primeiro deve ter rank=1
  if (body.ranking.length > 0) {
    expect(body.ranking[0].rank).toBe(1);
  }
});
