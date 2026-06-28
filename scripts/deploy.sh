#!/usr/bin/env bash
# =============================================================================
# Deploy do Bolão TFTEC Cloud — método DEFINITIVO (Run-From-Package)
# =============================================================================
# Validado em 2026-05-11 (Sprint S1.6). Resolve 100% dos bugs de rsync/Oryx
# que travaram o deploy anterior por 7+ horas.
#
# Por que Run-From-Package:
#   - App Service Linux Node + ESM strict resolver exige que cada arquivo
#     em node_modules esteja íntegro
#   - Oryx faz rsync de /tmp/zipdeploy/extracted → wwwroot que perde
#     arquivos pequenos em deep trees (ex: node_modules/zod/package.json)
#   - WEBSITE_RUN_FROM_PACKAGE=1 monta o zip como filesystem read-only
#     em /home/data/SitePackages/, sem extract, sem rsync, sem corrupção
#
# Uso:
#   ./scripts/deploy.sh [--skip-build]
#
# Tempo esperado: 5-8 min (vs 30-40 min do método antigo)
# Documentação completa: docs/deploy-runbook.md
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="${TMPDIR:-/tmp}/bolao-deploy-staging"
ZIP="${TMPDIR:-/tmp}/bolao-deploy.zip"
# Parametrizável via env (fork/aluno). Sem env, mantém os nomes de produção.
RG="${RG:-rg-fifa-bolao}"
APP="${APP:-app-fifa-bolao-tftec01}"
URL="https://${APP}.azurewebsites.net"
# Smoke valida pela BORDA (Front Door, ADR-021) quando SMOKE_BASE_URL é setado —
# em prod as Web Apps são isoladas (só-AFD), então o host direto dá 403. Sem o
# env (self-host dos alunos, sem AFD) usa o host direto.
SMOKE_URL="${SMOKE_BASE_URL:-$URL}"

SKIP_BUILD=false
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
done

log() { echo -e "\033[36m▸ $1\033[0m"; }
ok()  { echo -e "\033[32m✓ $1\033[0m"; }
err() { echo -e "\033[31m✗ $1\033[0m" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 1. Build production
# -----------------------------------------------------------------------------
if [ "$SKIP_BUILD" = false ]; then
  log "[1/7] Build production"
  cd "$ROOT"
  # S6.2: API-ONLY. Frontend vai para o Web App dedicado via
  # scripts/deploy-frontend-webapp.sh. server.ts auto-detecta ausência
  # de frontend/dist e serve apenas /api.
  npm run build --workspace=backend
  ok "Build OK (backend / API-only)"
else
  log "[1/7] skip-build"
fi

# -----------------------------------------------------------------------------
# 2-3. Staging com node_modules pré-instalado
# -----------------------------------------------------------------------------
log "[2/7] Staging em $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING/backend/dist"

# package.json staging gerado AUTOMATICAMENTE de backend/package.json
# (elimina classe de bug de dep esquecida — ver feedback_staging_packagejson.md)
node "$ROOT/scripts/make-staging-pkg.cjs" "$ROOT/backend" "$STAGING" \
  --name fifa2026-bolao --main backend/dist/server.js

cp -r "$ROOT/backend/dist/." "$STAGING/backend/dist/"
cp "$ROOT/backend/package.json" "$STAGING/backend/"
# S6.2: NÃO copia frontend/dist — API-only. server.ts → apenas /api.
ok "Files staged (API-only)"

log "[3/7] npm install --omit=dev no staging"
cd "$STAGING"
npm install --omit=dev --no-audit --no-fund --silent
count=$(ls node_modules | wc -l)
[ "$count" -ge 170 ] || err "Esperava 170+ pkgs, instalou $count"
ok "$count packages instalados"

# -----------------------------------------------------------------------------
# 4. Zip Linux-compatible (forward-slash POSIX paths)
# -----------------------------------------------------------------------------
log "[4/7] Zip Linux-compatible via Node archiver"
cd "$ROOT"
node scripts/make-zip.cjs "$STAGING" "$ZIP"
# grep -c exits 1 on zero matches → use { ... || true; } para evitar exit 1 cascading
backslash_count=$(unzip -l "$ZIP" 2>/dev/null | { grep -c '\\\\' || true; })
[ "$backslash_count" = "0" ] || err "Zip tem paths com backslash. Use Node archiver, NÃO PowerShell."
ok "Zip OK ($(stat -c%s "$ZIP") bytes, forward-slash POSIX)"

# -----------------------------------------------------------------------------
# 5. Habilitar Run-From-Package (essencial — single source of truth)
# -----------------------------------------------------------------------------
log "[5/7] Habilitar WEBSITE_RUN_FROM_PACKAGE=1 + desabilitar Oryx"
az webapp config appsettings set \
  --resource-group "$RG" --name "$APP" \
  --settings WEBSITE_RUN_FROM_PACKAGE=1 \
             SCM_DO_BUILD_DURING_DEPLOYMENT=false \
             ENABLE_ORYX_BUILD=false \
  --query "[?name=='WEBSITE_RUN_FROM_PACKAGE'].value" -o tsv >/dev/null
ok "Run-From-Package ativo, Oryx desabilitado"

# -----------------------------------------------------------------------------
# 6. Deploy via az (zip vai pra /home/data/SitePackages/, mounted read-only)
# -----------------------------------------------------------------------------
log "[6/7] az webapp deploy --type zip --async"
az webapp deploy --resource-group "$RG" --name "$APP" \
  --src-path "$ZIP" --type zip --async true 2>&1 | tail -3 || err "az deploy falhou"

log "Aguardando startup probe (~2 min — Run-From-Package monta zip)..."
sleep 120
ok "Warmup completo"

# -----------------------------------------------------------------------------
# 7. Smoke tests live
# -----------------------------------------------------------------------------
log "[7/7] Smoke tests live"
pass=0; fail=0
check() {
  if [ "$3" = "$2" ]; then
    echo "  ✓ $1 → $3"
    pass=$((pass+1))
  else
    echo "  ✗ $1 → $3 (esperava $2)"
    fail=$((fail+1))
  fi
}

check "/api/health"       "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 $SMOKE_URL/api/health)"
check "/api/health/full"  "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 $SMOKE_URL/api/health/full)"
check "/api/missing"      "404" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 $SMOKE_URL/api/missing)"
# Valida que o endpoint de auth está vivo e rejeita credenciais inválidas (401),
# sem depender de credenciais específicas — funciona em qualquer self-host.
check "POST /auth/login (401 p/ creds inválidas)" "401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST -H 'Content-Type: application/json' -d '{"email":"smoke@invalid.local","password":"invalid"}' $SMOKE_URL/api/auth/login)"
# S6.2: API-only — a raiz NÃO deve servir o SPA. Só vale no host DIRETO da API;
# pela borda same-origin (AFD) a raiz serve o SPA do frontend (200), então o
# check só roda sem SMOKE_BASE_URL (self-host direto).
if [ -z "${SMOKE_BASE_URL:-}" ]; then
  check "/ (API-only → 404)" "404" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 $URL/)"
fi

echo
[ $fail -eq 0 ] && ok "DEPLOY SUCCESS (API-only) — $pass checks PASS — $SMOKE_URL" \
                || err "$fail smoke falharam (passou $pass)"
