<!-- Spec gerado pela squad (squad-artilheiro-dropdown) em 2026-06-07. -->

# Spec — Artilheiro da Copa por dropdown de jogadores (v1)

> Tech lead: consolidação das 4 perspectivas (PM, Dados/Backend, UX, QA). Ancorado no código real lido: `functions/src/shared/scoring.ts`, `backend/src/routes/specials.ts`, `backend/src/routes/admin.ts`, `backend/src/routes/groups.ts`, `scripts/seed-cosmos.ts`, `scripts/fixtures/groups-2026.json`.

## Contexto

O palpite especial de **artilheiro** é texto livre nos dois lados. O aluno digita num `<Input>` com `datalist` de sugestões (`frontend/src/pages/Especiais.tsx`); o admin digita livre no gabarito (`backend/src/routes/admin.ts` L486: `topScorer: z.string().min(2).max(80).trim()`). A pontuação (120 pts — 2º maior peso, atrás só de campeão=150) compara os dois por igualdade exata após `normalizeName` em `functions/src/shared/scoring.ts` L86-89:

```ts
topScorer:
  guess.topScorer && normalizeName(guess.topScorer) === normalizeName(actual.topScorer)
    ? 120 : 0,
```

`normalizeName` (L47-53) só remove acento/caixa/espaço-das-pontas. Logo "Vinicius Jr." ≠ "Vinicius Junior" ≠ "Vini Jr": o aluno acerta o jogador e leva **0** dos 120 pts. Injusto, gera disputa.

Por contraste, campeão/top4 já funcionam por **igualdade de código ISO** (`guess.champion === actual.champion`, scoring.ts L82-85), populados por `<select>` de 48 seleções derivadas de `GET /api/groups` (`backend/src/routes/groups.ts`). A feature alinha o artilheiro a esse mesmo padrão determinístico.

**Janela ideal:** produção foi restaurada limpa (0 palpites/0 especiais/0 gabarito). Sem migração de dados legados.

## Escopo v1 (in/out)

**In:**
1. Fixture novo `scripts/fixtures/players-2026.json` (catálogo curado, padrão `groups-2026.json`) + seed para container Cosmos novo `players` + endpoint público `GET /api/players`.
2. Componente único `PlayerCombobox` (busca, rótulo "Nome (Seleção)", bandeira) consumido pelos DOIS formulários — aluno (`Especiais.tsx`) e admin (`AdminResults.tsx` → `TournamentFinalSection`).
3. Backend valida `topScorer` como **id de jogador existente no catálogo** (substitui texto livre em `specials.ts` e `admin.ts`).
4. Scoring por igualdade exata de id (`scoring.ts`/`calc-specials.ts`).
5. Plano de curadoria/carga documentado e versionado.

**Out (v1):**
- Foto/avatar, posição, número de camisa do jogador.
- Auto-sync com API externa de elencos (carga é manual/curada via fixture+seed, igual groups/matches).
- Histórico/changelog de troca de jogador entre seleções.
- Multi-artilheiro / empate de chuteira de ouro (mantém 1 artilheiro).
- Virtualização da lista (só entra se navegação sem-busca virar requisito firme — ver UX).
- Migração de strings legadas (N/A: produção restaurada limpa).

## Dados de jogadores (modelo, fonte/curadoria, como servir)

Espelha **exatamente** o padrão `groups` (fixture JSON → seed → container Cosmos → endpoint GET público), já provado em produção.

### Valor canônico = `playerId` estável (decisão consensual)
`topScorer` deixa de ser nome e passa a ser **`playerId` = `"{iso}-{slug}"`** — ex.: `"br-vinicius-junior"`, `"fr-mbappe"`.
- `iso` reusa o código de seleção de `groups-2026.json` (`'br'`, `'gb-eng'`, `'gb-sct'`…), garantindo coerência de domínio e evitando colisão de homônimos entre seleções.
- `slug` derivado do nome via `normalizeName` + espaços→`-` (reaproveita a função existente como util de slug).
- **Decisão (id, não `"nome|iso"`):** o nome pode ser corrigido na curadoria sem invalidar palpites; o id é o contrato estável. O nome só existe para exibição, resolvido na UI — nunca participa do scoring.

### Fixture: `scripts/fixtures/players-2026.json`
Mesmo shape de `groups-2026.json` (`_meta` + array), agrupado por seleção (1 doc por seleção, espelhando `GroupDoc` que guarda `teams: NationRef[]`):

```json
{
  "_meta": { "source": "Squads oficiais FIFA Copa 2026", "verified": "...", "season": 2026, "totalNations": 48 },
  "nations": [
    { "iso": "br", "name": "Brasil", "players": [
        { "id": "br-vinicius-junior", "name": "Vinícius Júnior" },
        { "id": "br-rodrygo", "name": "Rodrygo" } ] }
  ]
}
```

- **`id` pré-computado no fixture** (não gerado em runtime), revisável no PR. Validador no seed garante: id único global, `iso` ∈ 48 seleções de `groups-2026.json`, e `id` começa com `{iso}-`.
- **Homônimos na mesma seleção** → sufixo desambiguador no slug (`-2` ou número de camisa). O validador rejeita id duplicado.

### Container Cosmos `players` (PK `/season`)
Adicionar em `infra/modules/cosmos.bicep` espelhando o bloco `containerGroups`. 48 docs `NationSquadDoc` (`id = ${season}_${iso}`, ex.: `2026_br`). Cabe no throughput compartilhado do free tier (mesmo perfil de `groups`).

### Endpoint `GET /api/players` (público)
`backend/src/routes/players.ts`, cópia quase literal de `groups.ts` (1 query `SELECT * WHERE c.season = @season`). Retorna catálogo achatado, pronto pro combobox, com label resolvido:

```
GET /api/players → { players: [{ id, name, iso, nation, label }], count }
// label = `${name} (${nation})` → "Vinícius Júnior (Brasil)"
```

Público (sem `requireAuth`, igual `groups`) porque é usado nos dois formulários e não é sensível. Frontend ganha `listPlayers()` em `bolao-api.ts` (espelha `listGroups`), consumido por **uma única query react-query `['players']`** nos dois formulários — fonte única garantida.

## Backend (valor canônico, scoring, validação, arquivos)

### Scoring (`functions/src/shared/scoring.ts`)
Trocar a comparação por igualdade exata de id, idêntica a champion/runnerUp:

```ts
topScorer: guess.topScorer && guess.topScorer === actual.topScorer ? 120 : 0,
```

- O guard `guess.topScorer &&` **permanece** (cobre palpite null e gabarito ainda vazio → 0).
- `normalizeName` **sai do scoring** mas **não é removida**: continua útil como util de slug na curadoria/seed. Marcar com comentário "não reintroduzir no scoring". O comentário S2.5 (L10-17) permanece válido.
- `functions/src/functions/calc-specials.ts` **não muda** — só repassa `tournament.value.topScorer` (agora um id) ao `calcSpecialsBase`. Change-feed intacto.

### Validação contra a lista (anti-lixo — server-side é BLOCKER de integridade)
Os schemas hoje aceitam texto livre. **Sem validação server-side, o dropdown é burlável via API** (POST cru com id forjado nunca pontua, mas suja os dados). Trocar nos dois:
- `backend/src/routes/specials.ts` L43-46 (`upsertBodySchema.topScorer`): id-ou-null com regex `^[a-z0-9-]+-[a-z0-9-]+$` **+** verificação de que o id existe no catálogo. Rejeita com 400 se não pertencer.
- `backend/src/routes/admin.ts` L486 (`putTournamentBodySchema.topScorer`): mesma troca. Crítico: id fora da lista no gabarito = ninguém pontua.
- Helper compartilhado `assertValidPlayerId(id)` lê os ids do container `players` (cache em memória aceitável — dataset estático).

### Seed (`scripts/seed-cosmos.ts`)
`seedPlayers()` espelhando `seedGroups()`: carrega `players-2026.json`, valida (48 seleções, ids únicos, `iso` ∈ groups, UTF-8 íntegro), faz `upsert` de 48 docs. Incluir `'players'` em `requiredContainers` (L83) e adicionar flag `--players-only` (L46-51) para recarregar curadoria sem deploy de código. Reseed idempotente por `id`.

### Migração
Zero. Deploy do Bicep (cria `players`) + `npm run seed -- --players-only`.

## Frontend (combobox nos 2 formulários)

**Decisão: NÃO usar `<select>` nativo.** Os campos campeão/top4 usam `<select>` com 48 `<option>`; isso não escala a ~1200 jogadores (sem busca textual real, roleta gigante no mobile). E `<datalist>` (o atual do aluno) continua texto livre por baixo → não resolve o bug. **Sai.**

**Decisão: instalar `cmdk` + `@radix-ui/react-popover`** (hoje só existem `@radix-ui/react-label` e `react-slot`; UI kit mínimo). Criar `command.tsx` e `popover.tsx` em `frontend/src/components/ui/`, e o componente de domínio **único**:

```
frontend/src/components/bolao/PlayerCombobox.tsx
```

Consumido pelos DOIS formulários (substitui o `<Input>`+`<datalist>` do aluno e o `<Input>` do admin). Mesma lista, mesma UX, mesmo valor canônico → é o que elimina o problema de match.

| | Antes | Depois |
|---|---|---|
| Aluno (`Especiais.tsx`) | `<Input>` texto + `datalist` 10 nomes | `<PlayerCombobox value={form.topScorer} onChange disabled={locked} />` |
| Admin (`AdminResults.tsx` `TournamentFinalSection`) | `<Input>` texto livre | **o mesmo** `<PlayerCombobox>` |

Ambos emitem o **mesmo id canônico**. Como a fonte é uma só (`['players']`), todo jogador que o admin escolhe no gabarito é garantidamente escolhível pelo aluno.

## UX

- **Item:** bandeira (`flagUrl(iso, 40)` de `flags.ts`, `h-5 w-7 rounded object-cover ring-1 ring-border` — mesmo padrão dos previews atuais) + nome `font-medium` + "(Seleção)" em `text-muted-foreground text-sm`. Ex.: "Vinícius Júnior **(Brasil)**".
- **Trigger fechado:** bandeira + "Nome (Seleção)" + chevron. Vazio → placeholder "Buscar jogador..." Espelha o preview-de-bandeira dos selects de seleção; o artilheiro deixa de ser o campo destoante.
- **Busca accent-insensitive por nome E por seleção:** indexar cada item por `searchText = normalize(nome) + ' ' + normalize(seleção)` (reusa a lógica de `normalizeName` só no filtro de exibição — nunca no valor). "vini", "vinícius", "brasil", "muller"→"Müller" convergem. Passar `value`/keywords customizados ao `cmdk` (não confiar no filtro default com texto acentuado).
- **Agrupamento por seleção:** `<CommandGroup heading="Brasil">`, seleções em ordem alfabética `localeCompare(…, 'pt-BR')` (mesma ordenação já usada nos forms), jogadores ordenados dentro. Grupos vazios somem ao filtrar.
- **Performance (decisão: digitar-para-listar, sem virtualização no v1):** renderizar a lista só após ≥1 caractere digitado (limite ~50 resultados visíveis); antes, estado-guia "Digite o nome do jogador ou a seleção". Cobre 95% dos casos sem nova dependência pesada. `@tanstack/react-virtual` só entra se navegação livre sem-busca virar requisito firme.
- **Mobile:** popover com largura do trigger, busca no topo com `inputMode="search"` e foco automático; em telas pequenas, render em painel `max-h-[60vh]` rolável. Alvos de toque `min-h-11` (~44px). `truncate` no nome.
- **Estados:** loading → trigger desabilitado + `Loader2 animate-spin` "Carregando jogadores..."; lista vazia → "Lista de jogadores indisponível" (**nunca** fallback de texto livre); sem-resultado → `<CommandEmpty>` "Nenhum jogador encontrado." (admin: "Confira a seleção ou o nome.", sem "criar mesmo assim"); erro → `getErrorMessage` + toast.
- **Lock (só aluno):** `disabled={locked}` replicado; quando travado, vira somente-leitura mostrando bandeira + "Nome (Seleção)" salvo (não botão apagado sem contexto). Admin não tem lock.

## Critérios de aceite (numerados)

1. **AC1 — Fonte única.** `GET /api/players` retorna `{ id, name, iso, nation, label }`; aluno e admin consomem o mesmo endpoint via a mesma query `['players']`.
2. **AC2 — Combobox aluno.** O campo "Artilheiro" em `Especiais.tsx` deixa de ser `<Input>`/`datalist` e vira combobox com busca; cada opção exibe "Nome do Jogador (Seleção)".
3. **AC3 — Combobox admin.** Em `AdminResults.tsx` (`TournamentFinalSection`), o artilheiro usa **o mesmo componente/lista**.
4. **AC4 — Valor canônico salvo.** `POST /api/specials` e `PUT /api/admin/config/tournament-final` persistem o **id** em `topScorer`. Backend **rejeita (400)** id inexistente no catálogo.
5. **AC5 — Match determinístico.** Em scoring, `specials.topScorer === tournamentFinal.topScorer` → 120; senão 0. Sem `normalizeName` no caminho do artilheiro.
6. **AC6 — Regressão de grafia resolvida.** Aluno e admin selecionam o mesmo item "Vinícius Júnior (Brasil)" → 120 (caso que hoje dava 0 se digitado "Vini Jr").
7. **AC7 — Hidratação.** Ao reabrir com palpite salvo, o combobox exibe o jogador escolhido (label resolvido do id, não o id cru), mantendo o `useEffect` de hidratação atual.
8. **AC8 — Gabarito sempre possível.** Admin registra qualquer jogador da lista; se o artilheiro real não estiver na lista, há caminho de curadoria (reseed/edição do fixture) que o disponibiliza antes de salvar — gabarito nunca fica bloqueado por ausência do nome.
9. **AC9 — Busca em escala.** Com a lista completa, digitar parte do nome **ou** da seleção filtra; UI não trava (>16ms/keystroke proibido) nem força rolagem da lista inteira.
10. **AC10 — Lock respeitado.** Combobox do aluno desabilitado quando `locked`; sem regressão no fluxo de lock (`getSpecialsLockState`).
11. **AC11 — Sem texto livre remanescente.** Nenhum caminho (aluno/admin) aceita string arbitrária; `putTournamentBodySchema.topScorer` e `upsertBodySchema.topScorer` validam contra o catálogo.

## Casos de borda

- **Artilheiro real fora do catálogo (ALTO/bloqueante de operação).** Admin não acha → gabarito não fecha → ninguém pontua. Mitigação: gabarito só é preenchido após a Copa; caminho de curadoria (reseed `--players-only`) disponibiliza o id antes de salvar. **Nunca** reabrir texto livre no lado do aluno. Lista do aluno deve estar completa **antes do `lockUtc`** dos especiais; a do admin deve conter o artilheiro real **antes de fechar o gabarito**.
- **Listas divergindo entre os dois lados (MÉDIO).** Hoje os dois forms derivam seleções da mesma `listGroups` independentemente. Garantir idêntico padrão: uma única query `['players']`. Teste de paridade: id escolhido pelo aluno existe byte-a-byte no conjunto do admin.
- **Homônimos em seleções diferentes** (dois "Luis Díaz", dois "Danilo") → ids distintos (iso embutido) → palpite num não pontua o outro; label "(Seleção)" distingue na UI.
- **Homônimos na mesma seleção** → slug com sufixo desambiguador; validador rejeita id duplicado.
- **Corte/substituição pós-cadastro.** Jogador cortado permanece no fixture e resolvível para exibição; palpite nele continua válido (só não será artilheiro → 0). **Não** apagar.
- **`topScorer` null** (não palpitou) → guard `guess.topScorer &&` → 0.
- **Gabarito ainda sem `topScorer`** quando o cálculo roda → nenhum aluno ganha 120 por id vazio (guard cobre; confirmar em teste).
- **Top4 não afetado.** `calcTop4Bonus` e a `refine` de seleções distintas permanecem; mudar artilheiro não altera campeão/top4.
- **Encoding.** Seed grava UTF-8 sem corromper acentos; slug do id é ASCII estável.

## Plano de teste

**Unit (Vitest — `scoring.ts`):**
1. ids iguais → 120; diferentes → 0.
2. Homônimos (nomes iguais, ids diferentes) → 0 (prova comparação por id).
3. `guess.topScorer = null` → 0.
4. `actual.topScorer` vazio + guess vazio → 0 (sem falso-positivo).
5. Regressão: alterar `topScorer` não muda champion/runnerUp/thirdPlace/fourthPlace nem `calcTop4Bonus`.
6. Grep por usos de `normalizeName` antes de removê-la do caminho do artilheiro.

**Validação backend:**
7. `PUT /api/admin/config/tournament-final` com id inexistente → 400; válido → 200 e persiste o id.
8. `POST /api/specials` com id inexistente → 400; null → aceita; válido → persiste.
9. `GET /api/players`: ~48 seleções, todas com ≥1 jogador, sem ids duplicados.
10. Seed: `players-2026.json` valida 48 seleções, ids únicos, UTF-8 íntegro (mesma régua de `loadGroups`).

**E2E (aluno + admin na MESMA lista):**
11. Aluno busca "vini", seleciona "Vinícius Júnior (Brasil)", salva; recarrega → label correto; payload envia **id**.
12. Admin seleciona o MESMO jogador no MESMO combobox, salva gabarito → cálculo dispara → aluno pontua 120 (**caso central**).
13. Jogadores diferentes → 0.
14. Homônimo: aluno "Luis Díaz (Colômbia)", admin "Luis Díaz (outra seleção)" → 0.
15. Lock ativo: combobox desabilitado; POST → 409, audit registra o id.
16. Teclado: navegar e selecionar só com teclado.
17. Performance: render do catálogo completo sem travar digitação.

## Plano de curadoria dos dados

**Conflito resolvido (PM vs. requisito do dono):** o pedido é "todos os jogadores das 48 seleções" (~1.200). Mas os squads de 26 só saem ~1–2 semanas antes da Copa. **Decisão: faseado** — entrega valor já, sem ficar refém do timing do anúncio (a lista completa não é blocker do *valor*; a lista *canônica nos dois lados* é).

- **v1 (MVP, travar primeiro):** lista curada de candidatos plausíveis a artilheiro (~5–12 por seleção das ~24 seleções fortes + estrelas conhecidas, ≈150–300 jogadores). Cobre >95% dos palpites e resultados plausíveis; curadoria barata e estável. Combobox já suporta a lista completa sem mudança.
- **v1.1 (atende literalmente o pedido):** elenco completo das 48 seleções, carregado quando os squads de 26 forem oficiais — fixture atualizado + reseed `--players-only`, **antes do `lockUtc`** dos especiais.

**Carga:**
1. Gerar `players-2026.json` (padrão `groups-2026.json`: `_meta` com `source`/`verified`/`season` + array por seleção, reusando `iso`/`name` das 48 seleções dos grupos).
2. Carga via `seedPlayers()` (espelha seed de groups) → container `players`.
3. Validação de completude no seed: toda seleção com ≥1 jogador (idealmente ≥23 quando completa), ids únicos, `iso` ∈ groups. Congelar a lista no momento do lock dos especiais.
4. Reseed idempotente por `id` → correções de grafia/cortes sem perder palpites (palpites guardam `id`, não posição).

**Decisão pendente do dono (não-bloqueante para começar):** confirmar o faseamento v1 (~150–300) → v1.1 (1.200+), em vez de segurar tudo até os 1.200 (arriscado pelo timing squads-vs-`lockUtc`).

## Arquivos a criar/editar

**Criar:**
- `scripts/fixtures/players-2026.json` — catálogo curado (padrão `groups-2026.json`). **BLOCKER de dados** (sem ele não há lista canônica).
- `backend/src/routes/players.ts` — `GET /api/players` (cópia de `groups.ts`).
- `frontend/src/components/ui/command.tsx` e `popover.tsx` — shadcn (`cmdk` + `@radix-ui/react-popover`).
- `frontend/src/components/bolao/PlayerCombobox.tsx` — componente único dos dois forms.

**Editar:**
- `infra/modules/cosmos.bicep` — container `players` (PK `/season`), espelhando `containerGroups`.
- `backend/src/types/domain.ts` — `PlayerRef`, `NationSquadDoc`; comentar que `TournamentFinalConfigDoc.value.topScorer` e `SpecialPredictionDoc.topScorer` são **id**, não nome.
- `functions/src/shared/types.ts` — espelhar tipos novos.
- `functions/src/shared/scoring.ts` — `topScorer` por `===` de id (L86-89); aposentar `normalizeName` do scoring (mantê-la como util de slug).
- `backend/src/routes/specials.ts` — `upsertBodySchema.topScorer` (L43-46) → id validado contra catálogo.
- `backend/src/routes/admin.ts` — `putTournamentBodySchema.topScorer` (L486) → id validado contra catálogo.
- `backend/src/app` (registro de rotas) — registrar `playersRouter`.
- `backend/src/services/cosmos.ts` — habilitar `container('players')` se a lista de containers for tipada.
- `scripts/seed-cosmos.ts` + `scripts/lib/cosmos-types.ts` — `seedPlayers()`, flag `--players-only`, `'players'` em `requiredContainers` (L83) e no union `ContainerId`.
- `frontend/src/lib/bolao-api.ts` — `listPlayers()` (espelha `listGroups`).
- `frontend/src/pages/Especiais.tsx` — substituir `<Input>`/`datalist` do artilheiro por `<PlayerCombobox>`.
- `frontend/src/pages/AdminResults.tsx` (`TournamentFinalSection`) — substituir `<Input>` do artilheiro pelo mesmo `<PlayerCombobox>`.
- `frontend/package.json` — `cmdk`, `@radix-ui/react-popover` (e `@tanstack/react-virtual` só se virtualização entrar).

**BLOCKERS de dados (resumo):** (1) `players-2026.json` curado existir — sem ele nada funciona; (2) container `players` provisionado via Bicep + seed rodado antes de reabrir palpites; (3) lista do aluno completa antes do `lockUtc`; (4) artilheiro real presente no catálogo antes de fechar o gabarito (caminho de reseed garante AC8).