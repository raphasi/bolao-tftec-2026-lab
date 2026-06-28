#!/usr/bin/env bash
# =============================================================================
# Deploy ISOLADO do FRONTEND (SPA) — Web App dedicado (S6.2 / ADR-020 / Epic S6)
# =============================================================================
# v2 — micro-servidor Express (abandona `pm2 serve`, que falhou sob
# WEBSITE_RUN_FROM_PACKAGE: worker não subia). Ver post-mortem em
# docs/epic-hardening-rede-adr020.md.
#
# Pacote: server.js + package.json + node_modules/express + dist/  (raiz do zip).
# Startup no App Service: `node server.js` (node sempre no PATH; lê $PORT).
#
# ISOLADO: publica APENAS no Web App de frontend. NÃO toca o app de API,
# NÃO altera deploy.yml. O site live (single-app) segue intacto durante a
# validação — esta é a pré-condição do post-mortem (provar o front isolado
# ANTES de qualquer cutover).
#
# Uso: ./scripts/deploy-frontend-webapp.sh [--skip-build]
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="${TMPDIR:-/tmp}/bolao-frontend-staging"
ZIP="${TMPDIR:-/tmp}/bolao-frontend.zip"
RG="${AZURE_RG:-rg-fifa-bolao}"
FRONTEND_APP="${FRONTEND_APP:-app-fifa-bolao-web-tftec01}"
API_APP="${API_APP:-app-fifa-bolao-tftec01}"
API_BASE="${VITE_API_BASE_URL:-https://${API_APP}.azurewebsites.net/api}"
URL="https://${FRONTEND_APP}.azurewebsites.net"
# Smoke valida pela BORDA (Front Door, ADR-021) quando SMOKE_BASE_URL é setado —
# em prod o Web App é isolado (só-AFD) e o host direto dá 403. Sem o env
# (self-host dos alunos, sem AFD) usa o host direto.
SMOKE_URL="${SMOKE_BASE_URL:-$URL}"

SKIP_BUILD=false
for arg in "$@"; do [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true; done

log() { echo -e "\033[36m▸ $1\033[0m"; }
ok()  { echo -e "\033[32m✓ $1\033[0m"; }
err() { echo -e "\033[31m✗ $1\033[0m" >&2; exit 1; }

# 1. Build do frontend com a URL ABSOLUTA da API embutida
if [ "$SKIP_BUILD" = false ]; then
  log "[1/6] Build frontend (VITE_API_BASE_URL=$API_BASE)"
  cd "$ROOT"
  VITE_API_BASE_URL="$API_BASE" npm run build --workspace=frontend
  ok "Build OK"
else
  log "[1/6] skip-build"
fi
[ -f "$ROOT/frontend/dist/index.html" ] || err "frontend/dist/index.html ausente — build falhou?"

# Guard same-origin (SOR-05): num build /api relativo (cutover atrás do Front
# Door, ADR-021), o bundle NÃO pode conter a URL absoluta da API — senão o SPA
# chamaria o backend direto, furando o WAF, e o smoke (só status) não pegaria.
case "$API_BASE" in
  /*)
    if grep -rqs 'azurewebsites\.net/api' "$ROOT/frontend/dist/assets" 2>/dev/null; then
      err "Build same-origin (API_BASE=$API_BASE) mas o bundle tem URL absoluta '*.azurewebsites.net/api' — fura o WAF. Abortei."
    fi
    ok "Guard same-origin OK (bundle sem URL absoluta da API)"
    ;;
esac

# 2. Staging: server.js + package.json + dist/  (raiz, sem pasta-mãe)
log "[2/6] Staging em $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING/dist"
cp "$ROOT/frontend-server/server.js" "$STAGING/"
cp "$ROOT/frontend-server/package.json" "$STAGING/"
cp -r "$ROOT/frontend/dist/." "$STAGING/dist/"
ok "Files staged"

# 3. node_modules/express pré-instalado no staging (Run-From-Package = sem npm no destino)
log "[3/6] npm install --omit=dev (express) no staging"
cd "$STAGING"
npm install --omit=dev --no-audit --no-fund --silent
[ -f "$STAGING/node_modules/express/package.json" ] || err "express não instalado no staging"
ok "express instalado"

# 4. Zip POSIX forward-slash (mesma garantia do deploy.sh)
log "[4/6] Zip Linux-compatible via Node archiver"
cd "$ROOT"
node scripts/make-zip.cjs "$STAGING" "$ZIP"
backslash_count=$(unzip -l "$ZIP" 2>/dev/null | { grep -c '\\\\' || true; })
[ "$backslash_count" = "0" ] || err "Zip com backslash. Use Node archiver."
ok "Zip OK ($(stat -c%s "$ZIP") bytes)"

# 5. Startup command (node server.js — NÃO pm2) + Run-From-Package + deploy
log "[5/6] Startup 'node server.js' + Always On + WEBSITE_RUN_FROM_PACKAGE=1 + deploy"
# --always-on true: sem isso o app esfria e dá cold-start (HTTP 000 nos
# primeiros hits) — inaceitável quando vira o site live (achado pré-cutover).
az webapp config set --resource-group "$RG" --name "$FRONTEND_APP" \
  --startup-file "node server.js" --always-on true -o none
az webapp config appsettings set --resource-group "$RG" --name "$FRONTEND_APP" \
  --settings WEBSITE_RUN_FROM_PACKAGE=1 SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false \
  -o none
az webapp deploy --resource-group "$RG" --name "$FRONTEND_APP" \
  --src-path "$ZIP" --type zip --async true 2>&1 | tail -3 || err "az deploy falhou"
log "Aguardando startup (~90s)..."
sleep 90
ok "Warmup completo"

# 6. Smoke: health-probe + SPA + fallback de rota
log "[6/6] Smoke tests live"
pass=0; fail=0
check() { if [ "$3" = "$2" ]; then echo "  ✓ $1 → $3"; pass=$((pass+1)); else echo "  ✗ $1 → $3 (esperava $2)"; fail=$((fail+1)); fi; }

check "/healthz"                   "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 $SMOKE_URL/healthz)"
check "/ (SPA)"                    "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 $SMOKE_URL/)"
check "/leaderboard (SPA fallback)" "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 $SMOKE_URL/leaderboard)"
check "/index.html"                "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 $SMOKE_URL/index.html)"

echo
[ $fail -eq 0 ] && ok "FRONTEND ISOLADO OK — $pass checks PASS — $SMOKE_URL" \
                || err "$fail smoke falharam (passou $pass)"
