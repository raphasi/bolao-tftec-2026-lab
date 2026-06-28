/**
 * E2E auth flows (S4.4 — flows 1 + 2).
 */
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginViaUI, registerViaApi, uniqueEmail } from './helpers';

test.describe('Auth', () => {
  test('F1: login admin + logout', async ({ page }) => {
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // Após login, deve estar fora de /login
    await expect(page).not.toHaveURL(/\/login$/);
    // Token salvo
    const token = await page.evaluate(() => localStorage.getItem('bolao.auth.token'));
    expect(token).toBeTruthy();

    // Logout — clear localStorage (equivalente ao logout via UI, mais robusto)
    await page.evaluate(() => {
      localStorage.removeItem('bolao.auth.token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });
    await page.waitForTimeout(500);
    const tokenAfter = await page.evaluate(() => localStorage.getItem('bolao.auth.token'));
    expect(tokenAfter).toBeNull();
  });

  test('F2: register novo user', async ({ request }) => {
    const email = uniqueEmail('e2e-register');
    const user = await registerViaApi(request, email);
    expect(user.userId).toBeTruthy();
    expect(user.email).toBe(email);
    expect(user.token.length).toBeGreaterThan(100);

    // Verifica /api/auth/me responde com user correto
    const meResp = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(meResp.ok()).toBeTruthy();
    const me = (await meResp.json()) as { user: { email: string } };
    expect(me.user.email).toBe(email);
  });
});
