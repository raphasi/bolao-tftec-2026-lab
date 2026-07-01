# 🏆 Bolão TFTEC Cloud — Guia do Evento (Setup no Azure Portal)

> ⚽ **Bem-vindo(a) ao gramado!** Neste laboratório você vai **construir do zero**, na **sua
> própria conta Azure**, a infraestrutura da aplicação **Bolão TFTEC Cloud — FIFA World Cup
> 2026** e colocá-la **no ar**: front, API, banco NoSQL, processamento serverless, tempo real,
> cofre de segredos e **deploy automatizado (CI/CD)**.
>
> 🥅 **Para todos os níveis.** Você não precisa ser sênior. **Cada passo é explicado em
> detalhe**, com o **caminho visual pelo Portal do Azure** sempre que possível — a ideia é
> você **entender o que está fazendo**, não só copiar comando. Onde um terminal é inevitável,
> o passo está marcado com 🧰 e roda no **Azure Cloud Shell** (no navegador, sem instalar nada).

> 🧭 **A estratégia — leia isto antes de tudo.** Vamos subir a aplicação **inteira com o ambiente
> totalmente ABERTO** primeiro: banco em **rede pública**, **CORS liberado (`*`)** e **sem**
> Private Endpoint. Fazemos o **deploy**, a **carga de dados** e **validamos que tudo funciona
> 100%**. **Só depois** começamos a **fechar o ambiente por partes** (Fase 11): fecha **uma**
> coisa → **testa** → fecha a próxima → **testa**. Por quê? Porque assim, se algo parar de
> funcionar, você sabe **exatamente** qual "porta" causou — em vez de caçar um problema no meio
> de dez. **Abrir tudo → validar → fechar de um em um, testando a cada passo.**

> 🚧 **Documento vivo.** Itens marcados com _⚠️ a confirmar_ (ex.: URL do repositório público)
> serão fixados conforme o evento se aproxima. A arquitetura e os passos já valem.

> ⏱️ **Tempo estimado:** **90–120 min** para as Fases 0–10 (app no ar, ambiente aberto). A
> **Fase 11** (fechar por partes) adiciona **~40 min**. Reserve **~2h30** na primeira execução.

---

## 📋 Índice

1. [Sobre a aplicação](#-1-sobre-a-aplicação)
2. [Objetivos do lab](#-2-objetivos-do-lab)
3. [Serviços Azure que vamos usar](#-3-serviços-azure-que-vamos-usar)
4. [Arquitetura: o estado-alvo](#-4-arquitetura-o-estado-alvo)
5. [Taxonomia de nomes (convenção recomendada, porém flexível)](#-5-taxonomia-de-nomes-convenção-recomendada-porém-flexível)
6. [A jornada do aluno](#-6-a-jornada-do-aluno)
   - [🎽 Fase 0 — Pré-jogo: pré-requisitos](#-fase-0--pré-jogo-pré-requisitos)
   - [🤝 Fase 1 — Convocação: fork do repositório](#-fase-1--convocação-fork-do-repositório)
   - [🏟️ Fase 2 — Fundação: Resource Group + observabilidade](#️-fase-2--fundação-resource-group--observabilidade)
   - [🗄️ Fase 3 — O banco: Cosmos DB (rede pública) + 14 containers](#️-fase-3--o-banco-cosmos-db-rede-pública--14-containers)
   - [⚡ Fase 4 — Tempo real: SignalR](#-fase-4--tempo-real-signalr)
   - [🔐 Fase 5 — Cofre de segredos: Key Vault](#-fase-5--cofre-de-segredos-key-vault)
   - [🖥️ Fase 6 — Hospedagem: Plan + API + Frontend + Functions](#️-fase-6--hospedagem-plan--api--frontend--functions)
   - [🔗 Fase 7 — Amarração: Managed Identity + Key Vault references (CORS aberto)](#-fase-7--amarração-managed-identity--key-vault-references-cors-aberto)
   - [⚙️ Fase 8 — Esteira de deploy: Service Principal + GitHub Actions](#️-fase-8--esteira-de-deploy-service-principal--github-actions)
   - [🌱 Fase 9 — Carga inicial: o seed](#-fase-9--carga-inicial-o-seed)
   - [🏆 Fase 10 — Final: validar ponta a ponta (app 100% aberto)](#-fase-10--final-validar-ponta-a-ponta-app-100-aberto)
   - [🔒 Fase 11 — Fechar o ambiente por partes (uma porta de cada vez)](#-fase-11--fechar-o-ambiente-por-partes-uma-porta-de-cada-vez)
   - [🎖️ Fase 12 — Troubleshooting](#️-fase-12--troubleshooting)
7. [Tabela de variáveis e segredos](#-7-tabela-de-variáveis-e-segredos)
8. [Encerramento (parar custos)](#-8-encerramento-parar-custos)
9. [Evolução (o "próximo nível")](#️-9-evolução-o-próximo-nível)

---

## ⚽ 1. Sobre a aplicação

O **Bolão TFTEC Cloud** é um app de **palpites da Copa do Mundo FIFA 2026**. O torcedor se
cadastra, palpita o placar dos jogos e os palpites especiais (campeão, top 4, artilheiro), e
disputa um **leaderboard ao vivo** que se reordena na tela conforme os resultados saem.

É uma aplicação **real, completa e moderna** — não um "hello world":

- 🎯 **Palpites por jogo** (72 jogos da fase de grupos) + **palpites especiais**
- 🏅 **Pontuação automática** — quando o admin finaliza um jogo, os pontos de **todos** os
  palpiteiros são calculados sozinhos (regra **25/15/0**: placar exato = 25, acertou o
  vencedor/empate = 15, errou = 0)
- 📊 **Leaderboard em tempo real** — o ranking atualiza na tela sem refresh
- 📱 **PWA** — instalável no celular como um app
- 🔐 **Autenticação própria** (cadastro/login com senha) e **painel admin** para lançar resultados

> 💡 **Por que esse app?** Ele toca em tudo que importa numa arquitetura de nuvem real: API,
> banco NoSQL, **processamento assíncrono** (a pontuação roda fora do request do usuário),
> **tempo real**, **segredos**, **observabilidade**, **deploy automatizado** e **rede privada**.

---

## 🎯 2. Objetivos do lab

Ao final, você terá feito **com as suas próprias mãos**:

| # | Você vai aprender a... |
|---|---|
| 1 | Criar e organizar recursos no **Azure** pelo **Portal** (caminho visual) |
| 2 | Provisionar **banco NoSQL** (Cosmos DB), **tempo real** (SignalR) e **serverless** (Functions) |
| 3 | Hospedar **frontend e backend separados** em **Web Apps** (arquitetura split) |
| 4 | Guardar segredos no **Key Vault** e consumi-los via **Managed Identity** — **nada de senha no código** |
| 5 | Configurar **CI/CD com GitHub Actions** — dar um clique (ou `git push`) e o deploy acontecer sozinho |
| 6 | Fazer a **carga inicial de dados** (seed) e **validar a aplicação ponta a ponta** |
| 7 | **Endurecer o ambiente por partes** — fechar CORS e fechar a rede com **Private Endpoint + VNet**, testando a cada passo |

> 🧠 **Filosofia:** **Portal-first**. Clicar e ver vence rodar script. Terminal só quando é
> **realmente** necessário (criar a permissão de deploy e a carga de dados) — e, mesmo assim,
> pelo **Azure Cloud Shell** no navegador, sem instalar nada na sua máquina. Esses pontos estão
> sempre marcados com 🧰.

---

## ☁️ 3. Serviços Azure que vamos usar

Tudo dentro de **um Resource Group** (`rg-prd-bl-cin-001`), na região **Central India**
(`centralindia`). Os nomes seguem uma **taxonomia** padronizada (Seção 5) — você usa os nomes
**exatamente como recomendados**; só precisa trocar algo se um nome **global** já estiver em uso.

| Serviço Azure | Para que serve no Bolão | Camada / Custo |
|---|---|---|
| 🟦 **App Service Plan (B1 Linux)** | Host compartilhado dos **2 Web Apps** (API + frontend) | B1 ~US$13/mês |
| 🌐 **Web App — API** | Backend Express (Node 24) que fala com o Cosmos | incluso no plano |
| 🌐 **Web App — Frontend** | Site React (SPA) servido por um mini Express | incluso no plano |
| 🟩 **Azure Cosmos DB** (NoSQL) | Usuários, palpites, jogos, ranking, auditoria | Free Tier (1000 RU/s, 25 GB) |
| 🟪 **Azure Functions** (Consumption) | **Calculam os pontos** e o leaderboard (via Change Feed) | Y1 — 1M req/mês grátis |
| 🟧 **Azure SignalR Service** | Empurra o leaderboard **em tempo real** | Free_F1 (serverless) |
| 🔑 **Azure Key Vault** | Guarda os segredos (Cosmos, JWT, SignalR) **fora do código** | Free (operações) |
| 📈 **Application Insights + Log Analytics** | Logs, métricas e diagnóstico de tudo | Free (5 GB/mês) |
| 💾 **Storage Account** | Runtime obrigatório da Function App _(auto-criada com a Function — sem passo manual)_ | Standard_LRS (centavos) |
| 🔒 **VNet + Private Endpoint + Private DNS** | Rede privada API↔Cosmos (**Fase 11**) | ~US$15/mês enquanto no ar |
| 🤖 **GitHub Actions** (CI/CD) | Build + deploy automáticos | Grátis |

> 💰 **Custo total:** **~US$13/mês** (basicamente o App Service B1; o resto cabe no _free
> tier_). A rede privada (Fase 11) soma **~US$15/mês** enquanto estiver no ar. Como você
> **apaga o Resource Group no fim** (Seção 8), rateado para um dia de evento são **centavos** —
> bem dentro do crédito de uma conta trial. Configure um **alerta de orçamento** (Fase 0).

> 🌍 **Nomes globais!** `cosmos-...`, `kv-...`, `app-...` e `func-...` viram **endereços
> públicos** (`.documents.azure.com`, `.vault.azure.net`, `.azurewebsites.net`), então o nome
> precisa ser **único no mundo**. Se o Portal disser *"already taken"*, **incremente a instância**
> (`...-cin-002`, `-003`…) ou use um apelido curto no lugar do `001` — **e use o nome final nas
> Variables do GitHub** (Fase 8).

---

## 🗺️ 4. Arquitetura: o estado-alvo

O "mapa do estádio" — como as peças se encaixam quando tudo estiver no ar:

```
                         🌎 TORCEDOR (navegador / celular)
                                     │  HTTPS
                ┌────────────────────┴────────────────────┐
                ▼                                          ▼
   ┌───────────────────────────┐   /api/* (HTTPS+CORS)  ┌───────────────────────────┐
   │  🌐 WEB APP — FRONTEND     │ ────────────────────▶ │  🌐 WEB APP — API          │
   │  React (SPA) + Express     │                       │  Express 5 (Node 24)       │
   │  app-prd-bl-fend-cin-001   │                       │  app-prd-bl-bend-cin-001   │
   └───────────────────────────┘                       └──────────────┬────────────┘
                                                          Cosmos SDK   │   SignalR SDK
                                                                       ▼
   ┌───────────────────────────┐                        ┌───────────────────────────┐
   │  🟩 AZURE COSMOS DB        │ ◀── Change Feed ─────  │  🟪 AZURE FUNCTIONS        │
   │  bolao2026 (NoSQL)         │                        │  (Consumption Y1)          │
   │  9 containers de dados     │  ── calcula 25/15/0 ─▶ │  calc-* · aggregate-* ·    │
   │  5 containers de lease     │     atualiza ranking   │  emit-leaderboard · cron   │
   └───────────────────────────┘                        └──────────────┬────────────┘
              ▲                                                         │ broadcast
              │ segredos via Managed Identity                          ▼
   ┌──────────┴──────────┐                              ┌───────────────────────────┐
   │  🔑 KEY VAULT        │                              │  🟧 AZURE SIGNALR SERVICE  │
   │  kv-prd-bl-cin-001   │                              │  Hub: leaderboard 🏅       │
   └─────────────────────┘                              └───────────────────────────┘
        📈 APP INSIGHTS ── logs/métricas de tudo acima      💾 STORAGE ── runtime das Functions
```

**Princípios de design (e o que isso ensina):**

- 🟦🟩 **Front e API separados (split).** São **dois** Web Apps no **mesmo** App Service Plan. O
  frontend só serve a tela; a API é "API-only" (responde `404` na raiz `/` de propósito). Eles
  conversam por **HTTPS + CORS**. Isso espelha produção, onde escala-se front e back de forma
  independente. **Sem Front Door** neste lab — para você ter **mais flexibilidade e menos
  pontos de falha**.
  > 🧩 **Por serem origens diferentes** (sem Front Door), 3 coisas precisam liberar o cruzamento
  > — e **já vêm prontas no repo**: a API libera **CORS** (`CORS_ORIGINS`) e **CORP cross-origin**
  > (helmet, em `backend/src/server.ts`), e o frontend libera a API no **CSP** (`connect-src` via
  > app setting `API_ORIGIN`). Atrás de Front Door (same-origin) nada disso é necessário.
- 🟪 **Pontuação assíncrona.** Quando o admin finaliza um jogo, ele **só grava o resultado** no
  Cosmos. Quem calcula os pontos são as **Functions**, acordadas pelo **Change Feed** do Cosmos.
  O usuário nunca espera o cálculo — ele acontece "nos bastidores".
- 🔑 **Segredo nunca no código.** As senhas (chave do Cosmos, JWT, SignalR) ficam no **Key
  Vault**. Os apps ganham uma **Managed Identity** e leem o segredo por **referência** — sem
  senha em texto em lugar nenhum visível.
- 🚪 **Abrir tudo, depois fechar por partes (Fase 11).** As Fases 0–10 entregam o app **100%
  funcional** com o ambiente **aberto** (Cosmos público, CORS `*`, sem rede privada). A Fase 11
  **fecha uma porta de cada vez, testando a cada passo**: primeiro o **CORS**, depois a **rede**
  (VNet + Private Endpoint). É o que separa "PaaS que funciona" de "PaaS de produção".

---

## 🧩 5. Taxonomia de nomes (convenção recomendada, porém flexível)

Os recursos seguem o padrão de taxonomia **`<tipo>-<ambiente>-<carga>-<região>-<instância>`**:

| Segmento | Valor no lab | Significa |
|---|---|---|
| `<tipo>` | `rg`, `app`, `func`, `cosmos`, `kv`, `asp`, `st`, `signalr`, `log`, `appi`, `vnet`, `pe` | o tipo do recurso |
| `<ambiente>` | `prd` | ambiente (production-like) |
| `<carga>` | `bl` | a aplicação (**bl** = Bolão) |
| `<carga-sufixo>` | `bend` / `fend` | só nos Web Apps: **b**ack**end** (API) e **f**ront**end** |
| `<região>` | `cin` | **C**entral **In**dia |
| `<instância>` | `001` | número da instância (use `002`, `003`… se o nome global já existir) |

> 💡 **Use os nomes da coluna "Nome recomendado" exatamente como estão** — o resto do guia usa
> esses nomes. A esteira de deploy (Fase 8) **lê os nomes das Variables do GitHub**, então se
> você precisar mudar algum (ex.: nome global já em uso → bumpar para `-002`), é só refletir a
> mudança na Variable correspondente. **A única regra:** o nome no Portal = o nome na Variable.

**Recursos que o deploy precisa conhecer** (vão para as Variables na Fase 8):

| Recurso | Nome recomendado | Variable do GitHub |
|---|---|---|
| Resource Group | `rg-prd-bl-cin-001` | `AZURE_RG` |
| Cosmos DB (conta) | `cosmos-prd-bl-cin-001` | `COSMOS_ACCOUNT_NAME` |
| Key Vault | `kv-prd-bl-cin-001` | `KEY_VAULT_NAME` |
| Web App — API | `app-prd-bl-bend-cin-001` | `API_APP_NAME` |
| Web App — Frontend | `app-prd-bl-fend-cin-001` | `FRONTEND_APP_NAME` |
| Function App | `func-prd-bl-cin-001` | `FUNCTION_APP_NAME` |

**Recursos que só você usa no Portal** (a CI não precisa do nome):

| Recurso | Nome recomendado | Observação |
|---|---|---|
| Log Analytics Workspace | `log-prd-bl-cin-001` | backing do App Insights |
| Application Insights | `appi-prd-bl-cin-001` | observabilidade |
| SignalR Service | `signalr-prd-bl-cin-001` | tempo real |
| App Service Plan | `asp-prd-bl-cin-001` | B1 Linux; hospeda os 2 Web Apps |
| _(Fase 11)_ Virtual Network | `vnet-prd-bl-cin-001` | `10.20.0.0/16` |
| _(Fase 11)_ Private Endpoint | `pe-cosmos-prd-bl-cin-001` | IP privado do Cosmos |

> 📌 **Anote os nomes finais.** **Nomes globais** (`cosmos-`, `kv-`, `app-`, `func-`, storage)
> precisam ser **únicos no mundo** — se o Portal disser *"already taken"*, **incremente a
> instância** (`...-cin-002`) e use o novo (inclusive na Variable correspondente). Daqui pra
> frente o guia escreve os **nomes recomendados** — se você mudou algum, leia "o seu equivalente".

---

## 🧭 6. A jornada do aluno

| Fase | Etapa | Tempo |
|---|---|---|
| **0** | Pré-jogo: pré-requisitos (Azure, GitHub, nomes, orçamento) | 10 min |
| **1** | Convocação: **fork** do repositório (no GitHub, sem terminal) | 5 min |
| **2** | Fundação: Resource Group + Log Analytics + App Insights | 8 min |
| **3** | O banco: **Cosmos DB (rede pública)** + os **14 containers** | 15 min |
| **4** | Tempo real: **SignalR** _(Storage é auto-criada com a Function na 6.4)_ | 4 min |
| **5** | Cofre de segredos: **Key Vault** + secrets | 10 min |
| **6** | Hospedagem: **Plan** + **Web App API** + **Web App Frontend** + **Function App** | 15 min |
| **7** | Amarração: **Managed Identity + Key Vault references** (CORS `*` aberto) | 12 min |
| **8** | Esteira de deploy: **Service Principal** + **GitHub Actions** 🧰 | 15 min |
| **9** | Carga inicial: **seed** (workflow no GitHub — sem terminal) | 3 min |
| **10** | Final: **validar ponta a ponta** (app 100%, ambiente aberto) | 10 min |
| **11** | 🔒 **Fechar o ambiente por partes** (CORS → rede privada), testando a cada passo | 40 min |
| **12** | Troubleshooting | livre |

> 🧠 **Total:** ~90–120 min até a Fase 10 (app no ar) + ~40 min para a Fase 11. Você pode
> **parar na Fase 10** com tudo funcionando e fazer a Fase 11 depois — ela é o "modo produção".

---

### 🎽 Fase 0 — Pré-jogo: pré-requisitos

- [ ] **Conta Azure ativa** — trial (US$200 / 30 dias, https://azure.microsoft.com/free) ou uma
      assinatura sua.
- [ ] **Conta GitHub** (gratuita) — você vai **fazer o fork** do repositório.
- [ ] **A taxonomia de nomes** (Seção 5) em mãos — você vai criar os recursos com esses nomes.
      Não precisa inventar sufixo: use os nomes recomendados (só bumpe a instância `-001`→`-002`
      se um nome global já existir).
- [ ] **Bloco de notas** para anotar **endpoints e URLs**. ⚠️ **NÃO** anote segredos em texto —
      eles vivem **só** no Key Vault.
- [ ] **Navegador moderno.** (Nenhuma instalação local: o pouco de terminal roda no **Azure
      Cloud Shell**.)

> 🌍 **Região = Central India (`centralindia`).** Use **a mesma região em TODOS os recursos** —
> VNet Integration (Fase 11) exige App Service e VNet **na mesma região**, então não misture.
>
> ⚠️ **Se aparecer cota zerada (trial):** ao criar o App Service Plan você pode ver *"Operation
> cannot be completed without additional quota. Current Limit (Total VMs): 0"*. Numa **trial** a
> cota de App Service é **regional** e às vezes vem zerada — **não é** o limite de gastos. Se
> Central India estiver zerada **para a sua assinatura**, escolha outra região que libere
> (ex.: `eastus2`, `westeurope`) e **use-a em tudo**. A região que funciona varia por assinatura.

**Alerta de orçamento (recomendado):** Portal → busca **Cost Management** → **Budgets** →
**+ Add** → **US$20/mês**, alerta em 80% e 100% → seu e-mail. (O lab é barato, mas o hábito é bom.)

> ✅ **Pronto quando:** você tem conta Azure + conta GitHub, tem a tabela de nomes (Seção 5) e
> decidiu a região.

---

### 🤝 Fase 1 — Convocação: fork do repositório

> 🎯 **Objetivo:** ter **uma cópia sua** do projeto no **seu** GitHub. Toda edição que o guia
> pedir você fará **direto na interface web do GitHub** — **sem `git clone`, sem terminal**.

1. Abra o repositório do Bolão no GitHub: `https://github.com/raphasi/bolao-tftec-2026-lab`
   _(⚠️ repo privado por enquanto — será tornado público/transferido para a org TFTEC antes do evento; a URL final será divulgada na turma)._
2. No canto superior direito, clique em **Fork**.
3. Em **Owner**, selecione **a sua conta**. Deixe o nome do repositório como está.
4. Mantenha marcado **"Copy the `main` branch only"** → **Create fork**.
5. Em alguns segundos você cai no **seu** fork: `https://github.com/<seu-usuario>/bolao-tftec-2026-lab`.

> 💡 **O que é o fork?** É um **clone do repositório dentro da sua conta** do GitHub. Ele já vem
> com o código **e** com a esteira de deploy (`.github/workflows/deploy.yml`) prontos. Você vai
> mexer só em **algumas configurações** dele pela web (Fase 8) — nenhum download necessário.

> 🧠 **Como editar um arquivo pela web (você vai usar isto na Fase 8):** abra o arquivo no seu
> fork → clique no **ícone de lápis (✏️ Edit this file)** no canto direito → altere → role até
> o fim → **Commit changes** → **Commit directly to the `main` branch** → **Commit changes**.

> ✅ **Pronto quando:** existe `https://github.com/<seu-usuario>/bolao-tftec-2026-lab` e você
> consegue navegar pelas pastas (`backend/`, `frontend/`, `functions/`, `.github/workflows/`).

---

### 🏟️ Fase 2 — Fundação: Resource Group + observabilidade

> 🎯 **Objetivo:** criar o "container" de tudo (Resource Group) e a observabilidade (Log
> Analytics + Application Insights) que vai te ajudar a enxergar erros nas fases seguintes.

#### 2.1 Resource Group

1. Portal → busca **Resource groups** → **+ Create**.
2. **Subscription:** a sua · **Resource group:** `rg-prd-bl-cin-001`
3. **Region:** **Central India** (a região da Fase 0).
4. **Review + create** → **Create**.

#### 2.2 Log Analytics Workspace

1. Portal → busca **Log Analytics workspaces** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `log-prd-bl-cin-001`
3. **Region:** Central India.
4. **Review + create** → **Create**.

#### 2.3 Application Insights

1. Portal → busca **Application Insights** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `appi-prd-bl-cin-001` · **Region:** Central India.
3. **Resource Mode:** **Workspace-based** → **Log Analytics Workspace:** o `log-prd-bl-cin-001` (2.2).
4. **Review + create** → **Create**.
5. Abra o recurso → **Overview** → 📋 **anote a `Connection String`** (vai nas app settings).

> 💡 O Portal pode criar automaticamente "Failure Anomalies" / "Smart Detection" — é esperado.

> ✅ **Pronto quando:** o `rg-prd-bl-cin-001` tem o Log Analytics e o App Insights, e você anotou a
> **Connection String** do App Insights.

---

### 🗄️ Fase 3 — O banco: Cosmos DB (rede pública) + 14 containers

> 🎯 **Objetivo:** criar o banco NoSQL com **acesso público** (porta aberta — fechamos na Fase
> 11) e **todos os containers**. Este é o **passo mais importante** do lab.

> 🧠 **Por que público agora?** Para o **deploy**, o **seed** e a **validação** funcionarem sem
> dor de cabeça de rede. Na Fase 11 a gente abre o caminho privado, valida, e aí sim restringe.

#### 3.1 Criar a conta Cosmos

1. Portal → **Create a resource** → **Azure Cosmos DB** → **Create** → **Azure Cosmos DB for NoSQL** → **Create**.
2. **Account Name:** `cosmos-prd-bl-cin-001` · **Location:** **Central India**
3. **Capacity mode:** **Provisioned throughput**
4. ✅ **Apply Free Tier Discount** (1000 RU/s grátis).
   > ⚠️ **Só pode haver 1 conta Cosmos com Free Tier por assinatura.** Se você já tem outra na
   > mesma assinatura, selecione **Do Not Apply** (os 1000 RU/s serão cobrados — centavos).
5. Aba **Networking → Public network access: All networks**
   _(simplicidade agora; restringimos na Fase 11)._
6. **Review + create** → **Create**. ⏳ **Demora ~5–8 min.**

> ⚠️ **Alternativa (SÓ se o Portal não deixar) — criar via Cloud Shell 🧰.** Em algumas assinaturas
> **trial**, a lista de regiões do wizard **não mostra Central India** (ou trava ao selecionar). **Use
> este passo apenas se o Portal não funcionar** — se a criação pelo Portal (passos 1–6) deu certo,
> **pule isto**. No **Cloud Shell** (Bash), ajuste as 3 variáveis e rode:
>
> ```bash
> RG=rg-prd-bl-cin-001                 # seu RG (já criado na Fase 2)
> ACC=cosmos-prd-bl-cin-001            # nome GLOBALmente único — troque se já existir
> LOC=centralindia                     # tente centralindia; se for barrado, use uma região liberada
>
> az cosmosdb create \
>   --name "$ACC" \
>   --resource-group "$RG" \
>   --kind GlobalDocumentDB \
>   --locations regionName="$LOC" failoverPriority=0 isZoneRedundant=False \
>   --default-consistency-level Session \
>   --enable-free-tier true \
>   --public-network-access Enabled
> ```
>
> - Se o `az` **recusar `centralindia`** (mesma restrição do Portal — cota regional da trial), o erro
>   é claro; escolha então uma **região liberada** (`az account list-locations -o table`) e use **a
>   mesma em TODOS os recursos** (ela precisa ter **cota de App Service** — ver Seção 4.1).
> - `--enable-free-tier true`: só **1 free tier por assinatura**; se falhar por isso, troque para `false`.
> - Isso cria só a **conta**. O **database** e os **containers** continuam nos passos 3.2 e 3.3.

#### 3.2 Criar o database `bolao2026` (pelo Cloud Shell 🧰)

> ⛔ **NÃO crie o database pelo Portal.** No "New Database" do Data Explorer é preciso marcar
> **Provision throughput → Manual → 1000 RU/s** para o database ter throughput **compartilhado**.
> Esse passo é fácil de esquecer/errar e, quando isso acontece, o database fica **sem** throughput
> próprio → na 3.3 **cada container** passa a exigir RU/s dedicado (mín. 400) e, com o limite de
> **1000 RU/s** da conta, só caberão ~2 containers; o resto falha com
> *"would have increased the total throughput to 1200 RU/s"*. Para tornar isso **à prova de erro**,
> criamos o database por **comando** — que garante o throughput compartilhado de uma vez.

No **Cloud Shell** (`>_` no topo do Portal → **Bash**), rode:

```bash
az cosmosdb sql database create \
  -g rg-prd-bl-cin-001 -a cosmos-prd-bl-cin-001 -n bolao2026 \
  --throughput 1000

# Confirmação — deve imprimir 1000
az cosmosdb sql database throughput show \
  -g rg-prd-bl-cin-001 -a cosmos-prd-bl-cin-001 -n bolao2026 \
  --query "resource.throughput"
```

> ✅ **Pronto quando** o segundo comando imprime **`1000`** — o database `bolao2026` existe com
> throughput **compartilhado**, e os 14 containers da 3.3 vão dividir esses 1000 RU/s sem cobrar
> throughput próprio.

#### 3.3 Criar os 14 containers

Para **cada** container: **Data Explorer → New Container** → selecione o database **`bolao2026`
existente** → **Don't provision dedicated throughput** (usa o throughput do database) → preencha
**Container id** e **Partition key** conforme as tabelas → **OK**.

**Containers de DADOS (9):**

| Container id | Partition key | Guarda |
|---|---|---|
| `users` | `/userId` | cadastros (email, hash de senha, role) |
| `predictions` | `/userId` | palpites de placar |
| `specials` | `/userId` | palpites especiais (campeão/top4/artilheiro) |
| `matches-cache` | `/groupCode` | os 72 jogos da fase de grupos |
| `leaderboard` | `/season` | ranking agregado |
| `groups` | `/season` | os 12 grupos (48 seleções) |
| `players` | `/season` | catálogo de jogadores (~1247) |
| `config` | `/scope` | configuração administrada pelo admin |
| `audit-log` | `/performedBy` | auditoria de ações administrativas |

**Containers de LEASE (5)** — ⚠️ **OBRIGATÓRIOS**, **todos** com partition key **`/id`**:

| Container id | Partition key | Usado pela function |
|---|---|---|
| `leases-calc` | `/id` | `calc-predictions` |
| `leases-specials` | `/id` | `calc-specials` |
| `leases-aggregate-predictions` | `/id` | `aggregate-from-predictions` |
| `leases-aggregate-specials` | `/id` | `aggregate-from-specials` |
| `leases-emit-leaderboard` | `/id` | `emit-leaderboard-update` |

> 🚨 **CRÍTICO — não pule os leases.** As Functions **NÃO criam** esses 5 containers sozinhas.
> Um lease container é o "marca-página" do Change Feed: sem ele, a function correspondente
> **falha em silêncio** — o app fica de pé, o host fica "Running", **mas o placar nunca
> atualiza**. Confira que existem **14 containers no total** (9 de dados + 5 leases) antes de
> seguir.

##### ⚡ Alternativa (mais rápida): criar os 14 containers via Cloud Shell 🧰

Criar 14 containers clicando é repetitivo. Se preferir, crie todos de uma vez pelo **Cloud
Shell**. *Pré-requisito:* a conta Cosmos (3.1) e o database `bolao2026` com throughput
compartilhado (3.2) **já criados** — o bloco abaixo só cria os containers.

1. No topo do Portal, clique no ícone **Cloud Shell** (`>_`) → escolha **Bash**.
2. Cole o bloco inteiro (os nomes já são os padrão do lab; se você renomeou algo, ajuste as
   3 primeiras linhas):

```bash
RG=rg-prd-bl-cin-001
ACC=cosmos-prd-bl-cin-001
DB=bolao2026

# PRE-CHECK: o database PRECISA ter throughput compartilhado, senao cada container
# exige RU/s proprio e estoura o limite de 1000 da conta (erro "...to 1200 RU/s").
if ! az cosmosdb sql database throughput show -g "$RG" -a "$ACC" -n "$DB" -o none 2>/dev/null; then
  echo "❌ O database '$DB' NAO tem throughput compartilhado. Recrie antes de seguir:"
  echo "   az cosmosdb sql database delete -g $RG -a $ACC -n $DB --yes"
  echo "   az cosmosdb sql database create -g $RG -a $ACC -n $DB --throughput 1000"
else
  # 9 containers de DADOS — formato "id:partition-key"
  for c in \
    "users:/userId" \
    "predictions:/userId" \
    "specials:/userId" \
    "matches-cache:/groupCode" \
    "leaderboard:/season" \
    "groups:/season" \
    "players:/season" \
    "config:/scope" \
    "audit-log:/performedBy"; do
    if az cosmosdb sql container create -g "$RG" -a "$ACC" -d "$DB" \
         -n "${c%%:*}" -p "${c##*:}" -o none 2>/dev/null; then echo "✓ ${c%%:*}"; else echo "✗ ${c%%:*} (falhou)"; fi
  done

  # 5 containers de LEASE — todos com /id
  for c in leases-calc leases-specials leases-aggregate-predictions \
           leases-aggregate-specials leases-emit-leaderboard; do
    if az cosmosdb sql container create -g "$RG" -a "$ACC" -d "$DB" \
         -n "$c" -p /id -o none 2>/dev/null; then echo "✓ $c"; else echo "✗ $c (falhou)"; fi
  done

  # Confirmação: deve imprimir 14
  az cosmosdb sql container list -g "$RG" -a "$ACC" -d "$DB" --query "length(@)"
fi
```

> ℹ️ Sem `--throughput`, cada container usa o **throughput compartilhado do database** (3.2) —
> é o equivalente CLI de *"Don't provision dedicated throughput"*. Reexecutar o bloco é seguro:
> containers que já existem apenas retornam "conflito" (marcados `✗`, sem problema) e os demais
> seguem. Mesmo usando o atalho, **confira os 14** no Data Explorer antes de seguir.

##### ✅ Check rápido — a estrutura do Cosmos está completa?

Antes de seguir, rode este bloco no **Cloud Shell** para validar **tudo de uma vez** (throughput
do database + os 14 containers, apontando nominalmente qualquer um que falte):

```bash
RG=rg-prd-bl-cin-001
ACC=cosmos-prd-bl-cin-001     # ajuste se você renomeou
DB=bolao2026

echo "== Throughput do database (esperado: 1000) =="
az cosmosdb sql database throughput show -g "$RG" -a "$ACC" -n "$DB" --query "resource.throughput" -o tsv

echo "== Containers existentes =="
got=$(az cosmosdb sql container list -g "$RG" -a "$ACC" -d "$DB" --query "[].name" -o tsv | sort)
echo "$got"
echo "Total: $(printf '%s\n' "$got" | grep -c .)  (esperado: 14)"

echo "== Algum faltando? =="
for c in users predictions specials matches-cache leaderboard groups players config audit-log \
         leases-calc leases-specials leases-aggregate-predictions leases-aggregate-specials leases-emit-leaderboard; do
  printf '%s\n' "$got" | grep -qx "$c" || echo "❌ FALTA: $c"
done
echo "(se não apareceu nenhum '❌ FALTA' acima, os 14 estão completos ✅)"
```

> ✅ **Pronto quando:** throughput = **1000**, total = **14** e **nenhum** `❌ FALTA`. Aí a camada
> de dados está correta e você pode seguir para a 3.4.

> 🛠️ **Troubleshooting — erro `... would have increased the total throughput to 1200 RU/s`:**
> sinal de que o database foi criado **sem throughput compartilhado** (o "Provision throughput"
> da 3.2 não pegou), então cada container tenta provisionar RU/s próprio e a 3ª criação estoura o
> limite de 1000 RU/s da conta. Só `users` e `predictions` (≈800 RU/s) entram; o resto falha.
> **Correção** (o database ainda está vazio — o seed é só na Fase 9):
> ```bash
> az cosmosdb sql database delete -g "$RG" -a "$ACC" -n "$DB" --yes
> az cosmosdb sql database create -g "$RG" -a "$ACC" -n "$DB" --throughput 1000
> ```
> Depois **rode o bloco dos 14 containers de novo** — agora todos compartilham os 1000 RU/s.

#### 3.4 Anotar as credenciais

Na conta Cosmos → **Settings → Keys**. 📋 Anote (vai usar nos segredos do Key Vault na Fase 5):

- **URI** — ex.: `https://cosmos-prd-bl-cin-001.documents.azure.com:443/`
- **PRIMARY KEY** (chave longa)
- **PRIMARY CONNECTION STRING** (formato `AccountEndpoint=...;AccountKey=...;`)

> ⚠️ Essas credenciais são **segredos**. Você vai colá-las no **Key Vault** (Fase 5) — **nunca** no
> código nem no GitHub. _(O **seed** (Fase 9) não precisa que você cole a chave: ele a lê sozinho
> da conta Cosmos via o Service Principal.)_

> ✅ **Pronto quando:** o Data Explorer mostra **14 containers** dentro de `bolao2026` e você
> anotou URI + PRIMARY KEY + PRIMARY CONNECTION STRING.

---

### ⚡ Fase 4 — Tempo real: SignalR

> 🎯 **Objetivo:** criar o **SignalR**, que empurra o leaderboard em tempo real.
>
> 💡 **E a Storage Account?** Você **não cria** mais à mão: o assistente da **Function App**
> (Fase 6.4) **cria a storage automaticamente** (a runtime das Functions exige uma, e ela é
> provisionada sozinha). Não há passo manual de Storage.

#### 4.1 SignalR Service

1. Portal → busca **SignalR Service** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `signalr-prd-bl-cin-001` · **Region:** Central India.
3. **Pricing tier:** **Free_F1** · **Service mode:** **Serverless**.
4. **Review + create** → **Create**.
5. Abra o recurso → **Settings → Keys** → no campo **Primary Connection String** clique no ícone
   de **copiar** (📋) — isso copia a string **inteira** de uma vez. Ela vira o segredo
   `signalr-connection-string` (Key Vault, Fase 5) e o secret `SIGNALR_CONNECTION_STRING` (GitHub, Fase 8).

> 📋 **O que copiar (string inteira):** a Primary Connection String do SignalR tem **3 partes
> coladas** e você precisa de **TODAS**. O formato é:
> ```
> Endpoint=https://signalr-prd-bl-cin-001.service.signalr.net;AccessKey=AbCdEf...suaChave...==;Version=1.0;
> ```
> - ✅ **Começa em `Endpoint=`** (NÃO comece no `https://` — o `Endpoint=` faz parte!).
> - ✅ Vai **até o fim**, incluindo `;AccessKey=...` **e** `;Version=1.0;` (com o `;` final).
> - ❌ **Não pare no primeiro `;`** (isso deixaria de fora a chave e a versão).
> - 💡 Use o **botão de copiar** do Portal — ele pega a string completa e evita erro de seleção.
> Se você copiou certo, o valor **começa com `Endpoint=`** e **termina com `Version=1.0;`**.

> 💡 **SignalR é o que dá o "ao vivo".** Sem ele, o app funciona 100% — só o auto-refresh do
> placar deixa de acontecer (o usuário precisaria recarregar a página). Recomendado manter.

> ✅ **Pronto quando:** o SignalR existe no RG e você anotou a connection string dele.

---

### 🔐 Fase 5 — Cofre de segredos: Key Vault

> 🎯 **Objetivo:** guardar **todos os segredos** num cofre. Na Fase 7 os apps vão lê-los por
> **referência**, com **Managed Identity** — sem senha em texto nas configurações.

#### 5.1 Criar o Key Vault

1. Portal → busca **Key vaults** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `kv-prd-bl-cin-001` · **Region:** Central India.
3. **Pricing tier:** Standard · **Soft-delete:** Enabled (padrão), retenção 90 dias.
4. Aba **Access configuration → Permission model:** **Azure role-based access control (RBAC)**
   ⚠️ (não escolha "Vault access policy" — o resto do guia assume **RBAC**).
5. **Networking:** Public _(a API resolve por Managed Identity; restringir é hardening futuro)._
6. **Review + create** → **Create**.

#### 5.2 Dar a você mesmo permissão de gravar segredos (RBAC)

> 🔴 **Passo obrigatório — sem ele a 5.4 falha.** Com o cofre em **RBAC**, **criar o Key Vault
> NÃO te dá acesso aos segredos**. Se você for direto para o "+ Generate/Import", recebe
> **403 Forbidden** (*"The user ... does not have secrets set permission on key vault ..."*).
> Você precisa **se atribuir** uma role de escrita de segredos.

1. Key Vault `kv-prd-bl-cin-001` → **Access control (IAM)** → **+ Add → Add role assignment**.
2. **Role:** **Key Vault Secrets Officer** (cria/lê/edita/remove **segredos** — o suficiente aqui).
   _(Alternativa mais ampla: **Key Vault Administrator**, que também gerencia chaves/certificados.)_
3. **Next** → **Assign access to:** *User, group, or service principal* → **+ Select members** →
   escolha **a sua própria conta** (a que está logada no Portal) → **Select**.
4. **Review + assign**.

> ⏳ A permissão leva **1–2 min para propagar**. Se a 5.4 ainda der 403, aguarde um pouco e
> **recarregue a página** do Key Vault.
>
> 💡 **Não confunda com a Fase 7.1:** lá você dá **Key Vault Secrets User** (somente leitura) às
> **Managed Identities** dos apps, para **lerem** os segredos em runtime. **Aqui** é **você
> (humano)** ganhando permissão de **criar** os segredos. Identidades e papéis diferentes.

#### 5.3 Gerar o `jwt-secret`

O `JWT_SECRET` assina os tokens de login e precisa de **≥ 32 caracteres aleatórios**. Gere um
no **Azure Cloud Shell** 🧰 (ícone `>_` no topo do Portal, ou https://shell.azure.com — já vem
logado, escolha **Bash**):

```bash
openssl rand -base64 32
```

📋 Copie o resultado (uma string longa). É o valor do segredo `jwt-secret` abaixo.

#### 5.4 Criar os secrets

No Key Vault → **Objects → Secrets → + Generate/Import** e crie **um por um** (Upload options:
**Manual**):

| Secret name | Value |
|---|---|
| `cosmos-endpoint` | a **URI** do Cosmos (3.4) |
| `cosmos-key` | a **PRIMARY KEY** do Cosmos (3.4) |
| `cosmos-database` | `bolao2026` |
| `jwt-secret` | a string gerada em 5.3 (≥ 32 chars) |
| `signalr-connection-string` | a **Primary Connection String** do SignalR **inteira** (de `Endpoint=` até `Version=1.0;` — ver 4.1) |

> 🔒 **Regra de ouro:** o Key Vault é a **única fonte de verdade** dos segredos. Para rotacionar
> uma senha no futuro, você troca **aqui** — as referências (Fase 7) pegam a versão nova
> sozinhas.

> ✅ **Pronto quando:** o Key Vault tem os **5 secrets** acima.

---

### 🖥️ Fase 6 — Hospedagem: Plan + API + Frontend + Functions

> 🎯 **Objetivo:** criar o App Service Plan e os **três apps** (API, Frontend, Functions). Aqui a
> gente só **cria e configura** — o **código** sobe na Fase 8.

#### 6.1 App Service Plan

1. Portal → busca **App Service plans** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `asp-prd-bl-cin-001`
3. **Operating System:** **Linux** · **Region:** Central India.
4. **Pricing plan:** **Basic B1** (suporta "Always On"; ~US$13/mês).
5. **Review + create** → **Create**.

> 💡 **Um plano, dois apps.** O plano é o "servidor"; cada Web App é um "site" nele. O B1
> acomoda **API + frontend** sem custo extra. (A Function App cria o **próprio** plano
> Consumption na 6.4.)
>
> ⚠️ Erro **"Total VMs: 0"** aqui? Região sem cota (ver Fase 0) — recrie numa região que libere.

#### 6.2 Web App — API

1. Portal → **App Services** → **+ Create** → **Web App**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `app-prd-bl-bend-cin-001`
3. **Publish:** **Code** · **Runtime stack:** **Node 24 LTS** · **OS:** **Linux** · **Region:** Central India.
4. **App Service Plan:** selecione o `asp-prd-bl-cin-001` (6.1) → **Review + create** → **Create**.

**Após criar**, abra o `app-prd-bl-bend-cin-001`:

5. **Settings → Identity → System assigned → Status: On** → **Save**. _(Cria a Managed Identity —
   usamos na Fase 7.)_
6. **Settings → Configuration → General settings:**
   - **HTTPS Only:** On · **Minimum TLS Version:** 1.2 · **Always On:** On · **FTP state:** Disabled
   - **Startup Command:** `node backend/dist/server.js`
   - **Save**.

> ⏳ **As App Settings da API vêm na Fase 7** (são referências do Key Vault). Por enquanto o app
> ainda não sobe — é esperado.

#### 6.3 Web App — Frontend

1. Portal → **App Services** → **+ Create** → **Web App**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `app-prd-bl-fend-cin-001`
3. **Publish:** Code · **Runtime:** **Node 24 LTS** · **OS:** Linux · **Region:** Central India.
4. **App Service Plan:** o **mesmo** `asp-prd-bl-cin-001` → **Review + create** → **Create**.

**Após criar**, abra o `app-prd-bl-fend-cin-001` → **Settings → Configuration → General settings:**
- **HTTPS Only:** On · **Min TLS:** 1.2 · **Always On:** On
- **Startup Command:** `node server.js`
- **Save**.

> 💡 **O frontend não tem segredos.** Ele fala com a API por **URL absoluta**, embutida no
> **build** (`VITE_API_BASE_URL`) na Fase 8. Por isso não precisa de Managed Identity.

> 🔌 **App setting `API_ORIGIN` (split sem Front Door).** Como front e API são **origens
> diferentes**, o CSP do mini-servidor do front precisa **liberar a origem da API** no
> `connect-src` — senão o navegador bloqueia as chamadas do SPA ("Failed to fetch"). A esteira de
> deploy (Fase 8) **seta `API_ORIGIN` sozinha** (= URL da sua API) no seu fork; se rodar algo à
> mão, defina no Web App do frontend a app setting **`API_ORIGIN = https://<sua-api>.azurewebsites.net`**.

#### 6.4 Function App (pontuação)

1. Portal → busca **Function App** → **+ Create** → em **Hosting plan** escolha
   **Consumption (Windows)** _(o plano serverless pay-as-you-go)_.
   > ⚠️ **NÃO** escolha **Flex Consumption**, Functions Premium, App Service nem Container Apps.
   > O lab foi validado no **Consumption (Windows)** (Node 22 + `WEBSITE_NODE_DEFAULT_VERSION=~22`);
   > o **Flex Consumption** é um modelo novo (storage de deploy + versão do Node diferentes) e pode
   > quebrar o scoring.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `func-prd-bl-cin-001`
3. **Runtime stack:** **Node.js** · **Version:** **22 LTS** · **Region:** Central India.
   > 🚨 **Use Node 22 na Function App (NÃO 24).** O **Azure Functions** (modelo v4 Node) **ainda
   > não suporta Node 24** — com 24 o worker **não indexa as functions** (a lista de functions vem
   > **vazia** e a **pontuação nunca dispara**, mesmo com tudo "verde" no deploy). As **Web Apps**
   > (API/frontend) seguem em **Node 24**; só a **Function App** precisa de **22**. A esteira de
   > deploy já força `WEBSITE_NODE_DEFAULT_VERSION=~22` na Function App. _(Validado ao vivo: com 24
   > a lista de functions ficava vazia; ao trocar para 22 + restart, as 6 functions registraram e o
   > scoring rodou.)_
4. **Operating System:** **Windows** _(o plano Consumo Linux nem sempre está disponível na
   região; Windows + Node é o caminho mais estável para as Functions)._
5. **Storage account — não procure, não existe seletor.** O wizard novo de **Consumption
   (Windows)** **não pede** storage account (não há aba "Storage" nem campo na Basics): o Azure
   **cria uma storage automaticamente** para a Function App. **Siga em frente** — está tudo certo.
   > 💡 Vai aparecer no RG uma storage com nome automático (tipo `func...` + aleatório) — é a da
   > Function App, e é **esperado**. A runtime usa `AzureWebJobsStorage` (preenchido sozinho) e a
   > esteira de deploy **não depende do nome** dela. _(Se você estiver num portal antigo que ainda
   > mostra uma aba "Hosting" com "Storage account", pode deixar criar uma nova ali.)_
6. **Review + create** → **Create**.

**Após criar**, abra a `func-prd-bl-cin-001`:

7. **Settings → Identity → System assigned → Status: On** → **Save**. _(Managed Identity das
   Functions — também recebe acesso ao Key Vault na Fase 7.)_

> 💡 **Você não precisa configurar as app settings das Functions à mão.** A esteira de deploy
> (Fase 8) preenche sozinha as variáveis críticas — `COSMOS_DATABASE`, a connection string do
> Cosmos (`AzureWebJobsCosmosDBConnection`) e o SignalR. `AzureWebJobsStorage`,
> `FUNCTIONS_WORKER_RUNTIME` e `FUNCTIONS_EXTENSION_VERSION` já vêm do assistente.

> ✅ **Pronto quando:** existem `plan-`, `app-`, `app-...-web-` e `func-...`, e a **Managed
> Identity** está **On** na API e na Function App.

---

### 🔗 Fase 7 — Amarração: Managed Identity + Key Vault references (CORS aberto)

> 🎯 **Objetivo:** o passo que **liga tudo com segurança nos segredos** — mas mantendo a **rede
> e o CORS abertos** (vamos fechar na Fase 11). Dar às identidades dos apps permissão de **ler**
> o Key Vault e configurar as App Settings da API como **referências** de segredo.

#### 7.1 Dar acesso das identidades ao Key Vault (RBAC)

1. Key Vault `kv-prd-bl-cin-001` → **Access control (IAM)** → **+ Add → Add role assignment**.
2. **Role:** **Key Vault Secrets User** → **Next**.
3. **Assign access to:** **Managed identity** → **+ Select members** → selecione a Managed
   Identity do **`app-prd-bl-bend-cin-001`** (a API).
4. **Review + assign**.
5. **Repita** os passos 1–4 para a Managed Identity do **`func-prd-bl-cin-001`** (as Functions).

> 💡 **Por que duas?** A API lê `cosmos-*`, `jwt-secret` e `signalr-connection-string`. As
> Functions leem o `signalr-connection-string` (via referência) quando você **não** usa o
> caminho do GitHub secret (Fase 8). Dar a role às duas evita surpresa.

6. **(Opcional — página "Operação ao vivo" do admin)** Dê à Managed Identity da **API** a role
   **Monitoring Reader** no App Insights: abra **`appi-prd-bl-cin-001` → Access control (IAM) →
   + Add role assignment → Monitoring Reader → Managed identity → `app-prd-bl-bend-cin-001`**.
   É o que permite a API consultar Errors/Active Users/Latency (par com o `APPINSIGHTS_RESOURCE_ID`
   da Fase 7.2). Pule se não for usar essa página.

#### 7.2 App Settings da API (segredos por referência + CORS aberto)

Web App **API** (`app-prd-bl-bend-cin-001`) → **Settings → Environment variables → App settings**
→ adicione **uma por uma** (**+ Add**). Para os segredos, use a sintaxe de **referência**:

```
@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/<nome-do-secret>)
```

> 🔴 **Se você usou nomes diferentes dos do guia, ajuste a URL!** Se o seu Key Vault **não** se
> chama `kv-prd-bl-cin-001` (ex.: você usou `kv-dev-bl-cin-001`), **troque o nome do cofre na URL
> de TODAS as 5 referências** abaixo. Uma referência apontando para um cofre que não existe falha
> com **"Reference was not able to be resolved"** — e o RBAC/identidade podem estar 100% certos.
> Confira também que o **nome do secret bate exatamente** (um typo tipo `wt-secret` em vez de
> `jwt-secret` quebra só aquela referência). Confirme o nome real do cofre no Cloud Shell:
> ```bash
> az keyvault list --query "[].name" -o tsv
> ```

| Name | Value |
|---|---|
| `COSMOS_ENDPOINT` | `@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/cosmos-endpoint)` |
| `COSMOS_KEY` | `@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/cosmos-key)` |
| `COSMOS_DATABASE` | `@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/cosmos-database)` |
| `JWT_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/jwt-secret)` |
| `SIGNALR_CONNECTION_STRING` | `@Microsoft.KeyVault(SecretUri=https://kv-prd-bl-cin-001.vault.azure.net/secrets/signalr-connection-string)` |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | a Connection String do App Insights (2.3) — telemetria |
| `APPINSIGHTS_RESOURCE_ID` | o **Resource ID** do App Insights `appi-prd-bl-cin-001` (formato `/subscriptions/.../providers/microsoft.insights/components/appi-prd-bl-cin-001`) — habilita a página **Operação ao vivo** do admin |
| `CORS_ORIGINS` | `*` ← **aberto de propósito** (fechamos na Fase 11) |

7. **Apply / Save** (o app reinicia).
8. Volte em **Environment variables** e confirme: cada referência mostra **`Key Vault Reference`
   = resolvido** (ícone verde).

> 🛠️ **"Reference was not able to be resolved"?** Verifique, nesta ordem:
> 1. **Nome do cofre/secret na URL** — a causa mais sorrateira: se a URL aponta para um cofre que
>    **não existe** (ex.: ficou `kv-prd-bl-cin-001` mas o seu é `kv-dev-bl-cin-001`) ou um secret
>    com **typo** (`wt-secret`≠`jwt-secret`), falha mesmo com RBAC perfeito. Compare a URL com
>    `az keyvault list` e `az keyvault secret list --vault-name <cofre>`.
> 2. **RBAC** — a Managed Identity da API tem **Key Vault Secrets User** no cofre (7.1)? E o
>    `principalId` da role é o **atual** do app (`az webapp identity show … --query principalId`)?
> 3. **Modo do cofre** — tem que ser **RBAC** (`az keyvault show … --query properties.enableRbacAuthorization` = `true`); em "Vault access policy" a role não vale.
> 4. **Propagação** — após ajustar, **Save** (o app reinicia) e dê **Refresh**.

> 🧠 **Por que essa volta toda (referência + Managed Identity) em vez de colar a chave direto?**
> Você *poderia* colar a chave do Cosmos na App Setting — mas ela ficaria **em texto** na
> configuração, visível para quem abre o Portal e fácil de vazar num print/screenshare. Com a
> **referência**, a App Setting guarda só um *ponteiro* (`@Microsoft.KeyVault(...)`). Quando o app
> inicia, o App Service usa a **Managed Identity** dele (a "identidade" que você ligou em 6.2) para
> buscar o valor real no Key Vault — **sem senha em lugar nenhum** no código ou na config. É por
> isso que a role **Key Vault Secrets User** (7.1) é obrigatória: é ela que autoriza essa
> identidade a *ler* o segredo. Bônus: para trocar uma senha, você muda **só no Key Vault** e o
> app pega a nova sozinho — sem redeploy.

> 💚 **Por que `CORS_ORIGINS = *` agora?** Para você ter **flexibilidade total** enquanto monta e
> testa: com `*`, a API aceita chamadas de **qualquer origem** (o seu frontend, testes locais,
> Postman…). Nada de erro de CORS no meio da subida. **Fechamos para a URL específica do front
> na Fase 11** — uma porta de cada vez.

> 📈 **Página "Operação ao vivo" do admin (opcional).** Os cards **Errors / Active Users /
> Latency** vêm de *queries* ao Application Insights. Para funcionarem, além do
> `APPINSIGHTS_RESOURCE_ID` acima, a **Managed Identity da API precisa da role "Monitoring
> Reader"** no App Insights (Fase 7.1). Sem isso, a página mostra **"AppInsights não
> configurado"** — o resto do app funciona normal (o "Active Match" continua). A 1ª consulta após
> reiniciar é fria (~10-20s) e a telemetria leva alguns minutos para aparecer.

> 🚨 **`JWT_SECRET` precisa de ≥ 32 caracteres** e **`JWT_EXPIRES_IN` precisa de unidade**
> (`7d`, `24h`, `60m`) — **nunca** um número puro como `7` (o token nasceria expirado e toda
> rota autenticada daria 401). O backend **valida no boot**: se `JWT_SECRET` tiver menos de 32
> chars, ou faltar `COSMOS_ENDPOINT`/`COSMOS_KEY`, ele **não sobe** (vira "Application Error" até
> o deploy). _(`COSMOS_DATABASE`, `NODE_ENV` e `PORT` têm default no código, mas o guia pede para
> defini-las mesmo assim — `PORT=8080` é o esperado no App Service.)_ Health check: `/api/health`.

> ✅ **Pronto quando:** as duas Managed Identities têm **Key Vault Secrets User** e todas as
> referências da API aparecem como **resolvidas**.

---

### ⚙️ Fase 8 — Esteira de deploy: Service Principal + GitHub Actions

> 🎯 **Objetivo:** **fazer o fork** do projeto (se ainda não fez), dar ao GitHub permissão para
> publicar nos **seus** recursos, configurar as variáveis no seu fork, fazer **a única edição** que
> o lab sem Front Door exige, e **disparar o deploy** — tudo pela web (+ um comando no Cloud Shell
> para a permissão).

#### 8.1 Faça o fork do repositório (no GitHub)

> A esteira de deploy roda a partir de uma **cópia sua** do projeto no GitHub — o **fork**. Se você
> **já fez** o fork na Fase 1, **pule para o passo 6** (só confirme que está no seu fork). Se não fez,
> siga do passo 1. **Pré-requisito:** ter uma **conta no GitHub** e estar **logado**.

1. Entre no GitHub (https://github.com) com a sua conta.
2. Abra o repositório do lab: **`https://github.com/raphasi/bolao-tftec-2026-lab`**
   _(⚠️ a URL final/pública será divulgada na turma — o repo é tornado público antes da aula)._
3. No **canto superior direito** da página do repositório, clique no botão **Fork**.
4. Na tela **"Create a new fork"**:
   - **Owner:** selecione **a SUA conta** _(não escolha uma organização que você não controla)._
   - **Repository name:** deixe como está (`bolao-tftec-2026-lab`).
   - **Copy the `main` branch only:** deixe **marcado**.
   - Clique em **Create fork**.
5. Aguarde alguns segundos — o GitHub leva você ao **seu** fork.
6. ✅ **Confirme que está no SEU fork:** no topo da página o nome deve ser
   **`<seu-usuario>/bolao-tftec-2026-lab`**, com a etiqueta **"forked from raphasi/bolao-tftec-2026-lab"**
   logo abaixo. Se ainda aparecer `raphasi/...` como dono, você está no **original** — volte e clique em **Fork**.

> 🚨 **O erro nº 1 dos alunos:** continuar trabalhando no repositório **original** (`raphasi/...`) em
> vez do **seu fork**. **Tudo** na Fase 8 (Secrets, Variables, Actions) é feito **no seu fork** — no
> original você não tem permissão e **nada funciona**. Sempre confira o **nome do dono no topo**.

> 💡 **O botão "Fork" não aparece / está cinza?**
> - Confirme que você está **logado** no GitHub.
> - O repo precisa estar **público** (o instrutor libera antes da aula). Se ainda estiver privado e
>   você não tiver acesso, **aguarde a URL pública**.
> - Se você **já forkou** antes, o GitHub não deixa forkar de novo — o seu fork **já existe** em
>   `https://github.com/<seu-usuario>/bolao-tftec-2026-lab` (abra direto).

> 🧠 **Como editar um arquivo pela web** (você não vai precisar baixar nada): abra o arquivo no seu
> fork → ícone de **lápis (✏️ Edit this file)** → altere → **Commit changes** → **Commit directly to
> the `main` branch** → **Commit changes**.

> ✅ **Pronto quando:** existe `https://github.com/<seu-usuario>/bolao-tftec-2026-lab` e você
> consegue navegar pelas pastas (`backend/`, `frontend/`, `functions/`, `.github/workflows/`).

#### 8.2 Criar a permissão de deploy (Service Principal) 🧰

No **Azure Cloud Shell** (Bash), **escolha a assinatura certa** e crie o Service Principal **com
escopo só no seu Resource Group** (boa prática):

```bash
# 1) Liste suas assinaturas e copie o "SubscriptionId" da que você está usando no lab
az account list --query "[].{Nome:name, SubscriptionId:id, Padrao:isDefault}" -o table

# 2) Cole AQUI o SubscriptionId da assinatura correta:
SUB_ID="<cole-seu-subscription-id-aqui>"

# 3) (recomendado) deixe essa assinatura como a ativa
az account set --subscription "$SUB_ID"

# 4) Crie o Service Principal com escopo só no seu Resource Group
az ad sp create-for-rbac \
  --name "bolao-deploy-bl" \
  --role Contributor \
  --scopes /subscriptions/$SUB_ID/resourceGroups/rg-prd-bl-cin-001 \
  --json-auth
```

> ⚠️ **Tem mais de uma assinatura?** Não confie na "padrão" — copie o `SubscriptionId` exato da
> assinatura onde você criou o `rg-prd-bl-cin-001` (passo 1) e cole no passo 2. Se errar a
> assinatura, o `--scopes` aponta para um Resource Group que não existe lá e o deploy falha depois.

##### 📋 Como copiar o resultado (LEIA com atenção — é onde mais se erra)

O comando imprime um **bloco JSON** parecido com este (os valores serão os SEUS):

```json
{
  "clientId": "11111111-1111-1111-1111-111111111111",
  "clientSecret": "aBc~Exemplo.SuaSenha.Secreta.Aqui",
  "subscriptionId": "22222222-2222-2222-2222-222222222222",
  "tenantId": "33333333-3333-3333-3333-333333333333",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

**Copie do primeiro `{` até o último `}`, INCLUSIVE — exatamente como apareceu. Não mude nada.**

✅ **O que TEM que ir junto** (faz parte do JSON):
- a **chave de abertura `{`** (primeiro caractere) e a **chave de fechamento `}`** (último caractere);
- **todas as aspas duplas `"`**, os **dois-pontos `:`** e as **vírgulas `,`**;
- **todas as linhas** (são ~10 linhas) — não copie só a `clientId`/`clientSecret`.

❌ **O que NÃO copiar:**
- **avisos** que possam aparecer **antes** do JSON (ex.: linhas começando com `WARNING:` ou
  `The output includes credentials...`) — comece a seleção **no `{`**;
- o **`$`** ou o **prompt** do Cloud Shell, nem espaços/linhas em branco depois do `}` final;
- **não** "embrulhe" em aspas, **não** tire as chaves, **não** transforme numa linha só.

> 💡 **Confira rápido:** o que você copiou deve **começar com `{`** e **terminar com `}`**. Se
> começar com `WARNING` ou com `"clientId"` (sem o `{`), você copiou errado — refaça a seleção.
>
> 🧰 **Truque à prova de erro (opcional):** gere e copie sem risco de selecionar de menos/demais —
> rode `az ad sp create-for-rbac ... --json-auth > sp.json` e depois `cat sp.json`; ou no Cloud
> Shell use **Upload/Download** para baixar o `sp.json`. O conteúdo do arquivo já é o JSON puro.

Esse JSON inteiro é o valor do secret **`AZURE_CREDENTIALS`** no GitHub (passo 8.3). No GitHub,
cole tudo dentro do campo **Value** (uma caixa de texto grande — o JSON com várias linhas cabe
inteiro ali; não precisa virar uma linha só).

> 💡 **O que é isso?** Uma "conta de robô" que o GitHub Actions usa para logar no Azure e
> publicar. O `--scopes` limita o poder dela **só** ao `rg-prd-bl-cin-001`. Em CLIs antigas, troque
> `--json-auth` por `--sdk-auth`.

> 🔒 **É um segredo de verdade** (contém o `clientSecret`). Cole **só** no campo de **secret** do
> GitHub — nunca num arquivo do repositório, num chat ou print. Se ele vazar, **gere outro**
> (rode o comando de novo) e atualize o secret.

#### 8.3 Configurar Secrets e Variables no seu fork

> ℹ️ **Por que preencher do zero?** O fork **trouxe o código e os workflows**, mas o GitHub **NÃO
> copia Secrets nem Variables** para forks (é proteção de segurança — senão qualquer fork roubaria
> credenciais). Então **estes valores não existem ainda no seu fork**: você cria todos agora. Eles
> também são **individuais** (seus nomes de recurso, suas credenciais), então não há o que herdar.

No **seu fork** no GitHub → **Settings → Secrets and variables → Actions**:

**Aba *Secrets* → *New repository secret*:**

| Secret | Valor |
|---|---|
| `AZURE_CREDENTIALS` | o **JSON inteiro** do passo 8.2 |
| `SIGNALR_CONNECTION_STRING` | a Primary Connection String do SignalR **inteira** (de `Endpoint=` até `Version=1.0;` — ver 4.1) — _opcional, mas recomendado para o tempo real_ |

**Aba *Variables* → *New repository variable*:** aqui você **informa os nomes dos seus recursos**
— é assim que a esteira sabe **onde** publicar. Preencha cada uma com o **nome que você criou no
Portal** (a coluna de exemplo usa os nomes recomendados da Seção 5; se você bumpou alguma
instância para `-002`, reflita aqui):

| Variable | Valor (exemplo com os nomes recomendados) |
|---|---|
| `AZURE_RG` | `rg-prd-bl-cin-001` |
| `API_APP_NAME` | `app-prd-bl-bend-cin-001` |
| `FRONTEND_APP_NAME` | `app-prd-bl-fend-cin-001` |
| `FUNCTION_APP_NAME` | `func-prd-bl-cin-001` |
| `COSMOS_ACCOUNT_NAME` | `cosmos-prd-bl-cin-001` |
| `KEY_VAULT_NAME` | `kv-prd-bl-cin-001` |
| `VITE_API_BASE_URL` | `https://app-prd-bl-bend-cin-001.azurewebsites.net/api` (URL da **API** + `/api`) |
| `PUBLIC_BASE_URL` | `https://app-prd-bl-fend-cin-001.azurewebsites.net` (URL do **frontend**) |

> 🧠 **Por que informar cada nome?** A esteira **não adivinha** prefixo nenhum — ela publica
> **exatamente** nos recursos que você nomear aqui. É isso que deixa a taxonomia flexível: mudou um
> nome no Portal (ex.: instância `-002`)? Basta refletir na Variable. **Regra de ouro:** o nome na
> Variable = o nome no Portal (maiúsculas/minúsculas e hífens contam).

> 🔎 **`VITE_API_BASE_URL` é essencial neste lab (sem Front Door).** Ele é **embutido no build**
> do frontend e diz **onde está a API**. Como não há Front Door, precisa ser a **URL absoluta**
> da sua API, terminando em **`/api`**. Sem essa Variable, o build cairia em `/api` relativo (que
> só funciona com Front Door) e o site **não acharia a API**. Como o `CORS_ORIGINS` está em `*`
> (Fase 7.2), a chamada cross-origin é aceita sem dor de cabeça.
>
> 🧠 **O conceito que confunde todo mundo aqui — `VITE_API_BASE_URL` × `CORS_ORIGINS`:** são
> **dois lados** da mesma conversa, em **momentos diferentes**.
> - **`VITE_API_BASE_URL`** age no **build** (compilação do front): é **o front decidindo para
>   quem ligar**. Fica "congelado" dentro do JS que vai pro navegador.
> - **`CORS_ORIGINS`** age em **runtime** (a cada request): é **a API decidindo quem pode atender**.
>
> Como front (`app-...-web-...`) e API (`app-...`) ficam em **endereços diferentes** (origens
> distintas), o navegador **bloqueia** a chamada a menos que a API responda "essa origem é
> liberada" (CORS). Por isso os dois precisam casar: o front **aponta** para a API
> (`VITE_API_BASE_URL`) **e** a API **autoriza** o front (`CORS_ORIGINS`). Num Front Door (prod)
> isso some, porque front e API viram a **mesma** origem (`/api` relativo) e não há "cross-origin".

> 💡 **`PUBLIC_BASE_URL` é opcional.** Se você não definir, a esteira **deriva sozinha** a URL do
> **seu** frontend (a partir do `FRONTEND_APP_NAME`). Defina explicitamente só se quiser apontar
> os smoke tests para outro lugar.

> 🛡️ **Proteção contra "bater na prod":** no **seu fork**, os smoke tests **nunca** apontam para
> a aplicação de produção da TFTEC — a esteira deriva tudo dos **seus** recursos (as Variables que
> você preencheu). E o deploy de fato roda com a **sua** credencial Azure (sua subscription), então
> é **impossível** publicar na prod da TFTEC.

> 💡 **Nada de editar o `deploy.yml`!** Tudo é feito por **Variables** — é só preencher. A esteira
> publica exatamente nos recursos que você nomeou nas Variables.

#### 8.4 Disparar o deploy

1. No seu fork → aba **Actions** → se aparecer o aviso, clique no botão verde para **habilitar
   os workflows** (1ª vez).
2. Na lista à esquerda, selecione **Deploy** → **Run workflow** → branch **`main`** → **Run workflow**.
3. Acompanhe os jobs em paralelo: **Deploy API**, **Deploy Frontend**, **Deploy Functions** e,
   por fim, **Smoke tests live**.

> ⏳ **Acabou de criar o Service Principal (8.2)? A 1ª execução pode falhar no "Azure login"** com
> **`No subscriptions found for ***`** — é só a **propagação do RBAC** (a role do SP leva ~1-2 min
> para valer). **Espere 2 min e rode o workflow de novo** (Re-run / Run workflow). _(Validado: a
> role existe; era só timing.)_

> ✅ **O que esperar:** os **três** jobs de deploy (**API**, **Frontend**, **Functions**) ficam
> **verdes**. O job final **`Smoke tests live`** valida pela **topologia de produção (Front
> Door same-origin)**, então **no seu ambiente split ele pode ficar vermelho** — **isso é
> esperado** e não significa que o seu app quebrou. A validação de verdade é **manual**, na
> Fase 10.

> 💡 **O workflow ajusta sozinho** as app settings de **Cosmos e SignalR nas Functions** (puxa a
> connection string do Cosmos e usa o secret `SIGNALR_CONNECTION_STRING`, ou a referência do Key
> Vault se você não definiu o secret). As app settings do **backend** são as que você setou na
> Fase 7.2.

> 🧰 **Prefira sempre o GitHub Actions.** O build e o upload acontecem **na nuvem**, não na sua
> rede — evita a fragilidade do deploy manual em conexões instáveis.

> ✅ **Pronto quando:** Deploy API + Frontend + Functions estão **verdes** na aba Actions.

---

### 🌱 Fase 9 — Carga inicial: o seed

> 🎯 **Objetivo:** popular o banco com o **admin**, os **72 jogos** da fase de grupos, os **12
> grupos (48 seleções)**, o **catálogo de jogadores** (~1247) e a entrada inicial do leaderboard.
> _(Os jogos de mata-mata são lançados depois, pelo admin.)_

O seed roda como um **workflow no seu fork** — **sem `git clone`, sem terminal**. Ele usa o
**mesmo Service Principal do deploy** (secret `AZURE_CREDENTIALS`, com role Contributor) para ler
o endpoint e a chave do **seu** Cosmos direto da conta (via ARM) e popular o banco.

> ⚠️ **Pré-requisito:** o Cosmos precisa estar em **rede pública** (Fase 3.1) — o runner do GitHub
> grava no Cosmos pela internet. Nesta fase ele está público; só restringimos na **Fase 11**. Por
> isso o seed vem **antes** da Fase 11. _(Se precisar re-seedar depois, reabra o público temporariamente.)_

1. No **seu fork** (não no repositório original!) → aba **Actions** (barra superior do repo).
2. No **menu da esquerda**, clique no workflow **"Seed (carga inicial)"**.
3. À **direita**, clique no botão **▾ Run workflow**. Abre um **pequeno formulário** (um popover)
   com os 3 campos abaixo — **é aqui que você digita os dados do admin**:

   | Campo (no formulário) | O que preencher | Exemplo |
   |---|---|---|
   | **Use workflow from** | deixe **`Branch: main`** (já vem selecionado) | `main` |
   | **admin_email** | o e-mail com que você vai **logar no painel admin** | `voce@exemplo.com` |
   | **admin_password** | **troque** o padrão por uma senha sua (mín. 8 caracteres) | `MinhaSenhaForte!` |
   | **admin_name** | seu nome (aparece no painel) | `Seu Nome` |
   | **shift_days** | move os jogos para **+N dias** e **libera os palpites** (deixe `30`). Use `0` só se quiser as **datas reais** da Copa | `30` |

> 📅 **Por que mover os jogos?** O dataset tem as datas **oficiais** da Copa (jun/2026), que **já
> passaram** — sem mover, **todos os jogos nascem travados** e ninguém consegue palpitar nem testar
> a pontuação. Com `shift_days = 30` (padrão), os 72 jogos vão para o **futuro** e o ambiente nasce
> **testável**. _(Para reabrir/ajustar depois, há o workflow "Abrir palpites (teste)" — Fase 10.2.)_

4. Clique no botão verde **Run workflow** (dentro do formulário) para confirmar.
5. A execução aparece na lista em alguns segundos → abra-a e aguarde **~2–3 min** ficar **verde**.

> 🖱️ **Onde fica o "Run workflow":** ele só aparece **depois** de selecionar o workflow
> "Seed (carga inicial)" no menu da esquerda — é um botão no canto **direito**, acima da lista de
> execuções. Os campos (`admin_email`, etc.) **não** ficam num arquivo nem em Settings: eles
> aparecem **dentro desse formulário** que abre ao clicar em **Run workflow**.

O resumo do workflow (aba **Summary** da execução) deve mostrar: **1 admin** criado, **72 jogos**,
**12 grupos / 48 seleções**, **~1247 jogadores**, leaderboard inicializado.

> 💡 **Idempotente.** Pode rodar de novo sem duplicar (faz upsert; o admin não é recriado se o
> e-mail já existir).

> ⚠️ **Guarde o e-mail/senha do admin** — é com ele que você entra no painel para lançar
> resultados (Fase 10). A senha fica **mascarada** nos logs do workflow.

> ✅ **Pronto quando:** o workflow **"Seed (carga inicial)"** terminou **verde** (resumo com 72
> jogos, 12 grupos, ~1247 players, admin criado).

---

### 🏆 Fase 10 — Final: validar ponta a ponta (app 100% aberto)

> 🎯 **Objetivo:** provar que **tudo funciona** com o ambiente **aberto** — front, API, banco,
> pontuação automática e tempo real. Ao fim desta fase, o app está **no ar e completo**. **É a
> linha de base** a partir da qual vamos fechar as portas na Fase 11.

#### 10.1 Smoke test rápido

Faça de um dos dois jeitos — **(A) automático** (recomendado, mostra tudo de uma vez) ou
**(B) manual** no navegador.

##### (A) Automático — PowerShell (✓/✗ por item) 🧰

**Não precisa baixar nada nem clonar.**

1. Abra o **Azure Cloud Shell** (`>_` no topo do Portal).
2. 🔴 **Garanta que está no PowerShell, NÃO no Bash.** O Cloud Shell costuma abrir em **Bash** — se
   você colar o script no Bash, dá um monte de `bash: ... command not found`. Para entrar no
   PowerShell, **digite `pwsh` e Enter** (ou use o seletor **`Bash ▾` → PowerShell** no canto
   superior esquerdo). Confira pelo prompt:
   - **Bash** (errado p/ este script): `usuario [ ~ ]$`
   - **PowerShell** (certo): `PS /home/...>`
3. Já no PowerShell (`az` já vem logado), **cole o bloco abaixo** — trocando os **4 nomes** no topo
   pelos SEUS recursos — e tecle **Enter**:

```powershell
# === Smoke test do Bolão — troque os 4 nomes e cole no Cloud Shell (PowerShell) ===
$ApiApp   = "app-prd-bl-bend-cin-001"     # ⬅️ sua API
$FrontApp = "app-prd-bl-fend-cin-001"     # ⬅️ seu frontend
$FuncApp  = "func-prd-bl-cin-001"         # ⬅️ sua Function App
$RG       = "rg-prd-bl-cin-001"           # ⬅️ seu Resource Group

$api = "https://$ApiApp.azurewebsites.net"; $fe = "https://$FrontApp.azurewebsites.net"
$ok = 0; $bad = 0
function T($n, $b) {
  try   { $d = & $b; Write-Host "  [ OK ]  $n — $d" -ForegroundColor Green; $script:ok++ }
  catch { Write-Host "  [FALHA] $n — $($_.Exception.Message)" -ForegroundColor Red; $script:bad++ }
}
T "API /api/health"           { if ((irm "$api/api/health").status -ne 'ok') { throw 'status != ok' }; 'ok' }
T "API + Cosmos /health/full" { if (-not (irm "$api/api/health/full").dependencies.cosmos.ok) { throw 'cosmos != ok' }; 'cosmos ok' }
T "API dados /matches = 72"   { $c = (irm "$api/api/matches").count; if ($c -ne 72) { throw "count=$c (rodou o seed?)" }; "$c jogos" }
T "Frontend /healthz"         { if ((iwr "$fe/healthz" -UseBasicParsing).Content -notmatch 'ok') { throw 'sem ok' }; 'ok' }
T "Site / (200)"              { if ((iwr "$fe/" -UseBasicParsing).StatusCode -ne 200) { throw 'nao 200' }; '200' }
T "Functions (6)" {
  for ($i=1; $i -le 3; $i++) { $raw = az functionapp function list -g $RG -n $FuncApp --query "[].name" -o tsv 2>$null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep 3 }
  if ($LASTEXITCODE -ne 0) { throw "az falhou (rode 'az login' ou rede instavel) — nao foi possivel checar" }
  $f = @($raw | ForEach-Object { ($_ -split '/')[-1] } | Where-Object { $_ })
  if ($f.Count -lt 6) { throw "$($f.Count)/6 (Function App em Node 24? deve ser ~22 — ver Troubleshooting)" }
  "$($f.Count) registradas"
}
Write-Host "`n=== $ok OK / $bad FALHA ===" -ForegroundColor (@('Green','Red')[[int]($bad -gt 0)])
```

Saída esperada:
```
  [ OK ]  API /api/health — ok
  [ OK ]  API + Cosmos /health/full — cosmos ok
  [ OK ]  API dados /matches = 72 — 72 jogos
  [ OK ]  Frontend /healthz — ok
  [ OK ]  Site / (200) — 200
  [ OK ]  Functions (6) — 6 registradas

=== 6 OK / 0 FALHA ===
```

> 💡 Cada **`[FALHA]`** já diz o motivo (ex.: *"count=0 (rodou o seed?)"*, *"0/6 (Node 24?)"*) — vá
> direto ao item que falhou. _(Existe também a versão completa versionada no repo,
> `scripts/validate-lab.ps1`, com retry e parâmetros — útil se você tiver o repo clonado:
> `pwsh scripts/validate-lab.ps1 -ApiApp ...`.)_
>
> ⚠️ **Rode no Cloud Shell** (já vem com `az` logado). Se rodar no **PowerShell local**, faça
> **`az login`** antes — senão o check das Functions aparece como **`az falhou…`** (não é problema
> nas suas Functions). Se vier **`az falhou (rede instável)`**, é só repetir — são chamadas ARM que
> às vezes caem por rede local.

##### (B) Manual — no navegador

- [ ] **API viva:** abra `https://app-prd-bl-bend-cin-001.azurewebsites.net/api/health` → JSON
      com `"status":"ok"`.
- [ ] **API + banco:** `https://app-prd-bl-bend-cin-001.azurewebsites.net/api/health/full` →
      `"ok":true` (a API conseguiu falar com o Cosmos).
- [ ] **API tem dados:** `https://app-prd-bl-bend-cin-001.azurewebsites.net/api/matches` → deve
      trazer **72** jogos.
- [ ] **Frontend vivo:** `https://app-prd-bl-fend-cin-001.azurewebsites.net/healthz` → `ok`.
- [ ] **Site abre:** `https://app-prd-bl-fend-cin-001.azurewebsites.net/` → carrega a tela de login.
- [ ] **Functions registradas:** Portal → `func-prd-bl-cin-001` → **Functions** → devem
      aparecer **6**: `calc-predictions`, `calc-specials`, `aggregate-from-predictions`,
      `aggregate-from-specials`, `emit-leaderboard-update`, `health-check-cron`.

#### 10.2 Teste de pontuação ponta a ponta (o teste que importa)

> 🗓️ **Jogos aparecem "Palpite finalizado"?** Isso acontece quando o palpite travou no kickoff
> (`now ≥ kickoff − 30min`). **Se você rodou o Seed com `shift_days = 30` (padrão), os jogos já
> estão no futuro e os palpites abertos** — pode pular este aviso. Só precisa agir se você rodou o
> Seed com `shift_days = 0` (datas reais) ou se muito tempo passou: rode o workflow
> **"Abrir palpites (teste)"** — **sem terminal**:
>
> | Onde | O que fazer |
> |---|---|
> | Seu fork → **Actions** | clique no workflow **"Abrir palpites (teste)"** (menu da esquerda) |
> | Botão **Run workflow** (direita) | campo **days** = `30` (default ≈ 1 mês à frente; ajuste se quiser) → **Run workflow** |
>
> Ele move os 72 jogos de grupo para o **futuro** e os palpites reabrem. **Voltar às datas reais da
> Copa:** rode o **"Seed (carga inicial)"** (Fase 9) com **`shift_days = 0`**. _(Para finalizar um
> jogo **antes** do kickoff e testar a pontuação, use **Admin → Resultados → "Permitir finalizar"**
> no jogo.)_

1. No site, faça **login com o admin** (Fase 9).
2. Faça um **palpite** num jogo qualquer (ou crie um 2º usuário e palpite com ele).
3. Vá em **Admin → Resultados** e **lance o placar** desse jogo (marque como finalizado).
4. Em **~30 segundos**, o **leaderboard** deve atualizar **sozinho** — e, com o SignalR, **sem
   refresh**.

> 🚨 **O placar não atualizou?** É quase sempre **lease container faltando** (Fase 3.3) ou a
> Function "hibernada". Vá para a Fase 12 (Troubleshooting) — o sintoma e a correção estão lá.

> 🎉 **Parabéns — o app está 100% no ar (ambiente aberto)!** Anote esta linha de base: **tudo
> funciona**. Agora, na Fase 11, vamos **fechar as portas uma a uma** — e, se algo parar, você
> sabe **exatamente** qual passo causou.

> ✅ **Pronto quando:** login funciona, a tela de palpites mostra os 72 jogos, e lançar um
> resultado **atualiza o leaderboard sozinho**.

---

### 🔒 Fase 11 — Fechar o ambiente por partes (uma porta de cada vez)

> 🎯 **O passo final de produção.** Até aqui está **tudo aberto** (CORS `*`, Cosmos público, sem
> rede privada) — e **funcionando**. Agora vamos **endurecer o ambiente**, mas com **disciplina**:
> **fecha UMA porta → testa → só então fecha a próxima**. Se um teste falhar, você reabre **só
> aquela** porta e sabe exatamente onde estava o problema.

> 🧠 **A regra de ouro do endurecimento:** **nunca feche duas coisas sem testar no meio.** É o
> que transforma "deu erro, não sei por quê" em "o passo 11.2 quebrou — é a rede".

#### Passo 11.1 — Fechar o CORS (de `*` para a URL do front)

A porta mais barata de fechar primeiro: parar de aceitar **qualquer** origem.

1. Web App **API** (`app-prd-bl-bend-cin-001`) → **Settings → Environment variables → App
   settings** → edite `CORS_ORIGINS`:
   - de `*`
   - para `https://app-prd-bl-fend-cin-001.azurewebsites.net` **(sem barra `/` no fim)**
2. **Apply / Save** (a API reinicia).

> ⚠️ **Sem a barra final!** `CORS_ORIGINS` precisa bater **exatamente** com a origem do
> navegador. `https://...net/` (com `/`) **não** casa com `https://...net` e o navegador bloqueia.

**🧪 Teste (obrigatório antes de seguir):**
- Abra o site `https://app-prd-bl-fend-cin-001.azurewebsites.net/`, **faça logout e login** de
  novo, navegue pelas telas. Tudo deve funcionar **igual à Fase 10**.
- ❌ Se as chamadas começarem a falhar (erro de CORS no console do navegador, F12): a URL em
  `CORS_ORIGINS` está diferente da real (barra `/`, `http` vs `https`, nome do app errado).
  **Corrija ou volte para `*`** e confira.

> ✅ **Pronto quando:** o site funciona com `CORS_ORIGINS` na URL específica do front.

#### Passo 11.2 — Fechar a rede do Cosmos (VNet + Private Endpoint)

Agora o tráfego **API↔Cosmos** sai da internet e passa a viver **dentro da rede**.

> 🧩 **Conceito — inbound × outbound:** o **Private Endpoint** é a *porta privada* do Cosmos
> (dá a ele um **IP privado**, entrada). A **VNet Integration** é o *crachá* que deixa a **API
> entrar na rede** para chegar nessa porta (saída). E a **Private DNS Zone**
> (`privatelink.documents.azure.com`) faz o **nome público do Cosmos resolver para o IP
> privado** — sem ela, nada funciona (erro nº 1).

> ⚠️ **O público do Cosmos fica LIGADO de propósito.** As **Azure Functions em plano Consumption
> NÃO suportam VNet Integration** — e elas também precisam do Cosmos (é delas que sai a
> pontuação). Então damos à **API** o caminho privado pelo Private Endpoint, **sem desligar o
> público** (as Functions continuam por ele). Fechar o público 100% exigiria subir as Functions
> para **Elastic Premium** — fica como evolução (Seção 9).

**(a) Criar a VNet + 2 subnets**

1. Portal → **Virtual networks** → **+ Create**.
2. **Resource group:** `rg-prd-bl-cin-001` · **Name:** `vnet-prd-bl-cin-001` · **Region:** **Central
   India** (a **mesma** dos apps — obrigatório).
3. Aba **IP Addresses:** address space **`10.20.0.0/16`**. Crie **2 subnets**:

| Subnet | Range | Configuração especial |
|---|---|---|
| `snet-appsvc-integration` | `10.20.1.0/27` | **Delegation:** `Microsoft.Web/serverFarms` |
| `snet-private-endpoints` | `10.20.2.0/27` | **Network policies for private endpoints: Disabled** |

4. **Review + create** → **Create**.

**(b) Private Endpoint do Cosmos (+ Private DNS)**

1. Cosmos `cosmos-prd-bl-cin-001` → **Settings → Networking → Private access** → **+ Create
   a private endpoint**.
2. **Name:** `pe-cosmos-prd-bl-cin-001` · **Region:** Central India.
3. **Resource:** a conta `cosmos-prd-bl-cin-001` · **Target sub-resource:** **`Sql`**.
4. **Virtual network:** `vnet-prd-bl-cin-001` · **Subnet:** **`snet-private-endpoints`**.
5. **Private DNS integration: Yes** → zona **`privatelink.documents.azure.com`** (o Portal cria a
   zona + o vnet link + os A-records automaticamente).
6. **Review + create** → **Create**.

**(c) VNet Integration da API**

1. Web App **API** (`app-prd-bl-bend-cin-001`) → **Settings → Networking → Virtual network
   integration** → **Add** → **VNet:** `vnet-prd-bl-cin-001` · **Subnet:** **`snet-appsvc-integration`**.
2. **Settings → Environment variables → App settings** → adicione **dois** e **Save** (a API reinicia):
   - `WEBSITE_VNET_ROUTE_ALL` = `1` (todo egress da API pela VNet)
   - `WEBSITE_DNS_SERVER` = `168.63.129.16` (DNS do Azure → resolve a zona privada para o IP
     interno; sem ele a API pode continuar resolvendo o Cosmos pelo IP público)

> 💡 **Só a API** recebe VNet Integration. O **frontend** não precisa (só fala com a API por
> HTTPS) e as **Functions** não suportam (Consumption).
>
> 🧠 **Validação na prática (validado ao vivo):** o teste que **importa** e é fácil de checar é o
> **`/api/health/full` continuar `cosmos.ok:true`** depois de ligar a VNet (a latência sobe um
> pouco — sinal do salto privado). O `getent` de dentro do container é a prova "de dentro", mas o
> **SSH/Kudu costuma estar com basic-auth desabilitado** (hardening) — se não conseguir acessar,
> confie no `/api/health/full` + nos **A-records** da zona (`cosmos-… → 10.20.2.x`) + conexão do PE
> **Approved**. _(Confirmado: PE Approved, A-record `cosmos-… → 10.20.2.4`, `/api/health/full` ok.)_

**🧪 Teste (obrigatório — valide de DENTRO da rede):**

> ⚠️ Do seu PC, o nome do Cosmos resolve o **IP público** — isso é normal e **não** é erro.
> Valide **pela própria API**, que agora resolve de dentro da VNet.
>
> 🧠 **Por que o MESMO nome resolve diferente dependendo de onde você pergunta?** A Private DNS
> Zone (`privatelink.documents.azure.com`) só está **ligada à sua VNet**. Quem pergunta **de
> dentro** da VNet (a sua API, via VNet Integration) recebe o **IP privado** (`10.20.x`); quem
> pergunta **de fora** (o seu PC, a internet) continua recebendo o **IP público**. É o esperado —
> chama-se "DNS split-horizon". Por isso testar do seu micro **não prova nada**: a validação tem
> que partir **de dentro** (Kudu da API ou uma VM na VNet). O nome (`cosmos-...documents.azure.com`)
> **não muda** — só *para onde* ele aponta, dependendo de quem pergunta.

1. **Kudu da API:** `https://app-prd-bl-bend-cin-001.scm.azurewebsites.net` → **SSH** (console do
   container Linux da API). Resolva o nome do Cosmos **de dentro** da VNet:
   ```bash
   getent hosts cosmos-prd-bl-cin-001.documents.azure.com
   ```
   → deve mostrar um **IP privado (`10.20.2.x`)**. **IP público** = falta
   `WEBSITE_VNET_ROUTE_ALL=1` ou a zona DNS não linkada à VNet.
   > 🧠 **Por que `getent` e não `nameresolver`/`nslookup`?** A nossa API roda em **App Service
   > Linux** — o console SSH é um shell do container, **sem** `nameresolver` (isso é ferramenta do
   > Kudu de **Windows**) e geralmente sem `nslookup`/`dig`. O `getent hosts` usa o resolvedor do
   > próprio sistema (glibc) e está sempre disponível. Alternativa garantida (a API é Node):
   > `node -e "require('dns').lookup('cosmos-prd-bl-cin-001.documents.azure.com',(e,a)=>console.log(a))"`.
2. **App + banco:** abra `https://app-prd-bl-bend-cin-001.azurewebsites.net/api/health/full` →
   continua **`"ok":true`** (a API fala com o Cosmos pelo **IP privado**). _Este é o teste que
   realmente importa: se a API responde `ok` com a rede privada ligada, o caminho funciona._
3. **Smoke do app:** refaça o **teste de pontuação** (10.2) — lançar um resultado ainda atualiza
   o leaderboard. _(As Functions continuam pelo público; a API, pelo privado.)_

> ⚠️ **Não use `ping`** no App Service (ICMP é bloqueado pelo sandbox — "General failure." é
> esperado, **não** significa que a rede está quebrada). Use `getent hosts` (resolução de nome) e,
> para a prova real, o `/api/health/full`.
>
> ❌ Se `/api/health/full` quebrar: confira VNet Integration + `WEBSITE_VNET_ROUTE_ALL=1`, a zona
> DNS linkada e a connection **Approved** em Cosmos → Networking. Em último caso, **reabra**
> temporariamente o caminho (remova `WEBSITE_VNET_ROUTE_ALL`) para confirmar que o resto está OK.

> ✅ **Pronto quando:** o `getent` na API devolve **IP `10.20.x`** e `/api/health/full` segue
> **`"ok":true`**. 🔒 **CORS fechado + caminho API↔Cosmos privatizado — uma porta de cada vez.**

---

### 🎖️ Fase 12 — Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| **Erro ao criar Web App / Plan:** `"...Current Limit (Total VMs): 0"` | Região **sem cota** de App Service na sua trial (cota é **regional**, às vezes zerada). **Não é** spending limit | Escolha outra região que libere (Fase 0) e **recrie tudo nela**. A região varia por assinatura |
| **Frontend/Backend mostra "Application Error" (página azul)** | O Node **crashou no boot** | Abra o **Log stream** (Web App → **Monitoring → Log stream**). Verifique: `JWT_SECRET` ≥ 32 chars, `COSMOS_*` corretos (Fase 7.2), Startup Command (`node backend/dist/server.js` na API / `node server.js` no front), `PORT=8080`. ⚠️ **Não use FTP** (desabilitado) — use o Log stream |
| **Referência do Key Vault não resolve** (erro na App Setting) | RBAC faltando para a Managed Identity | Confirme **Key Vault Secrets User** para a MSI da API (e das Functions) no IAM do Key Vault (Fase 7.1) |
| **Site carrega, mas chama a API errada / 404 em `/api`** | Variable `VITE_API_BASE_URL` ausente/errada (sem ela o build usa `/api`, que só funciona com Front Door) | Defina a Variable `VITE_API_BASE_URL` com a **URL absoluta** da sua API + `/api` (Fase 8.3) e **rode o workflow de novo** |
| **Deploy publica no recurso errado / "resource not found"** | Variables de nome não batem com os recursos do Portal | Confira `API_APP_NAME`/`FRONTEND_APP_NAME`/`FUNCTION_APP_NAME`/`COSMOS_ACCOUNT_NAME`/`KEY_VAULT_NAME`/`AZURE_RG` — o nome na Variable tem que ser **idêntico** ao do Portal (Seção 5) |
| **(Fase 11.1) CORS no navegador** (erro no console F12, mas `curl` funciona) | `CORS_ORIGINS` ≠ URL do front (quase sempre **barra `/` no fim**) | Ajuste para `https://app-prd-bl-fend-cin-001.azurewebsites.net` **sem `/`**, ou volte para `*` e confira |
| **Login / chamadas falham com "Failed to fetch"** (a API responde direto na URL dela, mas não pelo site) | Bloqueio **cross-origin**: falta `API_ORIGIN` no front (CSP `connect-src`) e/ou o CORP do backend | Confirme a app setting **`API_ORIGIN`** no front = URL da API (Fase 6.3) e recarregue; o repo já traz **CORS** + **CORP `cross-origin`** (`backend/src/server.ts`). Cheque os headers: a API deve mandar `Access-Control-Allow-Origin` e `Cross-Origin-Resource-Policy: cross-origin` |
| **Lancei resultado e o placar não muda** | **(nº1)** Function App em **Node 24** → worker não indexa (lista de functions **vazia**); ou falta um `leases-*`; ou a Function não conecta no Cosmos; ou (Consumo) **hibernou** | **Confirme a lista de functions** (`az functionapp function list ...` deve ter **6**). Se vazia → **`WEBSITE_NODE_DEFAULT_VERSION=~22`** + restart (Node 24 não roda no Functions). Confira os **5 leases** (3.3) e o binding `AzureWebJobsCosmosDBConnection`; em Consumo, o Change Feed às vezes só volta após **restart** |
| **Deploy (Actions) — job `Smoke tests live` vermelho** | O smoke pressupõe a topologia de produção (**Front Door same-origin**) — você está em **split sem Front Door** | **Esperado.** Os jobs de **deploy** (API/Frontend/Functions) é que importam — se estão verdes, valide manualmente (Fase 10) |
| **Deploy da API cancela em ~20-30 min** (job "Deploy API" preso no passo `[6/7] az webapp deploy`) | **Trava transitória do Kudu/SCM** — o deployment fica preso em *"Fetching changes."* e o `az` não retorna. **Não é** erro de config nem seu | A esteira já **tenta de novo sozinha** (timeout + até 3 tentativas + restart entre elas). Se **ainda** falhar, **re-rode o Deploy** — a trava quase nunca se repete na 2ª vez. _(Cada aluno tem app/Kudu isolados; não é falha em massa.)_ |
| **Workflow falha no login Azure** (`No subscriptions found for ***`) | **Propagação do RBAC** do SP recém-criado (mais comum), ou `AZURE_CREDENTIALS` ausente/≠ JSON do SP | Espere **1-2 min** e **rode o workflow de novo** (a role do SP leva um tempo para valer). Se persistir: refaça 8.2/8.3; o secret deve ser o **JSON completo** (começa em `{ "clientId"...`) |
| **Seed (workflow) falha — Cosmos inacessível / Forbidden** | Cosmos em "Selected networks" (ex.: já fez a Fase 11) | O runner do GitHub grava no Cosmos pela internet → mantenha o Cosmos em **All networks** (Fase 3.1) ao rodar o seed; restrinja só na Fase 11 |
| **Seed (workflow) falha no Azure login** | `AZURE_CREDENTIALS` ausente/inválido no fork | Refaça o secret (Fase 8.2) — o mesmo SP do deploy é usado pelo seed |
| **(Fase 11.2)** `getent hosts` na API devolve **IP público** | Falta `WEBSITE_VNET_ROUTE_ALL=1`, ou a zona `privatelink.documents.azure.com` não linkada à VNet | Confirme a VNet Integration + `WEBSITE_VNET_ROUTE_ALL=1` e a zona DNS linkada (11.2) |
| **(Fase 11.2)** `nameresolver: command not found` no SSH da API | `nameresolver` é do Kudu de **Windows**; a API é **Linux** | Use `getent hosts <fqdn>` ou `node -e "require('dns').lookup('<fqdn>',(e,a)=>console.log(a))"` (11.2) |
| **(Fase 11.2)** `/api/health/full` quebrou após o Private Endpoint | Private Endpoint não **Approved**, ou DNS sem A-records | Cosmos → Networking → connection **Approved**; recrie os A-records pela aba **DNS configuration** do PE; em último caso reabra (remova `WEBSITE_VNET_ROUTE_ALL`) e reteste |
| **Mudei o frontend e o navegador mostra o antigo** | **PWA / Service Worker** com cache | Hard-reload (Ctrl+Shift+R) ou DevTools → Application → Service Workers → **Unregister** |
| **Cosmos lento / erro 429** | Estourou os 1000 RU/s do Free Tier | Normal sob carga alta; aguarde ou aumente RU/s (sai do free) |

> 📚 **Seu melhor amigo de diagnóstico:** `GET /api/health/full` — ele diz se a API consegue
> falar com o Cosmos e devolve o erro real. Para o resto, **Log stream** do Portal (não FTP).

---

## 📊 7. Tabela de variáveis e segredos

**Anotações que você carrega pelo lab** (mantenha **fora** do Git):

| Onde | Nome | Origem / Exemplo |
|---|---|---|
| 🔢 | *Taxonomia* | `<tipo>-prd-bl-<carga>-cin-001` (Seção 5) — bumpe `-001`→`-002` se um nome global colidir |
| 🌐 | *Cosmos URI* | `https://cosmos-prd-bl-cin-001.documents.azure.com:443/` (Fase 3.4) |
| 🔐 | *Cosmos PRIMARY KEY* | chave longa (Fase 3.4) → secret `cosmos-key` |
| 🔐 | *Cosmos CONNECTION STRING* | `AccountEndpoint=...;AccountKey=...;` (a CI usa nas Functions) |
| 🔐 | *jwt-secret* | `openssl rand -base64 32` (Fase 5.3) → secret `jwt-secret` |
| 🔐 | *SignalR connection string* | Primary Connection String (Fase 4.1) → secret + GitHub secret |
| 🔐 | *AZURE_CREDENTIALS* | JSON do Service Principal (Fase 8.2) → GitHub secret |
| 🔐 | *Admin do bolão* | `SEED_ADMIN_EMAIL` / senha (Fase 9) |
| 🌐 | *URL da API* | `https://app-prd-bl-bend-cin-001.azurewebsites.net` |
| 🌐 | *URL do Frontend* | `https://app-prd-bl-fend-cin-001.azurewebsites.net` |

**Segredos no Key Vault** (`kv-prd-bl-cin-001`): `cosmos-endpoint` · `cosmos-key` ·
`cosmos-database` · `jwt-secret` · `signalr-connection-string`.

**App Settings da API** (Fase 7.2): `COSMOS_ENDPOINT` · `COSMOS_KEY` · `COSMOS_DATABASE` ·
`JWT_SECRET` · `SIGNALR_CONNECTION_STRING` (todas como **Key Vault reference**) + `JWT_EXPIRES_IN`
· `NODE_ENV` · `PORT` · `WEBSITE_NODE_DEFAULT_VERSION` · `APPLICATIONINSIGHTS_CONNECTION_STRING`
· `CORS_ORIGINS` (`*` no início → URL do front na Fase 11.1; `WEBSITE_VNET_ROUTE_ALL` entra na
Fase 11.2).

**GitHub** (Fase 8): *Secrets* `AZURE_CREDENTIALS`, `SIGNALR_CONNECTION_STRING` · *Variables*
`AZURE_RG`, `API_APP_NAME`, `FRONTEND_APP_NAME`, `FUNCTION_APP_NAME`, `COSMOS_ACCOUNT_NAME`,
`KEY_VAULT_NAME`, `VITE_API_BASE_URL`, `PUBLIC_BASE_URL`.

> 🔒 **Regra de ouro:** segredo **nunca** vai para o código nem para o repositório. Aqui eles
> vivem no **Key Vault** e são lidos por **Managed Identity** — sem senha em texto nas configs.

---

## 🧹 8. Encerramento (parar custos)

Ao terminar os testes: Portal → **Resource groups** → `rg-prd-bl-cin-001` → **Delete resource group**
(digite o nome para confirmar). Isso remove **tudo** de uma vez — App Service, Cosmos, Functions,
SignalR, Key Vault, VNet, Private Endpoint — e **zera** qualquer cobrança.

> 💡 Diferente de uma VM, não há "o que desligar": você **apaga o Resource Group** e o custo vai
> a zero. Lembre-se também de remover o **Service Principal** (Entra ID → App registrations →
> `bolao-deploy-bl`) se não for reusar.

> ♻️ **Vai RECRIAR com os mesmos nomes depois de apagar?** O **Key Vault tem soft-delete** — o
> nome `kv-prd-bl-cin-001` fica "preso" ~90 dias e a recriação falha por nome em uso. Antes de
> recriar, **purgue** o cofre: `az keyvault purge -n kv-prd-bl-cin-001 --location centralindia`
> (ou liste com `az keyvault list-deleted`). _Aluno de primeira vez não passa por isso; é só para
> quem re-executa o lab._

---

## 🛡️ 9. Evolução (o "próximo nível")

> 🧠 **Tópico de aprendizado — não é passo do lab.** O ambiente que você montou **funciona e
> ensina a jornada inteira**. Um time de produção ainda fecharia mais portas:

1. **🚦 Front Door + WAF** — uma borda única na frente do frontend, com same-origin `/api` e
   filtragem de ataques (é por isso que a CI vem configurada para `/api` relativo).
2. **🔒 Cosmos 100% privado** — subir as Functions para **Elastic Premium (EP1)** para que
   **elas também** usem VNet Integration; aí dá para **desligar o público** do Cosmos por completo.
3. **🔌 SignalR privado** — `Private Link` exige o tier **Standard_S1** (o Free_F1 não suporta).
4. **🔑 Key Vault privado** — restringir o networking do cofre a "Selected networks" / Private
   Endpoint (hoje deixamos público; a MSI já protege o acesso).
5. **📈 Dashboards e alertas** — Application Insights já está ligado; faltaria criar *workbooks*,
   alertas de erro/latência e *Live Metrics*.

---

## 🆚 Quando usar cada caminho

| Caminho | Quando usar |
|---|---|
| **Portal** (este guia) | 1ª vez, aprendizado, ver a arquitetura na prática |
| [`setup-cli.md`](./setup-cli.md) | Reprodução rápida com scripts (CLI imperativo) |
| [`setup-bicep.md`](./setup-bicep.md) | Produção, repetibilidade, time grande (IaC) |
