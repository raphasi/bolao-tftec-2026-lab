# 🚀 Deploy Runbook — Bolão TFTEC Cloud

**Status:** Receita oficial · **Validado:** 2026-05-11 (Sprint S1.6) · **Tempo médio:** 5-8 min

Este é o método **definitivo** de deploy do Bolão. Use sempre este procedimento até que CI/CD GitHub Actions (Sprint S4) o substitua.

---

## 📋 TL;DR — 1 comando

```bash
bash scripts/deploy.sh
```

O script executa 7 passos, todos automáticos. Resultado: app online em 5-8 minutos com 7 smoke tests live PASS.

---

## 🧠 Por que esse método existe

Antes da Sprint S1.6, deployar o Bolão era **doloroso e instável** — cada tentativa quebrava o app por 30-40 min até dar restart loop por causa de `ERR_MODULE_NOT_FOUND`. A causa raiz só foi descoberta após 7+ horas de retries.

### Diagnóstico

```
Sintoma:    Container fica em restart loop, warmup probe falha em 230s
Erro Node:  ERR_MODULE_NOT_FOUND: Cannot find package 'zod/'
Root cause: rsync do Oryx no Linux App Service perde arquivos pequenos
            (node_modules/zod/package.json fica como pasta vazia)
            → ESM strict resolver crasha → container restart loop
```

### Comparação com main app (`fifa2026-web/back`)

| | Main app | Bolão |
|---|---|---|
| **OS** | Windows | Linux |
| **Runtime** | IIS + iisnode | Docker + Oryx |
| **Module system** | CommonJS (tolerante) | ESM (strict) |
| **Deploy** | Web Deploy / FTP | Oryx rsync |
| **Histórico** | 0 quebras em ~5 deploys | Quebrava sempre |

Main app é tolerante porque CommonJS aceita node_modules incompleto e IIS não mexe nos arquivos. Bolão usa ESM strict + Linux Oryx = combinação que **exige cada arquivo íntegro**.

### Solução: `WEBSITE_RUN_FROM_PACKAGE`

App setting do Azure que muda o comportamento de deploy:

```
ANTES (Oryx tradicional):
  zip → extract /tmp/zipdeploy → rsync → wwwroot
  ↑ rsync PERDE arquivos = ERR_MODULE_NOT_FOUND

DEPOIS (Run-From-Package):
  zip → /home/data/SitePackages/{ts}.zip
       → mounted como FUSE read-only em /home/site/wwwroot
       → Node lê DIRETO do zip
  ↑ ZERO extraction = ZERO corruption
```

---

## 🔧 Procedimento detalhado (7 passos)

### Passo 1 — Build production
```bash
npm run build --workspace=frontend
npm run build --workspace=backend
```

Gera `frontend/dist/` (Vite) e `backend/dist/` (tsc).

### Passo 2 — Staging com `node_modules` pré-instalado

Por que pré-instalar **localmente**: o npm install do servidor (via Oryx ou Kudu) tem o mesmo problema de rsync. Resolvemos instalando no host onde o ambiente é confiável.

```bash
mkdir -p /tmp/bolao-deploy-staging/{backend/dist,frontend}
# package.json minimal: APENAS 13 deps prod do backend (sem workspaces)
# Copia backend/dist, frontend/dist, backend/package.json
```

### Passo 3 — `npm install --omit=dev`
```bash
cd /tmp/bolao-deploy-staging
npm install --omit=dev --no-audit --no-fund
# Resultado: 176 packages íntegros
```

### Passo 4 — Zip Linux-compatible

⚠️ **NUNCA usar PowerShell Compress-Archive** — gera paths com backslash literal que Linux interpreta como filename, não pasta separator.

✅ **Usar Node `archiver` v5** com normalização POSIX:

```js
archive.file(fullPath, { name: relPath.split(path.sep).join('/') });
```

Validação:
```bash
unzip -l bolao-deploy.zip | grep -c '\\\\'   # deve ser 0
```

### Passo 5 — App settings

```bash
az webapp config appsettings set \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01 \
  --settings WEBSITE_RUN_FROM_PACKAGE=1 \
             SCM_DO_BUILD_DURING_DEPLOYMENT=false \
             ENABLE_ORYX_BUILD=false
```

**Mais importante:** `WEBSITE_RUN_FROM_PACKAGE=1`. Os outros são complementares.

### Passo 6 — Deploy

```bash
az webapp deploy \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01 \
  --src-path /tmp/bolao-deploy.zip \
  --type zip --async true
```

Zip vai pra `/home/data/SitePackages/{timestamp}.zip` e App Service registra em `packagename.txt`. A próxima inicialização monta o zip.

**Tempo:** 30s upload + 1-2 min mount.

### Passo 7 — Aguardar warmup + smoke tests

Tempo médio de warmup com Run-From-Package: **~120 segundos** (Node lê os ~40MB do zip mounted, inicializa Express, faz cosmos pool init).

Smoke tests obrigatórios (todos via curl):

| # | Endpoint | Status esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/health` | 200 | Backend responde |
| 2 | `GET /api/health/full` | 200 | Cosmos acessível |
| 3 | `GET /` | 200 + HTML | Frontend servido |
| 4 | `GET /api/missing` | 404 | 404 handler funciona (não SPA fallback) |
| 5 | `GET /leaderboard` | 200 | SPA route via splat |
| 6 | `POST /api/auth/login` admin | 200 + JWT | Auth + bcrypt + JWT signing |
| 7 | Header CSP contém `flagcdn.com` | ✓ | Helmet config correto |

---

## 🔍 Verificação pós-deploy

```bash
# Estado app
az webapp show --resource-group rg-fifa-bolao --name app-fifa-bolao-tftec01 --query state -o tsv
# Esperado: Running

# Zip mounted está lá?
USER='$app-fifa-bolao-tftec01'
PWD=$(az webapp deployment list-publishing-credentials \
  --resource-group rg-fifa-bolao --name app-fifa-bolao-tftec01 \
  --query publishingPassword -o tsv)
curl -s -X POST -u "$USER:$PWD" -H "Content-Type: application/json" \
  -d '{"command": "bash -c \"ls /home/data/SitePackages/\""}' \
  https://app-fifa-bolao-tftec01.scm.azurewebsites.net/api/command
# Esperado: {timestamp}.zip + packagename.txt
```

---

## ⚠️ Anti-padrões (NUNCA fazer)

| ❌ Não fazer | Por quê |
|---|---|
| Deploy sem `WEBSITE_RUN_FROM_PACKAGE=1` | Oryx rsync corrompe node_modules |
| Confiar no `node_modules.tar.gz` do Oryx | Extrai parcial (73-104 de 176 packages) |
| `npm install` no servidor via Kudu | Trava com EBUSY em `rm -rf node_modules` |
| Múltiplos retries de `stop`/`start` | Corrompe Kudu state após 2-3 ciclos |
| Zip via PowerShell `Compress-Archive` (múltiplos paths) | Gera backslash literais que quebram Linux |
| Deploy direto sem smoke test prévio local | Bugs ESM só aparecem em prod (ex: Express 5 splat) |

---

## 🩹 Troubleshooting

### App responde 502 / Application Error após deploy

**Diagnóstico:**
```bash
# 1. Confirmar Run-From-Package está habilitado
az webapp config appsettings list \
  --resource-group rg-fifa-bolao --name app-fifa-bolao-tftec01 \
  --query "[?name=='WEBSITE_RUN_FROM_PACKAGE'].value" -o tsv
# Esperado: 1

# 2. Confirmar zip está em SitePackages
USER='$app-fifa-bolao-tftec01'
PWD=$(az webapp deployment list-publishing-credentials \
  --resource-group rg-fifa-bolao --name app-fifa-bolao-tftec01 \
  --query publishingPassword -o tsv)
curl -s -X POST -u "$USER:$PWD" -H "Content-Type: application/json" \
  -d '{"command": "bash -c \"cat /home/data/SitePackages/packagename.txt && ls -lh /home/data/SitePackages/\""}' \
  https://app-fifa-bolao-tftec01.scm.azurewebsites.net/api/command
```

**Causas comuns:**
1. Zip não chegou em SitePackages → re-rodar `az webapp deploy`
2. App Insights auto-attach interferindo → `ApplicationInsightsAgent_EXTENSION_VERSION=disabled`
3. Warmup demora > 230s → checar Cosmos region latency
4. CSP errado → CSP custom em `backend/src/server.ts`

### Build local OK mas prod quebra

Sempre rodar smoke test LOCAL com staging exato antes:
```bash
cd /tmp/bolao-deploy-staging
NODE_ENV=production PORT=4099 [vars] node backend/dist/server.js
curl http://localhost:4099/api/health   # deve dar 200
```

### `ERR_MODULE_NOT_FOUND` no startup

- **NÃO É** o Run-From-Package falhando — é Oryx ainda rodando
- Confirmar que `ENABLE_ORYX_BUILD=false` está settando
- Confirmar que `WEBSITE_RUN_FROM_PACKAGE=1` está settando
- Verificar que `wwwroot/` está sendo MOUNTED do zip (deve estar **read-only**)

### Deploy bloqueado pelo Kudu (estado degradado)

Acontece se houve >3 tentativas de deploy falhas seguidas. Sintomas:
- Deploys novos travam em "Receiving changes" indefinidamente
- `rm -rf node_modules` retorna EBUSY

**Recovery (Opção A):**
```bash
# 1. Delete App Service (Cosmos/Storage/SignalR preservados)
az webapp delete --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-tftec01 --keep-empty-plan

# 2. Recriar via Bicep idempotente
az deployment group create -g rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.dev.json

# 3. Re-rodar deploy.sh normal
bash scripts/deploy.sh
```

---

## 📊 Histórico de problemas resolvidos

| Sprint | Bug | Causa raiz | Fix permanente |
|---|---|---|---|
| S1 | Express 5 `path-to-regexp` crash | `app.get('*')` deprecado | `app.get('/{*splat}', ...)` |
| S1 | SPA splat captura `/api/missing` | Sem skip de `/api/*` | `if (req.path.startsWith('/api/')) return next()` |
| S1 | Zip extract falha no Linux | PowerShell backslash | Node archiver + forward-slash POSIX |
| S1 | Kudu deploy stuck >30min | Filas acumuladas | Recovery Opção A |
| S1 | Functions Linux Y1 indisponível | Region stamp | Windows Y1 |
| S1 | Cosmos `ServiceUnavailable` East US | Saturation | `eastus2` |
| S1.5 | App Service corrompido pós 3 retries | Multi-restart state | Recovery Opção A |
| S1.6 | Bandeiras flagcdn.com bloqueadas | CSP default | CSP custom no helmet |
| S1.6 | 30 países errados | Histórico vs Copa 2026 | 48 oficiais agrupados por confederação |
| **S1.6** | **`ERR_MODULE_NOT_FOUND` recorrente** | **Oryx rsync perde arquivos** | **`WEBSITE_RUN_FROM_PACKAGE=1`** |

---

## 🔮 Próxima evolução (Sprint S4)

Esta receita manual será substituída por **CI/CD GitHub Actions**:

```yaml
# .github/workflows/deploy.yml
name: Deploy Bolão
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run build
      - run: bash scripts/deploy.sh --skip-build
      - run: # smoke tests live
```

Vantagens do CI/CD:
- Disparado automático por push em `main`
- Roda em ambiente limpo (Ubuntu) — sem state local
- Logs centralizados em GitHub Actions UI
- Rollback via `git revert` + auto-deploy
- Status checks bloqueiam merges com smoke fail

Esse runbook permanecerá como **fallback manual** se o CI/CD estiver indisponível.

---

## 📚 Referências

- [scripts/deploy.sh](../scripts/deploy.sh) — implementação executável
- [scripts/make-zip.cjs](../scripts/make-zip.cjs) — utility Node archiver POSIX
- [DECISIONS.md ADR-013](../DECISIONS.md) — registro arquitetural Run-From-Package
- [Microsoft Docs — Run-From-Package](https://learn.microsoft.com/azure/app-service/deploy-run-package)
- Memory permanente: `feedback_bolao_deploy_method.md`
