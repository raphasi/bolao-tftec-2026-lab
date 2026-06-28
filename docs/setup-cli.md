# Setup via Azure CLI (caminho imperativo)

Alternativa ao [`setup-bicep.md`](./setup-bicep.md). Aqui você cria cada recurso linha-a-linha usando comandos `az` puros — é mais didático para **entender o que o Bicep faz por baixo**, mas menos reproduzível.

**Use este caminho se:** você quer aprender Azure CLI ou está em ambiente sem Bicep instalado.

**Use o Bicep se:** quer reproduzibilidade, idempotência e produção real.

---

## ⚠️ Importante

**Não rode os dois caminhos.** Escolha um. Misturar Bicep + CLI imperativo deixa seu estado inconsistente porque o Bicep tenta reverter mudanças que ele não fez.

---

## ✅ Pré-requisitos

Mesmos do Bicep, exceto que **Bicep CLI não é necessário**.

```bash
az --version
az login
az account set --subscription "<sua-subscription>"
```

---

## 1️⃣ Variáveis de ambiente

Defina uma vez no seu terminal (ajuste o suffix):

```bash
export RG=rg-fifa-bolao
export LOC=eastus
export SUFFIX=rapha01           # 3-12 chars, lowercase, único globalmente
export PREFIX=fifa-bolao

export COSMOS=cosmos-${PREFIX}-${SUFFIX}
export PLAN=plan-${PREFIX}-${SUFFIX}
export APP=app-${PREFIX}-${SUFFIX}
export FUNC=func-${PREFIX}-${SUFFIX}
export FUNCPLAN=${FUNC}-plan
export STORAGE=st${PREFIX}${SUFFIX}      # SEM hífen
export STORAGE=${STORAGE//-/}            # remove hífens
export SIGNALR=signalr-${PREFIX}-${SUFFIX}
export AI=ai-${PREFIX}-${SUFFIX}
export LOG=log-${PREFIX}-${SUFFIX}
```

No PowerShell:
```powershell
$RG="rg-fifa-bolao"; $LOC="eastus"; $SUFFIX="rapha01"; $PREFIX="fifa-bolao"
$COSMOS="cosmos-$PREFIX-$SUFFIX"
$PLAN="plan-$PREFIX-$SUFFIX"
$APP="app-$PREFIX-$SUFFIX"
$FUNC="func-$PREFIX-$SUFFIX"
$FUNCPLAN="$FUNC-plan"
$STORAGE=("st$PREFIX$SUFFIX" -replace '-','')
$SIGNALR="signalr-$PREFIX-$SUFFIX"
$AI="ai-$PREFIX-$SUFFIX"
$LOG="log-$PREFIX-$SUFFIX"
```

---

## 2️⃣ Resource Group

```bash
az group create --name $RG --location $LOC
```

---

## 3️⃣ Log Analytics Workspace

Backing store do Application Insights (workspace-based é o padrão atual).

```bash
az monitor log-analytics workspace create \
  --resource-group $RG \
  --workspace-name $LOG \
  --location $LOC \
  --sku PerGB2018 \
  --retention-time 30 \
  --quota 1
```

---

## 4️⃣ Application Insights

```bash
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RG \
  --workspace-name $LOG \
  --query id -o tsv)

az monitor app-insights component create \
  --resource-group $RG \
  --app $AI \
  --location $LOC \
  --kind web \
  --application-type web \
  --workspace $WORKSPACE_ID
```

Capture a connection string:
```bash
AI_CONN=$(az monitor app-insights component show \
  --resource-group $RG --app $AI \
  --query connectionString -o tsv)
echo $AI_CONN
```

---

## 5️⃣ Cosmos DB (a parte demorada — ~5 min)

### 5a. Account
```bash
az cosmosdb create \
  --name $COSMOS \
  --resource-group $RG \
  --locations regionName=$LOC failoverPriority=0 isZoneRedundant=False \
  --default-consistency-level Session \
  --enable-free-tier true \
  --kind GlobalDocumentDB
```

### 5b. Database (1000 RU/s shared throughput)
```bash
az cosmosdb sql database create \
  --account-name $COSMOS \
  --resource-group $RG \
  --name bolao2026 \
  --throughput 1000
```

### 5c. Containers (todos com PK definido em cosmos.bicep)
```bash
az cosmosdb sql container create --account-name $COSMOS --resource-group $RG \
  --database-name bolao2026 --name users --partition-key-path /userId

az cosmosdb sql container create --account-name $COSMOS --resource-group $RG \
  --database-name bolao2026 --name predictions --partition-key-path /userId

az cosmosdb sql container create --account-name $COSMOS --resource-group $RG \
  --database-name bolao2026 --name specials --partition-key-path /userId

az cosmosdb sql container create --account-name $COSMOS --resource-group $RG \
  --database-name bolao2026 --name matches-cache --partition-key-path /groupCode

az cosmosdb sql container create --account-name $COSMOS --resource-group $RG \
  --database-name bolao2026 --name leaderboard --partition-key-path /season
```

> 💡 Alternativamente: use o script `scripts/setup-cosmos.sh` que faz exatamente isso de forma idempotente.

### 5d. Capturar credenciais
```bash
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS --resource-group $RG --query documentEndpoint -o tsv)
COSMOS_KEY=$(az cosmosdb keys list --name $COSMOS --resource-group $RG --query primaryMasterKey -o tsv)
echo "ENDPOINT: $COSMOS_ENDPOINT"
echo "KEY: $COSMOS_KEY"
```

---

## 6️⃣ Storage Account (requerido pelas Functions)

```bash
az storage account create \
  --name $STORAGE \
  --resource-group $RG \
  --location $LOC \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false

STORAGE_CONN=$(az storage account show-connection-string \
  --name $STORAGE --resource-group $RG --query connectionString -o tsv)
```

---

## 7️⃣ SignalR Service (Free, Serverless)

```bash
az signalr create \
  --name $SIGNALR \
  --resource-group $RG \
  --sku Free_F1 \
  --unit-count 1 \
  --service-mode Serverless \
  --location $LOC

SIGNALR_CONN=$(az signalr key list --name $SIGNALR --resource-group $RG --query primaryConnectionString -o tsv)
```

---

## 8️⃣ App Service Plan + App Service

### 8a. Plan B1 Linux
```bash
az appservice plan create \
  --name $PLAN \
  --resource-group $RG \
  --location $LOC \
  --sku B1 \
  --is-linux
```

### 8b. App Service Node 20
```bash
az webapp create \
  --name $APP \
  --resource-group $RG \
  --plan $PLAN \
  --runtime "NODE:20-lts"
```

### 8c. Configurações (HTTPS only, Always On, healthcheck)
```bash
az webapp update --name $APP --resource-group $RG --https-only true
az webapp config set --name $APP --resource-group $RG \
  --always-on true \
  --http20-enabled true \
  --min-tls-version 1.2 \
  --health-check-path /api/health \
  --startup-file "node backend/dist/server.js"
```

### 8d. App Settings (secrets e config)
```bash
# Gere um JWT secret robusto:
JWT_SECRET=$(openssl rand -base64 32)

az webapp config appsettings set --name $APP --resource-group $RG --settings \
  COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
  COSMOS_KEY="$COSMOS_KEY" \
  COSMOS_DATABASE="bolao2026" \
  SIGNALR_CONNECTION_STRING="$SIGNALR_CONN" \
  JWT_SECRET="$JWT_SECRET" \
  JWT_EXPIRES_IN="7d" \
  MAIN_API_BASE_URL="https://fifa2026-tickets-dev.azurewebsites.net/api" \
  NODE_ENV="production" \
  PORT="8080" \
  WEBSITE_NODE_DEFAULT_VERSION="~20" \
  SCM_DO_BUILD_DURING_DEPLOYMENT="true" \
  APPLICATIONINSIGHTS_CONNECTION_STRING="$AI_CONN"
```

### 8e. Habilitar Managed Identity (pra Block 4 Key Vault)
```bash
az webapp identity assign --name $APP --resource-group $RG
```

---

## 9️⃣ Function App (Consumption Y1 Linux)

```bash
# Functions roda em Consumption plan separado
az functionapp plan create --name $FUNCPLAN --resource-group $RG \
  --location $LOC --sku Y1 --is-linux

az functionapp create \
  --name $FUNC \
  --resource-group $RG \
  --plan $FUNCPLAN \
  --storage-account $STORAGE \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --os-type Linux

az functionapp config appsettings set --name $FUNC --resource-group $RG --settings \
  COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
  COSMOS_KEY="$COSMOS_KEY" \
  COSMOS_DATABASE="bolao2026" \
  AzureSignalRConnectionString="$SIGNALR_CONN" \
  MAIN_API_BASE_URL="https://fifa2026-tickets-dev.azurewebsites.net/api" \
  APPLICATIONINSIGHTS_CONNECTION_STRING="$AI_CONN"

az functionapp identity assign --name $FUNC --resource-group $RG
```

---

## ✅ Validar

```bash
# Listar tudo que foi criado
az resource list --resource-group $RG --output table

# Conferir URL do app
echo "https://${APP}.azurewebsites.net"

# Healthcheck (vai dar 502 enquanto não tem deploy)
curl -I https://${APP}.azurewebsites.net/api/health
```

---

## 🔄 Próximo passo

Igual ao Bicep:
1. Crie `.env` localmente com `COSMOS_ENDPOINT`, `COSMOS_KEY`, `JWT_SECRET`
2. `npm run seed` para popular admin + matches
3. Deploy do código: `npm run build && az webapp deploy ...`

---

## 🧹 Cleanup

```bash
az group delete --name $RG --yes --no-wait
```

---

## 📊 Comparação Bicep vs CLI

| Critério | Bicep | CLI imperativo |
|---|---|---|
| Reprodutibilidade | ✅ idempotente, versionável | ⚠️ depende de variáveis exportadas |
| Velocidade | ✅ paralelismo automático | ❌ sequencial |
| Rollback | ✅ ARM detecta drift | ❌ manual |
| Curva de aprendizado | ⚠️ sintaxe própria | ✅ comandos `az` que você já conhece |
| Auditoria | ✅ deployment history no portal | ⚠️ só activity log |
| **Recomendação** | **Produção** | **Aprendizado** |

Para o evento TFTEC, ambos são válidos. **Bicep é o caminho oficial** do projeto.
