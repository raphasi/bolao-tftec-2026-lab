# Backlog

Ideias e tarefas que surgiram durante a implementação mas não cabem na sprint atual. Refinadas depois para promoção a sprints futuras.

---

## Features (futuras)

- [ ] **Mascote IA Pelé Bot** — chatbot via GitHub Models + Key Vault + Managed Identity (Fase 2)
- [ ] **Notificações por e-mail** — confirmar palpite, lembrar de palpitar antes do jogo
- [ ] **Compartilhar palpite no WhatsApp/Twitter** — share API
- [ ] **Conquistas/badges** — "10 acertos seguidos", "primeiro placar exato"
- [ ] **Histórico de bolões anteriores** — comparativos cross-Cup
- [ ] **Modo Liga** — grupos privados de amigos com leaderboard isolado
- [ ] **Estatísticas pessoais** — gráficos de evolução do usuário

## Técnico (refinamentos)

- [ ] Event Grid pra `MatchResultPosted` (substituir timer-trigger)
- [ ] Cache Redis (Cosmos é caro em RU se queries não otimizadas)
- [ ] Rate limiting nas APIs
- [ ] Health checks ricos (`/api/health/full` com latência Cosmos)
- [x] **Isolar API do frontend (ADR-020) — Epic S6 ENCERRADO 2026-05-19** ([`docs/epic-hardening-rede-adr020.md`](./docs/epic-hardening-rede-adr020.md)). **S6.1+S6.2+S6.3+S6.5 ✅** validados em prod. S6.3 = parcial/custo-zero (Cosmos PE + VNet integration API; Cosmos `publicNetworkAccess` mantido Enabled por Functions `Y1`; SignalR `Free_F1` fora). **S6.5 ✅** (PR #51): RBAC KV Secrets User nas 2 MSIs, API+Functions via `@Microsoft.KeyVault` refs (`Resolved`), pipeline durável. **S6.4 App Gateway DESCARTADO** (decisão do owner; recriável sob demanda — `snet-appgw` inerte/sem custo).
- [ ] **(opcional, futuro) Lockdown público total Cosmos/SignalR** — só se o owner optar, **com custo**: (a) Functions `Y1` → **EP1** (Elastic Premium, VNet integration) → desligar `publicNetworkAccess` do Cosmos; (b) SignalR `Free_F1` → **Standard_S1** + Private Endpoint SignalR. Fecha a exposição pública remanescente. Sem trabalho planejado; aguarda decisão.
- [ ] **Flake recorrente do deploy do Bolão ("worker failed to start")** — `deploy.yml` (deploy_api/deploy_frontend) falha de forma intermitente no probe de worker-start; **o app sobe normalmente depois** (validado: control plane `Running` + `/api/health` 200). Consequência operacional: CI fica vermelho com prod saudável → **NUNCA re-rodar o CI atrás de verde** (re-deploya prod funcionando — anti-pattern já observado). Verdade do estado = control plane Azure + smoke direto, não a cor do run. Ações candidatas: aumentar/ajustar o health-probe pós-deploy, deploy síncrono com retry idempotente, ou separar "deploy OK" de "warm-up OK" no gate. Tech-debt própria, não bloqueia S6.x.
- [ ] **Discrepância de região na documentação** — guias/`GUIA-EVENTO.md` citam "East US" mas os recursos reais estão em **eastus2** (RG `rg-fifa-bolao`). Corrigir docs/guia para refletir `eastus2`.

## Operacional

- [x] **Event Day Runbook** — checklist + mitigações + escalação ([`docs/event-day-runbook.md`](./docs/event-day-runbook.md)) — S8 (2026-05-13)
- [x] **Dashboard de operação ao vivo** — `/admin/ops` com 4 cards real-time + pre-warm AppInsights — PRs #22 #24 #25 (2026-05-13/14)
- [x] **Scripts de reset demo data** — `scripts/reset-cosmos.ts` (já existia) + apontado do runbook
- [x] **Script de cleanup `users e2e-*` acumulados** — `scripts/cleanup-e2e-users.ts` + `npm run cleanup:e2e` — PR #23
- [x] **Load test SignalR** — `scripts/load-test-signalr.ts` valida cap empírico (~24 Free_F1) — PR #26
- [ ] Preencher contatos reais (oncall L1/L2, stakeholder TFTEC) no runbook antes do primeiro evento
- [ ] Painel de admin com estatísticas de uso
- [ ] Export de leaderboard em CSV
- [ ] Backup automático do Cosmos (point-in-time restore)

## ✅ Improvements resolvidos em PR #28 — QA batch 2 (2026-05-14)

PR consolidado com 3 improvements UX/admin:
- **B1.4** — Lock manual de palpites especiais no admin (aditivo ao time-based: novo flag `lockedManually` em `SpecialsLockConfigDoc.value` + PATCH `/api/admin/config/specials-lock` + toggle "Travar agora" no `AdminConfig.tsx`)
- **B2.1** — Botão "ver senha" em /login e /register (novo `components/ui/password-input.tsx` com toggle Eye/EyeOff)
- **B3.1** — Breakdown de especiais no modal leaderboard (novo `GET /api/leaderboard/:userId/specials` + seção UI no `Leaderboard.tsx` mostrando palpite vs real + pontos por categoria + bônus top4)

## ✅ Bugs resolvidos em PR #27 — QA batch 1 (2026-05-14)

PR consolidado com 7 fixes:
- **B1.1** — Palpite 0×0 agora pode ser salvo (`MatchCard.tsx`: distingue `hasNeverSaved`)
- **B1.2** — Botão "Salvar palpite" não pisca mais (`Palpites.tsx`: Set<matchId> in-flight tracking)
- **B1.3** — Especiais rejeita países duplicados no Top4 (`specials.ts`: zod refine + `Especiais.tsx`: filtro selects)
- **B6.1** — Banner "Sem conexão" no Layout quando offline (`useOnlineStatus` hook + `Layout.tsx`)
- **B6.2** — Empty state em /palpites mostra mensagem específica offline (`Palpites.tsx`)
- **B6.4** — `/palpites` sincroniza entre abas (refetchInterval 30s)
- **B6.5** 🔥 — Status `finished` trava palpite definitivamente (`match-lock.ts` linha 19)

## 🐛 Bugs encontrados em QA manual (B1) — ainda pendentes

> Descobertos pelo user em 2026-05-14 durante bateria B1. Documentados pra fix em PR futuro.

### Bug B1.1 — Palpite 0×0 não pode ser salvo

**Severidade:** Média — UX confusa, palpite legítimo (empate sem gols) bloqueado.

**Repro:**
1. Cadastrar user novo (sem palpites prévios)
2. Ir em `/palpites`
3. Em qualquer jogo NÃO palpitado ainda, deixar os inputs em `0 × 0`
4. Notar que botão "Salvar palpite" **não aparece**

**Causa raiz:** `frontend/src/components/bolao/MatchCard.tsx:53-73`
```ts
const savedHome = prediction?.predictedHome ?? 0;  // undefined vira 0
const hasChanged = (homeNum !== savedHome || ...);
// quando prediction=undefined, savedHome=0; com input 0×0: 0!==0 = false
// → hasChanged=false → botão NÃO aparece
```

Comentário linha 38 confirma: fix anterior pré-encheu inputs com '0' pra resolver bug do "Save sumir com placar tipo 2×0". Introduziu este bug.

**Fix proposto:**
```ts
const hasNeverSaved = prediction === undefined;
const hasChanged =
  !disabled &&
  hasValidNumbers &&
  (hasNeverSaved || homeNum !== savedHome || awayNum !== savedAway);
```

### Bug B1.2 — Botão "Salvar palpite" pisca em saves consecutivos

**Severidade:** Baixa — palpite É salvo corretamente; só comportamento visual confuso.

**Repro:**
1. Preencher placares em 5 jogos diferentes (não-zero)
2. Clicar "Salvar palpite" rapidamente em sequência
3. Notar que botão do jogo anterior **reaparece** brevemente quando clica no próximo

**Causa raiz:** `frontend/src/pages/Palpites.tsx:198`
```ts
isSaving={saveMutation.isPending && saveMutation.variables?.matchId === m.matchId}
```

Única instância de mutation pra todos jogos. Quando `mutate(B)` é chamado com A ainda in-flight, `variables.matchId` é replaced pra B, e A's `isSaving` vira false até `setQueryData` propagar.

**Fix proposto:** tracking explícito de matchIds in-flight via `useState<Set<number>>` com `onMutate`/`onSettled` da useMutation.

### Bug B1.3 — Especiais permitem mesmo país em múltiplos slots Top4

**Severidade:** Alta — palpite inválido aceito pelo backend, viola regra do bolão (4 países distintos no pódio).

**Repro:**
1. Login → `/especiais`
2. Em Campeão: selecionar Brasil
3. Em Vice: selecionar Brasil
4. Em 3º: selecionar Brasil
5. Em 4º: selecionar Brasil
6. Click "Salvar palpites especiais"
7. Backend aceita 201, palpite fica salvo com 4× Brasil

**Causa raiz:**
- Frontend (`frontend/src/pages/Especiais.tsx:211-217`): 4 `<select>` independentes listando `allTeams` sem filtro de "já selecionado"
- Backend (`backend/src/routes/specials.ts:147-156`): `upsertBodySchema.parse(...)` valida shape mas não tem `.refine()` checando uniqueness entre champion/runnerUp/thirdPlace/fourthPlace

**Fix proposto (defesa em camadas):**

Backend (Zod refinement em `upsertBodySchema`):
```ts
.refine(
  (d) => {
    const picks = [d.champion, d.runnerUp, d.thirdPlace, d.fourthPlace].filter(Boolean);
    return new Set(picks).size === picks.length;
  },
  { message: 'Os 4 países do Top4 devem ser distintos.' }
)
```

Frontend (UX-friendly — selects filtram países já escolhidos):
```ts
const pickedISOs = new Set([form.champion, form.runnerUp, form.thirdPlace, form.fourthPlace].filter(Boolean));
const availableForSlot = (currentKey) =>
  allTeams.filter((t) => !pickedISOs.has(t.iso) || form[currentKey] === t.iso);
```

### Bug B6.1 — App não mostra indicador visual de offline

**Severidade:** Média — user fica confuso (clica salvar, não recebe feedback, não sabe se está online).

**Repro:**
1. F12 → Network → Offline ☑
2. Navegar pela app, tentar salvar palpites
3. Nenhum banner, badge ou toast indica "você está offline"

**Estado do código:** browser API `navigator.onLine` + eventos `'online'`/`'offline'` **não estão sendo usados** em lugar nenhum do frontend (procurado em `frontend/src`).

**Fix proposto:**
- Criar hook `useOnlineStatus` em `frontend/src/hooks/`:
  ```ts
  export function useOnlineStatus() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
      const on = () => setOnline(true);
      const off = () => setOnline(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return online;
  }
  ```
- Mostrar banner fixo no topo do Layout quando `!online`: `🔌 Sem conexão — algumas ações podem falhar`
- Opcional: pintar borda de inputs em vermelho ou desabilitar botão Salvar enquanto offline

### Bug B6.2 — Filter mostra "nenhum jogo" quando offline (mensagem enganosa)

**Severidade:** Média — mensagem confusa esconde causa real.

**Repro:**
1. Offline → `/palpites` → filtro Grupo A (ou qualquer outro)
2. Aparece "Nenhum jogo nesse filtro"
3. Volta online → filtro mostra os 6 jogos do Grupo A normais

**Causa raiz:** `listMyPredictions` (`GET /api/predictions/me`) **não está no `runtimeCaching` do Service Worker** (`vite.config.ts:53-63` cobre apenas `matches|groups|leaderboard`). Offline → query falha → `predictionsByMatchId` vazio → filter aplicado retorna 0 OU exibe inconsistente.

**Fix proposto (opção A — UX mais correta):**
- Detectar `predictionsQuery.isError` em `Palpites.tsx:163-174` e mostrar mensagem específica:
  ```tsx
  {predictionsQuery.isError && (
    <Card>Não foi possível carregar seus palpites. Verifique sua conexão.</Card>
  )}
  ```
- OU usar `useOnlineStatus` (B6.1) e mostrar "Você está offline" ao invés de "nenhum jogo"

**Fix proposto (opção B — cobertura offline real):**
- Adicionar `/api/predictions/me` ao `runtimeCaching` no `vite.config.ts` com NetworkFirst + fallback cache (ex: 1 min staleness)
- Trade-off: stale data pode confundir user que esqueceu que está offline

### 🔥 Bug B6.5 — Status `finished` NÃO trava palpite (vulnerabilidade)

**Severidade:** 🔥 **CRÍTICA** — usuário pode **editar palpite depois do jogo terminar** se kickoff ainda for futuro (cenário early-finish).

**Repro:**
1. Admin → `/admin/results` → escolher jogo futuro (kickoff > now)
2. Toggle "Permitir finalizar" ON → registrar placar (ex: 2-1) → marca status=finished
3. User comum em outra aba: F5 em `/palpites`
4. Notar que o jogo finished **ainda permite editar palpite** (botão Salvar aparece)
5. User pode mudar palpite após resultado oficial conhecido = **fraude**

**Causa raiz:** `backend/src/services/match-lock.ts:18-22`:
```ts
export function computeMatchLocked(doc: MatchCacheDoc, nowMs: number = Date.now()): boolean {
  if (doc.lockedManually === true) return true;
  const kickoffMs = Date.parse(doc.kickoffUtc);
  return Number.isFinite(kickoffMs) && nowMs >= kickoffMs - LOCK_BEFORE_KICKOFF_MS;
}
```

Não considera `doc.status === 'finished'` como gatilho de lock. Resultado:
- Match early-finished mas kickoff futuro → `lockedManually !== true`, `now < kickoff - 30min` → **`locked = false`**
- User pode editar palpite apesar do resultado oficial já existir

**Fix proposto (uma linha):**
```ts
export function computeMatchLocked(doc: MatchCacheDoc, nowMs: number = Date.now()): boolean {
  if (doc.status === 'finished') return true;  // ← novo: finished sempre trava
  if (doc.lockedManually === true) return true;
  const kickoffMs = Date.parse(doc.kickoffUtc);
  return Number.isFinite(kickoffMs) && nowMs >= kickoffMs - LOCK_BEFORE_KICKOFF_MS;
}
```

**Impact:** Fix de 1 linha. Resolve indiretamente Bug B6.6 (admin não pode travar finished — não precisa, já está locked). Critical pra integridade do bolão.

### Bug B6.6 — Admin não pode travar jogo após status=finished

**Severidade:** Média — bug UX, agravado pelo B6.5 hoje. Resolve sozinho se B6.5 for fixado.

**Causa:** `frontend/src/pages/AdminResults.tsx:326` esconde toggle "Travar":
```tsx
{!isFinished && (
  <Button ... onClick={handleToggleLock}>...
)}
```

Decisão intencional (jogo finalizado não precisa lock — palpites já não fazem sentido). Mas combinado com B6.5 (status finished não trava palpites de fato), vira problema.

**Fix:** quando B6.5 for resolvido (status=finished trava palpites), Bug B6.6 desaparece. Manter `{!isFinished &&}` no UI fica consistente (admin não precisa do toggle pq backend já trava).

### Bug B6.7 — Palpite do user "zera" após ação admin (precisa repro detalhado)

**Severidade:** Investigar — pode ser bug real OR má-interpretação do flow.

**Reportado:** "se o usuário colocou o resultado do jogo e depois o administrador travou o jogo ou voltou, o resultado do usuário não persiste, ele zera o resultado que o usuário tinha marcado"

**Hipóteses:**
1. User digitou mas NÃO clicou Salvar → refresh limpa local state (esperado, não bug)
2. Backend tem algum changefeed/trigger que reseta predictions ao admin act (NÃO encontrado no código — `predictions.ts:246` só permite DELETE pelo próprio user)
3. Frontend pode estar mostrando default `0-0` por algum motivo de re-render

**Repro detalhado pra confirmar (precisa reexecutar):**
1. User: palpitar 2-1 em jogo X, **click Salvar palpite**, ver toast verde "Palpite salvo: X 2 × 1 Y"
2. F5 → confirmar 2-1 persistido na UI
3. Admin: travar jogo X via /admin/results
4. User: F5 → palpite ainda 2-1? OU foi pra 0-0?
5. **Se for pra 0-0, verificar Network → `GET /api/predictions/me` response** — predictedHome=2 ou predictedHome=null?

Se response mostra predictedHome=2 mas UI mostra 0-0, é bug frontend (re-sync issue em `MatchCard.tsx:45-48`). Se response mostra null/undefined, é bug backend.

### Bug B6.4 — Página `/palpites` não sincroniza entre abas/clientes

**Severidade:** **Alta** — durante evento, admin trava jogo OU registra resultado, e usuários com `/palpites` aberta **não recebem atualização** até F5 manual. Inclui auto-lock por kickoff (relógio do servidor avança, client não sabe).

**Repro:**
1. Aba 1 (user comum): `/palpites` com jogo X palpitado
2. Aba 2 (admin): `/admin/results` → trava jogo X manualmente OU registra placar oficial
3. Aba 1: aguardar 5min — jogo X **continua aparecendo como editável**, sem indicação de lock ou de finished

**Causa raiz arquitetural:**
- `App.tsx:35` — `refetchOnWindowFocus: false` global desabilita refetch on focus
- `Palpites.tsx` — `useQuery(['matches'])` e `useQuery(['predictions', 'mine'])` SEM `refetchInterval`
- Não usa `useLeaderboardSignal` (hook só montado em `Leaderboard.tsx`)
- SignalR só escuta `leaderboard:update` (backend não emite `match:updated` ou `prediction:updated`)

**Fixes possíveis (escalando complexidade):**

1. **Quick fix (polling, 5min de trabalho):** adicionar `refetchInterval: 30_000` nas queries de `Palpites.tsx`:
   ```ts
   const matchesQuery = useQuery({
     queryKey: ['matches'],
     queryFn: () => listMatches(),
     refetchInterval: 30_000,
     refetchIntervalInBackground: false,
   });
   ```
   Trade-off: gera +120 GET /matches/h por user, mas /matches é cacheado (Service Worker NetworkFirst) e Cosmos.

2. **Médio (SignalR generalizado):** estender `useLeaderboardSignal` pra escutar `matches:invalidate` e `predictions:invalidate` → invalidar queries correspondentes. Exige nova Function output binding ao admin/results PATCH.

3. **Robusto (Broadcast Channel API entre abas):** `new BroadcastChannel('bolao')` quando aba 1 salva mutation, posta evento → aba 2 escuta → invalida cache. Só sync entre abas do MESMO browser (não cross-device).

**Recomendação:** opção 1 pré-evento (low effort, cobre o caso). Opção 2 pós-evento se SignalR vira gargalo.

### Bug B6.3 — Save de palpite funciona durante offline (investigar)

**Severidade:** Investigar (pode ser feature OU bug crítico de UX).

**Observação:** user salvou palpite com `Offline ☑` no DevTools, UI mostrou como salvo, voltou online e palpite **estava realmente persistido no backend**.

**Hipóteses:**
1. Service Worker tem Background Sync configurado fora do `vite.config.ts` revisado → queue offline funciona "by design"
2. DevTools offline mode tem delay pra aplicar — request foi ANTES do toggle tomar efeito
3. Mutation `upsertPrediction` tem retry interno

**Como investigar:**
- F12 → Application → Service Workers → verificar se há registration com `sync` ou `BackgroundSync`
- F12 → Network durante teste — confirmar se request POST aparece como "(failed)" ou se foi enviado mesmo offline
- Se Background Sync: feature legítima, falta apenas indicador UI ("Salvando quando reconectar")
- Se timing/quirk: bug — user pode achar que salvou e fechar app sem confirmação

