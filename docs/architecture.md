# Arquitetura — Bolão TFTEC Cloud

Visão técnica completa do sistema. Este documento responde "como tudo se encaixa".

---

## 🏗️ Visão geral

O Bolão TFTEC Cloud é uma aplicação **independente** do app principal (`fifa2026-tickets-dev`). Os dois sistemas conversam apenas via REST API, sem compartilhar banco, sessão ou deployment.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO / CELULAR                        │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      App Service B1 Linux                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Express 5 (Node 20)                                     │   │
│  │  - Serve API /api/* (auth, predictions, leaderboard)    │   │
│  │  - Serve frontend estático (React SPA build)            │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────┬─────────────────────────────────────┬──────────────┘
             │                                     │
             │ Cosmos SDK                          │ SignalR SDK
             ▼                                     ▼
┌─────────────────────────────┐       ┌─────────────────────────┐
│    Azure Cosmos DB          │       │  Azure SignalR Service  │
│    (Free Tier)              │       │  (Free, Serverless)     │
│  ┌──────────────────────┐   │       │  ┌──────────────────┐   │
│  │ users                │   │       │  │ Hub: leaderboard │   │
│  │ predictions          │   │       │  └──────────────────┘   │
│  │ specials             │   │       └──────────▲──────────────┘
│  │ matches-cache        │   │                  │
│  │ leaderboard          │   │                  │ output binding
│  └──────────────────────┘   │                  │
└──────────────▲──────────────┘                  │
               │                                  │
               │ writes                           │
               │                                  │
┌──────────────┴──────────────────────────────────┴──────────────┐
│                    Azure Functions (Consumption)                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │ sync-matches         │    │ calculate-points              │  │
│  │ (timer 5min)         │    │ (timer 5min + HTTP trigger)   │  │
│  │ ↓                    │    │ ↓                             │  │
│  │ fetch main API       │    │ varre matches finalizados,    │  │
│  │ upsert matches-cache │    │ calcula points por user,      │  │
│  │                      │    │ atualiza leaderboard,         │  │
│  │                      │    │ broadcast SignalR             │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                                            ▲
        │ HTTP                                       │
        ▼                                            │
┌──────────────────────────────┐         ┌──────────┴────────────┐
│  Main App (separate sub)     │         │ Application Insights  │
│  fifa2026-tickets-dev        │         │ + Log Analytics       │
│  → GET /api/matches          │         │ (logs de tudo acima)  │
└──────────────────────────────┘         └───────────────────────┘
```

---

## 🧱 Componentes

### Frontend — React SPA
- **Stack:** Vite 5 + React 18 + TypeScript + Tailwind + shadcn/ui pattern
- **Roteamento:** React Router 6 com lazy loading por página
- **Estado servidor:** Tanstack Query 5 (cache 1min staleTime)
- **Auth state:** Context API com hydration via `/api/auth/me`
- **HTTP:** axios com interceptor para Bearer token + 401 handler
- **Real-time:** SignalR client (a partir do Block 3)
- **Build output:** servido pelo backend Express em produção

### Backend — Express API
- **Stack:** Express 5 + TypeScript + Node 20 (ESM)
- **Auth:** JWT HS256 + bcrypt (10 rounds), próprio do bolão
- **Validação:** Zod em todas as rotas com bodies
- **Logger:** pino (JSON em prod, pretty em dev)
- **Segurança:** helmet, CORS configurável, rate-limit global e por rota
- **Banco:** SDK `@azure/cosmos` com singleton client
- **Observabilidade:** Application Insights via `applicationinsights` npm

### Azure Functions — Workers async
- **Plan:** Consumption Y1 Linux (1M req/mês free forever)
- **Runtime:** Node 20
- **Funções:**
  - `sync-matches` (timer 5min) — replicar jogos do main app
  - `calculate-points` (timer 5min + HTTP) — recalcular leaderboard
- **Bindings:** Cosmos (input/output) + SignalR (output)

### Cosmos DB — Banco NoSQL
- **Free Tier:** 1000 RU/s + 25GB para sempre (1 conta por subscription)
- **API:** SQL/NoSQL
- **Throughput:** compartilhado no nível database (não por container)
- **5 containers:**
  - `users` (PK: /userId) — cadastros do bolão
  - `predictions` (PK: /userId) — palpites por jogo
  - `specials` (PK: /userId) — campeão, top 4, artilheiro
  - `matches-cache` (PK: /groupCode) — cópia local dos jogos
  - `leaderboard` (PK: /season) — ranking agregado

### SignalR Service — Real-time
- **SKU:** Free_F1 — 20 conexões concorrentes, 20k msgs/dia
- **Modo:** Serverless (clientes conectam direto, Functions publicam)
- **Hub principal:** `leaderboard` (broadcast quando pontos atualizam)

### Application Insights + Log Analytics
- **Free:** 5GB ingestão/mês, retenção 30 dias
- **Coleta de:** App Service (Express), Function App, custom events

---

## 🔄 Fluxos principais

### 1. Cadastro e Login
```
Frontend → POST /api/auth/register
         → bcrypt(password, 10) + Cosmos.users.create
         ← { token: JWT(userId, email, role), user }
         → localStorage.setItem('bolao.auth.token')
         → setUser(user)

Reload da página:
Frontend monta → AuthContext lê token do localStorage
              → GET /api/auth/me (Bearer)
              → backend valida JWT, lê Cosmos.users.read(userId)
              ← { user }
              → setUser(user) — autenticado de novo
```

### 2. Palpite em um jogo (Block 2)
```
Frontend (página /palpites) → GET /api/predictions/me
                            ← lista palpites do user
                            → render grid de 72 jogos

Usuário digita 2-1 em Brasil×Argentina → POST /api/predictions
                            → backend valida:
                              * matchId existe em matches-cache
                              * kickoffUtc > now (jogo ainda não começou)
                              * predictedHome/Away entre 0-15
                              * upsert no Cosmos.predictions
                            ← { points: null, lockedAt: null }
                            → frontend atualiza estado otimisticamente
```

### 3. Cálculo de pontos (Block 3)
```
Function sync-matches (timer 5min):
  GET MAIN_API_BASE_URL/matches
  Para cada jogo finalizado novo:
    Upsert matches-cache com homeScore/awayScore/status='finished'

Function calculate-points (timer 5min):
  Query matches-cache WHERE status='finished' AND pointsCalculatedAt IS NULL
  Para cada match:
    Query predictions WHERE matchId=X
    Para cada prediction:
      points = scoreLogic(predicted, actual)
      Upsert prediction com points
      Upsert leaderboard incrementando totalPoints
    Update match.pointsCalculatedAt = now
  
  output: SignalR broadcast { type: 'leaderboard.updated', matchId }

Frontend (página /leaderboard):
  connection.on('leaderboard.updated') → queryClient.invalidateQueries(['leaderboard'])
  → React Query refetch → tabela re-renderiza com nova ordem
```

---

## 🗂️ Resource Group

Todos os recursos do bolão vivem em **`rg-fifa-bolao`** (East US):

| Recurso | Nome (com suffix `rapha01`) | SKU |
|---|---|---|
| Cosmos DB Account | `cosmos-fifa-bolao-rapha01` | Standard (Free Tier ON) |
| Cosmos Database | `bolao2026` | 1000 RU/s shared |
| App Service Plan | `plan-fifa-bolao-rapha01` | B1 Linux |
| App Service | `app-fifa-bolao-rapha01` | — |
| Storage Account | `stfifabolaorapha01` | Standard_LRS |
| Function App | `func-fifa-bolao-rapha01` | Y1 Consumption Linux |
| SignalR Service | `signalr-fifa-bolao-rapha01` | Free_F1 Serverless |
| Application Insights | `ai-fifa-bolao-rapha01` | Workspace-based |
| Log Analytics Workspace | `log-fifa-bolao-rapha01` | PerGB2018 |

**Custo:** ~$13/mês (apenas App Service B1; resto no free tier). Cabe ~15 meses do trial de $200.

---

## 🔐 Segurança

### Em trânsito
- HTTPS obrigatório (`httpsOnly: true` no App Service)
- TLS 1.2+ mínimo
- HSTS via helmet

### Auth
- JWT HS256 com segredo de 32+ chars (validado por Zod)
- bcrypt 10 rounds (configurável)
- Token expira em 7d (configurável)
- Rate limit em `/register` e `/login`: 10 req/min/IP
- Timing-attack mitigation: bcrypt rodado mesmo para e-mail inexistente

### Em repouso
- Cosmos: criptografado pela Microsoft (AES-256)
- Storage: criptografado por padrão
- App Settings: secrets em texto plano (roadmap: migrar pra Key Vault na Fase 2)

### Identidade
- Managed Identity habilitada em App Service e Function App
- Usado hoje apenas para enviar logs ao App Insights
- Roadmap: usar para acessar Key Vault e Cosmos via RBAC

---

## 📡 CORS e integração

- `CORS_ORIGINS` permite `*` em dev, restringir em prod
- Frontend e backend servidos da **mesma origem** em produção → CORS não é problema runtime
- Em dev, Vite proxia `/api` → `http://localhost:3001` (sem CORS)
- Bolão chama `MAIN_API_BASE_URL` (main app) → requer CORS aberto no main para `https://*.azurewebsites.net`

---

## 📈 Escalabilidade

Para fins educacionais o sistema é dimensionado para **1 turma** (30-50 usuários).

| Recurso | Limite (Free/B1) | Suficiente para |
|---|---|---|
| App Service B1 | 1 CPU, 1.75GB RAM | ~100 RPS sustained |
| Cosmos 1000 RU/s | ~250 reads/s ou ~100 writes/s | turma inteira palpitando ao mesmo tempo |
| Functions Y1 | 1M req/mês | timer rodando a cada 5min = ~9k/mês — sobra muito |
| SignalR Free | 20 conexões concorrentes | turma assistindo leaderboard ao vivo |

Para produção real, escalar:
- App Service Plan → P1V2 ou superior
- Cosmos → autoscale 4000 RU/s
- SignalR → Standard_S1 (1000 conexões)

---

## 🔍 Observabilidade

### Logs
- Express → pino → stdout → App Service log stream → App Insights traces
- Functions → automático para App Insights
- Frontend → opcional (sem instrumentação por padrão)

### Métricas
- App Service: CPU, memória, requests/s, response time
- Cosmos: RU consumption, throttling (429), latência
- Functions: execuções, duração, falhas

### Health checks
- `GET /api/health` — uptime + version (configurado como `healthCheckPath` no App Service)
- `GET /api/health/full` — inclui ping Cosmos com latência

---

## 🚀 Roadmap arquitetural (próximas sprints)

| Sprint | Adição |
|---|---|
| 2 | CRUD predictions + specials com lock por kickoff |
| 3 | Functions implementadas + SignalR funcionando |
| 4 | CI/CD GitHub Actions pra deploy automático |
| Fase 2 | Mascote IA via GitHub Models + Key Vault + Managed Identity |
| Fase 2 | Painel de observabilidade /admin/health consumindo App Insights REST |

---

## 📚 Referências

- [Bicep templates](../infra/)
- [Cosmos seed scripts](../scripts/)
- [Backend README](../backend/README.md)
- [Brand guidelines](./brand/)
- [Decisões arquiteturais (ADRs)](../DECISIONS.md)
