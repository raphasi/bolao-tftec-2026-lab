# Sprint Tracker

## 🟡 Próxima: **S6 — Hardening de Rede (ADR-020)** — Planejada (2026-05-18)

Isolamento da API + dados privados (VNet/Private Endpoint) + App Gateway. Epic e stories por fase em **[`docs/epic-hardening-rede-adr020.md`](docs/epic-hardening-rede-adr020.md)** · decisão em [`DECISIONS.md` ADR-020](DECISIONS.md).
Fase 0 (plano) ✅ · S6.1 Rede · S6.2 Split app (QA gate) · S6.3 Privatizar dados (QA gate) · S6.4 App Gateway (⏸️ deferido — pré-evento) · S6.5 Hardening final. Execução **in-place**, autorizada pelo owner; cada fase gated.

---

## Status atual: **S4 — DevOps + Polish + Notificações ✅ FECHADA** (2026-05-11)

### Sprints concluídas

| Sprint | Tema | Status | Closeout |
|---|---|---|---|
| **S1** Foundation | Infra Bicep + Cosmos + Express/React + tema TFTEC | ✅ Done | 2026-05-07 |
| **S1.5** Visual refresh | FlagMarquee + WorldCupTrophy + SoccerBall + pitch tokens | ✅ Done | 2026-05-09 |
| **S1.6** Bugfix CSP + flags | CSP flagcdn + 48 países Copa 2026 | ✅ Done | 2026-05-10 |
| **S2** Bolão Core | 7 stories: dataset oficial + API matches/groups/predictions/specials + 4 frontend pages + admin config | ✅ Done | 2026-05-11 |
| **S3** Bolão Live | 7 stories: admin results + Functions (calc-predictions/calc-specials/aggregate-leaderboard/emit-update) + leaderboard UI + SignalR + stats Perfil + simulator | ✅ Done | 2026-05-11 |
| **S4** DevOps + Polish | 8 stories: Service Principal + Key Vault + CI/CD workflows + Playwright E2E + composite index + Promise.all + App Insights + health-check-cron | ✅ Done | 2026-05-11 |

### Sprint S4 — DevOps + Polish + Notificações (CLOSEOUT)

**Goal:** Pipeline CI/CD production-grade + tech debt performance + observabilidade.

**Stories entregues (8/8):**
- ✅ S4.1 Service Principal + Azure Key Vault (RBAC, 5 secrets armazenados)
- ✅ S4.2 CI workflow (.github/workflows/ci.yml — PR build+typecheck+smoke)
- ✅ S4.3 Deploy workflow (.github/workflows/deploy.yml — auto push main)
- ✅ S4.4 Playwright E2E suite (7 testes, 6 fluxos críticos, 19.5s local)
- ✅ S4.5 (E-2) Composite index `(matchId, points)` em predictions
- ✅ S4.6 (E-3) `Promise.all + pLimit(5)` em aggregate-leaderboard
- ✅ S4.7 App Insights dashboard + 5 queries KQL documentadas
- ✅ S4.8 Health check cron Function + closeout (ADRs + retro)

**Adiados pra S5 (decisão sprint planning):**
- Email reminders pre-kickoff (SendGrid signup pendente)
- Alertas Azure Monitor com action group (depende de email infra)

**Pipelines automatizados:**
- 4 PRs → 4 deploys automatizados em main
- CI: 1m40s | Deploy: 19m
- Secret architecture: APENAS `AZURE_CREDENTIALS` no GitHub; resto em Key Vault

**Infra adicionada S4:**
- Azure Key Vault `kv-bolao-tftec01` (RBAC mode, standard tier)
- Service Principal `github-actions-bolao`
- Application Insights queries documentadas
- Health-check-cron Function (6ª function — total 6 funcs)

**Concerns abertas (LOW, backlog S5/S6):**
- D-1 tipos duplicados functions↔backend
- F-1, F-2 dead imports cosméticos
- C-3, C-4, C-5 polish backend specials/admin

---

### Sprint anterior: **S3 — Bolão Live ✅ FECHADA** (2026-05-11)

#### Sprints anteriores (resumo)

### Sprint S3 — Bolão Live (CLOSEOUT)

**Goal:** Pontuação automática + Leaderboard realtime + Stats pessoais. Dividida em 2 waves.

**Stories entregues (7/7):**
- ✅ S3.1 Admin Results
- ✅ S3.2 calc-predictions Function (scoring 10/5/0)
- ✅ S3.3 calc-specials + aggregate-leaderboard Functions
- ✅ S3.4 Leaderboard API + UI funcional
- ✅ S3.5 SignalR realtime
- ✅ S3.6 Stats pessoais no Perfil
- ✅ S3.7 Tournament Simulator + closeout

**Infra adicionada S3:**
- 5 lease containers Cosmos → total 12 containers
- 5 Functions registradas (calc-predictions, calc-specials, aggregate-from-predictions, aggregate-from-specials, emit-leaderboard-update)
- SignalR hub 'leaderboard'

**Próximas sprints:**

| Sprint | Tema | Status |
|---|---|---|
| **S4** | CI/CD + smoke tests + push notifications | ⏳ Planned |
| **S5** | PWA + Storage toggle + Reset Demo | ⏳ Backlog |
| **S6** | QA final + roteiro do evento | ⏳ Backlog |

---

## Sprint Histórica: **S1 — Bolão Foundation**

**Started:** 2026-05-10
**Target:** 2026-05-12
**Goal:** Esqueleto deployável: Bicep + Cosmos seed + Express/React mínimo + tema TFTEC + 1 deploy manual no Azure validado.

---

### Blocks

#### Block 1.1 — Estrutura de pastas + repositório ✅
- [x] Folder tree local
- [x] Arquivos raiz (.gitignore, README, SPRINT, BACKLOG, DECISIONS)
- [ ] Repositório GitHub `TFTEC/fifa2026-bolao-dev` criado
- [ ] Initial commit pushed

#### Block 1.2 — Bicep IaC ✅
- [x] `infra/main.bicep` orquestrador
- [x] `infra/modules/cosmos.bicep` (5 containers + PK + composite indexes)
- [x] `infra/modules/appservice.bicep` (B1 Linux Node 20 + Managed Identity)
- [x] `infra/modules/functions.bicep` (Y1 Consumption Linux)
- [x] `infra/modules/signalr.bicep` (Free_F1 modo Serverless)
- [x] `infra/modules/storage.bicep` (Standard_LRS)
- [x] `infra/modules/appinsights.bicep` (workspace-based)
- [x] `infra/modules/loganalytics.bicep` (PerGB2018, 30d retention)
- [x] `infra/parameters.example.json`
- [x] `infra/README.md` com passo a passo
- [x] Build + lint validados (0 warnings)
- [ ] Testar provisioning end-to-end (Block 1.8)

#### Block 1.3 — Cosmos seed + reset scripts ✅
- [x] `scripts/lib/cosmos-types.ts` — tipos compartilhados (5 documents + container config)
- [x] `scripts/lib/cosmos-client.ts` — cliente SDK com dotenv + assertDatabaseExists
- [x] `scripts/fixtures/matches-sample.json` — 12 jogos sample (1 por grupo A-L)
- [x] `scripts/seed-cosmos.ts` — popula admin + matches + leaderboard (idempotente)
- [x] `scripts/reset-cosmos.ts` — soft/hard reset com confirmação
- [x] `scripts/setup-cosmos.sh` — alternativa CLI imperativa equivalente ao Bicep
- [x] `tsconfig.json` raiz para scripts
- [x] Typecheck limpo (npx tsc --noEmit)
- [x] Smoke tests dos 3 scripts validados

#### Block 1.4 — Backend skeleton ✅
- [x] `backend/package.json` (Express 5 + Zod + pino + helmet + rate-limit)
- [x] `backend/tsconfig.json` (NodeNext ESM + strict)
- [x] `backend/src/config/env.ts` — validação Zod de env vars
- [x] `backend/src/config/logger.ts` — pino com pretty em dev, JSON em prod
- [x] `backend/src/services/cosmos.ts` — client singleton + pingCosmos
- [x] `backend/src/services/jwt.ts` — sign/verify tipado
- [x] `backend/src/middleware/auth.ts` — requireAuth, requireAdmin, optionalAuth
- [x] `backend/src/middleware/error-handler.ts` — ZodError + HttpError + fallback
- [x] `backend/src/utils/http-errors.ts` — BadRequest/Unauthorized/Forbidden/NotFound/Conflict/Internal
- [x] `backend/src/types/http.ts` — augment de Express.Request com req.user
- [x] `backend/src/routes/health.ts` — GET /, GET /full (com Cosmos ping)
- [x] `backend/src/routes/auth.ts` — POST /register, /login, GET /me
- [x] `backend/src/routes/index.ts` — aggregator
- [x] `backend/src/server.ts` — bootstrap completo c/ graceful shutdown
- [x] `backend/.env.example`, `backend/README.md`
- [x] Typecheck limpo (0 erros)
- [x] Build de produção OK (backend/dist/ gerado)
- [x] Smoke tests: 5 endpoints respondendo corretamente

#### Block 1.5 — Frontend skeleton ✅
- [x] `frontend/package.json` (Vite 5 + React 18 + RR6 + Tanstack Query + axios + sonner + zod)
- [x] `frontend/tsconfig.{json,app,node}.json` com paths `@/*`
- [x] `frontend/vite.config.ts` + proxy /api → backend:3001 em dev
- [x] `frontend/tailwind.config.ts` + `postcss.config.js` + `components.json` (shadcn)
- [x] `frontend/src/index.css` — tokens HSL (placeholder shadcn neutro)
- [x] `frontend/src/lib/utils.ts` — cn() helper shadcn
- [x] `frontend/src/lib/api.ts` — axios c/ token interceptor + 401 handler
- [x] `frontend/src/lib/auth-api.ts` — login/register/getMe tipados
- [x] `frontend/src/components/ui/` — Button, Input, Label, Card (shadcn pattern)
- [x] `frontend/src/components/layout/` — Layout, Navbar, ProtectedRoute
- [x] `frontend/src/contexts/AuthContext.tsx` — hidrata do /api/auth/me, persiste em localStorage
- [x] `frontend/src/pages/` — Home, Login, Register, Palpites, Especiais, Leaderboard, Perfil, NotFound
- [x] `frontend/src/App.tsx` — router c/ lazy + QueryClient + Toaster + Devtools
- [x] `frontend/src/main.tsx` — entry point StrictMode
- [x] Typecheck limpo (npx tsc -b --noEmit)
- [x] Build OK — 1708 modules transformed, lazy chunks separados, 100KB gzip main bundle

#### Block 1.6 — Tema TFTEC Cloud ✅
- [x] Assets brand copiados para frontend/public/ (logo, ícone, favicon PNG)
- [x] Pattern descartado (1.3MB) → CSS radial gradient inspirado no GRADIENTE-ESCURO oficial
- [x] index.css com tokens HSL dark-first (background #1D1435, surface #241A40)
- [x] :root e .dark com mesma paleta (dark-first sem alternar tema)
- [x] Brand utilities: text-brand-gradient, bg-brand-gradient, glow-brand
- [x] Tailwind config: cores brand.{magenta,purple,violet,electric},
       backgroundImage: tftec-gradient/tftec-radial, boxShadow brand-glow
- [x] Fontes: Space Grotesk (display) + Inter (body) + JetBrains Mono (code)
- [x] Selection magenta translúcido
- [x] Navbar com logo TFTEC + "Bolão TFTEC" em gradient
- [x] Home hero com bg-tftec-radial e CTAs em gradient + shadow brand-glow-lg
- [x] Login/Register cards com ícone TFTEC central e botão gradient
- [x] Footer assinado "TFTEC Cloud · FIFA World Cup 2026"
- [x] Build OK (CSS 19.75KB / 4.59KB gzip — +25% por causa do brand)
- [x] Visual validado via puppeteer screenshots (Home e Login)

#### Block 1.7 — Documentação inicial ✅
- [x] `docs/architecture.md` — visão completa c/ ASCII diagram, 5 fluxos, RG layout, escalabilidade
- [x] `docs/setup-bicep.md` — caminho oficial 11 passos, dry-run, what-if, troubleshooting inline
- [x] `docs/setup-cli.md` — caminho imperativo c/ vars bash+PowerShell, ordem otimizada
- [x] `docs/setup-portal.md` — passo a passo visual 9 recursos, ordem de criação
- [x] `docs/scoring-rules.md` — regras + função TS + 10 exemplos + tabela de probabilidades
- [x] `docs/troubleshooting.md` — 25+ problemas comuns categorizados (Bicep/Cosmos/CORS/JWT/Build/App Service/Functions/SignalR/Dev)
- [x] README raiz atualizado c/ 3 caminhos de reprodução + referências cruzadas
- [x] Total: ~1.700 linhas de markdown técnico

#### Block 1.8 — Primeiro deploy real ✅
- [x] `az group create` rg-fifa-bolao em eastus2
- [x] Bicep deployment completo: 11 recursos Azure provisionados
- [x] Cosmos seed: 1 admin + 12 matches + leaderboard inicial
- [x] Squad workflow executado: @dev → @qa → @devops
- [x] Bug encontrado pelo Dex: Express 5 splat `'*'` → `/{*splat}` (commit be36ac0)
- [x] Bug encontrado pelo Dex: SPA splat capturando /api (commit 0b8efd5)
- [x] @qa decisão: PASS_WITH_CONCERNS (6 PASS, 1 CONCERN, 0 FAIL)
- [x] @devops fix do CONCERN-001: PowerShell zip backslash → Node archiver forward-slash
- [x] @devops fix do CONCERN-002: Kudu deploy stuck cleanup via stop/start
- [x] @devops descobriu issue: Oryx comprime node_modules em tar.gz → extração manual via Kudu API
- [x] Deploy via Kudu zipdeploy (clean zip 555KB, 49 arquivos)
- [x] Smoke tests live OK: 6/6 (health/health-full/index/login admin+JWT/api-missing 404/palpites SPA 200)
- [x] App live: https://app-fifa-bolao-tftec01.azurewebsites.net

## Sprint S1 ✅ FECHADA — 2026-05-11

Todos os 8 blocks concluídos. Bolão TFTEC Cloud em produção no Azure.

**Stats finais:**
- 11 recursos Azure provisionados (eastus2)
- 14 documentos Cosmos seeded
- 6 endpoints HTTP validados live
- ~1.700 linhas de docs
- 12 ADRs registrados (ADR-001 a ADR-012)
- 6 commits no GitHub TFTEC/fifa2026-bolao-dev

---

## Sprint S1.5 — Visual Identity Refresh ✅ FECHADA — 2026-05-11

Pipeline autônomo @ux → @dev → @qa → @devops aplicou identidade Copa do Mundo
ao site mantendo brand TFTEC como base.

**Entregas:**
- 3 componentes novos (FlagMarquee, WorldCupTrophy, SoccerBall — SVGs custom)
- 30 bandeiras WC 2026 via flagcdn.com (USA/CA/MX sedes em destaque)
- 3 tokens cor copa (pitch-green, champion-gold, passion-red)
- bg-pitch-overlay com linhas sutis de campo
- Páginas Palpites + Leaderboard com preview funcional
- Footer com sedes 2026 em todas as páginas
- Stats Copa no hero: 48 / 72 / 1

**Squad workflow validado:**
- @ux Uma → spec design 9 tasks (4 P0 + 5 P1)
- @dev Dex → implementação completa, commit 9c2b842
- @qa Quinn → gate PASS 7/7 AC
- @devops Gage → 2 ciclos de deploy (Opção A recovery via Bicep)

**Issue operacional resolvida (Opção A):**
- App Service entrou em estado corrompido após múltiplas tentativas Oryx
- Recovery: delete App Service + Bicep idempotente recriou + redeploy clean
- Lição em memory: deploy do Bolão deve pré-install node_modules local
  + archiver forward-slash POSIX (evitar bug Oryx tar.gz parcial)

**Smoke tests live: 6/6 PASS**
- /api/health → 200
- /api/health/full → 200 (Cosmos ping 2.6s)
- / → 200 HTML c/ tema Copa
- POST /api/auth/login → 200 + JWT
- /api/missing → 404
- /leaderboard → 200

**URL final:** https://app-fifa-bolao-tftec01.azurewebsites.net

---

## Sprint S1.6 — Bug fixes CSP + 48 países + Run-From-Package ✅ FECHADA — 2026-05-11

Pipeline @ux → @dev → @qa → @devops fix bugs reportados + descoberta da
solução DEFINITIVA para deploy no Linux App Service.

**Bugs corrigidos:**
- BUG-1: CSP helmet bloqueava flagcdn.com → custom directives permite
  img-src https://flagcdn.com + fonts/styles Google
- BUG-2: 30 países baseado em copas históricas → 48 oficiais Copa 2026
  (3 hosts + 6 CONMEBOL + 16 UEFA + 8 AFC + 9 CAF + 3 CONCACAF + 1 OFC + 2 playoff)

**Descoberta crítica do deploy:**
- Causa raiz dos restart loops: Oryx faz rsync de /tmp/zipdeploy/extracted
  para wwwroot mesmo com ENABLE_ORYX_BUILD=false. rsync perde arquivos
  pequenos (ex: node_modules/zod/package.json). ESM strict resolver crasha.
- SOLUÇÃO DEFINITIVA: WEBSITE_RUN_FROM_PACKAGE=1
  - Zip é montado como filesystem read-only em /home/data/SitePackages/
  - Node lê arquivos diretamente do zip (sem extract, sem rsync)
  - Site startup probe succeeded after 120s ✓

**Smoke tests live: 8/8 PASS**
- /api/health → 200 ok
- /api/health/full → 200 + Cosmos ping 2.1s
- / → 200 HTML c/ tema TFTEC + Copa
- /api/auth/login admin → 200 + JWT
- CSP contém https://flagcdn.com ✓
- /api/missing → 404
- /leaderboard → 200
- flagcdn.com bandeiras → carregando 48 corretas

**Memory atualizada:** feedback_bolao_deploy_method.md agora documenta
WEBSITE_RUN_FROM_PACKAGE como solução canônica.

**URL final:** https://app-fifa-bolao-tftec01.azurewebsites.net

---

## Próximas sprints (preview)

| Sprint | Foco | Bloco principal | Status |
|---|---|---|---|
| S2 | Auth + CRUD predictions | `[BOLAO]` | ✅ Done |
| S3 | Functions + SignalR + leaderboard | `[BOLAO]` | ✅ Done |
| S4 | CI/CD + smoke tests + polish | `[BOLAO][DOCS]` | ✅ Done |
| S4.5 | Admin Console (user mgmt + system stats) | `[BOLAO]` | ✅ Done (2026-05-12) |
| S5 | Reliability (deploy filter) + Observability (AppInsights queries) + PWA | `[BOLAO]` | ✅ Done (2026-05-12) |
| S6 | QA final + roteiro do evento + cleanup users e2e | `[MAIN][BOLAO]` | ⏳ Pending |

---

## Convenções

- `[BOLAO]` `[MAIN]` `[INFRA]` `[DOCS]` — tags por escopo
- Status: `⏳ Pending` · `🔄 In Progress` · `✅ Done` · `⚠️ Blocked`
- Cada block fecha com **check-in** ao usuário antes do próximo
