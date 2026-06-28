/**
 * E2E palpitar flow (S4.4 — flow 3).
 */
import { test, expect } from '@playwright/test';
import { registerViaApi, uniqueEmail } from './helpers';

test('F3: user cadastrado palpita match via API', async ({ request }) => {
  // Setup: cria user
  const user = await registerViaApi(request, uniqueEmail('e2e-palpitar'));

  // POST palpite via API (UI testada via screenshot em outros flows)
  const resp = await request.post('/api/predictions', {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { matchId: 50, predictedHome: 2, predictedAway: 1 },
  });
  expect(resp.status()).toBe(201);
  const body = (await resp.json()) as { prediction: { matchId: number; predictedHome: number } };
  expect(body.prediction.matchId).toBe(50);
  expect(body.prediction.predictedHome).toBe(2);

  // GET palpites confirma persistência
  const listResp = await request.get('/api/predictions', {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  const list = (await listResp.json()) as { count: number; predictions: Array<{ matchId: number }> };
  expect(list.count).toBe(1);
  expect(list.predictions[0].matchId).toBe(50);

  // DELETE palpite
  const delResp = await request.delete('/api/predictions/50', {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(delResp.status()).toBe(204);

  // Confirmar removido
  const finalResp = await request.get('/api/predictions', {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  const final = (await finalResp.json()) as { count: number };
  expect(final.count).toBe(0);
});
