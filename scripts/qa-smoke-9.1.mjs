/**
 * QA Smoke - Story 9.1 Visual Copa 2026 Refresh
 * Headless Playwright smoke against local dev server.
 * Run: BASE_URL=http://localhost:5173 node scripts/qa-smoke-9.1.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = 'docs/qa/screenshots/9.1';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text() }); });
page.on('pageerror', (err) => { consoleErrors.push({ url: page.url(), text: `PAGE ERROR: ${err.message}` }); });

const failedRequests = [];
page.on('requestfailed', (req) => { failedRequests.push({ url: req.url(), failure: req.failure()?.errorText }); });

const results = [];

async function smoke(path, name, assertions) {
  console.log(`\n=> ${path}`);
  const errBefore = consoleErrors.length;
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const checks = await assertions();
  const newErrs = consoleErrors.slice(errBefore);
  results.push({ path, name, checks, errors: newErrs });
  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
  if (newErrs.length) console.log(`  !! ${newErrs.length} console errors`);
}

await smoke('/', 'home', async () => ({
  'title contains TFTEC Prime': (await page.title()).includes('TFTEC Prime'),
  'h1 contains TFTEC Prime': await page.locator('h1').first().innerText().then((t) => t.includes('TFTEC Prime')),
  'navbar logo loaded': await page.locator('img[src="/copa/tftec-copa-logo.png"]').first().isVisible(),
  'mascotes visible': await page.locator('img[src="/copa/mascotes.webp"]').isVisible(),
  'mascotes heading': await page.locator('h2:has-text("mascotes")').isVisible(),
  'taca in Campeao card': await page.locator('img[src="/copa/taca.webp"][alt="Taça FIFA World Cup"]').isVisible(),
}));

await smoke('/login', 'login', async () => ({
  'logo lg in card header': await page.locator('img[src="/copa/tftec-copa-logo.png"]').first().isVisible(),
  'Entrar heading': await page.locator('text=Entrar').first().isVisible(),
}));

await smoke('/register', 'register', async () => ({
  'logo lg in card header': await page.locator('img[src="/copa/tftec-copa-logo.png"]').first().isVisible(),
  'Criar conta heading': await page.locator('text=Criar conta').first().isVisible(),
}));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const footerCheck = {
  'footer TFTEC Prime': await page.locator('footer:has-text("TFTEC Prime")').isVisible(),
  'footer small logo': await page.locator('footer img[src="/copa/tftec-copa-logo.png"]').isVisible(),
};
results.push({ path: '/ (footer)', name: 'footer', checks: footerCheck, errors: [] });
console.log('\n=> footer');
for (const [k, v] of Object.entries(footerCheck)) console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);

await browser.close();

const allChecks = results.flatMap((r) => Object.entries(r.checks));
const passed = allChecks.filter(([, v]) => v).length;
const total = allChecks.length;
const allErrs = results.flatMap((r) => r.errors).concat(failedRequests.map((f) => ({ url: f.url, text: `REQUEST FAILED: ${f.failure}` })));

console.log(`\n=== Summary ===`);
console.log(`Checks: ${passed}/${total} passed`);
console.log(`Console/request errors: ${allErrs.length}`);
if (allErrs.length) allErrs.forEach((e, i) => console.log(`  [${i + 1}] ${e.url}: ${e.text}`));
console.log(`Screenshots: ${OUT}/`);

process.exit(passed === total && allErrs.length === 0 ? 0 : 1);
