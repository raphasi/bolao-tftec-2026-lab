# Troubleshooting — Bolão TFTEC Cloud

Catálogo de problemas comuns e como resolver. Atualize com PRs sempre que encontrar e resolver algo novo.

---

## 🔥 Bicep / Provisioning

### `FreeTierAlreadyApplied`
**Sintoma:** `Cosmos free tier already enabled for another account in subscription`

**Causa:** Apenas 1 conta Cosmos com Free Tier por subscription. Você já tem outra ativa.

**Soluções:**
1. Veja qual já tem: `az cosmosdb list --query "[?enableFreeTier].name"`
2. Se a outra é descartável, delete: `az cosmosdb delete --name <conta> --resource-group <rg>`
3. OU desabilite no parâmetro: `cosmosEnableFreeTier: false` em `parameters.dev.json` (custo: ~$23/mês mínimo)

---

### `StorageAccountAlreadyExists` / `NameNotAvailable`
**Sintoma:** algum nome já está tomado globalmente

**Causa:** Storage, Cosmos, App Service e SignalR exigem nomes **únicos no mundo**.

**Solução:** mude o `nameSuffix` em `parameters.dev.json` para algo mais específico (ex: `rapha-tftec01`).

---

### `MissingSubscriptionRegistration`
**Sintoma:** `The subscription is not registered to use namespace 'Microsoft.X'`

**Solução:** registre o resource provider faltante:
```bash
az provider register --namespace Microsoft.DocumentDB    # Cosmos
az provider register --namespace Microsoft.SignalRService
az provider register --namespace Microsoft.Web           # App Service
az provider register --namespace Microsoft.Insights
az provider register --namespace Microsoft.OperationalInsights
```
Aguarde ~5 min, repita o deploy.

---

### Cosmos demora >15 min
**Causa:** região saturada ou throttling regional.

**Solução:**
- Cancele o deployment no portal
- Mude `location` para `centralus`, `eastus2` ou `westus2`
- Re-deploye

---

### `SubscriptionRequestsThrottled`
**Causa:** muitos deploys consecutivos (limite ARM: ~1200/h por sub).

**Solução:** aguarde 5 min e re-tente. Se persistir, espere 1h.

---

## 🔌 Conexão Cosmos DB

### `RequestTimeout` / `ServiceUnavailable` no SDK
**Causa:** firewall do Cosmos bloqueando IP.

**Verificar:**
```bash
az cosmosdb show --name <conta> --resource-group <rg> --query "ipRules"
```

Se há regras restritivas, adicione seu IP:
```bash
MY_IP=$(curl -s ifconfig.me)
az cosmosdb update --name <conta> --resource-group <rg> \
  --ip-range-filter "$MY_IP"
```

---

### `Unauthorized` ao conectar
**Sintoma:** `Error: Unauthorized. The input authorization token can't serve the request`

**Causas e soluções:**
| Causa | Solução |
|---|---|
| Chave errada no `.env` | Re-extraia: `az cosmosdb keys list --name <conta> --resource-group <rg> --query primaryMasterKey -o tsv` |
| Chave rotacionada | Mesma solução acima |
| `COSMOS_ENDPOINT` sem `/` final | Garanta que termina com `:443/` |

---

### `partition key path mismatch`
**Sintoma:** ao escrever, erro `PartitionKey extracted from document doesn't match the one specified in the header`

**Causa:** documento não tem o campo da PK (ex: container PK=/userId mas doc sem `userId`).

**Solução:** garanta que o documento inclui o campo. Para o bolão:
- `users`, `predictions`, `specials` → `userId`
- `matches-cache` → `groupCode`
- `leaderboard` → `season`

---

## 🌐 CORS

### Frontend não chega no backend em dev
**Sintoma:** `CORS error: No 'Access-Control-Allow-Origin' header`

**Causa:** Vite proxy não configurado ou backend não está rodando.

**Soluções:**
1. Confirme que backend está em `http://localhost:3001`: `curl http://localhost:3001/api/health`
2. Confirme `vite.config.ts` tem `proxy: { '/api': { target: 'http://localhost:3001' } }`
3. Use `/api/...` no frontend, **não** `http://localhost:3001/api/...`

### CORS em produção
**Sintoma:** após deploy, frontend não consegue chamar `/api/*`

**Causa:** frontend e backend deveriam estar na mesma origem. Se não estão, configure CORS:
```bash
az webapp config appsettings set \
  --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-<suffix> \
  --settings CORS_ORIGINS="https://meu-frontend.com,https://outro.com"
```

---

## 🔑 JWT / Auth

### `Token Bearer ausente` ao chamar endpoint protegido
**Causa:** axios não anexou header.

**Verificar:**
- `localStorage.getItem('bolao.auth.token')` retorna a string?
- Devtools → Network → Request Headers tem `Authorization: Bearer ...`?

**Solução:** se token sumiu, refaça login. Algum 401 prévio pode ter limpado.

---

### `Token inválido: jwt expired`
**Causa:** token expirou (default 7d).

**Solução:** o frontend deveria detectar 401 e redirecionar para `/login` automaticamente (via interceptor). Se isso falhar, refaça login manualmente.

---

### `JWT_SECRET deve ter no mínimo 32 chars` no startup
**Causa:** env var muito curta ou faltando.

**Solução:**
```bash
openssl rand -base64 32  # gera 44 chars
```
Cole no `.env` ou App Settings.

---

## 🐳 Build / Deploy

### `Cannot find module` ao rodar `node backend/dist/server.js`
**Causa:** dependências não instaladas no App Service.

**Solução:** garanta no App Settings:
```
SCM_DO_BUILD_DURING_DEPLOYMENT=true
```
Isso faz o Oryx rodar `npm install --production` durante o deploy.

---

### Build do frontend não encontra os caminhos `@/...`
**Causa:** tsconfig path mapping não está configurado.

**Verificar:** `frontend/tsconfig.app.json` tem:
```json
"paths": { "@/*": ["./src/*"] }
```

E `vite.config.ts`:
```ts
resolve: { alias: { '@': resolve(__dirname, './src') } }
```

---

### `tsc -b` reclama de `tsbuildinfo`
**Sintoma:** `error TS6305: Output file 'X' has not been built from source file 'Y'`

**Solução:** delete os caches e rebuild:
```bash
rm -rf frontend/node_modules frontend/dist frontend/*.tsbuildinfo
npm install
npm run build --workspace=frontend
```

---

## 🚀 App Service

### `502 Bad Gateway` após deploy
**Causa:** app não está rodando ou crashou no boot.

**Diagnóstico:**
```bash
az webapp log tail --resource-group rg-fifa-bolao --name app-fifa-bolao-<suffix>
```

Causas comuns:
- Env var faltando (procure `Variáveis de ambiente inválidas` no log)
- `startup-file` errado (deve ser `node backend/dist/server.js`)
- `backend/dist/server.js` não foi gerado (verifique o build)

---

### App responde lento (cold start)
**Causa:** Always On desabilitado.

**Solução:**
```bash
az webapp config set --resource-group rg-fifa-bolao \
  --name app-fifa-bolao-<suffix> --always-on true
```
(Plan B1 e superiores suportam.)

---

## ⚙️ Functions

### Function App não dispara timer
**Causa:** Storage Account não conectado ou TZ errada.

**Verificar App Settings da Function:**
- `AzureWebJobsStorage` aponta para storage real
- `FUNCTIONS_WORKER_RUNTIME=node`
- `FUNCTIONS_EXTENSION_VERSION=~4`

**Logs:**
```bash
az functionapp log tail --resource-group rg-fifa-bolao --name func-fifa-bolao-<suffix>
```

---

## 📡 SignalR

### Cliente conecta mas não recebe broadcast
**Causa:** modo errado (Default em vez de Serverless).

**Verificar:**
```bash
az signalr show --name signalr-fifa-bolao-<suffix> --resource-group rg-fifa-bolao --query "features"
```

Deve ter `ServiceMode = Serverless`.

**Corrigir:**
```bash
az signalr update --name signalr-fifa-bolao-<suffix> \
  --resource-group rg-fifa-bolao --service-mode Serverless
```

---

### Limite de 20 conexões atingido (Free)
**Sintoma:** novos clientes não conseguem conectar

**Soluções:**
1. Aumente SKU: `Free_F1` → `Standard_S1` (~$50/mês, 1000 conexões)
2. OU implemente reconnect com backoff no cliente

---

## 🛠️ Desenvolvimento

### `npm install` falha em Windows com erros de path longo
**Solução:**
```bash
git config --system core.longpaths true
```
Ou habilite Long Paths no Group Policy (`Computer\Administrative Templates\System\Filesystem\Enable Win32 long paths`).

---

### Hot reload do Vite não reflete mudanças
**Causa:** WSL ↔ Windows mount points perdem eventos de file watching.

**Soluções:**
- Use o WSL filesystem (`~/projetos/...`) em vez de `/mnt/c/...`
- OU habilite polling no `vite.config.ts`:
  ```ts
  server: { watch: { usePolling: true } }
  ```

---

### Tsx não roda os scripts (`scripts/seed-cosmos.ts`)
**Causa:** `tsx` não instalado ou Node antigo.

**Solução:**
```bash
node --version    # precisa ser 20+
npm install
npx tsx scripts/seed-cosmos.ts   # roda explicitamente
```

---

## 💰 Custo inesperado

### Cobrança maior que esperado
**Diagnóstico:**
1. Portal → Cost Management → Cost analysis → filtre por `rg-fifa-bolao`
2. Veja o "Top services" — qual serviço está gastando mais

**Causas comuns:**
- **App Service B1 sem Stop:** $13/mês mesmo sem tráfego. Quando não usar, pare:
  ```bash
  az webapp stop --resource-group rg-fifa-bolao --name app-fifa-bolao-<suffix>
  ```
- **Cosmos sem free tier:** se foi criado sem `enable-free-tier`, vai cobrar ~$23/mês mínimo
- **Storage logs grandes:** App Insights ingestão >5GB/mês cobra

**Prevenção:** sempre delete o RG depois de testes longos:
```bash
az group delete --name rg-fifa-bolao --yes --no-wait
```

---

## ❓ Não está aqui?

1. Verifique logs do App Service: Portal → App Service → Log stream
2. Veja erros em Application Insights: Failures
3. Procure em [issues do repo](https://github.com/TFTEC/fifa2026-bolao-dev/issues)
4. Abra issue novo descrevendo o erro + passos pra reproduzir
