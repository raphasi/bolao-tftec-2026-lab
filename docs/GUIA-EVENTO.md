# 🏆 Copa do Mundo Azure — Guia do Evento TFTEC

> ⚽ **Bem-vindo(a) ao gramado!** Neste evento você vai **construir do zero** o seu próprio ambiente em nuvem, do apito inicial ao apito final, e colocar no ar a aplicação **Bolão TFTEC Cloud — FIFA World Cup 2026**.
>
> 🥅 **Para todos os níveis.** Você não precisa ser sênior. Cada passo é explicado em detalhe, com o **caminho visual pelo Portal do Azure** sempre que possível — porque aqui a ideia é **entender o que você está fazendo**, não só copiar comando.

> 🚧 **Documento vivo.** Este guia evolui junto com o projeto. Itens marcados com _⚠️ a confirmar_ serão fixados conforme o evento se aproxima (ex.: URL do repositório público). A estrutura, a arquitetura e os passos já valem.

---

## 📋 Índice

1. [Sobre a aplicação](#-1-sobre-a-aplicação)
2. [Objetivos do evento](#-2-objetivos-do-evento)
3. [Tecnologias Azure que vamos usar](#-3-tecnologias-azure-que-vamos-usar)
4. [Arquitetura da aplicação](#-4-arquitetura-da-aplicação)
5. [A jornada do aluno](#-5-a-jornada-do-aluno)
   - [🎽 Fase 0 — Pré-jogo: pré-requisitos](#-fase-0--pré-jogo-pré-requisitos)
   - [🤝 Fase 1 — Convocação: fork do repositório](#-fase-1--convocação-fork-do-repositório)
   - [🏟️ Fase 2 — Fase de Grupos: criar os recursos no Portal](#️-fase-2--fase-de-grupos-criar-os-recursos-no-portal)
   - [🔐 Fase 3 — Oitavas: Key Vault e segredos](#-fase-3--oitavas-key-vault-e-segredos)
   - [⚙️ Fase 4 — Quartas: CI/CD com GitHub Actions](#️-fase-4--quartas-cicd-com-github-actions)
   - [🚀 Fase 5 — Semifinal: primeiro deploy + seed](#-fase-5--semifinal-primeiro-deploy--seed)
   - [🏆 Fase 6 — Final: validar e comemorar](#-fase-6--final-validar-e-comemorar)
   - [🎖️ Fase 7 — Pós-jogo: observabilidade e troubleshooting](#️-fase-7--pós-jogo-observabilidade-e-troubleshooting)
6. [Tabela de variáveis e segredos](#-6-tabela-de-variáveis-e-segredos)

---

## ⚽ 1. Sobre a aplicação

O **Bolão TFTEC Cloud** é um app de **palpites da Copa do Mundo FIFA 2026**. O torcedor se cadastra, palpita o placar dos jogos e os campeões/artilheiro, e disputa um **leaderboard ao vivo** que atualiza em tempo real conforme os resultados saem.

É uma aplicação **real, completa e moderna** — não um "hello world":

- 🎯 **Palpites por jogo** (72 jogos da fase de grupos) + **palpites especiais** (campeão, top 4, artilheiro)
- 🏅 **Pontuação automática** — quando um jogo é finalizado, os pontos de todos os palpiteiros são calculados sozinhos (regra **25/15/0**: placar exato 25, acertou vencedor/empate 15, errou 0)
- 📊 **Leaderboard em tempo real** — o ranking se reordena na tela sem refresh
- 📱 **PWA** — instalável no celular como um app
- 🔐 **Autenticação própria** (cadastro/login com senha)
- 🛠️ **Painel admin** para registrar resultados

> 💡 **Por que esse app?** Ele toca em tudo que importa numa arquitetura de nuvem real: API, banco NoSQL, processamento assíncrono, tempo real, segurança, segredos, observabilidade e **deploy automatizado (CI/CD)**.

---

## 🎯 2. Objetivos do evento

Ao final, você terá feito **com as suas próprias mãos**:

| # | Você vai aprender a... |
|---|---|
| 1 | Criar e organizar recursos no **Azure** usando o **Portal** (caminho visual) |
| 2 | Provisionar **banco NoSQL** (Cosmos), **tempo real** (SignalR) e **serverless** (Functions) |
| 3 | Hospedar uma aplicação web (front + back) num **App Service** |
| 4 | Guardar segredos com segurança no **Key Vault** (nada de senha no código!) |
| 5 | Configurar **CI/CD com GitHub Actions** — dar `git push` e o deploy acontecer sozinho |
| 6 | Ligar **observabilidade** (Application Insights) e diagnosticar problemas |
| 7 | Entender **como as peças se conectam** numa arquitetura de produção |

> 🧠 **Filosofia:** preferimos o **Portal do Azure** (clicar e ver) a rodar scripts. Script só quando for **realmente necessário** (e isso está sinalizado no guia). O objetivo é você **sair sabendo o que cada recurso faz**.

---

## ☁️ 3. Tecnologias Azure que vamos usar

Tudo dentro de **um Resource Group** (`rg-fifa-bolao`). Você escolhe um **sufixo único** (ex.: `joao2026`) que entra no nome dos recursos — porque vários nomes são **globais** no Azure.

| Serviço Azure | Para que serve no Bolão | Camada / Custo |
|---|---|---|
| 🟦 **App Service (Plan B1 Linux)** | Hospeda backend Express + frontend React (mesma origem) | B1 (~$13/mês) |
| 🟩 **Azure Cosmos DB** (NoSQL) | Usuários, palpites, jogos, ranking | Free Tier (1000 RU/s, 25 GB) |
| 🟪 **Azure Functions** (Consumption) | Sincroniza jogos e **calcula os pontos** | Y1 — 1M req/mês grátis |
| 🟧 **Azure SignalR Service** | Empurra o leaderboard **em tempo real** | Free_F1 (serverless) |
| 🔑 **Azure Key Vault** | Guarda segredos (Cosmos, JWT, SignalR) **fora do código** | Free (operações) |
| 📈 **Application Insights + Log Analytics** | Logs, métricas, diagnóstico | Free (5 GB/mês) |
| 💾 **Storage Account** | Runtime da Function App + pacote de deploy | Standard_LRS |
| 🤖 **GitHub Actions** (CI/CD) | Build + deploy automáticos a cada push | Grátis (repo público) |

> 💰 **Custo total:** ~**$13/mês** (só o App Service B1; o resto cabe no _free tier_). Configure um **alerta de orçamento** (Fase 0) para ficar tranquilo.

---

## 🗺️ 4. Arquitetura da aplicação

O "mapa do estádio" — como as peças se encaixam:

```
                          🌎 TORCEDOR (navegador / celular)
                                      │  HTTPS
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │           🟦 AZURE APP SERVICE  (Plan B1 Linux)          │
        │  ┌───────────────────────────────────────────────────┐  │
        │  │  Express 5 (Node 20)                               │  │
        │  │  • API  /api/*  (auth, palpites, leaderboard)      │  │
        │  │  • Serve o frontend React (SPA build)              │  │
        │  └───────────────────────────────────────────────────┘  │
        └───────┬───────────────────────────────────┬─────────────┘
                │ Cosmos SDK                         │ SignalR SDK
                ▼                                    ▼
   ┌───────────────────────────┐        ┌───────────────────────────┐
   │   🟩 AZURE COSMOS DB      │        │  🟧 AZURE SIGNALR SERVICE │
   │   (NoSQL, Free Tier)      │        │     (Free, Serverless)    │
   │  • users                  │        │   Hub: leaderboard 🏅     │
   │  • predictions (palpites) │        └─────────────▲─────────────┘
   │  • specials               │                      │ broadcast
   │  • matches-cache (jogos)  │                      │ (output binding)
   │  • leaderboard            │                      │
   └─────────────▲─────────────┘                      │
                 │ leitura/escrita                    │
        ┌────────┴────────────────────────────────────┴──────────┐
        │            🟪 AZURE FUNCTIONS  (Consumption Y1)         │
        │  sync-matches (timer)  •  calculate-points (changefeed) │
        │  → calcula pontos 25/15/0 → atualiza ranking → SignalR📡 │
        └──────────────────────────────┬──────────────────────────┘
                                        │
        🔑 KEY VAULT  ──── segredos ────┤  (Cosmos, JWT, SignalR — nunca no código)
        📈 APP INSIGHTS ─── logs/métricas de tudo acima
        💾 STORAGE ──────── runtime das Functions + pacote de deploy

        ───────────────────────────────────────────────────────────
        🤖 GITHUB ACTIONS:  git push  →  build  →  deploy automático
                            (autentica via Service Principal;
                             segredos vêm do Key Vault / GitHub)
```

**Princípios de design (e o que isso ensina):**

- 🔒 **Zero segredo no código.** Cosmos/JWT/SignalR vivem no **Key Vault**; o pipeline os lê em runtime. Você **não edita código** para configurar o seu ambiente — só define **1 Variable + 1 Secret** no GitHub.
- 🔁 **Front + back na mesma origem** → sem CORS em produção.
- ⚡ **Processamento assíncrono.** Quem calcula ponto é a **Function**, não a tela — o app continua rápido.
- 📡 **Tempo real de verdade.** Function → SignalR → navegador → ranking se reordena sozinho.
- 🤖 **Deploy é botão, não ritual.** `git push` → GitHub Actions builda e publica.

> 🧭 **Esta é a arquitetura de _aprendizado_ (intencionalmente simples).** O ambiente de **produção de referência** do Bolão é mais endurecido (front/API separados, Cosmos por Private Endpoint, segredos via Key Vault references + Managed Identity) — Epic S6/ADR-020 **concluído**. Você monta a versão simples para entender as peças; o "nível produção" está na **Seção 7** e no [`setup-portal.md`](./setup-portal.md) para estudo.

---

## 🧭 5. A jornada do aluno

A jornada segue o espírito da Copa: **da preparação ao título**.

| Fase | Etapa | Tempo aprox. |
|---|---|---|
| 🎽 Pré-jogo | 0. Pré-requisitos | 10 min |
| 🤝 Convocação | 1. Fork do repositório | 5 min |
| 🏟️ Fase de Grupos | 2. Criar recursos no Portal | 40 min |
| 🔐 Oitavas | 3. Key Vault e segredos | 15 min |
| ⚙️ Quartas | 4. CI/CD com GitHub Actions | 15 min |
| 🚀 Semifinal | 5. Primeiro deploy + seed | 15 min |
| 🏆 Final | 6. Validar e comemorar | 10 min |
| 🎖️ Pós-jogo | 7. Observabilidade e troubleshooting | livre |

> 🧩 **Como o código chega até você:** ele fica num **repositório público no GitHub**. Você faz um **fork** para a sua conta e trabalha a partir dele. O **GitHub Actions já vem pronto no projeto** — você só conecta o seu ambiente via 1 Variable + 1 Secret. **Nada de alterar código-fonte.**

---

### 🎽 Fase 0 — Pré-jogo: pré-requisitos

**O que você precisa ter antes de começar:**

- [ ] **Conta Azure ativa** — [azure.microsoft.com/free](https://azure.microsoft.com/free/) (crédito de estudante ou trial servem)
- [ ] **Conta GitHub** — [github.com](https://github.com/) (gratuita)
- [ ] **Navegador moderno** (Chrome/Edge/Firefox)
- [ ] **Bloco de notas** aberto para anotar valores (endpoints, chaves) durante a Fase 2
- [ ] _(Só para a Fase 5 — seed)_ **Node.js 20+** e **Git** instalados na sua máquina

**Confirme o acesso ao Azure:**
1. Entre em [portal.azure.com](https://portal.azure.com)
2. Topo direito → confirme que há uma **Subscription** ativa (Subscriptions → status *Active*)

**Configure um alerta de orçamento (recomendado):**
1. Portal → busque **Cost Management** → **Budgets** → **+ Add**
2. Amount: `$20` / mês · Alerta em **80%** e **100%** → seu e-mail
3. Assim você nunca é surpreendido pela fatura.

> ✅ **Pronto quando:** você consegue abrir o Portal do Azure e vê uma subscription ativa.

---

### 🤝 Fase 1 — Convocação: fork do repositório

O código da aplicação está num **repositório público**. Você vai **forkar** (copiar para a sua conta).

1. Acesse o repositório público: **`https://github.com/TFTEC/<repo-publico>`** _(⚠️ a confirmar — URL final divulgada no evento)_
2. Botão **Fork** (canto superior direito) → **Create fork** (deixe na sua conta pessoal)
3. Você cai no **seu** fork: `https://github.com/<seu-usuario>/<repo>`
4. **Habilite o GitHub Actions no fork** (forks vêm com Actions desabilitado por segurança):
   - No seu fork → aba **Actions** → clique em **"I understand my workflows, go ahead and enable them"**

> 💡 Você **não precisa clonar** o repositório para a maioria das fases — tudo é feito pelo Portal do Azure e pela interface do GitHub. O clone só aparece na **Fase 5** (seed de dados), e é opcional.

> ✅ **Pronto quando:** existe um fork na sua conta com a aba **Actions** habilitada.

---

### 🏟️ Fase 2 — Fase de Grupos: criar os recursos no Portal

A maratona principal — **9 recursos, na ordem, todo clique explicado**. Reserve ~40 min. Tudo é feito em [portal.azure.com](https://portal.azure.com). Ao final, valide com a checklist no fim da fase.

> 💡 **Como criar qualquer recurso no Azure:** no topo do Portal há uma **barra de busca**. Digite o nome do serviço (ex.: "Cosmos DB"), clique no resultado, e use o botão **+ Create** (ou **Create**). Toda criação termina numa aba **Review + create** → clique em **Create** e aguarde a notificação "deployment succeeded".

#### 🎽 Passo 0 — Escolha o seu sufixo

Escolha um **sufixo único** (3-12 caracteres, minúsculo, só letras/números, sem espaço): **seu nome + ano** funciona bem → ex.: **`joao2026`**. **Use exatamente o MESMO sufixo em todos os recursos.** Anote num bloco de notas — você vai reusá-lo na Fase 4.

> 📌 Onde aparece `<suffix>` abaixo, troque pelo seu (ex.: `joao2026`). A **região** é a mesma para tudo — use **East US 2** (ou a definida pela turma).

---

#### 1️⃣ Resource Group — `rg-fifa-bolao`

O "armário" que guarda todos os recursos (facilita achar e apagar tudo junto no fim).

1. Busca → **Resource groups** → **+ Create**
2. **Subscription:** a sua
3. **Resource group:** `rg-fifa-bolao`
4. **Region:** East US 2
5. **Review + create** → **Create**

---

#### 2️⃣ Log Analytics Workspace — `log-fifa-bolao-<suffix>`

É o "caderno" onde os logs/métricas ficam guardados (o App Insights usa ele por baixo).

1. Busca → **Log Analytics workspaces** → **+ Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Name:** `log-fifa-bolao-<suffix>`
4. **Region:** East US 2
5. Aba **Pricing tier:** deixe **Pay-as-you-go (Per GB 2018)** (tem 5 GB grátis/mês)
6. (Se aparecer **Retention**) → **30 days**
7. **Review + create** → **Create**

---

#### 3️⃣ Application Insights — `ai-fifa-bolao-<suffix>`

A "câmera" que observa o app: requests, erros, performance.

1. Busca → **Application Insights** → **+ Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Name:** `ai-fifa-bolao-<suffix>`
4. **Region:** East US 2
5. **Resource Mode:** **Workspace-based** (padrão)
6. **Log Analytics Workspace:** selecione o `log-fifa-bolao-<suffix>` criado no passo 2
7. **Review + create** → **Create**
8. Após criar → abra o recurso → **Overview** → 📋 **copie a `Connection String`** e cole no seu bloco de notas (rótulo: *AI Connection String*)

---

#### 4️⃣ Cosmos DB (NoSQL) — `cosmos-fifa-bolao-<suffix>`

O banco de dados principal (usuários, palpites, jogos, ranking). **Este é o passo mais longo (~8 min só pra criar a conta).**

**4a. Criar a conta:**
1. Busca → **Azure Cosmos DB** → **+ Create** → na lista escolha **Azure Cosmos DB for NoSQL** → **Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Account Name:** `cosmos-fifa-bolao-<suffix>`
4. **Location:** East US 2
5. **Capacity mode:** **Provisioned throughput**
6. ✅ **Apply Free Tier Discount: Apply** ← **MUITO IMPORTANTE** (1000 RU/s grátis para sempre; sem isso vira custo)
7. **Review + create** → **Create** → ⏳ **espere 5-8 minutos** (vá tomar um café)

**4b. Criar o database:**
1. Abra a conta criada → menu lateral → **Data Explorer**
2. Botão **New Database**
3. **Database id:** `bolao2026`
4. ✅ Marque **Provision throughput** → **Manual** → **1000** RU/s → **OK**

**4c. Criar os 5 containers** (Data Explorer → **New Container**, repita 5×):

Para **cada** container: **Database id:** *Use existing* → `bolao2026` · **Container id** e **Partition key** conforme a tabela · **Container throughput:** *Use database throughput* → **OK**

| Container id | Partition key |
|---|---|
| `users` | `/userId` |
| `predictions` | `/userId` |
| `specials` | `/userId` |
| `matches-cache` | `/groupCode` |
| `leaderboard` | `/season` |

**4d. Anotar credenciais:**
1. Menu lateral → **Settings → Keys**
2. 📋 Copie a **URI** (rótulo: *Cosmos URI*) e a **PRIMARY KEY** (rótulo: *Cosmos Primary Key*) para o bloco de notas

---

#### 5️⃣ Storage Account — `stfifabolao<suffix>`

A Function App **exige** uma storage account para funcionar (guarda estado interno + o pacote de deploy).

1. Busca → **Storage accounts** → **+ Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Storage account name:** `stfifabolao<suffix>` ← **minúsculo, SEM hífen**, 3-24 chars (ex.: `stfifabolaojoao2026`)
4. **Region:** East US 2
5. **Performance:** Standard
6. **Redundancy:** **LRS** (Locally-redundant storage — mais barato)
7. Aba **Security:** Minimum TLS version **1.2**; **Allow blob anonymous access: Disabled**
8. **Review + create** → **Create**
9. Após criar → **Security + networking → Access keys** → em **key1** clique **Show** → 📋 copie a **Connection string** (rótulo: *Storage Connection String*)

---

#### 6️⃣ SignalR Service — `signalr-fifa-bolao-<suffix>`

O serviço de **tempo real** (empurra a atualização do leaderboard pro navegador).

1. Busca → **SignalR** → **SignalR Service** → **+ Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Resource name:** `signalr-fifa-bolao-<suffix>`
4. **Region:** East US 2
5. **Pricing tier:** clique em **Change** → **Free_F1** → Select
6. **Service mode:** **Serverless** ← **ESSENCIAL** (sem isso a integração com as Functions não funciona)
7. **Review + create** → **Create**
8. Após criar → **Settings → Keys** → 📋 copie a **Primary connection string** (rótulo: *SignalR Connection String*)

---

#### 7️⃣ App Service Plan — `plan-fifa-bolao-<suffix>`

O "servidor" (poder de computação) onde o app vai rodar. É o único item pago (~$13/mês).

1. Busca → **App Service plans** → **+ Create**
2. **Resource group:** `rg-fifa-bolao`
3. **Name:** `plan-fifa-bolao-<suffix>`
4. **Operating System:** **Linux**
5. **Region:** East US 2
6. **Pricing plan:** clique e escolha **Basic B1** (suporta o "Always On" que o app precisa)
7. **Review + create** → **Create**

---

#### 8️⃣ App Service (Web App) — `app-fifa-bolao-<suffix>`

A aplicação em si (API Express + frontend React). Vira `https://app-fifa-bolao-<suffix>.azurewebsites.net`.

**8a. Criar:**
1. Busca → **App Services** → **+ Create** → **Web App**
2. **Resource group:** `rg-fifa-bolao`
3. **Name:** `app-fifa-bolao-<suffix>`
4. **Publish:** **Code**
5. **Runtime stack:** **Node 20 LTS**
6. **Operating System:** **Linux**
7. **Region:** East US 2
8. **Linux Plan:** selecione o `plan-fifa-bolao-<suffix>` (passo 7)
9. **Review + create** → **Create**

**8b. Ativar a identidade** (vamos usá-la na Fase 3 para ler o Key Vault):
- Abra o app → **Settings → Identity** → aba **System assigned** → Status **On** → **Save** → **Yes**

**8c. Configurações gerais** — **Settings → Configuration → General settings**:
- **HTTPS Only:** On
- **Minimum Inbound TLS Version:** 1.2
- **Always on:** On
- **Health check path:** `/api/health`
- **Startup Command:** `node backend/dist/server.js`
- **Save** (topo)

**8d. App settings não-sensíveis** — **Settings → Configuration → Application settings** → **+ New application setting** (um por linha) → **Save** no fim:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `MAIN_API_BASE_URL` | `https://fifa2026-tickets-dev.azurewebsites.net/api` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | *(a AI Connection String do passo 3)* |

> 🔒 **Os segredos (Cosmos, JWT, SignalR) NÃO entram aqui.** Eles vão para o **Key Vault** na Fase 3 e o pipeline os injeta — esse é o jeito certo, sem senha em texto plano.

---

#### 9️⃣ Function App — `func-fifa-bolao-<suffix>`

Os "trabalhadores" que sincronizam jogos e **calculam os pontos** automaticamente.

**9a. Criar:**
1. Busca → **Function App** → **+ Create** → escolha **Consumption** (Serverless) → **Select**
2. **Resource group:** `rg-fifa-bolao`
3. **Function App name:** `func-fifa-bolao-<suffix>`
4. **Runtime stack:** **Node.js**
5. **Version:** **20 LTS**
6. **Region:** East US 2
7. **Operating System:** **Linux**
8. **Storage account:** selecione o `stfifabolao<suffix>` (passo 5)
9. **Review + create** → **Create**

**9b. Ativar a identidade:**
- Abra a Function App → **Settings → Identity** → **System assigned** → **On** → **Save** → **Yes**

> 💡 **Os app settings sensíveis da Function App (Cosmos, SignalR) são configurados automaticamente pelo pipeline** na Fase 4/5, a partir do Key Vault — você **não** precisa colá-los à mão.

---

#### ✅ Checklist da Fase 2

No `rg-fifa-bolao` você deve ver **9 recursos**:

```
rg-fifa-bolao
├── log-fifa-bolao-<suffix>      (Log Analytics)
├── ai-fifa-bolao-<suffix>       (Application Insights)
├── cosmos-fifa-bolao-<suffix>   (Cosmos + DB bolao2026 + 5 containers)
├── stfifabolao<suffix>          (Storage)
├── signalr-fifa-bolao-<suffix>  (SignalR — Serverless)
├── plan-fifa-bolao-<suffix>     (App Service Plan B1 Linux)
├── app-fifa-bolao-<suffix>      (Web App — Identity On)
└── func-fifa-bolao-<suffix>     (Function App — Identity On)
```

E no seu **bloco de notas** devem estar anotados: 📋 *Cosmos URI*, *Cosmos Primary Key*, *SignalR Connection String*, *AI Connection String*, *Storage Connection String*.

> 📖 **Atenção — não confunda os guias:** este guia (workshop) monta a arquitetura **simples de aprendizado** (1 Web App, sem rede privada) de propósito. O [`setup-portal.md`](./setup-portal.md) documenta a **arquitetura de produção endurecida** (front/API separados, Private Endpoint, Key Vault references) — é mais longo e avançado, **não** é o passo a passo deste evento. Use-o só se quiser ver "o nível produção" (ver Seção 7).

> ✅ **Pronto quando:** os 9 recursos estão no RG (Cosmos com os 5 containers, App Service e Function App com Identity = On) e você anotou as 5 credenciais.

---

### 🔐 Fase 3 — Oitavas: Key Vault e segredos

Aqui está o coração da boa prática: **segredo nenhum vai para o código**. Eles ficam no **Key Vault**, e tanto o app quanto o pipeline os leem em runtime.

#### 3.1 Criar o Key Vault

Portal → busque **Key Vaults** → **+ Create**:
- Resource group: `rg-fifa-bolao`
- Name: **`kv-bolao-<suffix>`** (3-24 chars, global) — _use o mesmo sufixo_
- Region: a mesma dos outros
- Permission model: **Azure role-based access control (RBAC)** (recomendado)
- Review + Create

#### 3.2 Adicionar os 5 segredos

No Key Vault → **Objects → Secrets → + Generate/Import**, crie **um a um**:

| Nome do secret | Valor |
|---|---|
| `cosmos-endpoint` | A **URI** do Cosmos (Fase 2 #4) |
| `cosmos-key` | A **PRIMARY KEY** do Cosmos |
| `cosmos-database` | `bolao2026` |
| `jwt-secret` | Gere 32+ chars aleatórios (comando abaixo) |
| `signalr-connection-string` | A **connection string** do SignalR (Fase 2 #6) |

**Gerar um `jwt-secret` forte:**
```bash
openssl rand -base64 32
```
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

#### 3.3 Dar acesso de leitura aos segredos

Três identidades precisam **ler** os segredos. No Key Vault → **Access control (IAM) → + Add → Add role assignment** → role **"Key Vault Secrets User"** → atribua para:

1. A **Managed Identity** do **App Service** (`app-fifa-bolao-<suffix>`)
2. A **Managed Identity** do **Function App** (`func-fifa-bolao-<suffix>`)
3. O **Service Principal** do CI/CD (criado na Fase 4 — volte aqui e adicione depois dela)

> 💡 **Por que assim?** O app/pipeline pedem o segredo na hora que precisam, autenticando-se com a própria identidade. Se um segredo vazar ou precisar rodar, você troca **só no Key Vault** — sem mexer em código nem redeployar.

> ✅ **Pronto quando:** o Key Vault tem os **5 secrets** e as identidades do App Service e Function App têm o papel **Key Vault Secrets User**.

---

### ⚙️ Fase 4 — Quartas: CI/CD com GitHub Actions

O pipeline (`.github/workflows/deploy.yml`) **já está pronto no projeto**. Ele faz: detectar mudanças → deploy do app → deploy das functions → smoke test. Você só precisa **conectar o seu ambiente** com **1 Secret + 1 Variable** no GitHub. **Zero edição de código.**

#### 4.1 Criar o Service Principal (aqui um script É necessário)

> ⚙️ **Exceção justificada ao "Portal-first":** criar um Service Principal com escopo correto não tem um fluxo limpo no Portal. Use o **Azure Cloud Shell** (ícone `>_` no topo do Portal — não precisa instalar nada):

```bash
az ad sp create-for-rbac \
  --name "sp-bolao-<suffix>" \
  --role contributor \
  --scopes /subscriptions/<SEU_SUBSCRIPTION_ID>/resourceGroups/rg-fifa-bolao \
  --sdk-auth
```

- Troque `<suffix>` e `<SEU_SUBSCRIPTION_ID>` (Portal → Subscriptions → copie o ID).
- **Copie todo o JSON de saída** (começa com `{ "clientId": ...`). Você vai colar no GitHub no passo 4.2.
- Volte à **Fase 3.3** e dê a este SP o papel **Key Vault Secrets User** no Key Vault (procure por `sp-bolao-<suffix>`).

#### 4.2 Configurar o GitHub (no SEU fork)

No seu fork → **Settings → Secrets and variables → Actions**:

**Aba _Secrets_ → New repository secret:**

| Secret | Valor |
|---|---|
| `AZURE_CREDENTIALS` | O **JSON completo** do Service Principal (passo 4.1) |

**Aba _Variables_ → New repository variable:**

| Variable | Valor |
|---|---|
| `NAME_SUFFIX` | O seu sufixo (ex.: `joao2026`) — **exatamente** o usado nos recursos |
| `AZURE_RG` _(opcional)_ | `rg-fifa-bolao` (só se você usou outro nome de RG) |

> 🧠 **Como isso funciona:** o `deploy.yml` monta os nomes dos recursos a partir de `NAME_SUFFIX` (`app-fifa-bolao-${{ vars.NAME_SUFFIX }}`, etc.) e se autentica no Azure com `AZURE_CREDENTIALS`. Os segredos do Cosmos/JWT/SignalR ele busca **do Key Vault** em runtime. Por isso você **não toca em nenhum arquivo** do projeto.

> ✅ **Pronto quando:** seu fork tem o Secret `AZURE_CREDENTIALS` e a Variable `NAME_SUFFIX`, e o SP tem acesso ao Key Vault.

---

### 🚀 Fase 5 — Semifinal: primeiro deploy + seed

#### 5.1 Popular o banco (seed) — script necessário

> ⚙️ **Exceção justificada:** popular dados iniciais (usuário admin + 72 jogos) exige rodar um script uma vez. Na sua máquina:

```bash
git clone https://github.com/<seu-usuario>/<repo>.git
cd <repo>
npm install
# crie um arquivo .env na raiz com os valores do Cosmos (Portal/Key Vault):
#   COSMOS_ENDPOINT=...   COSMOS_KEY=...   COSMOS_DATABASE=bolao2026
#   (opcional) SEED_ADMIN_PASSWORD=SuaSenhaForte!   ← recomendado trocar o padrão
npm run seed
```

O seed cria:
- **1 usuário admin** (idempotente). Padrão: **`admin@bolao.tftec.com.br`** / **`TFTEC@2026!`** — _troque a senha via `SEED_ADMIN_PASSWORD` se for um ambiente compartilhado._
- **72 jogos** da fase de grupos em `matches-cache`.

#### 5.2 Disparar o deploy

Duas formas (escolha uma):
- **Automático:** faça qualquer commit/push na branch `main` do seu fork → o pipeline dispara.
- **Manual (recomendado na 1ª vez):** seu fork → aba **Actions** → workflow **Deploy** → **Run workflow** → branch `main` → **Run**.

Acompanhe na aba **Actions**: `Detect changes → Deploy App → Deploy Functions → Smoke tests live`. Leva ~10-20 min (a 1ª vez é mais lenta).

> 💡 **Se o job "Deploy Functions" ou "Deploy App" falhar com _"worker failed to start within allotted time"_:** costuma ser **timeout transitório** (cold start), não erro real. Verifique o app direto (Fase 6) — muitas vezes já está no ar. Se preciso, **re-rode o job** (botão *Re-run failed jobs* na aba Actions).

> ✅ **Pronto quando:** o workflow **Deploy** termina verde (ou o app responde na Fase 6 mesmo com um job marcando timeout transitório).

---

### 🏆 Fase 6 — Final: validar e comemorar

Abra o seu app: **`https://app-fifa-bolao-<suffix>.azurewebsites.net`**

**Checklist de smoke (o pipeline também roda isso sozinho):**

- [ ] `GET /api/health` → `{"status":"ok"}`
- [ ] `GET /api/health/full` → `{"ok":true}` (confirma conexão com o Cosmos)
- [ ] Página inicial (`/`) carrega (HTTP 200)
- [ ] `GET /api/matches` → `count: 72`
- [ ] `GET /api/leaderboard` → retorna `ranking`
- [ ] **Cadastre um usuário** na tela, faça **login** e **registre um palpite** em um jogo
- [ ] Login admin (`admin@bolao.tftec.com.br` / senha do seed) → painel admin abre

> 🏟️ **Bônus tempo real:** abra o `/leaderboard` em duas abas. Quando o admin registra um resultado, o ranking se reordena **sozinho** nas duas (SignalR em ação).

> 🏆 **Conseguiu?** Você acabou de provisionar e publicar uma aplicação de produção completa no Azure, com CI/CD e segredos gerenciados. **É campeão!** 🎉

---

### 🎖️ Fase 7 — Pós-jogo: observabilidade e troubleshooting

#### Observabilidade (Application Insights)
No recurso `ai-fifa-bolao-<suffix>`:
- **Live Metrics** — requests em tempo real
- **Failures** — erros 4xx/5xx agrupados
- **Logs** (KQL) — ex.: `traces | order by timestamp desc | take 50`

#### Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| App responde **000 / não abre** logo após deploy | Worker ainda subindo (cold start) | Aguarde 1-2 min e teste de novo; quase sempre sobe sozinho |
| **502 / Application Error** persistente | Startup Command errado ou app setting faltando | App Service → Configuration: confira `Startup Command` = `node backend/dist/server.js` e as variáveis |
| `/api/health/full` falha (Cosmos) | `cosmos-*` errado no Key Vault ou identidade sem acesso | Reconfira os secrets e o papel **Key Vault Secrets User** (Fase 3.3) |
| Pipeline falha no **Azure login** | `AZURE_CREDENTIALS` inválido/expirado | Recrie o SP (4.1) e atualize o Secret |
| Pipeline falha lendo Key Vault | SP sem papel no Key Vault | Fase 3.3 → adicione **Key Vault Secrets User** ao `sp-bolao-<suffix>` |
| Nomes de recurso errados no pipeline | `NAME_SUFFIX` não bate com o usado nos recursos | Ajuste a Variable `NAME_SUFFIX` no GitHub |
| Leaderboard não atualiza ao vivo | SignalR não está em **Serverless** ou connection string errada | Recrie/ajuste o SignalR (Fase 2 #6) e o secret `signalr-connection-string` |
| Deploy "worker failed to start in allotted time" | Timeout transitório do job (não é o app quebrado) | Verifique o app direto; **Re-run failed jobs** na aba Actions |

> 📚 Mais detalhes: [`troubleshooting.md`](./troubleshooting.md) · [`architecture.md`](./architecture.md) · [`scoring-rules.md`](./scoring-rules.md)

---

## 📊 6. Tabela de variáveis e segredos

**No GitHub (seu fork) — Settings → Secrets and variables → Actions:**

| Tipo | Nome | Valor |
|---|---|---|
| 🔑 Secret | `AZURE_CREDENTIALS` | JSON do Service Principal (`--sdk-auth`) |
| 🔢 Variable | `NAME_SUFFIX` | Seu sufixo (ex.: `joao2026`) |
| 🔢 Variable _(opcional)_ | `AZURE_RG` | `rg-fifa-bolao` (só se mudou o nome do RG) |

**No Azure Key Vault (`kv-bolao-<suffix>`):**

| Secret | Origem |
|---|---|
| `cosmos-endpoint` | Cosmos → Keys → URI |
| `cosmos-key` | Cosmos → Keys → Primary Key |
| `cosmos-database` | `bolao2026` |
| `jwt-secret` | Gerado (`openssl rand -base64 32`) |
| `signalr-connection-string` | SignalR → Keys → Primary Connection String |

**No App Service (não-sensíveis, texto plano OK):** `NODE_ENV`, `PORT`, `WEBSITE_NODE_DEFAULT_VERSION`, `SCM_DO_BUILD_DURING_DEPLOYMENT`, `MAIN_API_BASE_URL`, `APPLICATIONINSIGHTS_CONNECTION_STRING`.

> 🔒 **Regra de ouro:** segredo **nunca** vai para o código nem para o repositório. Só Key Vault (ou GitHub Secrets, para a credencial do CI/CD).

---

## 🛡️ 7. Evolução de segurança (o "VAR" da arquitetura)

> 🧠 **Tópico de aprendizado — não é passo do workshop.** O ambiente que você montou **funciona e é válido para o evento**. Mas todo arquiteto pergunta: *"como eu deixaria isso pronto para produção de verdade?"* O melhor é: **no ambiente de produção de referência do Bolão, isso já foi feito** (Epic S6 / ADR-020, concluído em 2026-05-19) — você pode estudar a implementação real.

**O ponto fraco da versão de aprendizado:** o que você montou usa **um único Web App servindo a API (`/api/*`) E o site (SPA)** — Express faz as duas coisas. É simples e ótimo para aprender, mas a **API fica exposta à Internet por construção**: não dá para "esconder" a API atrás de um endpoint privado, porque é o mesmo app que o torcedor abre.

**O que o time de produção JÁ implementou (e você pode estudar):**

1. ✅ **2 Web Apps separados** — um só frontend (Express estático), outro **API-only** (igual o app de **Tickets** — compare os dois, é o mesmo aprendizado).
2. ✅ **Caminho de dados privado** — VNet Integration na API + **Private Endpoint do Cosmos**: o tráfego API↔banco vai pela rede privada, não pela Internet.
3. ✅ **Segredos via Key Vault references + Managed Identity** — zero segredo em texto plano nos App Settings; o app resolve do cofre em runtime pela própria identidade.
4. ⏸️ **Exposição remanescente consciente** — Cosmos/SignalR ainda com acesso público (Functions Consumption + SignalR Free não suportam o isolamento total sem upgrade pago); **Application Gateway/WAF** foi avaliado e **descartado do escopo** (subnet reservada, recriável sob demanda). Decisões de custo, documentadas.

> 🎓 **Por que o frontend é Web App (e não Static Web App)?** Porque **Static Web App não serve como backend de Application Gateway** — manter a opção do App Gateway exige o frontend em **Web App**.

> 📋 Implementação real e racional completo: **[`DECISIONS.md` → ADR-020](../DECISIONS.md)** e **[`docs/epic-hardening-rede-adr020.md`](./epic-hardening-rede-adr020.md)** (passo a passo de produção no [`setup-portal.md`](./setup-portal.md)). **Continua fora do escopo do evento** — é o "próximo nível", agora com a vantagem de estar **implementado de verdade** para você estudar.

> 🆚 **Compare na prática:** monte também o app de **Tickets** (guia equivalente no outro repo). Ele já nasce com front e back **separados** — você vê, lado a lado, a diferença entre "simples para aprender" e "pronto para isolar". Esse contraste é metade do aprendizado do evento.

---

> 🏁 _Documento vivo — atualizado conforme o evento se aproxima. Dúvidas ou algo desatualizado? Fale com a organização. **Bola rolando!**_ ⚽🏆
