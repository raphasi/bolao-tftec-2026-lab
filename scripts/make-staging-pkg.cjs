#!/usr/bin/env node
/**
 * make-staging-pkg.cjs — Gera package.json minimal para staging deploy.
 *
 * Resolve a classe de bug em que deploy.sh/deploy-functions.sh tinham um package.json
 * hardcoded e novas deps adicionadas ao workspace eram esquecidas → prod crash com
 * ERR_MODULE_NOT_FOUND (PR #5 com p-limit, PR #9 com @azure/identity).
 *
 * Uso:
 *   node scripts/make-staging-pkg.cjs <workspaceDir> <outputDir> [--name N] [--main M]
 *
 * Extrai do <workspaceDir>/package.json:
 *   - name (overridável via --name)
 *   - version, type, engines (passthrough)
 *   - main (overridável via --main; útil quando staging tem layout diferente do workspace)
 *   - scripts.start derivado de main como `node <main>`
 *   - dependencies (NÃO devDependencies)
 *   - private: true (sempre)
 *
 * Escreve em <outputDir>/package.json (cria dir se necessário).
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    'Uso: node scripts/make-staging-pkg.cjs <workspaceDir> <outputDir> [--name <name>] [--main <path>]',
  );
  process.exit(1);
}

const [workspaceDir, outputDir] = args;
let nameOverride = null;
let mainOverride = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--name') nameOverride = args[++i];
  else if (args[i] === '--main') mainOverride = args[++i];
  else {
    console.error(`Argumento desconhecido: ${args[i]}`);
    process.exit(1);
  }
}

const srcPath = path.resolve(workspaceDir, 'package.json');
if (!fs.existsSync(srcPath)) {
  console.error(`✗ ${srcPath} não encontrado`);
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));

const main = mainOverride ?? src.main ?? null;

const minimal = {
  name: nameOverride ?? src.name,
  version: src.version ?? '0.1.0',
  private: true,
  type: src.type ?? 'module',
  ...(main && { main, scripts: { start: `node ${main}` } }),
  dependencies: src.dependencies ?? {},
  ...(src.engines && { engines: src.engines }),
};

fs.mkdirSync(outputDir, { recursive: true });
const outPath = path.join(outputDir, 'package.json');
fs.writeFileSync(outPath, JSON.stringify(minimal, null, 2) + '\n');

const depCount = Object.keys(minimal.dependencies).length;
console.log(`✓ Staging package.json: ${outPath} (${depCount} prod deps de ${path.relative(process.cwd(), srcPath)})`);
