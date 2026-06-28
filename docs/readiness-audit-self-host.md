<!-- Auditoria de prontidao self-host (squad) — 2026-06-07. -->

# Relatório de Prontidão 100% — Bolão TFTEC 2026 (self-host / fork dos alunos)

## Veredito

**NÃO PRONTO.** O fork+deploy do aluno **falha do zero** em ambos os caminhos principais:

- **Caminho Portal (recomendado no guia):** a Fase 7 (seed) aborta com `process.exit(1)` porque o aluno nunca cria o container `players` — ele está ausente da tabela de containers e da contagem "13" do guia.
- **Caminho Bicep + deploy Caminho A:** a pontuação **nunca roda** porque o `functions.bicep` não injeta `AzureWebJobsCosmosDBConnection`, usado por todas as 5 Functions de Change Feed.
- **Pré-requisito de partida:** o placeholder `<REPO_PUBLICO_URL>` não foi resolvido — o aluno literalmente não tem de onde forkar.

Após os 5 BLOCKERS abaixo, o veredito sobe para **PRONTO COM RESSALVAS** (restam os IMPORTANTES, que quebram caminhos secundários como `deploy.sh` direto e `setup-cosmos.sh`).

**Fato canônico de containers (use este número em todo o repo):** o Bicep cria **14 containers = 9 de dados** (`users`, `predictions`, `specials`, `matches-cache`, `leaderboard`, `groups`, `players`, `config`, `audit-log`) **+ 5 leases** (`leases-calc`, `leases-specials`, `leases-aggregate-predictions`, `leases-aggregate-specials`, `leases-emit-leaderboard`).

---

## BLOCKERS

### 1. `functions.bicep` não define `AzureWebJobsCosmosDBConnection` → pontuação nunca roda
- **Arquivo:** `infra/modules/functions.bicep:76-98` (appSettings).
- **Sintoma:** as 5 Functions de Change Feed usam `connection: 'AzureWebJobsCosmosDBConnection'` (`functions/src/functions/calc-predictions.ts:92`, `calc-specials.ts:83`, `aggregate-leaderboard.ts:125,136`, `emit-leaderboard-update.ts:110`). O Bicep injeta `COSMOS_ENDPOINT`/`COSMOS_KEY`/`COSMOS_DATABASE`/`CosmosDbConnection__accountEndpoint`, mas **não** este setting. O host fica "Running", o trigger não conecta, a pontuação não acontece — falha silenciosa. O `deploy.yml:167-172` (Caminho B) e o guia manual (`DEPLOY-ALUNO-PORTAL.md:268`) injetam; o aluno que usa **Bicep (Fase 15) + deploy Caminho A** fica sem ele.
- **Correção:** adicionar em `functions.bicep` appSettings: `{ name: 'AzureWebJobsCosmosDBConnection', value: 'AccountEndpoint=${cosmosEndpoint};AccountKey=${cosmosKey};' }` (param `cosmosKey` já existe e é `@secure`).

### 2. Container `players` ausente da tabela do guia → seed aborta no Caminho Portal
- **Arquivo:** `docs/DEPLOY-ALUNO-PORTAL.md:151-162` (tabela "Containers de DADOS (8)").
- **Sintoma:** a tabela lista 8 e **omite `players` (PK `/season`)**. O preflight do seed exige `players` (`scripts/seed-cosmos.ts:89`) e faz `process.exit(1)` em 404 (`:96-99`) com `Container "players" não existe. Rode o Bicep deploy primeiro.` — mensagem que ainda confunde quem seguiu o Portal e não usou Bicep.
- **Correção:** adicionar linha `| `players` | `/season` |` à tabela e renomear o título para "Containers de DADOS (9)".

### 3. Contagem "13 containers" no guia está errada (são 14)
- **Arquivo:** `docs/DEPLOY-ALUNO-PORTAL.md:176` e `:475`.
- **Sintoma:** "Confira que existem **13 containers**" e "cria todos os recursos e **os 13 containers**". O aluno valida em 13, fecha a conta sem o `players`, e mascara o BLOCKER 2.
- **Correção:** trocar "13 containers" → "14 containers" nos dois pontos. Alinhar também os comentários defasados: `infra/modules/cosmos.bicep:4,7` ("5 containers") e `scripts/lib/cosmos-types.ts:3`.

### 4. `setup-cosmos.sh` cria só 5 containers (script imperativo quebra tudo)
- **Arquivo:** `scripts/setup-cosmos.sh:120-124`.
- **Sintoma:** cria apenas `users, predictions, specials, matches-cache, leaderboard`. Faltam `groups`, `players`, `config`, `audit-log` **e os 5 leases**. O header (`:5`: "Cria a mesma estrutura que o Bicep") é falso hoje. Aluno que use este script fica sem scoring (sem leases), sem grupos/artilheiro/config/auditoria.
- **Correção:** adicionar `create_container groups /season`, `players /season`, `config /scope`, `audit-log /performedBy` e os 5 `leases-* /id` — ou substituir o script por um aviso "use o Bicep (`infra/main.bicep`) como fonte canônica".

### 5. Placeholder `<REPO_PUBLICO_URL>` não resolvido
- **Arquivo:** `docs/DEPLOY-ALUNO-PORTAL.md:70,80` (e `:7-8` marca o doc como "rascunho / dry-run pendente").
- **Sintoma:** sem a URL real do repo público, o aluno não tem de onde forkar — o caminho self-host não inicia.
- **Correção:** substituir `<REPO_PUBLICO_URL>` pela URL real e remover o aviso de "rascunho" após o dry-run de ponta a ponta.

---

## IMPORTANTES

### I1. `deploy.sh` faz smoke com login admin hardcoded → quebra Caminho A com credenciais próprias
- **Arquivo:** `scripts/deploy.sh:132` (e `:137-138` aborta).
- `POST /auth/login` fixo com `admin@bolao.tftec.com.br` / `TFTEC@2026!` exigindo HTTP 200. O aluno que definiu `SEED_ADMIN_EMAIL/PASSWORD` próprios (guia `:417-420`) recebe 401 e o deploy aborta mesmo com a API saudável. (Caminho B não é afetado.)
- **Correção:** tornar o login condicional a env (`SMOKE_LOGIN_EMAIL/PASSWORD`), aceitar 200/401 como "API respondendo", ou removê-lo do smoke.

### I2. Frontend Web App não é criado pelo Bicep → `deploy_frontend` falha no Caminho B
- **Arquivo:** `infra/main.bicep:140-156` (só o backend `app-fifa-bolao-<sufixo>`).
- Não há recurso para `app-fifa-bolao-web-<sufixo>` que `deploy.yml:25` e a Fase 4 esperam. O guia avisa (`:485`), mas Bicep + Caminho B sem criar o frontend manualmente faz o job falhar.
- **Correção:** adicionar segundo módulo App Service para o frontend (reusando o mesmo plan) **ou** reforçar no guia que, ao usar Bicep + Caminho B, é obrigatório criar o frontend Web App antes do workflow.

### I3. Fase 7 (seed) omite que `players` é populado (1247 jogadores)
- **Arquivo:** `docs/DEPLOY-ALUNO-PORTAL.md:407-427`.
- Descreve "admin, 72 jogos, 12 grupos/48 seleções, leaderboard" e omite o catálogo do artilheiro. O seed full chama `seedPlayers()` (`seed-cosmos.ts:381-383`) e sem ele o dropdown de artilheiro fica vazio.
- **Correção:** incluir "+ catálogo do artilheiro (48 seleções / 1247 jogadores em `players`)" na descrição e no resultado esperado.

### I4. Banner/help/cabeçalho do seed não mencionam `players`
- **Arquivo:** `scripts/seed-cosmos.ts:356-358` (`Modo: full (admin + matches + groups + leaderboard)`), cabeçalho `:8-19`, e flag `--players-only` (`:50,381`) não documentada no help.
- Cosmético, mas reforça a impressão errada de que players não faz parte do fluxo padrão.
- **Correção:** incluir `players` no banner do modo full, documentar `npm run seed -- --players-only` no help/cabeçalho.

### I5. `setup-cosmos.sh` usa RG de produção como default
- **Arquivo:** `scripts/setup-cosmos.sh:25` → `RG="${RESOURCE_GROUP:-rg-fifa-bolao}"`.
- O guia padroniza `rg-bolao` (`:119`). Aluno que rode `./setup-cosmos.sh joao01` sem exportar `RESOURCE_GROUP` mira um RG inexistente/divergente da convenção.
- **Correção:** alinhar default para `rg-bolao` ou exigir o RG como argumento posicional obrigatório.

### I6. `MAIN_API_BASE_URL` aponta para host de produção da TFTEC nos `.example`
- **Arquivos:** `.env.example:13` e `backend/.env.example:20` (`https://fifa2026-tickets-dev.azurewebsites.net/api`); default também em `main.bicep:72` / `parameters.example.json:32`.
- A var é opcional (`backend/src/config/env.ts:27`), não quebra o boot, mas se copiada literal o aluno integra contra um host da TFTEC.
- **Correção:** trocar por placeholder neutro (`https://<seu-main-app>.azurewebsites.net/api`) ou comentar como opcional.

### I7. CORS `*` instruído sem hardening obrigatório
- **Arquivo:** `docs/DEPLOY-ALUNO-PORTAL.md:213` (instrui `CORS_ORIGINS=*`), aperto em `:438-439` marcado como "(recomendado)".
- Para repo público forkado em massa, deixar CORS aberto é backlog comum. Não é BLOCKER (instância trial efêmera), mas convém tornar o passo de restringir `CORS_ORIGINS` à URL do frontend **parte do checklist obrigatório**.

### I8. Comentários/cabeçalhos do Bicep desatualizados
- `infra/modules/cosmos.bicep:1-9` ("5 containers" → são 14); `infra/main.bicep:8-9` e cabeçalho de `functions.bicep` descrevem Functions Linux/Consumption, mas o recurso é Windows Y1 (`functions.bicep:36-47`, `reserved: false`, coerente com a Fase 9.1 do guia).
- **Correção:** atualizar comentários para 14 containers e runtime Windows.

---

## NICE-TO-HAVE

- **N1. Output `appInsightsConnectionString` sem `@secure()`** — `infra/main.bicep:183`: contém InstrumentationKey em texto claro no histórico de deployment. (`cosmos.bicep:405-406` já marca `@secure()` na primaryKey — correto.) Marcar como `@secure()`.
- **N2. Senha default do admin no seed** — `scripts/seed-cosmos.ts:63` (`SEED_ADMIN_PASSWORD ?? 'TFTEC@2026!'`). Guia cobre o caminho feliz; considerar **abortar** o seed se a senha não estiver setada em `NODE_ENV=production`.
- **N3. Smoke não cobre features novas da sessão** — nem `deploy.yml:216-234` nem os scripts testam `/api/standings` (Tabela da Copa) ou o catálogo de artilheiro. Adicionar check leve (`/api/standings` → 200) e/ou item de checklist "tela de artilheiro lista jogadores".
- **N4. `mainApiBaseUrl` default de produção no template** — `main.bicep:72` / `parameters.example.json:32`. Comentar que é opcional / pode ficar em branco no self-host (relacionado a I6).
- **N5. `seedAdminUser` com condição redundante** — `scripts/seed-cosmos.ts:367-371`: `if (seedAll || !flags.skipAdmin) { if (seedAll) {...} }` só roda quando `seedAll`. Simplificar para `if (seedAll) { admin = await seedAdminUser(); }`.
- **N6. KeyVault não referenciado** — `infra/modules/keyvault.bicep` existe mas `main.bicep` não o usa. Intencional para trial (guia dispensa Key Vault, `:53`); apenas registro de consistência.
- **N7. Nomes das 6 funções na validação Caminho A.3** (`DEPLOY-ALUNO-PORTAL.md:401-403`) — conferir num dry-run que batem com os nomes reais registrados.

---

## Checklist do que falta para empacotar pro repo dos alunos

**Bloqueia o lançamento (resolver antes de publicar o repo público):**
- [ ] **B1** — Adicionar `AzureWebJobsCosmosDBConnection` em `infra/modules/functions.bicep:76-98`.
- [ ] **B2** — Adicionar `players` (`/season`) à tabela de containers e renomear para "DADOS (9)" — `docs/DEPLOY-ALUNO-PORTAL.md:151-162`.
- [ ] **B3** — Corrigir "13 containers" → "14 containers" em `docs/DEPLOY-ALUNO-PORTAL.md:176,475`; alinhar comentários `cosmos.bicep:4,7` e `cosmos-types.ts:3`.
- [ ] **B4** — Corrigir `scripts/setup-cosmos.sh:120-124` para criar os 14 containers, **ou** substituí-lo por aviso "use o Bicep".
- [ ] **B5** — Resolver `<REPO_PUBLICO_URL>` (`:70,80`) e remover o status "rascunho" (`:7-8`) após dry-run completo.

**Endurecimento de caminhos secundários (fortemente recomendado antes do fork em massa):**
- [ ] **I1** — `deploy.sh:132`: smoke de login condicional/tolerante a credenciais próprias.
- [ ] **I2** — Frontend Web App no Bicep **ou** aviso reforçado no guia (Bicep + Caminho B).
- [ ] **I3/I4** — Mencionar `players` na Fase 7 e no banner/help do seed.
- [ ] **I5** — Default de RG do `setup-cosmos.sh` para `rg-bolao`.
- [ ] **I6** — Neutralizar `MAIN_API_BASE_URL` de produção nos `.env.example`.
- [ ] **I7** — Tornar restrição de `CORS_ORIGINS` passo obrigatório no checklist.
- [ ] **I8** — Atualizar comentários do Bicep (14 containers, runtime Windows).

**Validação final antes de publicar:**
- [ ] Dry-run de ponta a ponta dos **dois** caminhos (Portal e Bicep) numa assinatura trial limpa, do fork até a pontuação rodando via Change Feed.
- [ ] Confirmar que o seed full termina com `1 admin, 72 jogos, 12 grupos / 48 seleções, leaderboard, 48 seleções / 1247 players`.
- [ ] Confirmar que `/api/matches` retorna 72 e que a pontuação processa uma predição de teste (valida B1 na prática).

**Sem ação necessária (verificado OK):** nenhum segredo real commitado (`git ls-files` limpo; `.gitignore` cobre `.env*`/`local.settings.json`/`parameters.local.json`); 5 leases batem exatamente com `leaseContainerName` das Functions; `players` correto no Bicep/seed/backend; throughput 1000 RU/s shared + free tier cabe no trial; JWT/CORS 100% por env; fixtures íntegras (72 / 12×4 / 48-1247).