# Architecture Decision Records (ADRs)

Decisões arquiteturais significativas. Cada entrada captura **contexto**, **decisão** e **consequências**.

---

## ADR-021: Front Door Premium + WAF na borda (supersede a entrada "App Gateway" do ADR-020)

**Status:** Accepted (2026-06-09, decisão do owner) — **implementada para a estreia (11/06)**.

**Contexto:** A estreia (11/06) é pública e o owner espera tentativas reais de intrusão; quer **máximo de segurança** na borda. O ADR-020 previa **Application Gateway WAF_v2** como entrada futura, mas nunca foi implementado (o `snet-appgw` segue reservado/vazio). Achado crítico (verificado no código): o split S6.2 deixou 2 Web Apps **cross-origin** e o SPA é buildado com `VITE_API_BASE_URL` = **URL absoluta do backend** (`deploy-frontend-webapp.sh:27`), então o browser chama a API **direto** — qualquer WAF na borda seria **decorativo** sem um rebuild **same-origin**. `frontend/src/lib/api.ts:14` já cai em `/api` relativo quando a var é vazia, então o rebuild custa 1 variável.

**Decisão:**

1. **Entrada pública = Azure Front Door Premium** (não Application Gateway). Premium é obrigatório p/ **Managed Rules (OWASP DRS 2.1)** + **Bot Manager 1.1**. Custo ~US$330/mês na sub Sponsorship-2024 (spendingLimit Off); app descartada após a Copa (~1 mês). Mais barato e operacionalmente mais simples que App Gateway WAF_v2 (~US$250-400/mês + subnet/IP/cert dedicados).
2. **Same-origin:** 1 endpoint AFD, frontend + API atrás do **mesmo hostname** (`/*` → og-web, `/api/*` → og-api). Rebuild do SPA com `VITE_API_BASE_URL=/api` **apenas na invocação de prod** — o default do script e o repo self-host dos alunos (sem AFD) seguem com a URL absoluta. Same-origin torna CORS moot.
3. **WAF em Prevention desde o dia 1**, com calibração no ensaio (D-2/D-1) e rollback de 1 comando p/ Detection. Custom rule de rate-limit **NAT-aware** escopada em `/api/*` (limiar alto: a turma sai por 1 IP via NAT).
4. **Isolamento "só-AFD"** das Web Apps via `ipSecurityRestrictions` (service tag `AzureFrontDoor.Backend` + match do header `X-Azure-FDID` = frontDoorId), como passo de **cutover separado**, só após validar o AFD. IP do owner mantido Allow na transição; rollback `az webapp config access-restriction remove`.
5. **URL:** `*.azurefd.net` (sem domínio próprio na v1; comunicar aos alunos antes do evento).

**Implementação:** módulo **standalone** `infra/modules/frontdoor.bicep` (NÃO referenciado por `main.bicep`, p/ não reconciliar o stack de prod) + `infra/parameters.frontdoor.json`. Deploy aditivo via `az deployment group create`.

**Consequências:**
- ✅ WAF cobre frontend **e** API (managed OWASP + Bot Manager + rate-limit de borda) sob 1 hostname.
- ✅ API isolável (só-AFD) sem refactor do Express nem App Gateway/subnet/cert.
- ✅ Reaproveita o `/api` relativo que o `api.ts` já suporta — rebuild trivial.
- ❌ Custo fixo do Premium pelo mês do evento.
- ❌ Prevention dia-1 + NAT = risco de falso-positivo barrar aluno → mitigado por calibração + rate-limit alto + rollback rápido.
- ❌ Sem domínio próprio, a URL é `*.azurefd.net` (estética/estabilidade p/ depois).

**Supersede:** o item **2 do ADR-020** ("Sem Front Door; entrada futura = Application Gateway WAF_v2"). O resto do ADR-020 (frontend sempre Web App, API privada, Cosmos/SignalR por PE) segue válido.

---

## ADR-020: Isolar API do frontend + Application Gateway (hosting sempre Web App)

**Status:** Accepted (2026-05-18, decisão do owner) — **direção de hardening; NÃO implementada no escopo do evento atual.** ⚠️ **Item 2 (entrada = App Gateway) SUPERSEDED por ADR-021** (2026-06-09): a borda pública passou a ser **Front Door Premium + WAF**.

**Contexto:** Hoje o Bolão serve **API (`/api/*`) e o SPA React no mesmo Web App** (Express único). Consequência: a **API é publicamente acessível por construção** — não dá para colocá-la atrás de Private Endpoint nem isolá-la, pois é o mesmo app que o público precisa alcançar para abrir o site. Isso impede defesa em profundidade (API privada, tráfego ao banco pela VNet). O Tickets já nasceu com 2 Web Apps (front + back separados), mas ainda sem isolamento de rede.

**Decisão:**

1. **Padrão de hosting (ambos os serviços):** o **frontend é sempre um Azure Web App (App Service)** servindo o build estático — **nunca Static Web App**. Motivo: **Static Web App não é backend válido de Application Gateway**; precisamos manter os fronts aptos ao App Gateway.
2. **Sem Front Door.** A entrada pública futura será **Application Gateway (WAF_v2)**.
3. **Bolão:** dividir o Web App único em **2 Web Apps** → (a) frontend Web App; (b) **API Web App separada e privada** (VNet Integration + Private Endpoint). O App Gateway faz o roteamento (`/` → frontend, `/api/*` → API); a API aceita tráfego **apenas do App Gateway**.
4. **Banco/realtime privados:** Cosmos e SignalR via **Private Endpoint** na VNet (public network access desligado); Functions VNet-integradas.
5. **Tickets:** já tem 2 Web Apps (frontend já é Web App) → **não precisa de split**; falta apenas pôr **App Gateway + Private Endpoints** quando for o momento.

**Consequências:**
- ✅ Defesa em profundidade: API não exposta à Internet, WAF na borda, tráfego ao banco privado, mínimo privilégio.
- ✅ Padrão consistente entre Bolão e Tickets (ambos aptos a App Gateway).
- ❌ Refactor não-trivial no Bolão: separar o monólito Express (servir SPA × API), VNet, Private Endpoints, reconfigurar SignalR/Functions e o pipeline de deploy.
- ❌ Custo: Application Gateway **WAF_v2** tem custo fixo relevante (avaliar viabilidade no contexto educacional × produção real).
- 🔗 Complementa o roadmap já previsto (Key Vault + Managed Identity + RBAC em `docs/architecture.md`).

**Escopo:** decisão arquitetural registrada para **evolução futura**. Não bloqueia o evento; o ambiente atual (1 Web App) segue válido para o workshop.

**Implementação (priorizada 2026-05-18):** planejada como **Epic S6** — ver [`docs/epic-hardening-rede-adr020.md`](docs/epic-hardening-rede-adr020.md) (5 fases, in-place, App Gateway deferido p/ pré-evento). Fase 0 (plano) concluída.

---

## ADR-019: Regra de pontuação 25/15/0 (supersede ADR-014)

**Status:** Accepted (2026-05-15, decisão do owner)

**Contexto:** A ADR-014 fixou 10/5/0 por jogo, mas `docs/scoring-rules.md` e a Home ("Como pontuar") sempre anunciaram um esquema diferente (25/12/7/3) — divergência de 3 vias descoberta na validação 2026-05-15 (engine 10/5/0 ≠ doc/Home 25/12 ≠ Regras 10/5/0). O owner definiu o padrão definitivo.

**Decisão:** Pontuação por jogo = **25 / 15 / 0**:
- Placar exato → **25**
- Acertou o vencedor OU o empate, sem acertar os gols → **15**
- Errou → **0**

(Especiais inalterados: 150/75/40/40/120 + bônus 50.)

**Implementação:** `functions/src/shared/scoring.ts::calcMatchPoints`. Alinhados no mesmo PR: `calc-predictions.ts` (comentário), `aggregate-leaderboard.ts` + `system-stats.ts` + `Perfil.tsx` + `Leaderboard.tsx` (consumidores que assumiam "placar exato = 10" → **25**, incluindo o critério de desempate `perfectScores`), `Regras.tsx`, `Home.tsx`, `docs/scoring-rules.md`.

**Consequências:**
- ✅ Engine, UI e docs finalmente consistentes (fonte da verdade única: scoring.ts)
- ✅ `perfectScores` (desempate do leaderboard) volta a funcionar (contava `=== 10`, nunca batia)
- ⚠️ **Gap de qualidade:** ADR-014 citava "23/23 unit tests" mas **não há testes de scoring no repo** (removidos/nunca commitados). Recriar testes de `calcMatchPoints` é tech-debt registrado.
- ⚠️ **Recálculo:** predictions já pontuadas sob 10/5/0 mantêm pontos antigos até `calc-predictions` reprocessar (idempotência via `pointsCalculatedAt`). Pré-evento (Copa em jun/2026) → impacto provável nulo, mas validar seed/dados e2e antes do evento.

**Reversal:** trocar 2 constantes na função + consumidores — sem lock-in.

---

## ADR-018: Reliability + Observability + PWA (S5)

**Status:** Accepted (2026-05-12, Sprint S5)

**Contexto:** Sprint S5 endereça (1) deploy Functions hangou no PR #7 mesmo sem mudanças em functions, (2) cards de observabilidade em /admin/system retornavam null, (3) app não era instalável como PWA.

**Decisão:**

1. **Path-based job filter no workflow Deploy:**
   - Novo job `detect_changes` usa `dorny/paths-filter@v3` para detectar mudanças em `backend/`/`frontend/` (app) vs `functions/` (functions)
   - `deploy_app` e `deploy_functions` rodam condicionalmente (`if: needs.detect_changes.outputs.X == 'true'`)
   - `smoke_live` roda se pelo menos um deploy efetivamente rodou (não no-op total)
   - `workflow_dispatch` sempre roda tudo (manual override)
   - `deploy_functions` timeout 15→25min para tolerar Oryx lento quando functions DO mudam

2. **App Insights queries via @azure/monitor-query SDK:**
   - DefaultAzureCredential (usa Managed Identity em App Service, az CLI em dev)
   - Novo env var `APPINSIGHTS_RESOURCE_ID` (opcional) — sem ele queries retornam null (graceful fallback)
   - 3 queries KQL paralelas com timeout 5s: errors24h, requestsLast1h, latencyP95(ms)
   - Backend não falha se App Insights estiver indisponível (todas queries têm catch + warn log)
   - Wiring infra (Managed Identity + role "Monitoring Reader") é manual one-time setup

3. **PWA via vite-plugin-pwa:**
   - `registerType: 'autoUpdate'` — service worker atualiza no background
   - Componente `PWAUpdatePrompt` exibe banner quando há nova versão disponível
   - Runtime cache: NetworkFirst (5s timeout) para `/api/(matches|groups|leaderboard)` (5min TTL); CacheFirst para flagcdn.com (30 dias TTL)
   - Manifest TFTEC theme (#1D1435), display standalone, ícones 192/512 reusam tftec-icon.png

**Justificativa:**
- Path filter elimina 95% dos deploys Functions desnecessários (PRs frontend não tocam functions)
- App Insights SDK + graceful fallback: zero impacto se infra não está pronta; funciona automaticamente quando MSI configurado
- PWA install: melhora UX mobile no dia do evento (acesso rápido home screen)

**Trade-offs:**
- ✅ Deploys mais rápidos quando funções não mudam (skip 15-25min)
- ✅ Observability cards populados quando infra estiver wirada (sem mudança código)
- ✅ App instalável + offline para leitura de jogos/leaderboard
- ❌ paths-filter requer fetch-depth=2 (mais slow no checkout)
- ❌ Ícones PWA reusam imagem TFTEC não-quadrada (1055x910) — visual sub-ótimo até gerarmos pwa-192/pwa-512 reais
- ❌ Service Worker pode cachear conteúdo stale; mitigado por `registerType: autoUpdate` + skipWaiting

---

## ADR-017: Admin Console architecture (S4.5)

**Status:** Accepted (2026-05-12, Sprint S4.5)

**Contexto:** Sprint S4.5 adiciona console administrativo para gestão de usuários (CRUD + roles + soft delete) e observabilidade do sistema. Decisões arquiteturais significativas em segurança, performance e estratégia de testes.

**Decisão:**

1. **Soft delete via `active: boolean`** em vez de hard delete:
   - Preserva audit trail e histórico de palpites
   - Login retorna mensagem unificada `Credenciais inválidas` (evita user enumeration)
   - Reativação reversível sem perda de dados

2. **Cache LRU em-memória** para validação `active` no middleware:
   - TTL: 10s (curto pra propagação rápida de soft-delete)
   - MaxSize: 200 entries com eviction insertion-order LRU
   - Auto-invalidação em deactivate/reactivate (propagação <1s)
   - Endpoint manual flush: `POST /api/admin/system/cache/invalidate-active`
   - Fail-closed em Cosmos error (bloqueia request)

3. **Audit log como container Cosmos** (não tabela separada nem App Insights events):
   - PK `/performedBy` (queries "tudo que admin X fez" são baratas)
   - TTL 365 dias (compliance + custo)
   - 2 composite indexes: `(performedBy, timestamp DESC)` + `(targetUserId, timestamp DESC)`
   - Fire-and-forget: warn log se falhar, não bloqueia mutation principal

4. **Last-admin guard:** wouldRemoveLastAdmin checa `COUNT(c.role='admin' AND c.active=true AND c.userId != @uid) === 0` antes de demote/deactivate. Race condition aceita para MVP (extremamente raro).

5. **System stats cache 30s + Promise.all** para minimizar carga Cosmos (~9 count queries paralelas).

**Justificativa:**
- Soft delete preserva integridade referencial (palpites, leaderboard) sem cascade
- Cache LRU vs Redis: Free tier App Service B1 single-instance, em-memória suficiente
- Audit como container Cosmos: zero infra adicional, queries indexadas, TTL automático

**Trade-offs:**
- ✅ Auditoria completa e queryable
- ✅ Operacional sem instalar Redis
- ✅ Propagação sub-segundo via auto-invalidação
- ❌ Cache em-memória não compartilha entre instâncias (irrelevante em B1)
- ❌ Last-admin guard tem race condition teórica (não-bloqueador, edge case)

---

## ADR-016: Playwright E2E suite (workers=1, retries=2, live env)

**Status:** Accepted (2026-05-11, Sprint S4)

**Contexto:** Sprint S4 adiciona suite de testes E2E pra validar fluxos críticos pós-deploy. Decisões importantes: rodar local vs CI, paralelismo, retries, ambiente target.

**Decisão:**
- **Stack:** @playwright/test 1.59 + chromium only
- **workers=1**: admin único (admin@bolao.tftec.com.br) — paralelismo causaria race conditions
- **retries=2**: tolera cold start Y1 Function
- **Ambiente:** LIVE (https://app-fifa-bolao-tftec01.azurewebsites.net) por default; override via `BASE_URL` env
- **CI:** suite NÃO roda em ci.yml por ora (backlog) — apenas script local `npm run test:e2e`

**Justificativa:**
- Rodar contra live: zero setup de banco local, true e2e validation
- workers=1: admin é singleton, evita lock conflicts
- retries=2: Y1 Function cold start ~5-10s, suficiente para auto-recover
- CI postponed: tempo de execução adiciona ~30s ao pipeline; valor incremental baixo neste momento

**Trade-offs:**
- ✅ Validação real pós-deploy
- ✅ Setup mínimo (Playwright vs Cypress = mais leve)
- ❌ Acumula users de teste (`e2e-*@test.com`) sem cleanup automático — backlog
- ❌ Cold start pode dar flaky (mitigado por retries)

**Reversal:** Trocar Playwright por Cypress/Vitest browser mode = ~1 dia.

**Implementação:** `playwright.config.ts`, `tests/e2e/*.spec.ts` (4 specs, 7 testes).

---

## ADR-015: CI/CD com Service Principal JSON + Azure Key Vault

**Status:** Accepted (2026-05-11, Sprint S4)

**Contexto:** Sprint S4 introduz pipeline CI/CD automatizado via GitHub Actions. Múltiplos secrets necessários (Cosmos keys, JWT, SignalR connection). Decisão chave: ONDE armazenar secrets.

**Opções consideradas:**
- **A** GitHub Secrets (5 secrets espalhados)
- **B** Azure Key Vault + GH com 1 secret (SP)
- **C** OIDC federated identity (sem secrets em GH)

**Decisão:** Opção B — Azure Key Vault + Service Principal JSON.

**Justificativa:**
- Usuário rejeitou A: "secrets no código/repo nunca, Key Vault é o caminho"
- OIDC seria ideal mas exige setup AD federation complexo (~1 dia extra)
- B é equilíbrio: production-grade pattern, didático pro evento educacional, 1 dia setup
- Apenas `AZURE_CREDENTIALS` em GH; workflow fetcha tudo de KV em runtime

**Implementação:**
- Service Principal: `github-actions-bolao` com role `Contributor` em `rg-fifa-bolao` + `Key Vault Secrets User` em `kv-bolao-tftec01`
- Key Vault: standard tier, RBAC mode (`enableRbacAuthorization: true`)
- Workflows: `.github/workflows/ci.yml` (PR) + `.github/workflows/deploy.yml` (push main)
- Secrets em KV: `cosmos-endpoint`, `cosmos-key`, `cosmos-database`, `jwt-secret`, `signalr-connection-string`

**Consequências:**
- ✅ Audit trail nativo Azure (KV logs)
- ✅ Rotação de secrets sem mexer em GitHub
- ✅ Padrão didático pra evento TFTEC (alunos veem DevOps modern stack)
- ❌ Secret rotation manual após 1 ano (SP password)
- ❌ Custo extra do KV (~$0 free tier 25K ops/mês)

**Reversal:** Migrar pra OIDC federated identity = ~4 horas (Sprint S5/S6 opcional).

---

## ADR-014: Regra de pontuação 10/5/0 (palpites de jogo)

**Status:** ~~Accepted (2026-05-11, Sprint S3 planning)~~ → **SUPERSEDED por [ADR-019](#adr-019-regra-de-pontuação-25150-supersede-adr-014) (2026-05-15)**

**Contexto:** Sprint S3 introduz cálculo automático de pontos quando admin finaliza match. Precisamos definir como pontos por palpite de jogo são calculados.

**Opções consideradas:**
- Simples 10/5/0 (placar exato / só vencedor / errou)
- Detalhado 25/15/10/5/0 (com saldo + 1 lado)
- Cartola-style 12/8/4/0

**Decisão:** Simples 10/5/0.

**Justificativa:**
- Fácil de explicar aos alunos (evento educacional TFTEC)
- Algoritmo trivial: equality check + sign(home-away) check
- Especiais (champion/top4/artilheiro) já carregam pesos maiores (150/75/40/40/120) — sistema simples para jogos evita over-weighting

**Implementação:** `functions/src/shared/scoring.ts::calcMatchPoints`

**Consequências:**
- ✅ Algoritmo testável (23/23 unit tests PASS)
- ✅ Idempotência simples
- ❌ Não diferencia proximidade ao real (3x2 vs 4x3 = 5 pts, igual a 1x0 vs 5x0)

**Reversal:** Trocar 1 função reimporta — sem lock-in.

---

## ADR-001: Apps separados (main + bolão)

**Status:** Accepted (2026-05-08)

**Contexto:** O bolão é uma feature nova significativa que poderia ser adicionada como módulo ao app principal `fifa2026-tickets-dev` ou desenvolvida como aplicação independente.

**Decisão:** Aplicação independente, em repositório separado (`fifa2026-bolao-dev`), Resource Group separado (`rg-fifa-bolao`), banco de dados separado (Cosmos DB ao invés de SQL).

**Consequências:**
- ✅ Risco isolado: bug no bolão não derruba venda de ingressos
- ✅ Demonstração didática de sistemas distribuídos
- ✅ Stacks/DBs diferentes lado a lado = polyglot persistence didático
- ❌ Aluno faz 2 logins (login próprio em cada app)
- ❌ Bolão precisa consumir dados de jogos via REST do main

---

## ADR-002: Cosmos DB como banco do bolão

**Status:** Accepted (2026-05-08)

**Contexto:** Bolão precisa armazenar palpites (write-heavy, schemaless, partição clara por usuário) e leaderboard (read-heavy, dataset pequeno).

**Decisão:** Azure Cosmos DB (NoSQL API) com Free Tier (1000 RU/s + 25GB).

**Consequências:**
- ✅ Free tier forever
- ✅ Demo didática de NoSQL vs SQL (main usa SQL)
- ✅ Partition por `/userId` ataca direto o hot path (ler todos palpites de um usuário)
- ❌ Curva de aprendizado para alunos que só conhecem SQL
- ❌ Limite de 1 conta com free tier por subscription

---

## ADR-003: Auth próprio em cada app (sem SSO)

**Status:** Accepted (2026-05-09)

**Contexto:** Avaliamos JWT compartilhado, Entra ID B2C, ou login independente em cada app.

**Decisão:** Login próprio em cada app (cadastro/login com bcrypt + JWT local).

**Consequências:**
- ✅ Apps 100% independentes — bolão funciona mesmo se main estiver fora
- ✅ Implementação simples para o evento
- ❌ Aluno faz cadastro 2 vezes
- ⏭️ SSO fica como possível Fase 2

---

## ADR-004: Stack do bolão idêntica ao main

**Status:** Accepted (2026-05-09)

**Contexto:** Considerar Next.js, .NET, ou outras stacks para demo polyglot.

**Decisão:** Manter Express + React + TypeScript + Vite + Tailwind + shadcn/ui idêntico ao main. Polyglot fica no banco (SQL vs Cosmos) e nos serviços Azure (Functions + SignalR novos).

**Consequências:**
- ✅ Aluno reaproveita 90% do conhecimento
- ✅ Foco do aprendizado é em Azure services, não em framework
- ❌ Menos "wow" de variedade de stack

---

## ADR-005: Região Azure East US

**Status:** Accepted (2026-05-10)

**Contexto:** Main app está em Brazil South. Bolão pode ficar próximo ou em região mais barata.

**Decisão:** East US para o bolão.

**Consequências:**
- ✅ ~30% mais barato que Brazil South
- ✅ Maior disponibilidade de SKUs e novidades
- ❌ Latência ~120ms do Brasil (vs ~30ms Brazil South)
- ⚠️ Aluno aprende sobre trade-off geo vs custo

---

## ADR-006: App Service Plan B1 ao invés de F1

**Status:** Accepted (2026-05-10)

**Contexto:** F1 (Free) tem limites pesados: 60 min CPU/dia, sem Always On, sem custom domain SSL. B1 custa ~$13/mês mas elimina essas restrições.

**Decisão:** B1 Linux Node 20.

**Consequências:**
- ✅ Always On disponível (sem cold start)
- ✅ Sem limite de CPU/dia
- ✅ Suporta deployments com mais memória
- ❌ ~$13/mês — cabe no trial $200 dos alunos com folga
- ✅ Educacional: aluno aprende como dimensionar plano

---

## ADR-007: Pontuação rebalanceada

**Status:** Accepted (2026-05-10)

**Contexto:** Versão inicial tinha campeão valendo 30 pts (muito pouco) e placar exato 10 pts. Análise de probabilidade mostrou desbalanceamento: top 4 era proporcionalmente mais valioso que palpitar 72 jogos.

**Decisão:** Pontuação rebalanceada:
- Por jogo: placar exato 25 / saldo 12 / vencedor 7 / empate 3
- Campeão 150, vice 75, 3º 40, 4º 40, artilheiro 120, bônus top 4 +50

**Consequências:**
- ✅ Vencedor típico do bolão precisa ser consistente em jogos + acertar alguns especiais
- ✅ Acertar campeão sozinho não decide o bolão
- ✅ Máx teórico: ~2.140 pts; máx realista: 800-1.100 pts

---

## ADR-008: SignalR em modo Serverless

**Status:** Accepted (2026-05-10)

**Contexto:** SignalR Service oferece 3 modos: Default (hubs server-side), Classic (legacy), Serverless (integração com Functions).

**Decisão:** Modo **Serverless**. Functions publicam via output binding `SignalR`, clientes (frontend) conectam direto ao serviço via SDK.

**Consequências:**
- ✅ Backend Express não precisa hospedar hub (mais leve)
- ✅ Functions têm output binding nativo — código mais simples
- ✅ Free tier (20 conexões) suficiente para 1 deploy por aluno
- ❌ Não dá pra fazer Express push direto — sempre via Function
- ⚠️ CORS configurado como `*` no template; restringir em produção

---

## ADR-009: Throughput compartilhado no Cosmos (database level)

**Status:** Accepted (2026-05-10)

**Contexto:** Cosmos permite provisionar RU/s no nível de database (compartilhado entre containers) ou por container individualmente.

**Decisão:** Database-level shared throughput de 1000 RU/s (free tier).

**Consequências:**
- ✅ Cabe inteiro no free tier (1000 RU/s grátis)
- ✅ Containers menos usados não desperdiçam RU/s
- ❌ Hot container pode esgotar RU/s e impactar outros
- ⚠️ Mitigado pela carga prevista do evento (poucos usuários por deploy)

---

## ADR-010: Managed Identity habilitada (uso futuro)

**Status:** Accepted (2026-05-10)

**Contexto:** App Service e Function App podem usar System-Assigned Managed Identity para autenticar contra Key Vault, Cosmos RBAC, etc., eliminando secrets em app settings.

**Decisão:** Habilitar Managed Identity em ambos no Bicep, mas continuar usando connection strings em app settings no MVP (mais didático).

**Consequências:**
- ✅ Identity existe — basta adicionar role assignment para usar
- ✅ Migração futura para Key Vault é trivial (Fase 2)
- ⚠️ Secrets ainda em app settings hoje (visíveis no portal)

---

## ADR-011: Functions Windows ao invés de Linux

**Status:** Accepted (2026-05-10)

**Contexto:** Linux Y1 Consumption (`Dynamic SKU, Linux Worker`) não está disponível em todos os stamps regionais do Azure. Deploy do bolão falhou em eastus2 com `BadRequest: Requested features 'Dynamic SKU, Linux Worker' not available in resource group`.

**Decisão:** Functions roda em Windows Consumption (Y1, kind 'functionapp', reserved=false). Node 20 funciona idêntico em ambos os OSs.

**Consequências:**
- ✅ Disponibilidade regional mais ampla — funciona em qualquer stamp
- ✅ Same runtime (Node 20), zero impacto no código
- ⚠️ Bicep parametriza `linuxFxVersion` para Linux; em Windows usa `WEBSITE_NODE_DEFAULT_VERSION`
- ⚠️ Para Linux Functions na próxima tentativa: tentar criar RG separado em eastus, eastus2 ou centralus

---

## ADR-012: Deploy slim (sem node_modules) com Oryx build

**Status:** Accepted (2026-05-10)

**Contexto:** Primeiro deploy do bolão usou zip de 53MB contendo node_modules pré-instalado. Kudu travou na extração de 38k arquivos por 30+ min (timeout). Builds falharam silenciosamente.

**Decisão:** Zip "slim" de ~650KB contém apenas:
- `backend/dist/` (compilado)
- `frontend/dist/` (build)
- `backend/package.json`
- Root `package.json` minimal com APENAS as 13 prod deps do backend (flat, sem workspaces)

Oryx build no servidor faz `npm install --omit=dev` rápido (~1-2 min).

**Consequências:**
- ✅ Upload em 22s ao invés de 2min30s
- ✅ Extract em segundos ao invés de 30+ min
- ✅ Build no servidor é determinístico e cacheável
- ❌ Depende de npm registry ser acessível do App Service (raramente um problema)
- ⚠️ Express 5 path-to-regexp v8 substitui `'*'` por `/{*splat}` — fix necessário no server.ts
- ❌ **SUPERSEDED por ADR-013** — Oryx rsync corrompe node_modules de forma silenciosa.

---

## ADR-013: WEBSITE_RUN_FROM_PACKAGE para deploy do Bolão

**Status:** Accepted (2026-05-11) — **DECISÃO DEFINITIVA**

**Contexto:** Após 7+ horas de tentativas (Sprints S1, S1.5, S1.6), foi descoberto que o App Service Linux Node + ESM strict resolver é incompatível com o comportamento padrão do Oryx, que faz `rsync` de `/tmp/zipdeploy/extracted` → `/home/site/wwwroot`. Esse rsync **perde arquivos pequenos** em deep trees (ex: `node_modules/zod/package.json`), causando `ERR_MODULE_NOT_FOUND` no startup do Node. ADR-012 (slim deploy + Oryx build) sofre do mesmo problema porque Oryx ainda executa rsync mesmo com `ENABLE_ORYX_BUILD=false`.

**Comparação com main app:** O app principal (`fifa2026-web/back`) NUNCA quebrou em ~5 deploys porque usa Windows + IIS + CJS — stack tolerante a estado parcial. O Bolão é Linux + Docker + ESM — stack que **exige cada arquivo íntegro**.

**Decisão:** Habilitar `WEBSITE_RUN_FROM_PACKAGE=1` no App Service. Com essa configuração:

1. Zip é uploaded para `/home/data/SitePackages/{timestamp}.zip`
2. App Service registra o package em `packagename.txt`
3. Próxima inicialização **monta o zip como filesystem FUSE read-only** em `/home/site/wwwroot/`
4. Node lê arquivos **diretamente do zip mounted**
5. **Sem extract, sem rsync, sem corruption**

**Procedimento canônico:**
```bash
# 1. Build local
npm run build --workspace=frontend && npm run build --workspace=backend

# 2. Staging com node_modules pré-instalado (176 pkgs)
mkdir /tmp/staging && cp -r [files] && npm install --omit=dev

# 3. Zip Linux-compatible (Node archiver, forward-slash POSIX)
node scripts/make-zip.cjs /tmp/staging /tmp/deploy.zip

# 4. Habilitar Run-From-Package
az webapp config appsettings set --settings WEBSITE_RUN_FROM_PACKAGE=1

# 5. Deploy
az webapp deploy --src-path /tmp/deploy.zip --type zip --async true

# 6. Wait warmup (~120s)
# 7. Smoke tests live
```

Procedimento completo em `scripts/deploy.sh` e documentação detalhada em `docs/deploy-runbook.md`.

**Consequências:**
- ✅ Deploy estável (5-8 min vs 30-40 min antes)
- ✅ Zero corruption de node_modules
- ✅ Mantém Linux + ESM (mantém objetivo educacional do bolão)
- ✅ wwwroot fica read-only — proteção contra modificações acidentais
- ✅ Rollback fácil (basta apontar `WEBSITE_RUN_FROM_PACKAGE` pra zip anterior em SitePackages)
- ❌ Não pode editar arquivos em wwwroot via Kudu (read-only) — é feature, não bug
- ❌ Warmup ~120s na primeira startup (mount FUSE)
- ⚠️ Cada deploy cria novo zip em SitePackages — limpar periodicamente se necessário (limite 10GB)
- ⚠️ Logs custom de build não disponíveis — Oryx não roda

**Por que NÃO escolhemos alternativas:**

| Alternativa | Por que não |
|---|---|
| Migrar pra Windows App Service | Perde objetivo educacional de Linux/Cloud-native |
| Migrar pra CommonJS | Perde objetivo educacional de ESM moderno |
| Docker container | +2-3h setup, overhead, melhor pra Sprint futura |
| GitHub Actions CI/CD | Sprint S4 — mas precisa do método base funcionando |

**Referências:**
- [docs/deploy-runbook.md](docs/deploy-runbook.md) — runbook completo
- [scripts/deploy.sh](scripts/deploy.sh) — implementação
- [Microsoft Docs — Run-From-Package](https://learn.microsoft.com/azure/app-service/deploy-run-package)
- Memory permanente: `feedback_bolao_deploy_method.md`
