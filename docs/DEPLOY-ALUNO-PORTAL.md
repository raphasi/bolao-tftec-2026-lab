# 🏆 Deploy do Bolão TFTEC 2026 — Guia do Aluno (Azure Portal)

Passo a passo para **você subir a sua própria instância** do Bolão na **sua conta Azure trial**.
O foco é o **Portal do Azure**; usamos linha de comando só onde é inevitável (build do
código e carga inicial de dados) — esses pontos estão sempre marcados com 🧰.

> **Status:** revisado (gaps de self-host corrigidos + dry-run em trial real). Repositório:
> `TFTEC/bolao-tftec-2026` (privado por enquanto — tornar **público** antes de divulgar pra
> turma, pois o fork exige isso).
>
> 🔴 **LEIA ANTES DE TUDO — quota REGIONAL na trial:** numa **Azure Free Trial**, a quota de
> App Service é **por região** e quase sempre vem **zerada** na maioria das regiões. Ao criar
> qualquer App Service Plan (até o **F1 grátis**) você verá o erro *"Operation cannot be
> completed without additional quota. Current Limit (Total VMs): 0"*. **Isso NÃO é o spending
> limit** — é cota de compute liberada apenas em **uma ou outra região** da SUA assinatura, e
> a região que funciona **varia de aluno para aluno**. Por isso, **antes de criar qualquer
> recurso**, faça a varredura da **Seção 4.1 (Descubra a sua região)** e use essa região em
> **tudo** (Resource Group, Cosmos, Web Apps, Function App).

---

## 1. Visão geral

> 📐 **Quer o desenho completo da arquitetura, a lista de TODOS os recursos e o papel de
> cada um?** Veja [`ARQUITETURA.md`](./ARQUITETURA.md) — diagrama, 9 recursos Azure, os 14
> containers do Cosmos, as 6 functions e os fluxos de dados.

O Bolão é dividido em 4 componentes que você vai criar na sua conta:

```
   Navegador do aluno
        │
        ▼
 ┌──────────────┐      HTTPS/CORS      ┌──────────────┐
 │  FRONTEND    │ ───────────────────▶ │   BACKEND    │
 │ Web App (SPA)│                      │  Web App API │
 │ Express      │                      │ Express/Node │
 └──────────────┘                      └──────┬───────┘
                                              │ chave + endpoint
                                              ▼
                                       ┌──────────────┐
                                       │  COSMOS DB   │ ◀── Change Feed ──┐
                                       │  bolao2026   │                   │
                                       └──────────────┘            ┌──────┴───────┐
                                                                   │  FUNCTIONS   │
                                                                   │ (pontuação)  │
                                                                   └──────────────┘
```

- **Backend (Web App)** — API em Node/Express. Lê/grava no Cosmos. É o cérebro.
- **Frontend (Web App)** — site React (SPA) servido por um mini-servidor Express.
- **Cosmos DB** — banco NoSQL. Guarda usuários, palpites, jogos, leaderboard, auditoria.
- **Functions** — calculam pontos e o leaderboard automaticamente quando um resultado é
  lançado (via *Change Feed* do Cosmos). **Sem elas, o placar não atualiza sozinho.**
- **SignalR** *(opcional)* — atualização do leaderboard em tempo real. **Pode pular** na v1.

---

## 2. O que SIMPLIFICAMOS em relação à produção (e por quê)

A versão de produção da TFTEC usa recursos extras que **NÃO valem a pena** numa conta trial
(custo, complexidade e pontos de falha). Para o seu ambiente de aprendizado, **deixe de fora**:

| Recurso de produção | Na sua trial | Por quê |
|---|---|---|
| VNet + Private Endpoint no Cosmos | ❌ Não usar | Caro e complexo; deixa o Cosmos em rede pública simples |
| Key Vault (segredos) | ❌ Não usar | Você coloca as connection strings direto nas configurações do app |
| SignalR (tempo real) | ⚠️ Opcional | App funciona 100% sem; só o auto-refresh do placar deixa de existir |
| Application Insights / Log Analytics | ⚠️ Opcional | Só observabilidade; pule na v1 |

> 🔎 **Criticidade:** a produção teve um incidente porque as Functions ficaram **sem rota
> de rede** para um Cosmos com firewall fechado. Mantendo o Cosmos em **rede pública
> ("Todas as redes")** na trial, você evita 100% esse problema.

---

## 3. Pré-requisitos

1. **Conta Azure trial ativa** (US$200 / 30 dias). Crie em https://azure.microsoft.com/free.
2. **Conta GitHub** (gratuita) — você vai **fazer o fork** do repositório público.
3. **Node.js 18+ e Git** no seu computador (para o seed; e para o build local, se usar o Caminho A).
   - Confira: `node -v` e `git --version`.
4. **Azure CLI** instalada (https://aka.ms/azurecli) — usada em poucos passos 🧰.
5. O **repositório público** do Bolão (URL será fornecida): `https://github.com/TFTEC/bolao-tftec-2026`.
6. **Escolha um sufixo único** seu (3–12 letras minúsculas/números), ex.: `joao01`.
   Vamos chamá-lo de **`<SUFIXO>`**.

> ⚠️ **Convenção de nomes (importante):** o deploy via GitHub Actions (Caminho B, recomendado)
> monta os nomes dos recursos no padrão **`<tipo>-fifa-bolao-<SUFIXO>`**. Por isso, **crie os
> recursos exatamente com esses nomes** (ex.: `app-fifa-bolao-joao01`). Use o mesmo `<SUFIXO>`
> em tudo.

🧰 **Faça o fork e clone** (no seu computador):
1. Abra `https://github.com/TFTEC/bolao-tftec-2026` no GitHub → botão **Fork** → cria `https://github.com/<voce>/<repo>`.
2. Clone o **seu fork**:
```bash
git clone https://github.com/<voce>/<repo>.git bolao
cd bolao
npm install
```

### Dois caminhos de deploy do código
Toda a **infra** (Fases 1–9) é criada no **Portal**, igual nos dois caminhos. A diferença é
**como o código sobe**:

| | **Caminho B — GitHub Actions** *(recomendado)* | **Caminho A — manual** |
|---|---|---|
| Como | Push/Run no seu fork → CI builda e faz deploy | Você builda e publica do seu PC (VS Code/CLI) |
| Esforço | Configura 1 secret + 1 variable, e pronto | Repetir build/deploy a cada mudança |
| Pré-req | Service Principal (1 comando) | Node + VS Code/az local |

A documentação cobre os **dois**. Faça a infra (Fases 1–9), depois escolha o caminho na
**Fase 10**.

---

## 4. Custos e limites da trial (leia antes!)

- **Cosmos DB Free Tier:** 1000 RU/s + 25 GB grátis — **apenas 1 por assinatura**. Marque
  "Apply Free Tier Discount" ao criar. Se você **já tem** outra conta Cosmos com Free Tier
  nessa mesma assinatura, **não marque** (só pode haver 1 por assinatura) — ela vai cobrar
  os 1000 RU/s normalmente (centavos no crédito), ou use a do Bicep com `cosmosEnableFreeTier=false`.
- **App Service:** ⚠️ numa **Free Trial** a cota é **REGIONAL** e quase sempre **zerada** —
  até o **F1 (grátis)** falha com *"Total VMs: 0"* na maioria das regiões. **Descubra a sua
  região antes (Seção 4.1).** O plano **F1** funciona quando há cota, mas hiberna (cold start)
  e não tem "Always On". Para uma experiência melhor, **B1** (~US$13/mês, cabe no crédito) —
  desde que a região tenha cota.
- **Functions (Consumo):** tem cota gratuita generosa; custo ~zero nesse volume.
- **SignalR Free_F1:** grátis, ~20 conexões simultâneas.
- 🧹 **Ao terminar, apague o Resource Group inteiro** para parar qualquer cobrança
  (Passo 14).

---

## 4.1 🌍 Descubra a SUA região (FAÇA ISTO ANTES DE CRIAR QUALQUER RECURSO) 🧰

> 🔴 **Esta é a etapa que mais derruba self-host em trial.** Numa **Azure Free Trial**, a cota
> de App Service (compute) é **liberada por região**, e na maioria das assinaturas vem **zerada**
> em quase todas. Quando isso acontece, **qualquer** tentativa de criar um App Service Plan —
> **inclusive o F1 gratuito** — falha com:
>
> ```
> Operation cannot be completed without additional quota.
> Current Limit (Total VMs): 0
> ```
>
> **Atenção a dois mitos:**
> - ❌ **Não é o spending limit** da trial. Mesmo com o limite de gastos "On", o bloqueio é a
>   **cota regional de compute**, não dinheiro.
> - ❌ **Não existe "a região certa" universal.** A região liberada **muda de assinatura para
>   assinatura** — o que funciona para um colega pode dar "Total VMs: 0" para você. Cada aluno
>   precisa descobrir a **sua**.

### Passo a passo da varredura (CLI) 🧰
A ideia é simples: tentar criar um **App Service Plan F1 de teste** em algumas regiões e ficar
com a **primeira que não der o erro "Total VMs: 0"**. Depois apague os planos de teste.

1. Login e crie um Resource Group temporário só para o teste:
```bash
az login
az group create --name rg-scan-quota --location eastus
```

2. Tente criar um plano **F1** em várias regiões. Rode os comandos abaixo (um de cada vez): o
   que **terminar sem erro** indica uma região com cota. Os que falharem com *"Total VMs: 0"*
   estão zerados — só ignore.
```bash
# tente nesta ordem; pare assim que UM funcionar
az appservice plan create -g rg-scan-quota -n scan-eastus        --sku F1 --is-linux --location eastus
az appservice plan create -g rg-scan-quota -n scan-eastus2       --sku F1 --is-linux --location eastus2
az appservice plan create -g rg-scan-quota -n scan-westus2       --sku F1 --is-linux --location westus2
az appservice plan create -g rg-scan-quota -n scan-centralus     --sku F1 --is-linux --location centralus
az appservice plan create -g rg-scan-quota -n scan-brazilsouth   --sku F1 --is-linux --location brazilsouth
# se NENHUMA acima funcionar, amplie a varredura para outras regiões:
az appservice plan create -g rg-scan-quota -n scan-indonesia     --sku F1 --is-linux --location indonesiacentral
az appservice plan create -g rg-scan-quota -n scan-westeurope    --sku F1 --is-linux --location westeurope
az appservice plan create -g rg-scan-quota -n scan-southeastasia --sku F1 --is-linux --location southeastasia
```
> 💡 No nosso dry-run real, **todas** as regiões "óbvias" (eastus/eastus2/centralus/westus2/
> brazilsouth) deram "Total VMs: 0", e a que liberou foi **`indonesiacentral`**. Para você pode
> ser outra — por isso varremos uma lista ampla. **Evite `centralindia`**: ela não suporta
> Linux F1/B1.

3. A **primeira região que criar o plano com sucesso** é a SUA região. **Anote-a** — você vai
   usá-la em **todos** os recursos deste guia.

4. 🧹 **Apague o Resource Group de teste** (remove todos os planos de varredura de uma vez):
```bash
az group delete --name rg-scan-quota --yes --no-wait
```

> ✅ **Resumo da decisão:** use a região descoberta aqui no Resource Group (Fase 1), no Cosmos
> (Fase 2), nos dois Web Apps (Fases 3–4), na Function App (Fase 5) e, se usar o Bicep
> (Seção 16), passe `location=<sua-região>`. Onde o guia disser *"a mesma região"*, é **esta**.

---

## 5. Fase 1 — Resource Group

1. Portal → barra de busca → **Resource groups** → **+ Create**.
2. **Subscription:** sua trial. **Resource group:** `rg-bolao`.
3. **Region:** use **a região que você descobriu na Seção 4.1** (a que liberou cota de App
   Service). **Use a mesma em TODOS os recursos** deste guia. *(Não escolha "no chute": numa
   trial, a maioria das regiões dá "Total VMs: 0" ao criar o Web App lá na frente.)*
4. **Review + create** → **Create**.

---

## 6. Fase 2 — Cosmos DB (o banco) ⚠️ passo mais importante

### 6.1 Criar a conta
1. Portal → **Create a resource** → **Azure Cosmos DB** → **Create**.
2. API: **Azure Cosmos DB for NoSQL** → **Create**.
3. Preencha:
   - **Account Name:** `cosmos-fifa-bolao-<SUFIXO>`
   - **Location:** **a mesma do Resource Group** (a região da Seção 4.1)
   - **Capacity mode:** **Provisioned throughput**
   - **Apply Free Tier Discount:** **Apply** ✅
     > ⚠️ **Só pode haver 1 conta Cosmos com Free Tier por assinatura.** Se você já tem outra
     > conta Cosmos free-tier nessa mesma trial, **selecione "Do Not Apply"** aqui (senão a
     > criação falha) — os 1000 RU/s serão cobrados (centavos, cabe no crédito). No Bicep
     > (Seção 16) o equivalente é `cosmosEnableFreeTier=false`.
4. Aba **Networking:** **Public network access = All networks**
   *(simplicidade na trial — ver criticidade na seção 2)*.
5. **Review + create** → **Create**. Aguarde ~5 min.

### 6.2 Criar o database `bolao2026`
1. Abra a conta → **Data Explorer** → **New Database**.
2. **Database id:** `bolao2026`
3. Marque **Provision throughput** → **Manual** → **1000** RU/s
   *(throughput compartilhado entre todos os containers — cabe no Free Tier).*
4. **OK**.

### 6.3 Criar os containers
Para **cada** container: **New Container** → selecione o database **bolao2026** existente →
**Don't provision dedicated throughput** (usa o throughput do database) → defina **Container id**
e **Partition key** conforme a tabela → **OK**.

**Containers de DADOS (9):**

| Container id | Partition key |
|---|---|
| `users` | `/userId` |
| `predictions` | `/userId` |
| `specials` | `/userId` |
| `matches-cache` | `/groupCode` |
| `leaderboard` | `/season` |
| `groups` | `/season` |
| `players` | `/season` |
| `config` | `/scope` |
| `audit-log` | `/performedBy` |

**Containers de LEASE (5)** — ⚠️ **OBRIGATÓRIOS**, todos com partition key **`/id`**:

| Container id | Partition key |
|---|---|
| `leases-calc` | `/id` |
| `leases-specials` | `/id` |
| `leases-aggregate-predictions` | `/id` |
| `leases-aggregate-specials` | `/id` |
| `leases-emit-leaderboard` | `/id` |

> 🔴 **CRÍTICO:** as Functions **NÃO criam** esses 5 containers de lease sozinhas. Se você
> esquecer qualquer um, a função correspondente **falha em silêncio** (o app continua de pé,
> o host fica "Running", **mas o placar nunca atualiza**). Confira que existem **14 containers**
> no total antes de seguir (9 de dados + 5 leases).

### 6.4 Anotar as credenciais
Na conta Cosmos → **Settings → Keys**. Anote (vai usar nas configs e no seed):
- **URI** → ex.: `https://cosmos-fifa-bolao-<SUFIXO>.documents.azure.com:443/`
- **PRIMARY KEY** (chave longa)
- **PRIMARY CONNECTION STRING** (no formato `AccountEndpoint=...;AccountKey=...;`)

---

## 7. Fase 3 — Backend (Web App / API)

### 7.1 Criar o Web App
1. **Create a resource** → **Web App**.
2. Preencha:
   - **Name:** `app-fifa-bolao-<SUFIXO>`
   - **Publish:** **Code**
   - **Runtime stack:** **Node 20 LTS**
   - **OS:** **Linux**
   - **Region:** **a região da Seção 4.1** (a que liberou cota de App Service)
   - **App Service Plan:** **Create new** → SKU **B1** (recomendado) ou **F1** (grátis).
     *Reaproveitaremos esse plano no frontend.*
     > ⚠️ Se aparecer *"Operation cannot be completed without additional quota. Current Limit
     > (Total VMs): 0"*, você está numa região **sem cota** — volte à **Seção 4.1** e use a
     > região correta. **Não é spending limit; é cota regional.**
3. **Review + create** → **Create**.

### 7.2 Configurar (Environment variables)
No Web App → **Settings → Environment variables → App settings** → **+ Add** para cada linha:

| Nome | Valor |
|---|---|
| `COSMOS_ENDPOINT` | a **URI** do Cosmos (6.4) |
| `COSMOS_KEY` | a **PRIMARY KEY** do Cosmos (6.4) |
| `COSMOS_DATABASE` | `bolao2026` |
| `JWT_SECRET` | uma chave forte **≥ 32 caracteres** — gere: `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `CORS_ORIGINS` | `*` (simples) — depois troque pela URL do frontend (seção 11) |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

> Variáveis **opcionais** (pode deixar de fora na v1): `SIGNALR_CONNECTION_STRING`,
> `APPLICATIONINSIGHTS_CONNECTION_STRING`, `MAIN_API_BASE_URL`, `BCRYPT_ROUNDS`,
> `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`.

3. Aba **Settings → Configuration → General settings** → **Startup Command:**
   `node backend/dist/server.js` → **Save**.
4. **Save** as configurações (o app reinicia).

> 🔎 O backend valida as variáveis no boot: se faltar `COSMOS_ENDPOINT`, `COSMOS_KEY` ou um
> `JWT_SECRET` com menos de 32 caracteres, ele **não sobe**. Health check: `/api/health`.

---

## 8. Fase 4 — Frontend (Web App / SPA)

> ⚠️ **A URL da API é embutida no build do frontend** (`VITE_API_BASE_URL`). Por isso
> criamos o backend **antes** — agora já sabemos a URL dele.

### 8.1 Criar o Web App
1. **Create a resource** → **Web App**.
   - **Name:** `app-fifa-bolao-web-<SUFIXO>`
   - **Publish:** Code · **Runtime:** Node 20 LTS · **OS:** Linux
   - **Region:** **a mesma** (região da Seção 4.1)
   - **App Service Plan:** **selecione o mesmo plano** criado em 7.1 *(reaproveitar o plano
     evita pedir cota de novo)*.
2. **Create**.

### 8.2 Configurar
No Web App → **Settings → Configuration → General settings**:
- **Startup Command:** `node server.js` → **Save**.

*(O frontend não precisa de variáveis de ambiente em runtime — a URL da API vai embutida
no build, no passo 9.)*

---

## 9. Fase 5 — Function App (pontuação) + Storage

### 9.1 Criar
1. **Create a resource** → **Function App** → **Consumption** (Serverless).
2. Preencha:
   - **Name:** `func-fifa-bolao-<SUFIXO>`
   - **Runtime stack:** **Node.js** · **Version:** **20 LTS**
   - **Region:** **a mesma** (região da Seção 4.1)
   - **Operating System:** **Windows** *(o plano Consumo Linux nem sempre está disponível
     na região; Windows + Node é o caminho mais estável)*
   - **Storage account:** deixe o assistente **criar uma nova** (as Functions exigem).
3. **Create**.

### 9.2 Configurar (Environment variables → App settings)
Adicione:

| Nome | Valor |
|---|---|
| `AzureWebJobsCosmosDBConnection` | a **PRIMARY CONNECTION STRING** do Cosmos (6.4) |
| `COSMOS_DATABASE` | `bolao2026` |

> 🔴 **CRÍTICO:** o trigger das Functions usa **`AzureWebJobsCosmosDBConnection`** (string
> completa `AccountEndpoint=...;AccountKey=...;`). Sem ela — ou com o Cosmos bloqueando rede —
> o Change Feed não conecta e **a pontuação não roda** (sem erro visível). Como deixamos o
> Cosmos em "Todas as redes" (6.1), aqui não há firewall para tropeçar.

*(`AzureWebJobsStorage`, `FUNCTIONS_WORKER_RUNTIME=node` e `FUNCTIONS_EXTENSION_VERSION=~4`
já vêm configurados pelo assistente.)*
*(Opcional p/ tempo real: `SIGNALR_CONNECTION_STRING` — só se fizer a Fase SignalR.)*

---

## 10. Fase 6 — Deploy do código

Escolha **um** caminho. O **Caminho B (GitHub Actions) é o recomendado**: depois de configurado,
cada deploy é um clique (ou um `git push`).

> Em **ambos**, os recursos já devem existir (Fases 1–9) com os nomes `<tipo>-fifa-bolao-<SUFIXO>`,
> e as app settings do **backend** (Fase 7.2) e das **Functions** (Fase 9.2) já configuradas.

---

### 🅱️ Caminho B — GitHub Actions (recomendado)

O seu fork já inclui o workflow `.github/workflows/deploy.yml`, que **builda e publica** backend,
frontend e functions. O workflow monta os nomes como `<tipo>-fifa-bolao-${NAME_SUFFIX}` — por
isso a convenção de nomes importa. Ele **não cria** recursos, só publica o código.

#### B.1 — Criar o Service Principal (permissão de deploy) 🧰
Descubra seu subscription id: `az account show --query id -o tsv`. Depois:
```bash
az ad sp create-for-rbac --name "bolao-deploy-<SUFIXO>" \
  --role Contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/rg-bolao \
  --json-auth
```
Copie **todo o JSON** retornado (começa em `{ "clientId": ...`).
> Em CLIs mais antigas use `--sdk-auth` no lugar de `--json-auth`. O escopo limita a permissão
> **só ao seu Resource Group** (boa prática). Se o seu RG tiver outro nome, ajuste o `--scopes`.

#### B.2 — Configurar no GitHub
No **seu fork** → **Settings → Secrets and variables → Actions**:

**Secrets** (aba *Secrets* → *New repository secret*):
| Secret | Valor |
|---|---|
| `AZURE_CREDENTIALS` | o **JSON inteiro** do passo B.1 |
| `SIGNALR_CONNECTION_STRING` | *(opcional)* connection string do SignalR — só se for usar tempo real |

**Variables** (aba *Variables* → *New repository variable*):
| Variable | Valor |
|---|---|
| `NAME_SUFFIX` | o seu **`<SUFIXO>`** (ex.: `joao01`) — **obrigatório** |
| `AZURE_RG` | o nome do seu Resource Group (ex.: `rg-bolao`) |

> 🔎 **Criticidade:** sem `NAME_SUFFIX`, o workflow montaria nomes inválidos (`app-fifa-bolao-`)
> e o deploy falharia. Confira que ele bate **exatamente** com o sufixo usado nos recursos.

#### B.3 — Disparar o deploy
1. No fork → aba **Actions** → clique no botão verde para **habilitar os workflows** (1ª vez).
2. Selecione o workflow **Deploy** → **Run workflow** → branch `main` → **Run workflow**.
   *(Depois, qualquer `git push` na `main` dispara o deploy automático do que mudou.)*
3. Acompanhe os jobs: **Deploy API → Deploy Frontend → Deploy Functions → Smoke tests**.

> ℹ️ O workflow ajusta sozinho as app settings de **Cosmos e SignalR nas Functions**. As do
> **backend** (`COSMOS_*`, `JWT_SECRET`…) são as que você setou no Portal (Fase 7.2).
> O *smoke test* confere, entre outras coisas, que a API responde **72 jogos** — então rode o
> **seed (Fase 7)** antes, ou ignore esse item até semear.

✅ Terminou o Caminho B? **Pule para a Fase 7 (seed).**

---

### 🅰️ Caminho A — Manual (VS Code / CLI) 🧰

Use este se preferir não configurar o GitHub Actions. Aqui é **inevitável o terminal** (não dá
para compilar pelo Portal). Faça login uma vez: `az login`.

> ⭐ **Método mais robusto (recomendado): use o script pronto `scripts/deploy.sh`.** Ele é o
> mesmo método da **produção**: empacota o backend e publica via **Run-From-Package**
> (`az webapp deploy --type zip` + `WEBSITE_RUN_FROM_PACKAGE=1`), o que evita corrupção de
> `node_modules` no deploy (problema clássico do Oryx/rsync em ESM). Basta apontar para os
> seus recursos:
> ```bash
> RG=rg-bolao APP=app-fifa-bolao-<SUFIXO> ./scripts/deploy.sh
> ```
> (No Windows, rode pelo **Git Bash** ou **WSL**.) Se preferir os passos manuais, siga abaixo.

#### A.1 Backend (manual)
```bash
# na raiz do projeto clonado
npm run build --workspace=backend

# empacota só o backend já compilado + dependências de produção
cd backend && npm install --omit=dev && cd ..
# cria o zip (Windows PowerShell: Compress-Archive; Linux/Mac: zip -r)
#   o conteúdo precisa ter a pasta backend/ com dist/ e node_modules/
```
Deploy pelo Portal (sem zip manual) — **caminho recomendado para iniciantes**:
> No VS Code, instale a extensão **Azure App Service**, faça login, clique direito no Web App
> `app-fifa-bolao-<SUFIXO>` → **Deploy to Web App** → selecione a pasta **`backend`** (após o build).
> Confirme o **Startup Command** `node dist/server.js` se deployar a pasta `backend` isolada,
> ou `node backend/dist/server.js` se deployar a raiz.

Alternativa CLI (zip deploy — mesmo modo do `deploy.sh`):
```bash
az webapp deploy --resource-group rg-bolao --name app-fifa-bolao-<SUFIXO> \
  --type zip --src-path backend.zip
```
> ⚠️ **Não tente publicar por FTP/FTPS.** O hardening de segurança deste projeto deixa o
> **FTP desabilitado** (`ftpsState=Disabled`) em todos os Web Apps e na Function App. Use
> **zip deploy** (acima), VS Code ou GitHub Actions. Para diagnosticar, use o **Log stream**
> do Portal (ver Troubleshooting), não FTP.

✅ Valide: abra `https://app-fifa-bolao-<SUFIXO>.azurewebsites.net/api/health` → deve responder OK.
> Se vier **"Application Error"**, o backend crashou no boot — abra o **Log stream** do Portal
> (Web App → **Monitoring → Log stream**) e veja o erro. Causas mais comuns: `JWT_SECRET` com
> menos de 32 chars, `COSMOS_ENDPOINT`/`COSMOS_KEY` errados, ou Startup Command incorreto
> (deve ser `node backend/dist/server.js` quando se deploya a raiz). Ver Seção 13.

#### A.2 Frontend (lembre: a URL da API entra no build!)
```bash
# embute a URL do SEU backend no build
VITE_API_BASE_URL="https://app-fifa-bolao-<SUFIXO>.azurewebsites.net/api" \
  npm run build --workspace=frontend
```
Monte a pasta de publicação com o mini-servidor + os estáticos:
```
publish/
├── server.js           (copie de frontend-server/server.js)
├── package.json        (copie de frontend-server/package.json)
└── (conteúdo de frontend/dist/  ← copie tudo para a RAIZ de publish/)
```
🧰 `cd publish && npm install --omit=dev` (instala o express).
Deploy (VS Code → Deploy to Web App → pasta `publish`; **Startup** `node server.js`) ou:
```bash
az webapp deploy --resource-group rg-bolao --name app-fifa-bolao-web-<SUFIXO> \
  --type zip --src-path publish.zip
```
✅ Valide: `https://app-fifa-bolao-web-<SUFIXO>.azurewebsites.net/healthz` → `ok`.

#### A.3 Functions
```bash
npm run build --workspace=functions
cd functions && npm install --omit=dev && cd ..
```
Deploy (VS Code → extensão **Azure Functions** → Deploy to Function App → pasta `functions`) ou:
```bash
func azure functionapp publish func-fifa-bolao-<SUFIXO>   # requer Azure Functions Core Tools
```
✅ Valide: no Portal, Function App → **Functions** deve listar 6 funções
(`calc-predictions`, `aggregate-from-predictions`, `aggregate-from-specials`,
`calc-specials`, `emit-leaderboard-update`, `health-check-cron`).

---

## 11. Fase 7 — Carga inicial de dados (seed) 🧰

Cria o **admin**, os **72 jogos da fase de grupos**, os **12 grupos (48 seleções)**, o
**catálogo de jogadores** (48 seleções / ~1247 jogadores, usado no palpite de artilheiro) e a
entrada zerada do admin no leaderboard. *(Os jogos de mata-mata são lançados depois, pelo admin.)*

🧰 Na **raiz** do projeto, crie um arquivo `.env` com as credenciais do **seu** Cosmos:
```dotenv
COSMOS_ENDPOINT=https://cosmos-fifa-bolao-<SUFIXO>.documents.azure.com:443/
COSMOS_KEY=<sua PRIMARY KEY>
COSMOS_DATABASE=bolao2026
# defina o SEU admin:
SEED_ADMIN_EMAIL=voce@exemplo.com
SEED_ADMIN_PASSWORD=SuaSenhaForte!
SEED_ADMIN_NAME=Seu Nome
```
Rode:
```bash
npm run seed
```
Deve terminar com: 1 admin criado, **72 jogos**, **12 grupos / 48 seleções**, **48 seleções /
~1247 jogadores (players)**, leaderboard inicializado. *(Idempotente — pode rodar de novo sem duplicar.)*

> 💡 Como deixamos o Cosmos em "Todas as redes", o seed roda direto do seu PC. Se você tivesse
> escolhido "Selected networks", precisaria liberar o **seu IP** no firewall do Cosmos primeiro.

---

## 12. Fase 8 — Primeiro acesso e validação

1. Abra o frontend: `https://app-fifa-bolao-web-<SUFIXO>.azurewebsites.net`
2. **Login** com o admin do seed (`SEED_ADMIN_EMAIL` / senha).
3. **Ajuste o CORS** ⚠️ **(obrigatório antes de divulgar a URL)**: no **backend** → Environment
   variables → troque `CORS_ORIGINS` de `*` para `https://app-fifa-bolao-web-<SUFIXO>.azurewebsites.net`
   → Save. *(Deixar `*` num app público é uma brecha de segurança.)*

### ✅ Smoke test final ("está tudo funcionando")
Rode esta lista de cima a baixo — se todos os itens passarem, sua instância está pronta:
- [ ] **14 containers** no Cosmos (9 dados + 5 leases) — confira no Data Explorer (6.3)
- [ ] **Seed concluído** (Fase 7): 72 jogos, 12 grupos/48 seleções, ~1247 players, admin criado
- [ ] `https://app-fifa-bolao-<SUFIXO>.azurewebsites.net/api/health` do **backend** responde OK
      *(se vier "Application Error", veja o Log stream — Seção 13)*
- [ ] `https://app-fifa-bolao-web-<SUFIXO>.azurewebsites.net/healthz` do **frontend** responde `ok`
- [ ] **Login do admin** funciona (`SEED_ADMIN_EMAIL` / senha do seed)
- [ ] A **tela de palpites mostra os 72 jogos** de grupos
- [ ] Function App lista **6 funções** (Portal → Function App → Functions)
- [ ] **Teste de pontuação ponta a ponta:** crie um palpite, depois no **Admin → Resultados**
      lance o placar desse jogo. Em ~30s o **leaderboard** deve atualizar sozinho.
      → Se **não** atualizar: o problema está nas Functions/leases (veja Seção 13).

---

## 13. 🔧 Problemas comuns (criticidade técnica)

| Sintoma | Causa provável | Correção |
|---|---|---|
| **Erro ao criar Web App / App Service Plan: `"Operation cannot be completed without additional quota. Current Limit (Total VMs): 0"`** | **Região sem cota de App Service na sua trial** (cota é **regional** e quase sempre zerada). **NÃO é spending limit.** | Rode a varredura da **Seção 4.1** para achar uma região que a SUA trial libera e **recrie os recursos nessa região**. A região varia por assinatura; no dry-run só `indonesiacentral` funcionou. Evite `centralindia` (sem Linux F1/B1) |
| **Frontend/Backend retorna "Application Error" (página azul do Azure)** | O processo Node **crashou no boot** | Abra o **Log stream** do Portal (Web App → **Monitoring → Log stream**) e leia o stack. Verifique: variáveis `COSMOS_*`/`JWT_SECRET` (≥32 chars) (7.2), **Startup Command** correto (`node backend/dist/server.js` na raiz, ou `node dist/server.js` se deployou só `backend/`), e que `PORT=8080`. ⚠️ **Não use FTP** para investigar (desabilitado pelo hardening) — use o **Log stream** |
| **Deploy do código trava / cai / `az webapp deploy` dá timeout** | Rede ruim + **SCM/Kudu** (`*.scm.azurewebsites.net`) é frágil em conexões instáveis | Prefira o **Caminho B (GitHub Actions)** — o build/upload acontece na nuvem, não na sua rede. Se insistir no manual, use `scripts/deploy.sh` (Run-From-Package) e tente novamente em rede estável |
| **Lancei resultado e o placar não muda** | Falta um container `leases-*`; a Function não conecta no Cosmos; ou a Function em plano Consumo **hibernou** e o Change Feed não reativou | Confira os **5 leases** (6.3) e o `AzureWebJobsCosmosDBConnection` (9.2); **reinicie** a Function App. ⚠️ Em Consumo (Y1) as Functions hibernam quando ociosas e às vezes o Change Feed só volta após **restart** — se for usar em evento real e longo, considere um plano *Elastic Premium/Flex* (instância sempre ativa) |
| Backend não sobe / erro 500 no boot | `JWT_SECRET` < 32 chars, ou Cosmos endpoint/key errados | Revise as variáveis (7.2); veja o **Log stream** do Portal |
| Cosmos: criação da conta falha ao marcar "Apply Free Tier" | Já existe **outra conta Cosmos free-tier** na assinatura (limite de **1 por assinatura**) | Crie esta com **"Do Not Apply"** (Free Tier desligado), ou no Bicep `cosmosEnableFreeTier=false` (6.1) |
| Frontend chama a API errada / CORS bloqueado | Frontend buildado com a URL errada, ou `CORS_ORIGINS` restrito demais | **Caminho B:** confira a variável `NAME_SUFFIX` e rode o workflow de novo. **Caminho A:** rebuild com `VITE_API_BASE_URL` certa (A.2); ajuste `CORS_ORIGINS` (12) |
| Workflow do GitHub falha no login Azure | `AZURE_CREDENTIALS` ausente/!= JSON do SP, ou `NAME_SUFFIX` não definido | Refaça o B.1/B.2; o secret deve ser o **JSON completo**; confirme as Variables |
| Mudei o frontend e o navegador mostra o antigo | **PWA / Service Worker** com cache | Hard-reload (Ctrl+Shift+R) ou DevTools → Application → Service Workers → **Unregister** |
| Seed falha com 403 (Forbidden) | Cosmos em "Selected networks" sem o seu IP liberado | Mude para "All networks" (6.1) ou libere seu IP no firewall do Cosmos |
| Cosmos lento / erro 429 | Estourou os 1000 RU/s do Free Tier | Normal sob carga alta; aguarde ou aumente RU/s (sai do free) |

---

## 14. 🧹 Encerramento (parar custos)

Ao terminar os testes: Portal → **Resource groups** → `rg-bolao` → **Delete resource group**
(digite o nome para confirmar). Isso remove **tudo** de uma vez e zera qualquer cobrança.

---

## 15. (Opcional) Atalho via Bicep para quem já conhece CLI 🧰

O repositório traz `infra/main.bicep`, que cria **todos** os recursos (backend, **frontend Web
App**, Cosmos, Functions, Storage) e **os 14 containers** (9 de dados + 5 leases) de uma só vez —
eliminando o risco de esquecer um lease container:
```bash
# use a região que você descobriu na Seção 4.1 (NÃO chute eastus):
az group create --name rg-bolao --location <SUA_REGIAO>
az deployment group create --resource-group rg-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.example.json \
  --parameters nameSuffix=<SUFIXO> location=<SUA_REGIAO> jwtSecret="$(openssl rand -base64 32)"
```
> 🔴 **Passe `location=<SUA_REGIAO>`** (a região da Seção 4.1). O `main.bicep` aceita **qualquer**
> região (o antigo `@allowed` que travava em eastus/eastus2/etc. foi removido justamente porque
> nenhuma delas tem cota numa trial). Sem a região certa, o deploy do App Service Plan falha com
> *"Total VMs: 0"*.
> Se você **já tem** outra conta Cosmos com Free Tier na assinatura, adicione também
> `cosmosEnableFreeTier=false` (só 1 free-tier por assinatura — Seção 6.1).
> Mesmo usando o Bicep, os passos de **build/deploy do código** (Fase 6) e **seed** (Fase 7)
> continuam necessários.

---

### Mapa rápido dos nomes (preencha o seu `<SUFIXO>`)
| Componente | Nome | URL |
|---|---|---|
| Resource Group | `rg-bolao` | — |
| Cosmos DB | `cosmos-fifa-bolao-<SUFIXO>` | `…documents.azure.com` |
| Backend (API) | `app-fifa-bolao-<SUFIXO>` | `https://app-fifa-bolao-<SUFIXO>.azurewebsites.net` |
| Frontend (SPA) | `app-fifa-bolao-web-<SUFIXO>` | `https://app-fifa-bolao-web-<SUFIXO>.azurewebsites.net` |
| Function App | `func-fifa-bolao-<SUFIXO>` | — |
| SignalR (opcional) | `signalr-fifa-bolao-<SUFIXO>` | — |
