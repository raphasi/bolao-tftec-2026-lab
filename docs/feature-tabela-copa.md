<!-- Spec gerado pela squad multiagente (squad-tabela-copa) em 2026-06-06. -->

# Tabela da Copa — Spec de Implementação (v1: classificação ao vivo da fase de grupos)

## Contexto

O Bolão TFTEC 2026 acompanha a Copa de 48 seleções (12 grupos A–L, mata-mata 16-avos→final). Hoje os participantes não têm uma visão consolidada de quem está se classificando: precisam abrir cada jogo e fazer a conta de pontos, saldo e melhores terceiros na cabeça.

Esta feature entrega uma página **pública** "Tabela da Copa" que exibe as **12 tabelas de grupo**, atualiza-se sozinha conforme os resultados entram no admin, e **sinaliza ao vivo** os classificados: 🟢 1º/2º (diretos), 🟡 melhor 3º (faixa de corte dinâmica entre os 12 grupos), ⚪ eliminado.

O motor de cálculo **já existe e é testado** em `backend/src/services/standings.ts` e **não é reimplementado** — apenas consumido por um novo endpoint:
- `computeGroupStandings(matches: MatchCacheDoc[]): GroupTable[]` — filtra `phase==='group'` (linha 141), descobre os times pelos próprios jogos, aplica desempates FIFA (pontos → saldo → gols pró → confronto direto → fallback alfabético), preenche `position` 1..4 e a flag `complete`.
- `rankBestThirds(tables, topN=8): ThirdPlaceEntry[]` — rankeia os terceiros existentes (mesmos critérios globais) e devolve os `topN` melhores com `.rank` e `.groupCode`.

A novidade é (a) expor isso via `GET /api/standings` (público, hoje inexistente — só há `/matches` e `/groups` em `backend/src/routes/index.ts`) e (b) uma página de visualização com auto-refresh por polling e sinalização de classificação. Idioma do produto: PT-BR.

**Fato de código load-bearing:** `isFinishedWithScore` (standings.ts:56) exige `status === 'finished' && homeScore != null && awayScore != null`. Jogos `'live'` ou `'scheduled'` **não entram na conta**, mesmo com placar parcial preenchido. Isto define todo o comportamento "ao vivo": os indicadores refletem apenas jogos `finished`.

## Escopo v1 (in / out)

**Dentro (in):**
1. `GET /api/standings` público (sem auth), registrado em `backend/src/routes/index.ts`, lendo todos os jogos `phase='group'` via `container('matchesCache')`, aplicando `computeGroupStandings` + `rankBestThirds(.., 8)` e derivando a flag de qualificação **no serializer do backend** (não no front).
2. Página pública "Tabela da Copa" (`/tabela`), rota em `App.tsx` e item no `navLinks` do `Navbar.tsx` (`protected: false`).
3. As 12 tabelas de grupo (A–L, ordenadas) com colunas **P V E D GP GC SG Pts**, ordem FIFA do motor.
4. Sinalização 🟢/🟡/⚪ por seleção, com a faixa de melhores-terceiros **dinâmica e global**, mais o estado **provisório** (grupo incompleto) sem badge definitivo.
5. Auto-refresh por polling (padrão `AdminOps.tsx`: `useQuery` + `refetchInterval`, pausa em aba oculta), com indicador "atualizado há Xs".
6. Bandeiras (`flagUrl`) + nomes PT-BR, estados loading/erro/vazio, responsivo mobile-first, legenda.
7. Painel "Disputa dos 8 melhores 3º" (lista global ordenada com linha de corte).

**Fora (out) — explicitamente NÃO entra:**
1. **Chaveamento / mata-mata ao vivo** (bracket 16-avos→final). Extensão futura.
2. **Palpites na página** — é só leitura; não chama `predictions`/`specials`/`admin`. Palpites seguem em `/palpites`.
3. **Histórico / evolução temporal** da classificação.
4. **Tempo real via SignalR** — v1 usa polling (justificativa abaixo).
5. **Pontuação/efeito no bolão** — a página é puramente informativa.
6. **Filtros avançados** (confederação, busca) e detalhe expandido de confronto direto.

**Por que polling e não SignalR (resolvendo conflito Arquitetura×Leaderboard):** o `signalRNegotiate` (`bolao-api.ts`) é **autenticado** (Bearer), e esta página é pública para deslogados — exigir token seria atrito e nova superfície de auth. Standings é um agregado derivado idempotente sobre ~72 docs, não um stream de eventos por usuário; resultados entram em minutos, não em milissegundos. Polling 10s (padrão já consolidado no `AdminOps`) é folgado, resiliente a offline (PWA) e zero infra nova.

## Modelo de dados e endpoint (`GET /api/standings`)

### Comportamento
1. Query cross-partition filtrando `phase='group'` (reduz RU/payload e blinda contra vazamento de mata-mata):
   ```ts
   const { resources } = await container('matchesCache').items
     .query<MatchCacheDoc>({ query: 'SELECT * FROM c WHERE c.phase = @p', parameters: [{ name: '@p', value: 'group' }] })
     .fetchAll();
   const tables = computeGroupStandings(resources);   // já ordena A→L
   const bestThirds = rankBestThirds(tables, 8);
   ```
2. **Derivação da qualificação no serializer** (decisão: no backend, não na UI — o 🟡 depende do `bestThirds` global, então é natural calcular uma vez no backend e ter teste unitário determinístico). Set de corte por grupo: `new Set(bestThirds.map(t => t.groupCode))` (cada grupo tem no máx. um 3º). Para cada linha:
   - `played === 0` em **todas** as linhas do grupo (nenhum jogo finalizado) → `qualification: 'undecided'` (suprime 🟢/🟡/⚪ na UI — evita falso "classificado" pelo fallback alfabético com tudo zerado).
   - senão `position <= 2` → `'direct'` (🟢)
   - senão `position === 3` e grupo no set de corte → `'best-third'` (🟡), com `thirdRank`
   - senão → `'eliminated'` (⚪)
   - `provisional: true` enquanto `!allComplete` (a faixa de 3º ainda pode mudar). A UI usa isto para hachurar/legendar "provisório" sem mudar a API.
3. Resposta nunca 500 em dados vazios: `computeGroupStandings([])` → `[]`, responder **200** com `groups: []`.
4. `Cache-Control: public, max-age=10` para alinhar ao polling.

### Shape do JSON
```ts
type Qualification = 'direct' | 'best-third' | 'eliminated' | 'undecided';

interface StandingRowPublic {
  team: NationRef;          // { iso, name } — iso pode ser '' (fallback flag)
  position: number;         // 1..4
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
  qualification: Qualification;
  thirdRank?: number;       // presente só quando qualification === 'best-third'
  provisional: boolean;     // true enquanto a fase de grupos não está toda completa
}

interface GroupStandingPublic {
  groupCode: string;        // 'A'..'L'
  complete: boolean;        // GroupTable.complete
  playedCount: number;      // jogos finalizados no grupo (p/ badge "N/6")
  totalCount: number;       // jogos cadastrados no grupo (normalmente 6)
  rows: StandingRowPublic[];
}

interface StandingsResponse {
  groups: GroupStandingPublic[];   // 12, ordenados A→L
  bestThirds: { groupCode: string; team: NationRef; rank: number; points: number; goalDiff: number; goalsFor: number }[];
  cutoffRank: number;              // 8 (fixo v1) — usado no painel de corte
  allComplete: boolean;            // groups.length>0 && groups.every(g => g.complete)
  computedAt: string;              // ISO — "atualizado há Xs"
}
```
> `playedCount`/`totalCount` vêm do serializer derivando dos próprios docs do grupo (não há contagem no `GroupTable`); resolve o ponto levantado pela UX de evitar `rows.reduce(...)/2` no front.

### Registro
Em `backend/src/routes/index.ts`: `import { standingsRouter } from './standings.js';` + `router.use('/standings', standingsRouter);` — ao lado de `/matches` e `/groups`, sem auth. Validação opcional `?groupCode` reusa o schema Zod `^[A-L]$/i` de `matches.ts`.

## Frontend (página, nav, atualização ao vivo)

**Rota** (`frontend/src/App.tsx`): `const TabelaCopa = lazy(() => import('@/pages/TabelaCopa'))` + `<Route path="/tabela" element={<TabelaCopa />} />` — **pública**, fora de `ProtectedRoute` (igual a `/leaderboard`, `/regras`).

**Nav** (`frontend/src/components/layout/Navbar.tsx`): novo item em `navLinks`, posicionado **antes** de `/leaderboard` (fluxo "resultados da Copa → ranking do bolão"):
```ts
{ to: '/tabela', label: 'Tabela da Copa', icon: LayoutGrid, protected: false },
```
Por ser `protected: false`, o filtro existente já o mostra a deslogados. **Dependência conhecida:** o `Navbar` só renderiza a nav em `md:flex` (não há menu mobile/hamburguer). Para alcançabilidade no celular, v1 adiciona um Card/botão de destaque no `Home` (`frontend/src/pages/Home.tsx`) apontando para `/tabela`, até existir um drawer mobile.

**Cliente API** (`frontend/src/lib/bolao-api.ts`), no padrão de `getLeaderboard`/`listGroups`:
```ts
export async function getStandings(): Promise<StandingsResponse> {
  const { data } = await api.get<StandingsResponse>('/standings');
  return data;
}
```

**Tipos** (`frontend/src/lib/types-domain.ts`): espelhar 1:1 `Qualification`, `StandingRowPublic`, `GroupStandingPublic`, `StandingsResponse` (padrão do arquivo, que já espelha DTOs públicos).

**Auto-refresh** (extrair `useDocumentVisible` de `AdminOps.tsx` para `frontend/src/hooks/useDocumentVisible.ts` e importar nos dois lugares, evitando duplicação; idem `formatRelative` para um util compartilhado):
```ts
const REFRESH_MS = 10_000;
const query = useQuery({
  queryKey: ['standings'],
  queryFn: getStandings,
  refetchInterval: (data) => (!visible || data?.allComplete ? false : REFRESH_MS),
  refetchIntervalInBackground: false,
  placeholderData: keepPreviousData, // mantém tabela em tela durante refetch/erro
});
```
> Ajuste fino: quando `allComplete === true` (fase de grupos encerrada), o polling para — nada mais muda. (Resolvido alinhando o 10s do `AdminOps`/Arquitetura com a folga sugerida pela UX; 10s é o padrão já consolidado no repo.)

**Header** no espírito do `AdminOps`: pílula de ícone + título `font-display text-3xl md:text-4xl` "**Tabela da Copa**", subtítulo "**Classificação ao vivo · fase de grupos**", `LiveIndicator` (`Zap`: emerald live / amber `animate-pulse` sync / muted pausado) e texto "Atualizado {formatRelative(computedAt)} · refresh 10s · (pausado — aba oculta)".

## UX e sinalização de classificados

**Grid das 12 tabelas:** `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` (3×4 desktop, 1 coluna mobile). Reusa `Card`/`CardContent` de `@/components/ui/card`.

**Header do card:** "**Grupo A**" (`font-display font-bold`) + selo de estado à direita:
- 🟢 **"Encerrado"** quando `complete === true` (badge esmeralda).
- 🟡 **"Em andamento · N/6"** quando incompleto, usando `playedCount`/`totalCount`.
- ⚪ **"Aguardando jogos"** quando `playedCount === 0`.

**Colunas (linha):** Pos (dot colorido + `position`) · Bandeira+Seleção (`flagUrl(row.team.iso, 40)` no estilo `h-4 w-6 rounded-sm ring-1 ring-border/40` do footer em `Layout.tsx`; nome truncado) · **P V E D GP GC** · **SG** (com sinal: `+3`/`0`/`-2`) · **Pts** (única em negrito, `tabular-nums`). Todos os números `tabular-nums`. Em **mobile** colapsa para **Pos · Time · P · SG · Pts** (5 colunas), com P/V/E/D/GP/GC acessíveis via toggle "detalhes" no card — sem scroll horizontal quebrado.

**Sinalização (derivada do `qualification` do backend; o front não recalcula tiebreak):**
- 🟢 **`direct`** (1º/2º): `border-l-2 border-emerald-500`, `bg-emerald-500/5`, dot verde. Tooltip "Classificado às oitavas (1º/2º do grupo)".
- 🟡 **`best-third`**: `border-l-2 border-amber-500`, `bg-amber-500/5`, dot âmbar, badge `3º · #{thirdRank}`. Tooltip "3º colocado — entre os 8 melhores (atual: Nº {thirdRank})". Quando `provisional`, hachurar levemente + tooltip acrescenta "posição provisória, pode mudar".
- ⚪ **`eliminated`**: `text-muted-foreground`/`opacity-70`, dot cinza, sem realce. Tooltip "Fora da zona de classificação".
- **`undecided`** (grupo sem jogo finalizado): linhas neutras, **sem cor de classificação**, badge "Aguardando jogos". Crítico: não pintar 🟢/🟡 com tudo zerado (a ordem é só o fallback alfabético do motor).

**Acessibilidade:** cor nunca isolada — sempre cor + dot/ícone + texto; linhas verdes/amarelas com `aria-label` descritivo. **Legenda fixa** (chips) abaixo do header: `🟢 1º e 2º (classificados) · 🟡 melhor 3º (8 vagas) · ⚪ eliminado`, mais a ordem dos critérios "(pontos → saldo → gols pró → confronto direto)".

**Painel "Disputa dos 8 melhores 3º"** (Card largura total abaixo do grid): lista os terceiros de `bestThirds` (e, opcionalmente, todos os 12 chamando o motor com `topN=12` no backend — ou o front lista os 8 + nota), ordenados, com **linha tracejada de corte âmbar entre 8º e 9º** (metáfora `strokeDasharray="2 2"` do `Sparkline`/`alarmY` do `AdminOps`). Acima = 🟡, abaixo = ⚪. Título acompanhado de "A faixa de corte é recalculada a cada resultado" e, enquanto `!allComplete`, badge "parcial — pode mudar". Quando um refetch reordena, `transition-all` + flash sutil (`animate-pulse` ~1s) na linha que cruzou a corte.

**Estados:** loading inicial = `Loader2 animate-spin` central (como `AdminOps`/`PageLoader`), opcional 12 skeletons. Erro = Card `border-destructive/40 bg-destructive/5` com `getErrorMessage(query.error)`, mantendo últimos dados em tela (`keepPreviousData`). Vazio (`groups.length === 0`) = estado amigável "As tabelas aparecem aqui quando os jogos da fase de grupos forem cadastrados." Bandeira com fallback/placeholder quando `iso === ''` (sem 404 ruidoso no console).

## Critérios de aceite (numerados)

1. **Acesso público:** usuário deslogado abre `/tabela` e vê conteúdo; aparece no menu sem login (como `/leaderboard`, `/regras`). Navegar sem token → 200.
2. **12 grupos:** renderiza exatamente 12 tabelas A–L em ordem, cada uma com até 4 seleções.
3. **Colunas:** cada tabela exibe **P V E D GP GC SG Pts** (PT-BR) + nome+bandeira, com `SG = GP − GC` e `Pts = 3V + 1E`, idênticos a `applyResult`.
4. **Ordem FIFA:** ordem das linhas == `position` de `computeGroupStandings`.
5. **🟢 direto:** `position` 1 e 2 aparecem como `direct`.
6. **🟡 melhor 3º:** `position === 3` é `best-third` **se e somente se** o `groupCode` está nos 8 de `rankBestThirds(tables, 8)`; senão `eliminated`. UI bate com o `qualification` do backend.
7. **⚪ eliminado:** `position === 4` aparece como `eliminated`.
8. **Faixa dinâmica:** lançar resultado que altere o ranking global dos 3º recalcula 🟡/⚪ de **outros** grupos no próximo refresh, sem reload manual.
9. **Auto-refresh:** com aba visível, refaz a consulta a cada ~10s e reflete novos resultados sem refresh manual.
10. **Pausa em aba oculta:** com `document.hidden`, o polling pausa (`refetchInterval: false` / `refetchIntervalInBackground: false`) e retoma ao voltar.
11. **Indicador de atualização:** mostra "atualizado há Xs" via `formatRelative(computedAt)`.
12. **Estado provisório/undecided:** grupo sem jogo finalizado é rotulado "Aguardando jogos" e **não** mostra badges 🟢/🟡/⚪; enquanto `!allComplete`, linhas `best-third` são marcadas provisórias.
13. **Estado completo:** `complete === true` → grupo sinalizado "Encerrado".
14. **Bandeiras + PT-BR:** cada seleção tem `flagUrl(iso)` (com placeholder se `iso===''`) e nome PT-BR; todos os textos em PT-BR.
15. **Legenda:** visível, explicando 🟢/🟡/⚪ e a ordem dos critérios de desempate.
16. **Loading/erro/vazio:** estados explícitos (spinner, mensagem via `getErrorMessage`, vazio amigável).
17. **Somente leitura:** nenhuma chamada de escrita nem a `predictions`/`specials`/`admin`; apenas `GET /api/standings` (e opcional `GET /api/groups`).
18. **Sem mata-mata:** nenhum bracket nem jogos `round-of-32`..`final`; o payload do endpoint também não vaza mata-mata.
19. **Sem recálculo no front:** ausência de lógica de tiebreak/qualificação no front — consome `qualification` do backend.
20. **Responsivo:** em ~375px as tabelas são legíveis sem overflow quebrado, com P/V/E/D/GP/GC acessíveis via toggle.
21. **Live não conta:** jogo `status:'live'` com placar parcial não move posições nem acende indicadores (reflete `isFinishedWithScore`).
22. **Vazio → 200:** Cosmos sem jogos `group` retorna `{ groups: [], bestThirds: [], allComplete: false }`, nunca 500.

## Casos de borda

1. **Cosmos vazio:** `computeGroupStandings([])` → `[]`; endpoint 200 com listas vazias; UI mostra estado vazio (não spinner infinito, não 12 cards fantasma).
2. **Grupo sem jogo finalizado (tudo `scheduled`):** tabela existe (times descobertos pelos jogos), tudo zerado; posições 1..4 vêm do fallback alfabético. **Suprimir 🟢/🟡/⚪** → `qualification: 'undecided'`.
3. **Jogo `'live'` com placar parcial:** `isFinishedWithScore` retorna `false` por causa do `status` → placar ignorado, posições não mudam. Teste de regressão fixando este comportamento.
4. **Empate total entre 3º:** `rankBestThirds` desempata por pontos→saldo→gols pró→**nome** (não é critério FIFA real, é fallback determinístico). 12 terceiros idênticos → `bestThirds.length === 8`, ordem alfabética estável. Marcar a bolha do corte como provisória; não afirmar "classificado" com certeza enquanto `!allComplete`.
5. **Faixa de corte mudando ao terminar grupos (o caso mais perigoso):** `rankBestThirds` inclui 3º de grupos incompletos; novos resultados podem flippar 🟡↔⚪ entre refreshes — **correto** para ao vivo. Mitigação: campo `provisional` + legenda; só travar definitivo com `allComplete`. Sort estável (por nome) garante ausência de flicker por instabilidade.
6. **Mata-mata não afeta grupos:** `computeGroupStandings` filtra `phase==='group'`; a query do endpoint também filtra `c.phase='group'`. Blindagem dupla; o payload não vaza mata-mata.
7. **`groupCode` fora de A–L / placeholder semeado errado:** o serializer deve descartar/validar grupos fora de `^[A-L]$` antes de devolver (ou ao menos não quebrar); `?groupCode` reusa o schema Zod de `matches.ts`.
8. **Bandeira ausente:** `homeFlag?`/`awayFlag?` opcionais; `nationOf` cai para `iso:''`. UI usa placeholder de bandeira sem layout quebrado nem 404 no console.
9. **Fuso:** o cálculo de standings não usa horário (só `status`) — sem bug de fuso na classificação. "Atualizado há Xs" usa relativo (`formatRelative`); qualquer horário exibido usa fuso do navegador, nunca UTC cru.
10. **0×0 / saldo e gols zerados:** ordenação correta e UI mostra `0` (não vazio/`–`) em todas as colunas.
11. **Latência de refresh:** sinal pode levar até ~1 ciclo (10s) para mudar após o admin lançar resultado — aceitável, documentado; polling pausa em aba oculta para não martelar o endpoint.

## Plano de teste

**Unit do motor — regressão de blindagem** (`backend/src/services/standings.test.ts`, reusando helper `mkMatch`; o motor já é coberto, aqui fixamos os edge cases): (a) `status:'live'` com placar parcial não conta; (b) docs de mata-mata não afetam tabelas nem `bestThirds`; (c) 12 terceiros idênticos → `bestThirds.length===8` em ordem alfabética; (d) transição de corte: lançar último jogo flippa um 🟡↔⚪; (e) grupo todo `scheduled` → tabela existe, `complete:false`, `played:0`; (f) idempotência: reprocessar mesmos matches dá o mesmo corte.

**Unit do endpoint + serializer (maior valor de QA)** (`backend/src/routes/__tests__/standings.test.ts`, mockando `container('matchesCache').items.query(...).fetchAll()` no padrão das rotas): (a) Cosmos vazio → 200 `{ groups:[], bestThirds:[] }`; (b) shape do DTO completo por linha + `qualification` correto (🟢=pos 1-2; 🟡=3º no corte; ⚪=resto; `undecided`=grupo zerado) e `provisional`; (c) `playedCount`/`totalCount` corretos; (d) grupos ordenados A→L; (e) mata-mata no container não vaza; (f) `?groupCode` inválido → 400 via Zod.

**E2E / integração (frontend):** (a) `refetchInterval` reflete novo resultado em ≤1 ciclo (mock mudando entre fetches); (b) loading/erro/vazio renderizam em PT-BR; (c) legenda acessível (não só cor); (d) pausa de refresh em aba oculta; (e) placeholder de bandeira com `iso===''`; (f) fumaça de navegação pública (rota em `App.tsx` + item de menu) sem auth.

**Manual / smoke em staging (roteiro do dono):** 1) container vazio → estado vazio. 2) semear 72 jogos `scheduled` → 12 tabelas, **zero** badges de classificação. 3) marcar 1 `live` → tabela não muda. 4) finalizar 1 grupo → 🟢🟢 no topo, `complete:true`, 🟡 provisório nos 3º. 5) finalizar grupos restantes → ver a faixa de corte dos 8 terceiros mexendo até estabilizar com `allComplete`. 6) lançar mata-mata → tabelas de grupo inalteradas.

## Arquivos a criar/editar

**Backend**
- **CRIAR** `backend/src/routes/standings.ts` — rota: query `phase='group'`, chama o motor, deriva `qualification`/`thirdRank`/`provisional`/`playedCount`, serializa o DTO, `Cache-Control`.
- **EDITAR** `backend/src/routes/index.ts` — importar e registrar `router.use('/standings', standingsRouter)`.
- **EDITAR (opcional)** `backend/src/types/domain.ts` — exportar DTOs públicos `Qualification`/`StandingRowPublic`/`GroupStandingPublic`/`StandingsResponse`.
- **CRIAR** `backend/src/routes/__tests__/standings.test.ts` — testa derivação de `qualification`, corte dos 8, vazio→200, ordem A→L, não-vazamento de mata-mata.
- **EDITAR** `backend/src/services/standings.test.ts` — adicionar testes de regressão de blindagem (live/mata-mata/transição de corte).
- **NÃO TOCAR** `backend/src/services/standings.ts` (motor reusado tal-qual).

**Frontend**
- **CRIAR** `frontend/src/pages/TabelaCopa.tsx` — página.
- **CRIAR** `frontend/src/hooks/useDocumentVisible.ts` — extrair de `AdminOps.tsx` (importado nos dois lugares).
- **EDITAR** `frontend/src/lib/bolao-api.ts` — `getStandings()`.
- **EDITAR** `frontend/src/lib/types-domain.ts` — tipos espelho dos DTOs.
- **EDITAR** `frontend/src/App.tsx` — lazy import + `<Route path="/tabela">` pública.
- **EDITAR** `frontend/src/components/layout/Navbar.tsx` — item de nav público (`LayoutGrid`, antes de `/leaderboard`).
- **EDITAR** `frontend/src/pages/Home.tsx` — Card/atalho para `/tabela` (alcançabilidade mobile, dado que o Navbar é `md:flex`-only).
- **CRIAR (recomendado)** `frontend/src/pages/AdminOps.tsx` → extrair `formatRelative` para um util compartilhado (ex.: `frontend/src/lib/format.ts`) e reimportar, evitando duplicação.