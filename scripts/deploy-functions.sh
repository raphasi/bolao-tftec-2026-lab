#!/usr/bin/env bash
# =============================================================================
# Deploy Functions do Bolão TFTEC Cloud (Sprint S3)
# =============================================================================
# Mirror do scripts/deploy.sh mas voltado para o Function App.
# Uses az functionapp deployment source config-zip (sem Run-From-Package).
#
# Uso:
#   ./scripts/deploy-functions.sh [--skip-build]
#
# Pré-requisitos:
#   - func core tools instalado (opcional, só pra dev local)
#   - AzureWebJobsCosmosDBConnection já configurado no Function App (S1)
#   - COSMOS_DATABASE app setting
#
# Tempo esperado: 3-5 min
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="${TMPDIR:-/tmp}/bolao-functions-staging"
ZIP="${TMPDIR:-/tmp}/bolao-functions.zip"
# Parametrizável via env (fork/aluno). Sem env, mantém os nomes de produção.
RG="${RG:-rg-fifa-bolao}"
APP="${APP:-func-fifa-bolao-tftec01}"
COSMOS_ACCOUNT="${COSMOS_ACCOUNT:-cosmos-fifa-bolao-tftec01}"

SKIP_BUILD=false
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
done

log() { echo -e "\033[36m▸ $1\033[0m"; }
ok()  { echo -e "\033[32m✓ $1\033[0m"; }
err() { echo -e "\033[31m✗ $1\033[0m" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 1. Build
# -----------------------------------------------------------------------------
if [ "$SKIP_BUILD" = false ]; then
  log "[1/6] Build functions"
  cd "$ROOT"
  npm run build --workspace=functions
  ok "Build OK"
else
  log "[1/6] skip-build"
fi

# -----------------------------------------------------------------------------
# 2. Staging
# -----------------------------------------------------------------------------
log "[2/6] Staging em $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# Copia dist + host.json
cp -r "$ROOT/functions/dist" "$STAGING/dist"
cp "$ROOT/functions/host.json" "$STAGING/"

# package.json staging gerado AUTOMATICAMENTE de functions/package.json
# (elimina classe de bug de dep esquecida — ver feedback_staging_packagejson.md)
node "$ROOT/scripts/make-staging-pkg.cjs" "$ROOT/functions" "$STAGING" \
  --name fifa2026-bolao-functions

ok "Files staged"

# -----------------------------------------------------------------------------
# 3. npm install --omit=dev
# -----------------------------------------------------------------------------
log "[3/6] npm install --omit=dev"
cd "$STAGING"
npm install --omit=dev --no-audit --no-fund --silent
count=$(ls node_modules | wc -l)
[ "$count" -ge 10 ] || err "Esperava 10+ pkgs, instalou $count"
ok "$count packages instalados"

# -----------------------------------------------------------------------------
# 4. Zip Linux-compatible
# -----------------------------------------------------------------------------
log "[4/6] Zip via Node archiver"
cd "$ROOT"
node scripts/make-zip.cjs "$STAGING" "$ZIP"
backslash_count=$(unzip -l "$ZIP" 2>/dev/null | { grep -c '\\\\' || true; })
[ "$backslash_count" = "0" ] || err "Zip tem paths com backslash"
ok "Zip OK ($(stat -c%s "$ZIP") bytes)"

# -----------------------------------------------------------------------------
# 5. Configurar app settings (COSMOS_DATABASE + connection)
# -----------------------------------------------------------------------------
log "[5/6] Verificar app settings"
existing=$(az functionapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='AzureWebJobsCosmosDBConnection'].value" -o tsv 2>/dev/null || echo "")
if [ -z "$existing" ]; then
  log "AzureWebJobsCosmosDBConnection ausente — obtendo do Cosmos..."
  COSMOS_CONN=$(az cosmosdb keys list \
    --type connection-strings \
    --name "$COSMOS_ACCOUNT" \
    --resource-group "$RG" \
    --query "connectionStrings[0].connectionString" -o tsv)
  [ -n "$COSMOS_CONN" ] || err "Falha ao obter connection string"
  az functionapp config appsettings set -g "$RG" -n "$APP" \
    --settings "AzureWebJobsCosmosDBConnection=$COSMOS_CONN" "COSMOS_DATABASE=bolao2026" >/dev/null
  ok "Cosmos connection setada"
else
  ok "Cosmos connection já configurada"
fi

# -----------------------------------------------------------------------------
# 6. Deploy zip
# -----------------------------------------------------------------------------
log "[6/6] az functionapp deployment source config-zip"
az functionapp deployment source config-zip \
  --resource-group "$RG" --name "$APP" \
  --src "$ZIP" 2>&1 | tail -5 || err "Deploy falhou"

ok "Deploy enviado. Aguardando warmup inicial (~60s)..."
sleep 60

# Health check via list functions — retry com backoff (Y1 cold start é variável).
# Budget anterior (120s warmup + 3×30s = 180s) era insuficiente: às vezes registration
# leva 3-5min em Y1 Linux mesmo após Kudu retornar success. Novo budget: ~6min total
# (60s warmup + 6×60s = 6min), suficiente pros piores casos observados.
log "Verificando functions registradas (até 6 tentativas, 60s entre cada — budget máx ~6min)..."
funcs=""
for attempt in 1 2 3 4 5 6; do
  funcs=$(az functionapp function list -g "$RG" -n "$APP" --query "[].name" -o tsv 2>/dev/null || echo "")
  if [ -n "$funcs" ]; then
    elapsed=$((60 + (attempt - 1) * 60))
    ok "Functions registradas (tentativa $attempt, ~${elapsed}s pós-deploy)"
    break
  fi
  if [ "$attempt" -lt 6 ]; then
    log "Tentativa $attempt vazia — aguardando 60s (Y1 cold start variável)..."
    sleep 60
  fi
done

if [ -z "$funcs" ]; then
  echo
  echo "⚠️  ATENÇÃO — Functions não apareceram em 'az functionapp function list' após 6min."
  echo "    O upload do zip pra Kudu retornou success (passo anterior), então o deploy"
  echo "    foi entregue. Isso pode ser:"
  echo "      (a) Y1 Linux registration flake — function host ainda inicializando"
  echo "      (b) Erro real no código (host.json inválido, dep faltando, etc)"
  echo
  echo "    Investigar:"
  echo "      az functionapp log tail -g $RG -n $APP"
  echo "      az functionapp function list -g $RG -n $APP   # retry manual em 1-2min"
  echo
  err "Nenhuma function registrada após budget de 6min"
fi
echo "$funcs" | while read f; do echo "  ✓ $f"; done

ok "DEPLOY FUNCTIONS SUCCESS — Function App: $APP"
echo "  Triggers ativos: changefeed em matches-cache, config, predictions, specials, leaderboard + timer health-check"
echo "  Logs: az functionapp log tail -g $RG -n $APP"
