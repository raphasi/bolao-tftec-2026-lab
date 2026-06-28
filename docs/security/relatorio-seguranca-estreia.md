# Relatório de Segurança — Estreia Bolão TFTEC (11/06)

> Auditoria conduzida na madrugada de 09→10/06 por 2 squads multiagente (review de
> código + simulação de ataque com 2 personas) + sondagem ao vivo do ambiente.
> Cada achado Critical/High foi **verificado adversarialmente** (um agent tentou
> refutar antes de confirmar). Total bruto: ~76 achados → consolidados abaixo.

## Veredito: 🟡 GO-COM-RESSALVAS

A **postura de código é sólida**. As duas squads tentaram quebrar a aplicação de fora
(não-autenticado) e de dentro (aluno logado querendo trapacear/sabotar) e **não acharam
nenhuma porta de comprometimento direto** (sem RCE, sem injection explorável, sem IDOR de
escrita, sem escalada a admin, sem furo no lock de palpite, sem manipulação de placar).

O risco real concentra-se em **disponibilidade (derrubar o evento)** e **ótica de scanner
(o hater que printa "tem falha")** — exatamente as suas duas preocupações — e em **1 camada
de defesa que ainda está desligada**: o WAF está em **Detection** (passivo, não bloqueia nada).

**Condição do GO:** virar o WAF para **Prevention** antes da estreia + um teto anti-flood
por-IP no `/api/auth/*`. Sem isso → NO-GO.

---

## Threat model (as 2 lógicas pedidas)

| Persona | Objetivo | Resultado da auditoria |
|---|---|---|
| **Atacante externo (não-logado)** | Derrubar (DoS) ou achar vuln explorável / printar "tem falha" | Sem vuln de comprometimento. Risco = **DoS de CPU/cota** + **ótica de scanner**. |
| **Aluno logado malicioso** | Trapacear / sabotar / estragar o evento | Controles de integridade **sólidos**. Resíduo = **lock de especiais sem fail-safe** e **token de admin sem revogação**. |

---

## 🔴 Bloqueadores da estreia (resolver antes de 11/06)

### B-1 — WAF em Detection (passivo): nenhuma defesa de borda ativa · **High**
Hoje o WAF **só registra, não bloqueia**. DRS, Bot Manager, rate-limit `/api/auth/*`
(300/5min), rate-limit `/api/*` (6000/5min) e block de TRACE estão **inertes**. A decisão
de "não usar captcha, confiar no WAF" **só vale com o WAF em Prevention**.
**Ação:** no ensaio D-1, calibrar exclusões pelo tráfego (Log Analytics) e
`wafMode=Prevention`. Validar que login/cadastro legítimos da sala (1 IP NAT) **não** tomam
403. Rollback p/ Detection pronto. *(refs: parameters.frontdoor.json:9; DOS-04; HATER-07)*

### B-2 — Flood de bcrypt derruba a sala (DoS de CPU) · **High**
O `authLimiter` chaveia por `IP:email` (NAT-aware). Efeito colateral: **rotacionando o email,
cada request cai num balde novo** → bypass do limite. Cada `/login` roda `bcrypt` (~90ms de
CPU 100%, **inclusive contra dummy-hash quando o user não existe**). A API roda em **B1, 1
vCPU, instância única, sem autoscale**. Algumas dezenas de req/s saturam o vCPU → o health
probe falha → **AFD marca a origin Unhealthy → a sala inteira perde a API**.
**Ação:** (1) WAF em Prevention (B-1) é a 1ª barreira; (2) **2º limiter só-por-IP-real** em
`/api/auth/*` (ex. 30/min por `X-Azure-ClientIP`, sem email na chave) — *já desenhado, falta
implementar*; (3) considerar subir o plano (B2/S1 + 2 instâncias) na janela do evento.
*(refs: auth.ts:33-44,145; env.ts:24; main.bicep:59; DOS-01/03; AUTH-003)*

### B-3 — Confirmar que a senha do admin ≠ default público · **verificação**
A senha default `TFTEC@2026!` está publicada nos guias. A rotação de 08/06 está registrada e
o `SEED_ADMIN_PASSWORD` **não está** nos App Settings (verifiquei) — então o vetor está
fechado. **Ação:** confirmar por **login real** (default → 401) antes da estreia, para o
go/no-go não depender só de memória. *(refs: seed-cosmos.ts:66; rank 2 da squad de review)*

---

## 🟠 Importantes (pré-estreia ou logo após)

### Disponibilidade / DoS
- **DOS-03/05 — listagens sem cache nem LIMIT** (`/api/leaderboard`, `/api/matches` fazem
  `fetchAll` sem `Cache-Control`). *Medium.* **Fix barato e alto valor:** `Cache-Control`
  curto (5–15s) → o AFD serve do edge e absorve flood sem tocar origem/Cosmos.
- **DOS-02 — rate-limit por-IP é por-SALA (NAT):** um aluno sozinho estoura a cota e dá 429
  na turma toda. *Low (auto-infligido/localizado).* **Fix:** chavear o limiter autenticado
  por `userId` (do JWT), caindo p/ IP só em rotas públicas.
- **DOS-06 — front-server sem rate-limit; catch-all faz `sendFile` por path aleatório.**
  *Medium.* **Fix:** custom rule de rate-limit no WAF cobrindo `/*` (hoje só cobre `/api/`).
- **DOS-07 — body limit de 256kb** p/ payloads minúsculos. *Low.* **Fix:** `express.json({limit:'16kb'})`.

### Ótica de scanner / reputação (o "hater que printa") — ✅ maioria já corrigida na branch
- **HATER-01/02/04 — front sem headers de segurança + `X-Powered-By` + `200` em `/.env`.**
  ✅ **FEITO na branch** (headers/CSP/X-Frame-Options/nosniff + 404 honesto em dotfiles +
  `x-powered-by` off). Falta **build+deploy** do front.
- **sourcemaps `.js.map` 200 em prod** (código do admin exposto). ✅ **FEITO na branch**
  (`vite sourcemap:false`). Falta build+deploy.
- **HATER-03 — cookie `ARRAffinity` vaza o hostname da origem.** *Medium.* **Fix:**
  `clientAffinityEnabled=false` no App Service do front (SPA estático não precisa de sticky).
- **HATER-05 — `/api/health` expõe versão/uptime.** *Low.* **Fix:** reduzir o público a
  `{status:'ok'}`; mover versão/uptime p/ `/api/health/full` (admin).
- **HATER-09 — `*.azurefd.net` default ainda vivo** = 2º alvo de scan. *Low.* **Fix (após
  custom domain 100%):** `linkToDefaultDomain:'Disabled'` nas rotas.

### Exploração unauth
- **AUTH-001 — enumeração de contas via `/register`** (409 "e-mail já cadastrado"). *Medium.*
  **Fix:** resposta genérica (não confirmar existência) + limiter de register por-IP.
- **AUTH-002 — spam de contas-lixo** (sem captcha + balde por-email) polui leaderboard.
  *Medium.* **Fix:** limiter de `/register` por-IP-puro + WAF Prevention + (ideal) verificação
  de e-mail. Mitigação operacional: query pronta p/ purgar contas sem atividade.

### Integridade do evento (aluno logado) — o que a squad **TENTOU e NÃO conseguiu** 🟢
- ✅ **Lock de palpite robusto server-side** (não fura via API crua → 409). *(INT-01)*
- ✅ **Não dá pra editar palpite de outro** (docId/PK derivados do JWT). *(INT-02)*
- ✅ **Não dá pra auto-atribuir pontos nem disparar recálculo** (admin-only, points server-only). *(INT-03)*
- ✅ **Leaderboard não-manipulável** (re-derivado do banco no Change Feed). *(INT-05)*
- ✅ **Replay/double-submit não pontua 2x** (upsert idempotente). *(INT-06)*
- ✅ **Sem stored XSS** (React escapa; sem `dangerouslySetInnerHTML`). *(XSS-001)*
- ✅ **CSRF não se aplica** (auth por Bearer, não cookie). *(CSRF-001)*
- ✅ **Superfície admin protegida** (todas as rotas `/api/admin/*` sob `requireAdmin`). *(AUTHZ-001)*

**Resíduos reais:**
- **INT-04 — lock de especiais/artilheiro sem fail-safe** *Medium.* O lock é global e só
  trava se o admin setar `lockUtc` ou travar manual. Se esquecer, um aluno troca
  campeão/artilheiro (palpites de até 150/120 pts) **depois** do torneio encaminhar.
  **Fix:** (D-1) confirmar `lockUtc` setado; (código) `computeSpecialsLocked` também travar
  quando o 1º jogo já kickou (fallback automático).
- **JWT-001 — role no token, sem revogação (7d)** *Medium.* Admin promovido→rebaixado mantém
  poderes até o token expirar; token de admin roubado não dá pra invalidar (nem trocando
  senha). **Fix:** reler `role` fresco do Cosmos em `requireAdmin` (igual já é feito p/
  `active`) + rejeitar `iat < passwordChangedAt` (campo **já existe**); encurtar expiry p/ 24h.
- **INT-07 — merge de specials apaga picks não enviados** *Low.* Só auto-dano (não é trapaça),
  mas gera ruído de suporte. **Fix:** coalescer com o existente.

### Segredos / RBAC / supply-chain
- **PFX com chave privada no disco** *High → mitigado.* ✅ **`.gitignore` já blinda** (commit
  na branch). **Recomendado:** apagar `docs/cert/` (o KV é a fonte de verdade) e, pós-evento,
  **rotacionar o cert** (a senha `vamosgremio` apareceu no contexto). *(rank 3)*
- **CORS_ORIGINS aponta p/ o domínio default, não p/ `bolao.tftec.com.br`** (verifiquei ao
  vivo). Impacto baixo (front é same-origin), mas **alinhar:** setar
  `CORS_ORIGINS=https://bolao.tftec.com.br,https://fd-...azurefd.net`. O default de código `*`
  é perigoso p/ o repo self-host → falhar no boot se `production` + `*`.
- **KV: meu usuário ficou com `Secrets Officer` + `Certificates Officer`** (amplo) e o KV está
  **sem purge protection.** *Medium.* **Fix pós-evento:** remover o `Secrets Officer` (basta
  `Certificates Officer`); habilitar `enablePurgeProtection`.
- **JWT_SECRET em App Setting texto plano** (não KV reference). *Medium, pós-evento.*
- **JWT sem `algorithms:['HS256']`** *Low.* Não explorável hoje (HMAC + jsonwebtoken@9); fix
  de custo zero. *(BAC-01/JWT-002)*
- **npm audit:** 3 high (OpenTelemetry, sem exporter exposto) + open-redirect moderate
  (react-router). *Low, pós-estreia.*

---

## ✅ O que já foi feito nesta madrugada (branch `seguranca/hardening-estreia`, **sem deploy**)
1. `.gitignore` blinda `*.pfx/*.pem/*.key/docs/cert/` + saída compilada do bicep — **a chave
   privada não vaza mais num `git add` acidental**.
2. `feat(frontdoor)` — commit da feature do **custom domain BYOC** (estava viva mas não
   commitada; corrige o config-drift do IaC).
3. `feat(seguranca)` — hardening do `frontend-server` (headers de segurança + CSP com SignalR
   liberado + `X-Frame-Options DENY` + nosniff + 404 honesto em dotfiles + `x-powered-by` off)
   e `sourcemap:false` no Vite. Sintaxe validada (`node --check`); **não deployado**.

Verificações ao vivo realizadas: cert BYOC servido na borda; `/api/health` e
`/api/health/full` 200 via `bolao.tftec.com.br`; WAF cobre o custom domain (refutou o achado
"domínio sem WAF"); `CORS_ORIGINS`/`SEED_ADMIN_PASSWORD`/`NODE_ENV` lidos; sourcemaps 200.

---

## 📋 Plano de ação proposto (pra decidirmos juntos)

### Fase 0 — agora / antes de dormir (já feito por mim)
- [x] `.gitignore` da chave privada · [x] commit do custom domain · [x] hardening do front na branch

### Fase 1 — D-1 (10/06), **decisão sua + alguns precisam deploy**
1. **WAF → Prevention** (B-1) com calibração no ensaio. *(eu rodo o `az` com seu OK)*
2. **2º limiter por-IP-real em `/api/auth/*`** (B-2) — eu implemento na branch; precisa deploy.
3. **Confirmar senha admin ≠ default** (B-3) — login real.
4. **Confirmar `lockUtc` dos especiais setado** (INT-04).
5. **Build + deploy do front** com o hardening da branch (headers + sourcemaps off).
6. **`Cache-Control` em `/api/leaderboard` e `/api/matches`** (DOS-03/05) — eu implemento; deploy.
7. **`clientAffinityEnabled=false`** no App Service do front (HATER-03).
8. **`CORS_ORIGINS`** incluir `bolao.tftec.com.br`.

### Fase 2 — endurecimento (logo após, sem pressa de estreia)
- Revogação de JWT (role fresco + `iat<passwordChangedAt`) + expiry 24h (JWT-001)
- Fail-safe automático do lock de especiais (INT-04)
- `/register` anti-enumeração + limiter por-IP (AUTH-001/02)
- `/api/health` público minimalista (HATER-05); `linkToDefaultDomain:Disabled` (HATER-09)
- Apagar `docs/cert/` + **rotacionar o cert**; KV purge protection + tirar meu `Secrets Officer`
- `JWT_SECRET` → KV reference; `algorithms:['HS256']`; `npm audit fix`; body limit 16kb

> **Nada acima foi deployado.** O flip do WAF, os App Settings e os deploys precisam do seu OK.
