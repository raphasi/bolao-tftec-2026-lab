/**
 * E2E admin flows (S4.4 — flows 5 + 6).
 */
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, registerViaApi, uniqueEmail } from './helpers';

test('F5: admin acessa /admin/results e lista jogos', async ({ request }) => {
  // Login admin via API
  const loginResp = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const { token } = (await loginResp.json()) as { token: string };
  expect(token).toBeTruthy();

  // GET /api/admin/matches retorna 72 jogos com campos admin
  const matchesResp = await request.get('/api/admin/matches', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(matchesResp.ok()).toBeTruthy();
  const body = (await matchesResp.json()) as {
    count: number;
    matches: Array<{ matchId: number; locked: boolean; pointsCalculatedAt: string | null }>;
  };
  expect(body.count).toBe(72);
  // Campos admin-only presentes
  expect('pointsCalculatedAt' in body.matches[0]).toBe(true);
  expect('locked' in body.matches[0]).toBe(true);

  // Filtro status=scheduled
  const filteredResp = await request.get('/api/admin/matches?status=scheduled', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(filteredResp.ok()).toBeTruthy();
});

test('F6: user comum recebe 403 em /admin/*', async ({ request }) => {
  const user = await registerViaApi(request, uniqueEmail('e2e-403'));

  // GET /api/admin/matches → 403
  const r1 = await request.get('/api/admin/matches', {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(r1.status()).toBe(403);

  // PUT /api/admin/config/specials-lock → 403
  const r2 = await request.put('/api/admin/config/specials-lock', {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { lockUtc: null },
  });
  expect(r2.status()).toBe(403);

  // PUT /api/admin/matches/:id/result → 403
  const r3 = await request.put('/api/admin/matches/1/result', {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { homeScore: 1, awayScore: 0 },
  });
  expect(r3.status()).toBe(403);
});
