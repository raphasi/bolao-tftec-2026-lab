# 🏛️ Arquitetura — Bolão TFTEC 2026 (self-host)

Este documento descreve **todos os recursos** da aplicação, o **papel de cada um**
e os **fluxos de dados** entre eles. É a referência para entender a estrutura antes
de fazer o deploy (ver o passo a passo em [`DEPLOY-ALUNO-PORTAL.md`](./DEPLOY-ALUNO-PORTAL.md)).

---

## 1. Visão geral

```
                          ┌──────────────────────┐
                          │   Navegador do aluno  │
                          └───────────┬──────────┘
                                      │ HTTPS
              site (HTML/JS/PWA)      │      ┌───────── push em tempo real ──────────┐
        ┌─────────────────────────────▼──────┐                                       │
        │  FRONTEND — Web App (Linux)         │                                       │
        │  React (SPA) + micro-servidor       │                                       │
        │  Express (server.js)                │                                       │
        └─────────────────────────────┬──────┘                                       │
                                       │ chamadas REST (/api/...) com JWT             │
                                       ▼                                              │
        ┌────────────────────────────────────┐        ┌──────────────────────┐       │
        │  BACKEND — Web App (Linux)          │        │   SignalR Service     │◀──────┘
        │  API Express/Node (cérebro)         │        │   (tempo real)        │
        │  auth, palpites, admin, leaderboard │        └───────────▲──────────┘
        └───────────────┬─────────────────────┘                    │ emite update
                        │ lê/grava (SQL API + chave)                │
                        ▼                                           │
        ┌────────────────────────────────────┐         ┌───────────┴──────────┐
        │   COSMOS DB  (banco NoSQL)          │ change  │   FUNCTIONS (Node)    │
        │   db `bolao2026` · 14 containers    │ feed →  │   motor de pontuação  │
        │   (9 de dados + 5 de lease)         │◀────────│   6 funções           │
        └────────────────────────────────────┘ grava   └───────────┬──────────┘
                                                   pontos            │ estado/runtime
                                                                     ▼
                                                          ┌──────────────────────┐
                                                          │   Storage Account     │
                                                          │  (exigido p/ Functions)│
                                                          └──────────────────────┘

        Observabilidade (transversal):  Application Insights  ──▶  Log Analytics
        (backend e functions enviam logs/métricas/traces)
```

**Resumo do fluxo:** o navegador carrega o **site** do *Frontend Web App*; o site fala
com o **Backend API**; o backend lê/grava no **Cosmos DB**; quando um resultado é lançado,
o **Change Feed** do Cosmos aciona as **Functions** que recalculam os pontos e atualizam o
**leaderboard**; o **SignalR** empurra a atualização para os navegadores em tempo real.

---

## 2. Componentes Azure (9 recursos)

Nomeados no padrão `<tipo>-fifa-bolao-<SUFIXO>` (o `<SUFIXO>` é escolhido por você no deploy).

| # | Recurso (padrão de nome) | Tipo Azure | Tier (trial) | Papel na estrutura |
|---|---|---|---|---|
| 1 | `cosmos-fifa-bolao-<sufixo>` | Azure Cosmos DB (SQL/NoSQL) | **Free Tier** (1000 RU/s, 25 GB) | **Banco de dados** central. Guarda usuários, palpites, especiais, jogos, grupos, jogadores, leaderboard, config e auditoria. Seu **Change Feed** é o gatilho do motor de pontuação. |
| 2 | `plan-fifa-bolao-<sufixo>` | App Service Plan (Linux) | **B1** (~US$13/mês) | **Hospedagem compute** compartilhada: roda **os dois** Web Apps (backend e frontend) no mesmo plano (sem custo de plano extra). |
| 3 | `app-fifa-bolao-<sufixo>` | App Service / Web App | usa o plano B1 | **Backend / API** (Express/Node). O "cérebro": autenticação (JWT), regras de palpite, travas por fase/horário, endpoints de admin e a leitura do leaderboard. |
| 4 | `app-fifa-bolao-web-<sufixo>` | App Service / Web App | usa o plano B1 | **Frontend**. Serve a SPA React (build estático) por um micro-servidor Express (`server.js`). A URL da API é embutida no build. |
| 5 | `st…fifabolao<sufixo>` | Storage Account | Standard LRS (centavos) | **Estado das Functions** (obrigatório pelo runtime do Azure Functions) e armazenamento do pacote de deploy. |
| 6 | `func-fifa-bolao-<sufixo>` | Function App | **Consumption** (grátis até 1M exec/mês) | **Motor de pontuação** serverless. 6 funções acionadas pelo Change Feed do Cosmos (+1 timer de health-check). Calcula pontos e agrega o leaderboard automaticamente. |
| 7 | `signalr-fifa-bolao-<sufixo>` | Azure SignalR Service | **Free** (20 conexões, 20k msgs/dia) | **Tempo real**. Empurra a atualização do leaderboard para os navegadores sem refresh. *Opcional* — o app funciona sem ele (só perde o auto-refresh). |
| 8 | `ai-fifa-bolao-<sufixo>` | Application Insights | grátis até 5 GB/mês | **Observabilidade**: logs, métricas, traces e exceções do backend e das functions. |
| 9 | `log-fifa-bolao-<sufixo>` | Log Analytics Workspace | grátis até 5 GB/mês | **Armazém de telemetria** que dá suporte ao Application Insights (workspace-based). |

> 💰 **Custo:** cabe inteiramente no crédito de US$200 da trial. O único recurso com
> custo relevante é o **App Service Plan B1**; todo o resto fica em free tier.

> 🔒 **Simplificado vs produção:** a versão self-host **NÃO** usa VNet, Private Endpoint
> nem Key Vault (mantém o Cosmos em rede pública e as connection strings nas configurações
> do app). Ver §6.

---

## 3. Banco de dados — Cosmos DB (`bolao2026`, 14 containers)

Throughput de **1000 RU/s compartilhado** no nível do database (free tier). A *partition key*
de cada container está na coluna PK.

### 3.1 Containers de dados (9)

| Container | PK | Papel |
|---|---|---|
| `users` | `/userId` | Contas (admin e participantes): e-mail, hash de senha (bcrypt), nome, role. |
| `predictions` | `/userId` | Palpites de placar dos jogos. Recebe os pontos calculados pela function. |
| `specials` | `/userId` | Palpites especiais (ex.: **artilheiro**). Pontuados separadamente. |
| `matches-cache` | `/groupCode` | Os 72 jogos da fase de grupos (e mata-mata): times, kickoff, status, placar. Lançar um placar aqui **dispara a pontuação**. |
| `leaderboard` | `/season` | Ranking agregado por usuário (pontos de jogos + especiais, desempates). Lido pelo backend e empurrado via SignalR. |
| `groups` | `/season` | Os 12 grupos × 4 seleções da Copa. |
| `players` | `/season` | Catálogo de ~1247 jogadores das 48 seleções (dropdown do artilheiro). |
| `config` | `/scope` | Configurações do bolão: trava dos especiais (`specials-lock`), janelas de fase (`phase-windows`). |
| `audit-log` | `/performedBy` | Trilha de auditoria (ações de admin, palpites rejeitados, etc.). |

### 3.2 Containers de *lease* (5) — controle do Change Feed

Cada função que lê o Change Feed precisa de um container de *lease* próprio (guarda o
checkpoint de quais documentos já foram processados). **Não guardam dados de negócio.**

| Container (PK `/id`) | Usado pela função |
|---|---|
| `leases-calc` | `calc-predictions` |
| `leases-specials` | `calc-specials` |
| `leases-aggregate-predictions` | `aggregate-from-predictions` |
| `leases-aggregate-specials` | `aggregate-from-specials` |
| `leases-emit-leaderboard` | `emit-leaderboard-update` |

---

## 4. Motor de pontuação — Azure Functions (6)

Cinco funções reagem ao **Change Feed** do Cosmos (encadeadas); uma é um *timer*.

| Função | Gatilho (origem → lease) | Papel |
|---|---|---|
| `calc-predictions` | Change Feed: **`matches-cache`** → `leases-calc` | Ao lançar/alterar um placar, calcula os pontos de cada palpite daquele jogo e grava em `predictions`. |
| `calc-specials` | Change Feed: **`config`** → `leases-specials` | Quando o admin resolve/trava os especiais, calcula os pontos dos palpites especiais e grava em `specials`. |
| `aggregate-from-predictions` | Change Feed: **`predictions`** → `leases-aggregate-predictions` | Soma os pontos de jogos do usuário e atualiza a entrada dele no `leaderboard`. |
| `aggregate-from-specials` | Change Feed: **`specials`** → `leases-aggregate-specials` | Soma os pontos de especiais do usuário no `leaderboard`. |
| `emit-leaderboard-update` | Change Feed: **`leaderboard`** → `leases-emit-leaderboard` | Empurra a atualização do ranking para os navegadores via **SignalR** (tempo real). |
| `health-check-cron` | **Timer** (a cada 5 min) | Auto-monitoramento: pinga `/api/health/full` e registra no App Insights. |

---

## 5. Fluxos principais

### 5.1 Registrar um palpite
```
Navegador → Frontend (SPA) → POST /api/predictions (Backend, com JWT)
   → Backend valida (fase aberta? jogo não travado?) → grava em Cosmos `predictions`
```

### 5.2 Pontuação automática (o coração do sistema)
```
Admin lança placar → PUT /api/admin/matches/:id/result → Backend grava em `matches-cache`
   │  (Change Feed dispara)
   ▼
calc-predictions   → calcula pontos dos palpites do jogo → grava em `predictions`
   │  (Change Feed dispara)
   ▼
aggregate-from-predictions → soma o total do usuário → grava em `leaderboard`
   │  (Change Feed dispara)
   ▼
emit-leaderboard-update → SignalR → navegadores atualizam o ranking SEM refresh
```
*(Os especiais seguem o caminho paralelo: `config` → `calc-specials` → `specials` →
`aggregate-from-specials` → `leaderboard` → `emit-leaderboard-update`.)*

### 5.3 Sem SignalR (opcional)
Se o SignalR não for provisionado, todo o resto funciona igual — o leaderboard só não
atualiza sozinho na tela (o usuário recarrega a página para ver o ranking novo).

---

## 6. O que foi simplificado vs produção

A produção da TFTEC usa recursos extras que **não valem a pena** numa conta trial:

| Recurso de produção | No self-host | Por quê |
|---|---|---|
| VNet + Private Endpoint no Cosmos | ❌ não usar | Caro/complexo; o Cosmos fica em rede pública simples. Evita o incidente clássico de "Functions sem rota para o Cosmos com firewall fechado". |
| Key Vault | ❌ não usar | As connection strings vão direto nas configurações do app. |
| SignalR | ⚠️ opcional | App funciona 100% sem; só perde o auto-refresh do placar. |
| App Insights / Log Analytics | ⚠️ opcional | Só observabilidade; pode pular na v1. |

> ⚠️ **Atenção de região (trial):** a quota de App Service numa Free Trial costuma ser
> **regional** (a maioria das regiões dá `Total VMs: 0`). Descubra uma região que a sua
> trial libera **antes** de criar os recursos — ver a seção "Descubra a SUA região" no
> guia de deploy.
