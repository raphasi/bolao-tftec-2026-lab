# 🏆 Event Day Runbook — Bolão TFTEC Cloud

**Escopo:** procedimentos operacionais para o **dia do evento** (transmissão dos jogos da Copa com a turma assistindo + palpitando em tempo real). Cobre prep, kickoff, live ops, incidentes e rollback.

> Não é runbook de deploy — para deploy use [`deploy-runbook.md`](./deploy-runbook.md). Para bugs comuns de stack use [`troubleshooting.md`](./troubleshooting.md).

---

## 📋 TL;DR — cheat sheet

| Quando | Ação | Comando / Link |
|--------|------|----------------|
| D-7 | Smoke + scale rehearsal | 5 curls (ver §[Smoke live](#-smoke-live-5-curls)) |
| D-1 | Lock matches do dia + freeze deploys | `/admin/results` |
| T-30min | Health check + check leaderboard live | `curl .../api/health/full` |
| T-0 (kickoff) | Confirmar auto-lock disparou | `/admin/results` (jogo: 🔒) |
| In-game | Monitorar AppInsights + SignalR | Q1, Q2, Q4 em `queries.kql` |
| Pós-jogo | Validar pontos calculados | `/leaderboard` mudou? |
| Incidente | Aplicar mitigação → escalar | seção [🚨 Incidents](#-incident-response) |

**Link rápido prod (Front Door — URL dos alunos):** https://fd-fifa-bolao-tftec01-dhacbschctefaqct.z02.azurefd.net  
**Resource group:** `rg-fifa-bolao` (eastus2)

> ⚠️ As Web Apps `app-fifa-bolao-tftec01` (API) e `app-fifa-bolao-web-tftec01` (web) estão **isoladas**: só aceitam tráfego do Front Door (403 no acesso direto). A entrada pública é **só** a URL `*.azurefd.net` acima. Ver §[Front Door / WAF](#-front-door--waf-adr-021).

---

## 🛡️ Front Door / WAF (ADR-021)

Borda pública = **Azure Front Door Premium + WAF**. Same-origin: `/*`→front, `/api/*`→API. Ambas as Web Apps trancadas por `ipSecurityRestrictions` (regra `AllowFrontDoor` = service tag `AzureFrontDoor.Backend` **E** header `x-azure-fdid` na mesma regra/AND).

- **URL pública:** `https://fd-fifa-bolao-tftec01-dhacbschctefaqct.z02.azurefd.net`
- **frontDoorId** (X-Azure-FDID): `a090d556-e26d-4c60-bd3d-b61c36e3f83c`
- **profile:** `afd-fifa-bolao-tftec01` · **WAF policy:** `waffifabolaotftec01` · **diag:** `afd-waf-to-la` → Log Analytics `log-fifa-bolao-tftec01`

### WAF: Detection → Prevention (ensaio D-1 → estreia)
O WAF sobe em **Detection** (só registra). No ensaio D-1, calibrar e virar **Prevention**:
```powershell
# 1) Ver o que DISPARARIA (no Log Analytics, após tráfego do ensaio):
#    FrontDoorWebApplicationFirewallLog | where action_s != "Allow" | summarize count() by ruleName_s, action_s
# 2) Aplicar exclusões necessárias (senha/nome já excluídos no bicep), então virar Prevention
#    re-rodando o bicep (idempotente, só muda o modo) — preferível ao update solto:
az deployment group create -g rg-fifa-bolao --template-file infra/modules/frontdoor.bicep `
  --parameters infra/parameters.frontdoor.json --parameters wafMode=Prevention
# Rollback rápido p/ Detection se barrar aluno (mesmo comando com wafMode=Detection,
# ou direto na policy):
az network front-door waf-policy update -g rg-fifa-bolao --name waffifabolaotftec01 --mode Detection
```

### Rollback do isolamento (se o AFD/lock travar a sala)
Rollback é **via ARM** (control-plane) — NÃO depende de acesso direto/data-plane; propagação ~até 1 min. **Remover TODAS as regras** (volta a Allow-All), não cirúrgico:
```bash
./scripts/isolate-origins.sh rollback all     # remove AllowFrontDoor das 2 apps
# ou manual, por app:
az webapp config access-restriction remove -g rg-fifa-bolao -n app-fifa-bolao-tftec01 --rule-name AllowFrontDoor
az webapp config access-restriction remove -g rg-fifa-bolao -n app-fifa-bolao-web-tftec01 --rule-name AllowFrontDoor
```
Após rollback, a API/web voltam a responder direto (sem WAF) — medida de emergência, reverter só se o AFD estiver causando outage.

### Notas
- Health-cron das Functions pinga `APP_URL=/api/health/full` — `APP_URL` aponta pro **host AFD** (passa o lock). Scoring (change feed) e SignalR não dependem do AFD.
- `az` com resource IDs (`/subscriptions/...`) → rodar no **PowerShell** (git-bash converte o path errado) ou Cloud Shell.

---

## 👥 Contatos & Escalação

> **TODO ao final do projeto:** preencher contatos reais antes do primeiro evento.

| Papel | Nome | Canal primário | Canal fallback |
|-------|------|----------------|----------------|
| **Oncall L1** (operação) | _Raphael Andrade_ | WhatsApp direto | E-mail (rapha.rss@gmail.com) |
| **Oncall L2** (cloud/infra) | _Raphael_ | Direto | — |
| **Stakeholder TFTEC** | _(definir)_ | _(definir)_ | _(definir)_ |
| **Suporte Azure** | — | portal → Help+Support → Submit ticket | Severity B se app down (resposta <2h) |

**Critério de escalação:**
- 🟢 **L1 resolve:** lock manual, restart app, hotfix de UI, cache invalidate
- 🟡 **L2 entra:** Cosmos 429 sustained, Function App down, scaling, rollback de PR
- 🔴 **Azure suporte:** App Service não responde após restart × 2, Cosmos region outage

---

## 🗓️ Cronograma operacional

### D-7 — Rehearsal completo

Objetivo: garantir que o caminho feliz funciona ponta-a-ponta com carga simulada.

- [ ] Smoke tests live (§[Smoke live](#-smoke-live-5-curls)) → 5/5 PASS
- [ ] Logar como admin → `/admin/system` → confirmar cards observability LIVE (errors24h, requests1h, p95)
- [ ] Logar como usuário comum → palpitar 3 jogos → recarregar → palpites persistidos
- [ ] Abrir `/leaderboard` em 2 abas → confirmar SignalR conectado (DevTools → Network → WS)
- [ ] **Cleanup users e2e-\*** acumulados de testes (script TBD ou via `/admin/users`)
- [ ] Conferir 48 bandeiras renderizando em `/palpites` (servidas localmente, sem chamada flagcdn)
- [ ] Reset de dados demo se necessário (script TBD)

### D-1 — Freeze e preparação final

Objetivo: estado conhecido, sem mudanças tardias.

- [ ] **🚫 FREEZE de deploys** — só hotfix crítico via @devops com aprovação L1
- [ ] Verificar todos os jogos do dia seguinte estão em `matches-cache` (`/admin/results`)
- [ ] Confirmar `kickoffUtc` correto para cada jogo (auto-lock depende disso)
- [ ] **Backup de cortesia** do leaderboard: portal → Cosmos → Data Explorer → export JSON do container `leaderboard`
- [ ] Verificar Cosmos RU usage (Q4) — baseline deve estar <200 RU/s ocioso
- [ ] Smoke completo (§[Smoke live](#-smoke-live-5-curls)) → 5/5 PASS
- [ ] Limpar audit log se >500 entradas (UX do drawer fica lento)

### T-30min antes do kickoff

Objetivo: tudo verde e estável quando começarem a chegar.

- [ ] `GET /api/health/full` → `status: "ok"` + `cosmos.ok: true`
- [ ] AppInsights query Q1 (request rate) — sem spikes anômalos
- [ ] AppInsights query Q2 (latency p95) — <500ms para `/api/predictions/me`, `/api/leaderboard`
- [ ] Confirmar SignalR conectado: abrir `/leaderboard` no navegador, DevTools → Network WS aberto
- [ ] Functions ativas: `func-fifa-bolao-tftec01` → portal → última execução de `sync-matches` e `calculate-points` < 6min atrás
- [ ] **Anunciar** no canal da turma: app live, link, prazo final pra palpites (= kickoffUtc)

### T-0 — Kickoff

Objetivo: confirmar lock automático e iniciar monitoramento.

- [ ] Em `/admin/results`, confirmar que o jogo do momento está com 🔒 (lockedByKickoff) automaticamente
  - Se NÃO travou: **lock manual** via PATCH `/api/admin/matches/{id}/lock` (UI: toggle "Travar")
  - Causa comum: relógio do servidor vs `kickoffUtc` em fuso errado → debugar pós-evento
- [ ] Iniciar monitor contínuo (1 aba aberta): AppInsights → Logs → Q5 (5xx errors)

### Durante o jogo (live ops)

Objetivo: detectar e mitigar em <2min.

- [ ] Refresh a cada 10min em `/admin/system` — cards LIVE devem atualizar
- [ ] Tab fixa em AppInsights com Q5 — qualquer 5xx novo dispara investigação imediata
- [ ] Tab fixa em Cosmos → Insights → RU/s. Free tier: 1000 RU/s. **Alerta visual >800 sustained 2min** → ver [🚨 Cosmos throttling](#cosmos-throttling-429)

### Pós-jogo (T+5 a T+15min)

Objetivo: validar pipeline de pontos.

- [ ] Após placar registrado em `/admin/results` (PUT `/api/admin/matches/{id}/result`):
  - [ ] Aguardar até 5min (timer `calculate-points`)
  - [ ] OU forçar: invocar Function HTTP-trigger manualmente (portal → calc-predictions → Code+Test → Run)
- [ ] Confirmar `/leaderboard` atualizou com pontos do jogo
- [ ] Validar SignalR broadcast: usuários conectados devem ver re-ordenação sem F5
- [ ] Conferir audit-log se aplicou alguma ação manual

### Pós-evento (limpeza)

- [ ] Export do leaderboard final
- [ ] Salvar screenshots dos winners
- [ ] Adicionar nota em `docs/retrospectiva-s7.md` (a criar) com incidentes vs. ações
- [ ] Reverter freeze de deploys

---

## 🔄 Procedimentos de mitigação

### Rollback de release problemática

Cenário: PR recém-mergedo causa regressão visível em prod (5xx, UI quebrada, palpites somem).

**Decisão (5min):** rollback OU hotfix?
- **Rollback** se: caminho crítico quebrado (login, palpites, leaderboard) e mais de 1 usuário afetado
- **Hotfix** se: bug isolado em página secundária, baixo blast radius

**Procedimento de rollback (delegar a @devops):**

```bash
# 1. Identificar último commit estável em main
cd ~/repos/TFTEC-Bolao-2026
git log --oneline -10
# Pegar SHA antes do PR problemático (ex: 40a8c21)

# 2. Criar branch de revert
git checkout -b hotfix/rollback-{descricao}
git revert <SHA-do-merge-problematico>  # OU git reset --hard <SHA-estavel> se ainda não pushed

# 3. Push + PR via @devops
@devops *push hotfix/rollback-{descricao}
@devops *create-pr title='hotfix: rollback {motivo}' base=main
@devops *merge-pr {numero} method=squash
```

**Após rollback merged → CD dispara automaticamente.** Aguardar ~10min (CD do deploy.yml). Smoke validar.

**Plan B se CD falha:** redeploy manual a partir de tag estável → `bash scripts/deploy.sh` no commit `22394b9` (PR #20 merge, baseline estável atual).

### Hotfix in-flight

Cenário: bug pequeno detectado durante o evento, fix óbvio em <30min.

⚠️ **NÃO faça durante jogo ao vivo** — espere intervalo OU pós-jogo. App estável > app perfeito.

```bash
# 1. Branch local (via @sm autorizado para branch ops)
git checkout main && git pull
git checkout -b hotfix/{descricao-curta}

# 2. Implementar fix, validar local
npm run build --workspace=backend  # ou frontend
NODE_ENV=production node backend/dist/server.js  # smoke local prod-mode

# 3. Commit + delegar push/PR a @devops
git add -A && git commit -m "hotfix: {descricao} [event-day]"
@devops *push hotfix/{descricao-curta}
@devops *create-pr base=main
```

**Não pular:** smoke local prod-mode é mandatório (regra de ouro #1 do deploy-runbook).

### Cosmos throttling (429)

Sintoma: `429 TooManyRequests` em logs, latência API >2s, alerta visual no card de RU consumption.

**Mitigação imediata (sem reescalar):**
1. Identificar query culpada na Q4 (KQL pivota por `name` da operação)
2. Se for query do leaderboard sendo chamada por SignalR loop: pausar SignalR broadcast via app setting `SIGNALR_ENABLED=false` + restart app (~2min)
3. Se for predictions sendo gravadas em massa: rate-limit já protege (`POST /api/predictions` tem 30 req/min/IP)

**Scale-up emergencial (8min, custo: ~$23/mês prorata):**

```bash
# Cosmos 1000 → 4000 RU/s autoscale (descobre o teto sozinho)
az cosmosdb sql database throughput update \
  --resource-group rg-fifa-bolao \
  --account-name cosmos-fifa-bolao-tftec01 \
  --name bolao2026 \
  --max-throughput 4000
```

**Decisão de reverter:** depois do evento, voltar para `--max-throughput 1000` para preservar Free Tier (que aceita até 1000 RU/s grátis).

### App Service degradado (lento / 502 esporádico)

Sintoma: response time p95 >5s, requests intermitentes 502, CPU >90%.

**Restart simples (2min):**
```bash
az webapp restart \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01
# Aguardar warmup 60s antes de divulgar
```

**Scale-up emergencial (B1 → P1V2, 5min, custo: ~$73/mês prorata):**
```bash
az appservice plan update \
  --resource-group rg-fifa-bolao \
  --name plan-fifa-bolao-tftec01 \
  --sku P1V2
# App não restart sozinho — chame restart manual depois
```

**Reverter pós-evento:** `--sku B1` (custo volta a ~$13/mês).

### SignalR limite atingido (Free ~20-24 conexões)

Sintoma: usuários reclamam que leaderboard não atualiza em tempo real. Q8 (broadcast success rate) cai. Erro do cliente: `Failed to complete negotiation with the server: Connection count reaches limit`.

**Cap empírico (validado via `npm run loadtest:signalr` em 2026-05-14):**

| N tentadas | N estabelecidas | Falhas | App health |
|------------|-----------------|--------|------------|
| 15 | 15 | 0 | OK (REST p95 ~240ms) |
| 25 | **24** | 1 (graceful) | OK (REST p95 ~160ms) |

Azure docs dizem 20, mas Free_F1 aceitou 24 conexões antes de rejeitar (burst tolerance / soft cap). Falha é graciosa — não derruba a app, só rejeita a próxima conexão com erro específico.

**Mitigação imediata:** none — Free é hard cap. Usuários acima do cap têm fallback de polling (Tanstack Query refetch 1min staleTime), só perdem real-time. REST API continua respondendo normal durante breach.

**Decisão de scale-up — gatilho:** se turma ativa simultânea com leaderboard aberto >24 esperada.

**Scale-up (4min, custo: ~$1.61/dia):**
```bash
az signalr update \
  --resource-group rg-fifa-bolao \
  --name signalr-fifa-bolao-tftec01 \
  --sku Standard_S1
```

Standard_S1: 1000 conexões concorrentes, 1M msgs/dia — suficiente pra qualquer turma realista.

**Reverter:** voltar para `Free_F1` pós-evento.

**Validar pré-evento:**
```bash
npm run loadtest:signalr -- --count=25 --target=prod --i-know-what-im-doing --hold=5
```
Confirma comportamento do tier atual (atenção: rodar em horário sem usuários reais conectados).

### Frontend retorna 404 / SPA fallback quebrado

Sintoma: refresh em rota interna (ex: `/leaderboard`) retorna 404 em vez do HTML do SPA.

Causa típica: Express 5 splat regression (`/{*splat}` handler quebrou).

**Mitigação:** restart App Service (`az webapp restart`). Se persistir → rollback do último PR que tocou backend/Express.

---

## 📊 Telemetria — o que olhar

| Sinal | Onde | Threshold de alarme |
|-------|------|---------------------|
| 5xx rate | AppInsights Q5 | >0 errors em 5min durante jogo |
| p95 latency | AppInsights Q2 | >1s para `/api/leaderboard` |
| Cosmos RU/s | Cosmos Insights | >800 sustained 2min |
| Function failures | AI Q3 | qualquer falha de `calculate-points` durante jogo |
| SignalR success | AI Q8 (descomentar) | <95% broadcast success |
| Active users | AI Q6 (descomentar) | baseline esperado: 30-50 |
| Cold start | AI Q7 (descomentar) | avg >10s indica problema |

**Comando rápido para checar Cosmos RU em CLI:**
```bash
az monitor metrics list \
  --resource cosmos-fifa-bolao-tftec01 \
  --resource-type Microsoft.DocumentDB/databaseAccounts \
  --resource-group rg-fifa-bolao \
  --metric TotalRequestUnits \
  --interval PT1M --output table | tail -10
```

---

## 🛠️ Comandos úteis (cole no terminal)

```bash
# Health full
curl https://app-fifa-bolao-tftec01.azurewebsites.net/api/health/full | jq

# Tail de log stream em tempo real
az webapp log tail \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01

# Listar últimas execuções de calculate-points
az functionapp logs tail \
  --resource-group rg-fifa-bolao \
  --name func-fifa-bolao-tftec01

# Smoke tests live — ver §Smoke live (5 curls) abaixo

# Trocar app setting (sem restart automático)
az webapp config appsettings set \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01 \
  --settings SIGNALR_ENABLED=false

# Restart
az webapp restart -g rg-fifa-bolao -n app-fifa-bolao-tftec01
```

---

## 🔥 Smoke live (5 curls)

Bloco copy-paste para D-7, D-1 e qualquer momento que precisar validar prod ponta-a-ponta. Mesma sequência que o job `smoke_live` do `deploy.yml` (linhas 208-228) roda automaticamente após cada deploy.

```bash
URL="https://app-fifa-bolao-tftec01.azurewebsites.net"
set -e

echo "1/5 /api/health (uptime+version)..."
curl -sf --max-time 30 "$URL/api/health" | grep -q '"status":"ok"' && echo "  ✓ PASS"

echo "2/5 /api/health/full (Cosmos connectivity)..."
curl -sf --max-time 30 "$URL/api/health/full" | grep -q '"ok":true' && echo "  ✓ PASS"

echo "3/5 / (SPA root)..."
curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$URL/" | grep -q '200' && echo "  ✓ PASS"

echo "4/5 /api/leaderboard (ranking shape)..."
curl -sf --max-time 30 "$URL/api/leaderboard" | grep -q '"ranking"' && echo "  ✓ PASS"

echo "5/5 /api/matches count=72..."
curl -sf --max-time 30 "$URL/api/matches" | grep -q '"count":72' && echo "  ✓ PASS"

echo "✓ All 5 live smoke tests PASS"
```

**Alternativa via GitHub Actions** (mesmo job que roda no CD):
```bash
gh workflow run deploy.yml --ref main
# Acompanhar: gh run watch $(gh run list --workflow=deploy.yml --limit=1 --json databaseId -q '.[0].databaseId') --exit-status
```

> **Quando alguma check falhar:** ver seção [🩹 Procedimentos de mitigação](#-procedimentos-de-mitigação) (rollback / restart / scale-up).

---

## 🚨 Incident response

Template de comunicação em caso de degradação visível:

> **Aviso turma:** Identificamos lentidão em /leaderboard. Já estamos mitigando, palpites continuam funcionando normalmente. Atualização em 5min.

Após mitigação:

> **Atualização:** Resolvido às {HH:MM}. Causa: {1-frase}. Sem impacto em pontuação.

**Pós-evento OBRIGATÓRIO:** registrar em `docs/retrospectiva-s7.md` (a criar):
- Linha do tempo (kickoff, alarme, mitigação, resolução)
- Causa raiz
- Ação de prevenção (vira issue/PR pra próxima sprint)

---

## ✅ Checklist consolidado (imprimível)

```
□ D-7  Rehearsal completo
□ D-1  Freeze deploys + backup leaderboard
□ T-30 Health full + AppInsights baseline
□ T-0  Lock automático confirmado
□      Monitor 5xx + RU/s + SignalR
□ T+5  Pontos calculados + leaderboard atualizado
□ Pós  Export + retrospectiva
```

---

## 📚 Referências

- [Deploy Runbook](./deploy-runbook.md) — como deployar (não use durante evento exceto rollback)
- [Troubleshooting](./troubleshooting.md) — bugs comuns de stack
- [Observability](./observability/README.md) — queries KQL detalhadas
- [Architecture](./architecture.md) — componentes e fluxos
- [Scoring rules](./scoring-rules.md) — fórmula de pontos (regras imutáveis durante evento)

---

**Última atualização:** 2026-05-13 (Sprint S8, post-S7.4 baseline)
