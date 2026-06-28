#!/usr/bin/env node
/**
 * download-flags.cjs — Baixa as 48 bandeiras WC2026 do flagcdn pra frontend/public/flags/.
 *
 * Roda como parte do build do frontend (ver frontend/package.json scripts).
 * Idempotente: skip arquivos que já existem com tamanho >0.
 *
 * Resolve bug recorrente de bandeiras sumirem (Service Worker cache de fonte externa
 * intermitente). Self-host elimina dependência runtime do flagcdn.com.
 *
 * Source dos iso codes: frontend/src/lib/flags.ts (sincronizado manualmente).
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

// Espelho das 48 ISO codes em frontend/src/lib/flags.ts
// Se mudar lá, atualizar aqui (e vice-versa).
const ISO_CODES = [
  // Hosts
  'us', 'ca', 'mx',
  // CONMEBOL
  'br', 'ar', 'uy', 'co', 'ec', 'py',
  // UEFA
  'es', 'fr', 'gb-eng', 'de', 'pt', 'nl', 'be', 'hr', 'ch', 'at', 'no',
  'gb-sct', 'tr', 'ba', 'se', 'cz',
  // AFC
  'jp', 'kr', 'ir', 'au', 'sa', 'uz', 'jo', 'qa',
  // CAF
  'ma', 'sn', 'dz', 'tn', 'eg', 'gh', 'ci', 'cv', 'za',
  // CONCACAF (além hosts)
  'pa', 'ht', 'cw',
  // OFC
  'nz',
  // Playoff
  'cd', 'iq',
];

const SIZES = [40, 80, 160];
const OUTPUT_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'flags');
const BASE_URL = 'https://flagcdn.com';

function download(url, filepath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const stream = fs.createWriteStream(filepath);
      res.pipe(stream);
      stream.on('finish', () => stream.close(() => resolve()));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const size of SIZES) {
    for (const iso of ISO_CODES) {
      const filename = `${iso}-w${size}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);

      // Idempotente: skip se já existe e tem conteúdo
      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
        skipped++;
        continue;
      }

      const url = `${BASE_URL}/w${size}/${iso}.png`;
      try {
        await download(url, filepath);
        downloaded++;
        process.stdout.write(`  ✓ ${filename}\n`);
      } catch (err) {
        failed++;
        // Cleanup arquivo parcial
        try { fs.unlinkSync(filepath); } catch { /* ignore */ }
        process.stderr.write(`  ✗ ${filename}: ${err.message}\n`);
      }
    }
  }

  console.log(`\nFlags download: ${downloaded} novos, ${skipped} pulados, ${failed} falhas.`);
  console.log(`Total esperado: ${ISO_CODES.length} × ${SIZES.length} = ${ISO_CODES.length * SIZES.length}`);
  console.log(`Dir: ${OUTPUT_DIR}`);

  if (failed > 0) {
    console.error('\n✗ Algumas bandeiras falharam — verificar logs acima.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
