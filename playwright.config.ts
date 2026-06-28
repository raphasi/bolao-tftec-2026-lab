/**
 * Playwright E2E config (S4.4).
 *
 * Suite roda contra ambiente live por padrão.
 * Override BASE_URL via env: BASE_URL=http://localhost:5173 npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app-fifa-bolao-tftec01.azurewebsites.net';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,        // workers=1 — admin único, evita race
  workers: 1,
  retries: 2,                  // tolera cold start Y1 Function
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,  // cold start tolerance
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
