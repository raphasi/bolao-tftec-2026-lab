#!/usr/bin/env bash
# =============================================================================
# Cosmos DB Setup — Alternativa imperativa via Azure CLI
# =============================================================================
# Cria a mesma estrutura que o Bicep (infra/modules/cosmos.bicep), mas usando
# comandos `az` linha a linha. Útil para entender o que o Bicep faz por baixo
# e para ambientes onde Bicep não está disponível.
#
# Pré-requisitos:
#   - Azure CLI (az) autenticado
#   - Resource Group já existente (rg-fifa-bolao)
#
# Uso:
#   ./scripts/setup-cosmos.sh <nameSuffix> [location]
#   Exemplo: ./scripts/setup-cosmos.sh rapha01 eastus
#
# Equivalência funcional ao Bicep — escolha 1 caminho, não rode os dois.
# =============================================================================

set -euo pipefail

# ---------------------------- Parâmetros ----------------------------
NAME_SUFFIX="${1:?Uso: $0 <nameSuffix> [location]}"
LOCATION="${2:-eastus}"
RG="${RESOURCE_GROUP:-rg-bolao}"
PREFIX="${NAME_PREFIX:-fifa-bolao}"
ACCOUNT="cosmos-${PREFIX}-${NAME_SUFFIX}"
DATABASE="bolao2026"
THROUGHPUT=1000

# Cores para output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_section() { echo -e "\n${CYAN}▸ $1${NC}"; }
log_ok()      { echo -e "${GREEN}✓${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
log_error()   { echo -e "${RED}✗${NC}  $1" >&2; }

# ---------------------------- Pre-flight ----------------------------
log_section "Pre-flight"
if ! az account show >/dev/null 2>&1; then
  log_error "Não autenticado. Rode 'az login' primeiro."
  exit 1
fi
log_ok "Autenticado como: $(az account show --query user.name -o tsv)"

if ! az group show --name "$RG" >/dev/null 2>&1; then
  log_warn "Resource Group '$RG' não existe. Criando em $LOCATION..."
  az group create --name "$RG" --location "$LOCATION" --output none
  log_ok "RG criado"
else
  log_ok "RG '$RG' encontrado"
fi

# ---------------------------- Cosmos Account ----------------------------
log_section "Cosmos Account"
echo "  Conta:    $ACCOUNT"
echo "  Database: $DATABASE"
echo "  Region:   $LOCATION"
echo "  Free Tier: enabled"
echo

if az cosmosdb show --name "$ACCOUNT" --resource-group "$RG" >/dev/null 2>&1; then
  log_warn "Conta '$ACCOUNT' já existe — pulando criação"
else
  log_section "Criando conta Cosmos (~3-5 min)..."
  az cosmosdb create \
    --name "$ACCOUNT" \
    --resource-group "$RG" \
    --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=False \
    --default-consistency-level Session \
    --enable-free-tier true \
    --kind GlobalDocumentDB \
    --output none
  log_ok "Conta criada"
fi

# ---------------------------- Database ----------------------------
log_section "Database"
if az cosmosdb sql database show --account-name "$ACCOUNT" --resource-group "$RG" --name "$DATABASE" >/dev/null 2>&1; then
  log_warn "Database '$DATABASE' já existe"
else
  az cosmosdb sql database create \
    --account-name "$ACCOUNT" \
    --resource-group "$RG" \
    --name "$DATABASE" \
    --throughput "$THROUGHPUT" \
    --output none
  log_ok "Database '$DATABASE' criado com $THROUGHPUT RU/s compartilhados"
fi

# ---------------------------- Containers ----------------------------
log_section "Containers"

create_container() {
  local name="$1"
  local pk="$2"
  if az cosmosdb sql container show \
       --account-name "$ACCOUNT" \
       --resource-group "$RG" \
       --database-name "$DATABASE" \
       --name "$name" >/dev/null 2>&1; then
    log_warn "Container '$name' já existe"
  else
    az cosmosdb sql container create \
      --account-name "$ACCOUNT" \
      --resource-group "$RG" \
      --database-name "$DATABASE" \
      --name "$name" \
      --partition-key-path "$pk" \
      --output none
    log_ok "Container '$name' (PK=$pk)"
  fi
}

# Containers de DADOS (9)
create_container users         /userId
create_container predictions   /userId
create_container specials      /userId
create_container matches-cache /groupCode
create_container leaderboard   /season
create_container groups        /season
create_container players       /season
create_container config        /scope
create_container audit-log     /performedBy

# Containers de LEASE (5) — OBRIGATÓRIOS p/ o Change Feed (scoring). Sem eles a
# pontuação não roda. PK sempre /id.
create_container leases-calc                  /id
create_container leases-specials              /id
create_container leases-aggregate-predictions /id
create_container leases-aggregate-specials    /id
create_container leases-emit-leaderboard      /id

# ---------------------------- Outputs ----------------------------
log_section "Pronto! Capture as credenciais"
ENDPOINT=$(az cosmosdb show --name "$ACCOUNT" --resource-group "$RG" --query documentEndpoint -o tsv)
KEY=$(az cosmosdb keys list --name "$ACCOUNT" --resource-group "$RG" --query primaryMasterKey -o tsv)

echo
echo "  Cole no seu .env:"
echo -e "  ${GREEN}COSMOS_ENDPOINT=${ENDPOINT}${NC}"
echo -e "  ${GREEN}COSMOS_KEY=${KEY}${NC}"
echo -e "  ${GREEN}COSMOS_DATABASE=${DATABASE}${NC}"
echo
echo "  Próximo passo: npm run seed"
echo
