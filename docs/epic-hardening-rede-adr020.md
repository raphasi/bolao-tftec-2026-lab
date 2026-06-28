# Epic S6 — Hardening de Rede (ADR-020)

> **Owner:** @architect → @dev · **Status:** 🏁 EPIC ENCERRADO 2026-05-19 (S6.1+S6.2+S6.3+S6.5 ✅; S6.4 descartado) · **Origem:** [ADR-020](../DECISIONS.md) · **Criado:** 2026-05-18
> **Decisões do owner (2026-05-18):** App Gateway provisionado **só perto do evento** · migração **in-place** (sem usuários atualmente, janelas de indisponibilidade aceitas) · execução **story-driven** (este epic).
> **Decisão do owner (2026-05-19, S6.3):** escopo **parcial / custo zero** — Private Endpoint Cosmos + VNet integration da API, **mantendo Cosmos `publicNetworkAccess: Enabled`** (Functions em plano Consumption `Y1` não suportam VNet integration; lockdown total exigiria upgrade EP1 com custo). **SignalR fica fora da S6.3**: tier `Free_F1` **não suporta Private Link** (e modo Serverless = clientes conectam direto) → tratado na S6.4 / decisão de upgrade `Standard_S1`.

---

## 🎯 Objetivo

Eliminar o acoplamento "API + SPA no mesmo Web App" do Bolão e isolar a camada de dados, conforme ADR-020. Estado-alvo: frontend público em Web App próprio, **API com caminho de dados privado** (VNet/Private Endpoint para Cosmos). **Application Gateway (WAF) DESCARTADO do escopo** (decisão do owner 2026-05-19; recriável sob demanda). Lockdown público total de Cosmos/SignalR fica como pendência opcional futura (depende de upgrades com custo).

## 🗺️ Estado atual → alvo

```
HOJE:   Internet → [app-fifa-bolao-tftec01]  Express serve SPA + /api/*  → Cosmos/SignalR (público)
ALVO:   Internet → [App Gateway WAF] → /  → [web Web App  (SPA)]
                                       → /api/* → [api Web App PRIVADA] → Cosmos/SignalR (Private Endpoint, VNet)
```

## 📋 Stories (fases)

Cada fase é uma story validável, com rollback. Ordem obrigatória (dependências).

### S6.1 — Rede base (VNet + subnets) · risco BAIXO
- **Goal:** criar a fundação de rede sem tocar no app rodando.
- **Tasks:** VNet `vnet-fifa-bolao`; subnets `snet-appsvc-integration` (delegada a App Service), `snet-private-endpoints`, `snet-appgw` (reservada p/ S6.4).
- **AC:** VNet + 3 subnets criadas; app atual segue 100% funcional (nada plugado ainda).
- **Rollback:** deletar a VNet (nada depende dela ainda).
- **@:** @dev (infra), Portal-first.

### S6.2 — Split do app (frontend ⟂ API) · risco MÉDIO (código)
- **Goal:** separar hosting do SPA da API.
- **Tasks:** novo Web App `app-fifa-bolao-web-tftec01` (serve só `frontend/dist`); o `app-fifa-bolao-tftec01` atual passa a servir **só a API**; ajustar Express (deixar de servir estático), SignalR negotiate/baseURL do front, auth/CORS (agora origens distintas), build e **`deploy.yml`** (2 alvos); E2E Playwright.
- **AC:** front novo serve o site; API responde; login/palpite/leaderboard/SignalR OK; CI/E2E verde.
- **Rollback:** reverter o PR (Express volta a servir estático) + apontar DNS/uso ao app único.
- **@:** @dev (código + infra) · **QA gate** obrigatório (fluxos críticos).

### S6.3 — Privatizar dados (Private Endpoint) · ✅ CONCLUÍDA 2026-05-19 (escopo parcial)
- **Goal original:** Cosmos e SignalR sem acesso público; API os alcança pela VNet.
- **Escopo executado (decisão do owner — parcial/custo zero):** caminho de dados **API↔Cosmos** privatizado via Private Endpoint + VNet integration, **sem desligar o acesso público do Cosmos** e **sem tocar no SignalR**.
- **Tasks executadas:** (1) Private DNS zone `privatelink.documents.azure.com` + VNet link; (2) Private Endpoint Cosmos (groupId `Sql`) em `snet-private-endpoints` (IPs `10.20.2.4`/`.5`), conexão `Approved`; A-records criados **manualmente** (dns-zone-group não populou no ambiente — interceptação TLS no `az`; A-records são estáticos pela vida do PE); (3) **[GATE]** VNet integration da API `app-fifa-bolao-tftec01` → `snet-appsvc-integration` + `WEBSITE_VNET_ROUTE_ALL=1` + restart; (4) validação: `/api/leaderboard` (leitura real Cosmos) OK via IP privado, site OK, Functions `Running`.
- **NÃO executado (fora do escopo por limitação técnica):** desligar `publicNetworkAccess` do Cosmos (Functions Consumption `Y1` perderiam o banco — exigiria upgrade EP1, custo); Private Endpoint SignalR (`Free_F1` não suporta Private Link).
- **AC ajustado (atingido):** API lê/escreve Cosmos **pela rede privada (PE)**; Cosmos segue `Enabled` (Functions ok); SignalR inalterado.
- **Rollback:** `WEBSITE_VNET_ROUTE_ALL=0` + remover vnet-integration → app resolve Cosmos público (segundos). Cosmos nunca foi privado → Functions nunca em risco.
- **Pendência herdada (futuro):** lockdown público real do Cosmos + SignalR privado → depende de upgrade Functions `Y1→EP1` e SignalR `Free→Standard_S1`; bundle pré-evento. Registrado no BACKLOG.
- **@:** @architect (desenho) · @devops (infra) · @qa (validação) · **QA gate: PASS**.

### S6.4 — Application Gateway (WAF) · ❌ DESCARTADO do Epic S6 (decisão do owner 2026-05-19)
- **Decisão do owner (2026-05-19):** App Gateway **descartado neste momento** e **removido do escopo do Epic S6**. Será **recriado sob demanda** se/quando o owner solicitar (não há trabalho planejado aqui).
- **Estado da infra:** subnet `snet-appgw` (criada na S6.1) permanece **inerte e reservada** — sem custo, sem recurso provisionado. Disponível caso o App Gateway seja retomado no futuro.
- **Se retomado (escopo de referência, NÃO ativo):** App Gateway WAF_v2 na `snet-appgw`, backend pools front/API, rotas + health probes, Access Restriction da API → só subnet do gateway, TLS. WAF_v2 ≈ US$250-350/mês.

### S6.5 — Hardening final · risco BAIXO
- **Goal:** fechar o ciclo de segredos.
- **✅ CONCLUÍDA 2026-05-19 (PR #51, deploy verde + validado prod).** RBAC `Key Vault Secrets User` concedido às 2 System-Assigned MSIs (API `717bfa6f…`, Functions `90a6e2b1…`), escopo só o KV. **API**: `COSMOS_ENDPOINT/KEY/DATABASE`, `JWT_SECRET`, `SIGNALR_CONNECTION_STRING` → `@Microsoft.KeyVault(SecretUri=…)` (status `Resolved`). **Functions**: `SIGNALR_CONNECTION_STRING` + `AzureSignalRConnectionString` → KV ref (`Resolved`). Pipeline tornado durável (`deploy.yml`: deploy_api perdeu o passo `.env` morto — CI não baixa mais segredos; deploy_functions seta SignalR como KV ref). **Fora de escopo (assumido):** `AzureWebJobsCosmosDBConnection` (conn string gerada, sem secret KV, binding crítico do scoring) e `AzureWebJobsStorage`/`WEBSITE_CONTENT*` (constraint do plano Consumption `Y1`) — seguem raw.
- **AC atingido:** segredos da API/SignalR resolvidos via KV reference + MSI (zero segredo em texto plano nos App Settings; CI não materializa segredos da API); smoke 4/4 + KV refs `Resolved`. QA gate: PASS.
- **@:** @architect (desenho) · @devops (RBAC/infra/pipeline) · @qa (validação).

## 🔢 Sequência & gates

`S6.1 → S6.2 (QA gate) → S6.3 (QA gate + smoke) → S6.5` · **S6.4 descartado** do Epic S6 (recriável sob demanda).
Cada story = branch + PR + (gate quando indicado) + autorização explícita do owner antes de mutação em prod.

## 💰 Custo

Fases 1-3,5: ~US$0 adicional (VNet/PE são baratos; recursos atuais reaproveitados). S6.4 (App Gateway WAF_v2 ≈ US$250-350/mês): **descartado** — sem custo. Eventual lockdown total (bundle pré-evento) implicaria Functions EP1 + SignalR Standard (custo) se o owner optar no futuro.

## ⚠️ Riscos principais

| Risco | Mitigação |
|---|---|
| Cutover S6.3 derruba o app | Sequência VNet-integration→PE→validar→desligar público; rollback = religar público (segundos) |
| Split S6.2 quebra auth/SignalR | QA gate + E2E Playwright antes do merge |
| Custo App Gateway | Descartado do Epic S6 (decisão do owner); recriável sob demanda se solicitado |
| In-place sem ambiente paralelo | Aceito pelo owner (sem usuários); cada fase tem rollback; janelas de indisponibilidade |

## ✅ Status das fases

- [x] **Fase 0** — Plano/Epic (este doc) + ADR-020
- [x] **S6.1 Rede base** (2026-05-19) — `vnet-fifa-bolao` (10.20.0.0/16) + 3 subnets em **eastus2**: `snet-appsvc-integration` /27 (delegada `Microsoft.Web/serverFarms`), `snet-private-endpoints` /27 (PE policies Disabled), `snet-appgw` /26. App 100% funcional (nada plugado). Subnet de integração tem `serverFarms` delegada → ainda não habilita VNet Integration no app (isso é S6.3).
- [x] **S6.2 Split do app — CONCLUÍDA 2026-05-19** (cutover validado em prod). Site SPA em `app-fifa-bolao-web-tftec01` (Express, Always On); API isolada API-only em `app-fifa-bolao-tftec01` (`/`→404, `/api/*` 200); CORS cross-origin OK. Caminho: pm2-serve (#43, falhou, revertido #44) → Express provado isolado (#46) → cutover (#48). CI vermelho foi flake transitório recorrente do deploy_api ('worker failed to start' — app sobe depois); estado de prod verificado direto. Próxima: S6.3.
- [x] **S6.3 Privatizar dados — CONCLUÍDA 2026-05-19 (escopo parcial / custo zero)** — Private Endpoint Cosmos (`10.20.2.4`/`.5`, conn `Approved`) + Private DNS zone `privatelink.documents.azure.com` (A-records manuais) + VNet integration API (`snet-appsvc-integration`, `WEBSITE_VNET_ROUTE_ALL=1`). Validado: API↔Cosmos via IP privado (`/api/leaderboard` 200 com dados), site OK, Functions `Running`. Cosmos `publicNetworkAccess` **mantido Enabled** (Functions `Y1` Consumption) e SignalR **fora de escopo** (`Free_F1` sem Private Link) — lockdown total adiado p/ bundle pré-evento (decisão do owner, custo zero agora). QA gate: PASS.
- ❌ **S6.4 App Gateway — DESCARTADO do Epic S6** (decisão do owner 2026-05-19). Subnet `snet-appgw` segue inerte/reservada (sem custo). Recriável sob demanda se o owner solicitar.
- [x] **S6.5 Hardening final — CONCLUÍDA 2026-05-19 (PR #51)** — RBAC KV Secrets User nas 2 MSIs; API + Functions usam `@Microsoft.KeyVault` references (status `Resolved`); pipeline durável (deploy verde, validado prod direto). `AzureWebJobsCosmosDBConnection`/storage seguem raw (fora de escopo justificado).
- [ ] (futuro, opcional) Lockdown público total Cosmos/SignalR — bundle pré-evento: Functions `Y1→EP1` + SignalR `Free→Standard_S1` + disable public + PE SignalR. Só se o owner optar (com custo).

---

## 🏁 Epic S6 — ENCERRADO 2026-05-19

**Entregue e validado em prod:** S6.1 (rede base) · S6.2 (split front/API) · S6.3 (Private Endpoint Cosmos, parcial/custo-zero) · S6.5 (Key Vault references + Managed Identity). **S6.4** (App Gateway) descartado por decisão do owner (recriável sob demanda). **Pendência opcional** (só com decisão de custo do owner): lockdown público total Cosmos/SignalR no bundle pré-evento.

**Postura final:** API↔Cosmos pela rede privada (PE); segredos resolvidos via KV reference + MSI (nada em texto plano nos App Settings; CI não materializa segredos da API). Exposição pública remanescente (Cosmos `publicNetworkAccess=Enabled` por causa das Functions Consumption; SignalR Free) é consciente e documentada, fechável no bundle pré-evento.

> ⚠️ **Achado (região):** os recursos reais do Bolão estão em **`eastus2`**, mas `docs/architecture.md`, `docs/setup-portal.md` e `docs/GUIA-EVENTO.md` dizem "East US". A VNet foi criada em `eastus2` (correto — VNet Integration exige mesma região do App Service). **TODO doc:** corrigir a região nos guias/arquitetura para `East US 2` (fora do escopo desta fase; registrar no BACKLOG).

---

## 🔴 Post-mortem — S6.2 cutover (2026-05-19)

**Incidente:** site do Bolão indisponível ~tempo do cutover/recuperação. Sem usuários (educacional) → impacto real baixo, mas foi outage de Ur.

**Timeline:** PR #43 mergeado → Deploy: `deploy_api` falhou no flake transitório ("worker failed to start") **mas o app subiu** (API-only OK); `deploy_frontend` **cancelled**; site fora. Re-run: `deploy_api` ✅, `deploy_frontend` **failure** (2ª vez, falha real); site novo `app-fifa-bolao-web-tftec01` retornando `000` (SPA nunca serviu). Decisão: **rollback** (revert PR #43 → #44 `d91d4f7`) → deploy single comprovado → **site restaurado** na URL original. Dados (Cosmos, scoring 25/15) intactos o tempo todo.

**Causa raiz:** o caminho de deploy do **frontend novo** (`deploy-frontend-webapp.sh` + Web App `pm2 serve --spa` + `WEBSITE_RUN_FROM_PACKAGE=1`) **nunca foi validado isoladamente** — foi exercido pela 1ª vez **durante o cutover de produção**. `deploy_frontend` falhou 2× e o app não serviu o SPA (provável: incompatibilidade `pm2 serve` × Run-From-Package mount, ou `pm2` ausente no PATH da imagem Node Linux, ou layout do pacote — **não confirmado** pois o log não foi recuperável com o run in_progress).

**Erro de processo (a corrigir):** o "QA gate" da S6.2 focou em build local + smoke pós-deploy, mas **não exigiu provar o mecanismo de hosting do frontend ANTES de tocar o app de API**. O cutover virou o app antigo API-only confiando num caminho de deploy não comprovado.

**Pré-condição obrigatória p/ re-tentar S6.2:**
1. **Provar o frontend Web App isoladamente** — deployar o SPA em `app-fifa-bolao-web-tftec01` e confirmar que serve (`/`→200, fallback de rota) **sem tocar o app de API**. Diagnosticar/escolher o mecanismo (validar `pm2 serve`; alternativas: micro Express estático empacotado; `serve`; container).
2. Só depois de (1) verde, executar o cutover (API-only) — que vira reversível e previsível.
3. Manter rollback de 1 comando (revert do PR) sempre pronto.

**Estado pós-incidente:** arquitetura single-app (estado pré-S6.2). S6.1 (VNet+subnets) intacta e inerte. Web App `app-fifa-bolao-web-tftec01` + `CORS_ORIGINS` no API app continuam provisionados (inertes/inofensivos) — reaproveitáveis no re-attempt. ADR-020 segue válida; S6.2 volta a `[ ]` com a pré-condição acima.
