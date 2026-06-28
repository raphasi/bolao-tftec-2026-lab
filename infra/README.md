# Infrastructure as Code — Bicep

Templates Bicep que provisionam toda a infraestrutura Azure do Bolão TFTEC Cloud.

---

## 📦 Recursos criados

| Recurso | SKU | Custo mensal | Free tier? |
|---|---|---|---|
| Cosmos DB Account | Standard (Free Tier ON) | $0 | ✅ 1000 RU/s + 25GB forever |
| App Service Plan | B1 Linux | ~$13 | ❌ trial cobre 15 meses |
| App Service | — | $0 (no plan) | — |
| Function App + Plan | Y1 Consumption | $0 | ✅ 1M req/mês forever |
| SignalR Service | Free_F1 | $0 | ✅ 20 conexões forever |
| Storage Account | Standard_LRS | <$1 | ✅ 5GB forever |
| Application Insights | PerGB2018 | $0 | ✅ 5GB/mês forever |
| Log Analytics | PerGB2018 | $0 | ✅ 5GB/mês forever |
| **Total** | | **~$13/mês** | |

> 💡 **Free tier do Cosmos:** apenas 1 conta com free tier por subscription. Se você já tem outra conta Cosmos com free tier ativo na sua sub, defina `cosmosEnableFreeTier: false` nos parâmetros para evitar erro de deploy.

---

## 🚀 Deploy passo a passo

### 1. Pré-requisitos

```bash
# Azure CLI instalado e autenticado
az login
az account show          # confirme a subscription correta
az account set --subscription "<sua-subscription-id>"  # se necessário
```

### 2. Criar Resource Group

```bash
az group create --name rg-fifa-bolao --location eastus
```

### 3. Preparar arquivo de parâmetros

```bash
# Copie o exemplo
cp infra/parameters.example.json infra/parameters.dev.json

# Edite parameters.dev.json e ajuste:
#   - nameSuffix: seu identificador único (ex: rapha01, joao2026)
#   - jwtSecret: gere com `openssl rand -base64 32`
```

> ⚠️ O arquivo `parameters.dev.json` está no `.gitignore` — nunca commite secrets.

### 4. Validar template (dry-run)

```bash
az deployment group validate \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json
```

### 5. Executar deployment

```bash
az deployment group create \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json \
  --name bolao-deploy-$(date +%Y%m%d-%H%M%S)
```

Tempo médio: **6-10 minutos** (Cosmos é o gargalo).

### 6. Capturar outputs

```bash
az deployment group show \
  --resource-group rg-fifa-bolao \
  --name <deployment-name> \
  --query properties.outputs
```

Outputs úteis:
- `cosmosEndpoint` → URL do Cosmos DB
- `appServiceUrl` → URL pública do app
- `signalRHostName` → host do SignalR
- `seedCommand` → comando pronto pra popular o Cosmos

### 7. Popular Cosmos com dados iniciais

```bash
npm install
npm run seed
```

---

## 🔍 Comandos úteis

### Ver o que será criado/alterado (what-if)
```bash
az deployment group what-if \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json
```

### Recompilar Bicep para ver ARM gerado
```bash
az bicep build --file infra/main.bicep --outdir infra/_compiled/
```

### Validar sintaxe localmente
```bash
az bicep lint --file infra/main.bicep
```

### Deletar tudo (cuidado!)
```bash
az group delete --name rg-fifa-bolao --yes
```

---

## 🏗️ Estrutura dos módulos

```
infra/
├── main.bicep                  # Orquestrador (chama todos os módulos)
├── parameters.example.json     # Template de parâmetros (commitado)
├── parameters.dev.json         # Parâmetros reais (gitignored)
└── modules/
    ├── loganalytics.bicep      # Workspace (backing de AI)
    ├── appinsights.bicep       # Application Insights
    ├── cosmos.bicep            # Cosmos DB + database + 5 containers
    ├── storage.bicep           # Storage (req. Functions)
    ├── signalr.bicep           # SignalR (Serverless mode)
    ├── appservice.bicep        # App Service Plan + Web App
    └── functions.bicep         # Function App + Consumption Plan
```

---

## 📐 Convenções de naming

Todos os recursos seguem `<tipo>-<prefix>-<suffix>`:

| Recurso | Prefixo | Exemplo |
|---|---|---|
| Cosmos | `cosmos-` | `cosmos-fifa-bolao-rapha01` |
| App Service | `app-` | `app-fifa-bolao-rapha01` |
| App Service Plan | `plan-` | `plan-fifa-bolao-rapha01` |
| Function App | `func-` | `func-fifa-bolao-rapha01` |
| Storage | `st` (sem hífen) | `stfifabolaorapha01` |
| SignalR | `signalr-` | `signalr-fifa-bolao-rapha01` |
| App Insights | `ai-` | `ai-fifa-bolao-rapha01` |
| Log Analytics | `log-` | `log-fifa-bolao-rapha01` |

**Regras:**
- `nameSuffix`: 3-12 chars, lowercase, único globalmente
- Storage exige: 3-24 chars, lowercase, **sem hífens**, alfanumérico
- Cosmos exige: 3-44 chars, lowercase, com hífens

---

## 🔐 Segurança

**Estado atual (didático):**
- Secrets do Cosmos passados como app settings em texto plano
- Connection strings no portal Azure (App Service > Configuration)

**Roadmap (próxima sprint):**
- Migrar secrets para Key Vault
- App Service usa Managed Identity (já habilitada via `identity: SystemAssigned`)
- Cosmos com RBAC ao invés de keys

---

## 🐛 Troubleshooting

| Erro | Causa | Solução |
|---|---|---|
| `FreeTierAlreadyApplied` | Já existe conta Cosmos free tier na sub | Defina `cosmosEnableFreeTier: false` ou delete a outra |
| `StorageAccountAlreadyExists` | Nome global em uso | Mude o `nameSuffix` |
| `SignalRQuotaExceeded` | Outra app está usando o SignalR Free | Delete outras instâncias Free na sub |
| `Deployment timeout` | Cosmos demora — esperar 10min | Re-rodar `az deployment group create` é idempotente |
