#!/usr/bin/env bash
# =============================================================================
# Fase 4 do cutover — isolar as Web Apps para aceitarem SÓ o nosso Front Door
# (ADR-021 item 4). Lock = Azure Front Door service tag + header X-Azure-FDID
# na MESMA regra (AND). Só service tag deixa o AFD de QUALQUER tenant entrar;
# só header é spoofável (o GUID não é secreto). Os dois juntos = o lock real.
#
# ⚠️ Rodar SOMENTE após validar o app pelo host do Front Door (Fases 2 e 3).
# Ordem segura: frontend primeiro, depois API. IP do dono fica Allow na
# transição (canal direto de debug). Rollback canônico = remover TODAS as
# regras (volta a Allow-All implícito) — remover só uma deixa o Deny-All
# implícito ativo e segue 403.
#
# Uso:
#   OWNER_IP=<ip/32> ./scripts/isolate-origins.sh test-open      # antes do lock: prova que está aberto
#   OWNER_IP=<ip/32> ./scripts/isolate-origins.sh lock frontend  # isola o front
#   OWNER_IP=<ip/32> ./scripts/isolate-origins.sh verify         # testes adversariais
#   OWNER_IP=<ip/32> ./scripts/isolate-origins.sh lock api       # isola a API
#   ./scripts/isolate-origins.sh rollback frontend|api|all       # remove TODAS as regras do app
# =============================================================================
set -euo pipefail

RG="${AZURE_RG:-rg-fifa-bolao}"
PROFILE="${AFD_PROFILE:-afd-fifa-bolao-tftec01}"
FRONTEND_APP="${FRONTEND_APP:-app-fifa-bolao-web-tftec01}"
API_APP="${API_APP:-app-fifa-bolao-tftec01}"

log() { echo -e "\033[36m▸ $1\033[0m"; }
ok()  { echo -e "\033[32m✓ $1\033[0m"; }
err() { echo -e "\033[31m✗ $1\033[0m" >&2; exit 1; }

# FrontDoorId (GUID) puxado do profile — NÃO copiar à mão (output frontDoorId do bicep).
fdid() {
  az afd profile show -g "$RG" --profile-name "$PROFILE" --query frontDoorId -o tsv 2>/dev/null \
    || err "Não consegui ler o frontDoorId do profile $PROFILE (o AFD já foi provisionado?)"
}

app_for() {
  case "$1" in
    frontend) echo "$FRONTEND_APP" ;;
    api)      echo "$API_APP" ;;
    *) err "alvo inválido: $1 (use frontend|api)" ;;
  esac
}

# --- lock: 1 regra com service tag E header (AND) + 1 regra do IP do dono ------
lock() {
  local app; app="$(app_for "$1")"
  local FDID; FDID="$(fdid)"
  [ -n "${OWNER_IP:-}" ] || err "Defina OWNER_IP=<ip/32> (descubra com: curl -s ifconfig.me) — sem isso você se auto-bloqueia."
  log "Lock em $app — FDID=$FDID, OWNER_IP=$OWNER_IP"

  # Allow do dono PRIMEIRO (priority menor = avaliada antes) p/ não perder acesso.
  az webapp config access-restriction add -g "$RG" -n "$app" \
    --rule-name 'AllowOwner' --priority 90 --action Allow \
    --ip-address "$OWNER_IP" -o none
  # Allow do Front Door: service tag E header na MESMA regra = AND (não 2 regras!).
  az webapp config access-restriction add -g "$RG" -n "$app" \
    --rule-name 'AllowFrontDoor' --priority 100 --action Allow \
    --service-tag 'AzureFrontDoor.Backend' \
    --http-header "x-azure-fdid=$FDID" -o none

  ok "Lock aplicado em $app (Deny-All implícito agora ativo p/ o resto)."
  log "Confira no portal que 'AllowFrontDoor' aparece como 1 regra com o header anexado (não 2)."
  log "⚠️ Health probe do AFD vem do service tag mas NÃO carrega o FDID — ele passa pela regra do service tag; valide as origins Healthy no portal AFD AGORA."
}

# --- test-open: antes do lock, prova que o host direto responde --------------
test_open() {
  for app in "$FRONTEND_APP" "$API_APP"; do
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${app}.azurewebsites.net/healthz" || echo 000)"
    echo "  $app /healthz (direto) → $code (esperado 200 ANTES do lock)"
  done
}

# --- verify: testes adversariais do lock -------------------------------------
verify() {
  local FDID; FDID="$(fdid)"
  log "Testes adversariais (rode de uma máquina FORA do IP do dono p/ o teste 2 valer):"
  for app in "$FRONTEND_APP" "$API_APP"; do
    local direct hdr
    direct="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${app}.azurewebsites.net/healthz" || echo 000)"
    hdr="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "x-azure-fdid: $FDID" "https://${app}.azurewebsites.net/healthz" || echo 000)"
    echo "  [$app] direto SEM header → $direct (esperado 403)"
    echo "  [$app] direto COM header de IP não-AFD → $hdr (esperado 403 — prova que o service tag está no AND)"
  done
  log "E pelo host do Front Door (https://<endpoint>.azurefd.net) deve dar 200. Teste no browser."
}

# --- rollback: remove TODAS as regras (volta a Allow-All implícito) ----------
rollback() {
  local target="${1:-all}"
  local apps=()
  case "$target" in
    frontend) apps=("$FRONTEND_APP") ;;
    api)      apps=("$API_APP") ;;
    all)      apps=("$FRONTEND_APP" "$API_APP") ;;
    *) err "alvo inválido: $target (use frontend|api|all)" ;;
  esac
  for app in "${apps[@]}"; do
    log "Rollback $app — removendo TODAS as regras Allow (volta a Allow-All)"
    for rule in AllowFrontDoor AllowOwner; do
      az webapp config access-restriction remove -g "$RG" -n "$app" --rule-name "$rule" -o none 2>/dev/null \
        && echo "  removida: $rule" || echo "  (ausente): $rule"
    done
    ok "$app de volta a Allow-All (propagação data-plane ~até 1 min)."
  done
}

cmd="${1:-}"; shift || true
case "$cmd" in
  test-open) test_open ;;
  lock)      lock "${1:?frontend|api}" ;;
  verify)    verify ;;
  rollback)  rollback "${1:-all}" ;;
  *) echo "uso: $0 {test-open|lock frontend|lock api|verify|rollback [frontend|api|all]}"; exit 1 ;;
esac
