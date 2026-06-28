# Setup via Bicep (caminho oficial)

Guia passo-a-passo para reproduzir o ambiente do Bolão TFTEC Cloud na sua subscription Azure usando **Infrastructure as Code (IaC)** com Bicep.

**Tempo estimado:** 15-20 minutos · **Conhecimento prévio:** Azure CLI básico.

---

## ✅ Pré-requisitos

| Ferramenta | Versão mínima | Como instalar |
|---|---|---|
| Node.js | 20+ | https://nodejs.org/ |
| Git | qualquer | https://git-scm.com/ |
| Azure CLI | 2.60+ | https://aka.ms/installazurecliwindows |
| Conta Azure | trial ou paga | https://azure.microsoft.com/free/ |

### Verificar pré-requisitos
```bash
node --version    # v20.x.x ou superior
git --version
az --version      # azure-cli 2.60+
```

---

## 1️⃣ Clone do repositório

```bash
git clone https://github.com/TFTEC/fifa2026-bolao-dev.git
cd fifa2026-bolao-dev
npm install
```

---

## 2️⃣ Autenticar no Azure

```bash
az login
```

Uma janela do navegador abrirá. Após login, valide:
```bash
az account show
```

Se você tem **múltiplas subscriptions**, defina a correta:
```bash
az account list --output table
az account set --subscription "<NOME-OU-ID-DA-SUBSCRIPTION>"
```

---

## 3️⃣ Criar o Resource Group

```bash
az group create \
  --name rg-fifa-bolao \
  --location eastus
```

**Por que East US?** Mais barato que regiões brasileiras (~30% menor para SKUs equivalentes) e suporta todos os serviços usados. Latência ~120ms do Brasil é aceitável para um bolão.

---

## 4️⃣ Preparar arquivo de parâmetros

```bash
cp infra/parameters.example.json infra/parameters.dev.json
```

Abra `infra/parameters.dev.json` e ajuste:

| Parâmetro | O que colocar |
|---|---|
| `nameSuffix.value` | Seu identificador único (3-12 chars lowercase, ex: `rapha01`, `joao2026`). Garante unicidade global dos recursos. |
| `jwtSecret.value` | Segredo aleatório, mínimo 32 chars. Gere com `openssl rand -base64 32` (ou use https://www.random.org/bytes/) |

### Atenção
> O arquivo `parameters.dev.json` está no `.gitignore` — **nunca commite secrets**.

### Gerar JWT secret no Windows
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Gerar JWT secret no Linux/macOS/WSL
```bash
openssl rand -base64 32
```

---

## 5️⃣ Validar o template (dry-run)

Antes de provisionar, verifique se não há erro de sintaxe ou conflito:

```bash
az deployment group validate \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json
```

Deve retornar `"provisioningState": "Succeeded"` no output JSON. Se aparecer erro, leia o `errorMessages` e ajuste.

### Ver o que será criado (what-if)
```bash
az deployment group what-if \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json
```

Saída mostra `+ Create` para cada recurso. Aprove mentalmente.

---

## 6️⃣ Executar o deployment

```bash
az deployment group create \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json \
  --name bolao-deploy-$(date +%Y%m%d-%H%M%S)
```

**Tempo:** 6-10 minutos. O gargalo é a criação do Cosmos DB (~5 min sozinha).

Acompanhe o progresso no Azure Portal: `rg-fifa-bolao` → Deployments.

---

## 7️⃣ Capturar outputs do deployment

```bash
az deployment group show \
  --resource-group rg-fifa-bolao \
  --name <nome-do-deployment-acima> \
  --query "properties.outputs"
```

Outputs importantes:

| Campo | Uso |
|---|---|
| `cosmosEndpoint.value` | URL do Cosmos DB |
| `appServiceUrl.value` | URL pública do bolão (ex: `app-fifa-bolao-rapha01.azurewebsites.net`) |
| `functionAppName.value` | Nome da Function App |
| `signalRHostName.value` | Host do SignalR |
| `appInsightsConnectionString.value` | Connection string do AI |

### Extrair Cosmos key para seed
```bash
az cosmosdb keys list \
  --name cosmos-fifa-bolao-<seu-suffix> \
  --resource-group rg-fifa-bolao \
  --query primaryMasterKey \
  --output tsv
```

---

## 8️⃣ Configurar `.env` para rodar localmente

Crie `.env` na raiz do projeto:

```bash
cp .env.example .env
```

Preencha com os valores capturados:

```env
COSMOS_ENDPOINT=https://cosmos-fifa-bolao-<suffix>.documents.azure.com:443/
COSMOS_KEY=<colado-do-az-cosmosdb-keys-list>
COSMOS_DATABASE=bolao2026
JWT_SECRET=<mesmo-do-parameters.dev.json>
MAIN_API_BASE_URL=https://fifa2026-tickets-dev.azurewebsites.net/api
```

---

## 9️⃣ Popular Cosmos com dados iniciais

```bash
npm run seed
```

Cria:
- 1 usuário admin (`admin@bolao.tftec.com.br` / `TFTEC@2026!` — **trocar no 1º acesso**)
- 12 jogos sample no `matches-cache` (1 por grupo A-L)
- 1 entrada inicial no leaderboard

> Para puxar os 72 jogos reais do main app, garanta que `MAIN_API_BASE_URL` está apontando para uma instância acessível.

---

## 🔟 Rodar localmente para validar

### Dev mode (hot reload)
```bash
npm run dev --workspace=backend     # terminal 1 — http://localhost:3001
npm run dev --workspace=frontend    # terminal 2 — http://localhost:5173
```

Abra `http://localhost:5173` no navegador. Você deve ver a Home do Bolão TFTEC Cloud.

Faça login com as credenciais admin do seed.

### Build de produção
```bash
npm run build --workspace=frontend  # gera frontend/dist
npm run build --workspace=backend   # gera backend/dist
npm start --workspace=backend       # serve backend + frontend na mesma porta
```

---

## 1️⃣1️⃣ Deploy do código no App Service

(Configuração final do CI/CD vem no Block 4. Por enquanto, deploy manual:)

```bash
# Build production
npm run build

# ZIP do projeto (sem node_modules — App Service builda no deploy)
cd ..
zip -r bolao.zip fifa2026-bolao-dev \
  -x "*/node_modules/*" \
  -x "*/dist/*" \
  -x "*/.git/*"

# Deploy
az webapp deploy \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-<suffix> \
  --src-path bolao.zip \
  --type zip
```

Aguarde 3-5 minutos. Teste: `https://app-fifa-bolao-<suffix>.azurewebsites.net/api/health`.

---

## 🧹 Como deletar tudo (limpeza)

Para remover toda a infra (cuidado, é destrutivo):

```bash
az group delete --name rg-fifa-bolao --yes --no-wait
```

Demora ~5min. Você pode recriar a qualquer momento rodando esse guia novamente.

---

## ❗ Problemas comuns

| Erro | Causa | Solução |
|---|---|---|
| `FreeTierAlreadyApplied` | Já existe outra conta Cosmos com Free Tier nesta sub | Mude `cosmosEnableFreeTier: false` em parameters OU delete a outra conta |
| `StorageAccountAlreadyExists` | Nome global tomado por outro usuário Azure no mundo | Mude o `nameSuffix` |
| `SubscriptionRequestsThrottled` | Muitos deploys seguidos | Aguarde 5 min |
| `MissingSubscriptionRegistration` | RP não registrado | `az provider register --namespace Microsoft.DocumentDB` |
| Cosmos demora >15min | Região saturada | Tente outra: `--location centralus` |

Mais em [`troubleshooting.md`](./troubleshooting.md).

---

## 📚 Próximos passos

- 📖 [`scoring-rules.md`](./scoring-rules.md) — entenda a pontuação
- 🛠️ [`setup-cli.md`](./setup-cli.md) — caminho alternativo via Azure CLI puro
- 🖼️ [`setup-portal.md`](./setup-portal.md) — passo a passo manual no Portal
