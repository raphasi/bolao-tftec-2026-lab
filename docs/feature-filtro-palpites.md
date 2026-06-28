<!-- Spec gerado pela squad (squad-filtro-palpites) em 2026-06-06. -->

# Spec — Filtro "Jogos que não palpitei" + rename/reorder dos chips (Tela de Palpites)

> Bolão TFTEC 2026 · SPA React (Vite, TS, react-query, tailwind, shadcn) · **só frontend, 1 deploy** · PT-BR
> Arquivos âncora: `frontend/src/pages/Palpites.tsx`, `frontend/src/components/bolao/MatchCard.tsx`, `frontend/src/components/bolao/LockedBadge.tsx`, `frontend/src/lib/types-domain.ts`, `docs/backlog-palpites.md` §4.

## Contexto

A tela de Palpites (`Palpites.tsx`) lista os jogos do bolão como `MatchCard`s, agrupados por seção (grupos A–L e fases de mata-mata). O usuário filtra por chips em 3 linhas: **Linha 1 = status** (`Palpites.tsx:200-213`), **Linha 2 = grupos A–L** (`216-221`), **Linha 3 = mata-mata** (`225-238`). O estado é um único `filter: SectionFilter` (string, `:44,57`), e cada predicado vive no `useMemo` `filteredMatches` (`:125-138`).

Hoje o chip **"Sem palpite"** (`filter === 'pending'`) já filtra por `!has(matchId) && !m.locked && m.predictionsOpen !== false` (`:127-130`) — ou seja, **só jogos abertos sem palpite**. Consequência: os jogos **já travados sem palpite ficam invisíveis** em qualquer chip de status, e o usuário não vê o que perdeu. Esta feature preenche essa lacuna com um novo chip read-only e renomeia o `pending` para refletir sua semântica real (que já é "pendentes acionáveis").

Fonte de verdade da trava: `MatchPublic.locked: boolean` vindo do backend (`types-domain.ts:33`), persistido no kickoff−30min. Atenção: o `LockedBadge` calcula um countdown **local** (`kickoff−30`, `LockedBadge.tsx:16,31`) só para exibição — os filtros usam exclusivamente `m.locked` do servidor.

## Escopo

### Dentro (in)
- Novo chip **"Jogos que não palpitei"** (`filter === 'missed'`), read-only, agrupado por seção (reusa o ramo `filter !== 'upcoming'`).
- Rename do rótulo do chip `pending`: **"Sem palpite" → "Palpites pendentes"** (chave `'pending'` e lógica inalteradas).
- Reordenação da Linha 1 para: `Todos · Meus palpites · Jogos que não palpitei · Palpites pendentes · Próximos jogos`.
- Empty state próprio para `missed` + atualização do texto de `pending`.
- `readonly` explícito nos `MatchCard` do ramo `missed`.

### Fora (out)
- Qualquer mudança de backend, DTO (`types-domain.ts`) ou cálculo de pontos.
- Comportamento dos chips de grupo (A–L), fase (mata-mata) ou "Próximos jogos".
- Regra de lock/abertura de fase.
- Edição/criação de palpite em jogos travados.
- Contador numérico nos chips (não pedido → não adicionar; evita superfície de bug).
- Correção do denominador do header `/totalMatches` (pré-existente; só sinalizar).

## Mudanças no `Palpites.tsx`

Todas as edições são neste arquivo. Nenhum componente novo.

### 1. Predicados de cada filtro (`useMemo filteredMatches`, `:125-138`)

Adicionar o ramo `'missed'` antes do fallback. O ramo `'pending'` **permanece byte-a-byte idêntico**.

```ts
if (filter === 'missed')
  // Travado E sem palpite = "perdi a janela". predictionsOpen===false NUNCA
  // vira locked (fase não abriu, não fechou) → mata-mata não-aberto sai daqui.
  return matches.filter(
    (m) => m.locked === true && !predictionsByMatchId.has(m.matchId),
  );
```

**Resolução do conflito Frontend × QA (guarda `predictionsOpen !== false`):** **NÃO adicionar** a guarda explícita em `missed`. Justificativa: `predictionsOpen === false` significa "fase não abriu" e nesse estado `locked === false` por construção (a trava é por kickoff−30, vide `lockedPhases` em `:148-152` e `sections.locked` em `:169`, ambos derivando "bloqueada" de `predictionsOpen===false` **sem** tocar em `locked`); logo `m.locked === true` já exclui esses jogos e a guarda seria morta. **Porém**, para blindar contra o payload-teórico `locked=true + predictionsOpen=false` levantado pela QA (R3), a proteção real e barata é no **agrupamento**, não no predicado — ver item 5. Mantém o predicado limpo e o critério de aceite garantido por construção verificável (CA13/B5 abaixo).

**Por que a não-sobreposição é matemática (CA12/R3):** `pending` exige `!m.locked`; `missed` exige `m.locked === true`. Sendo `m.locked` booleano, os conjuntos são **disjuntos por construção** — desde que ambos usem **a mesma flag `m.locked`** (não o countdown local do badge). Esta é a invariante inegociável.

### 2. Estado (`filter`)

Nenhuma mudança estrutural. `SectionFilter = string` (`:44`) já aceita `'missed'` sem alterar tipo. O valor `'pending'` **não muda** — só o rótulo. (Opcional, fora do escopo mínimo: endurecer para union `'all'|'mine'|'missed'|'pending'|'upcoming'|string`.)

### 3. Ordem dos chips (Linha 1, `:200-213`)

```tsx
<FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</FilterChip>
<FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>Meus palpites</FilterChip>
<FilterChip active={filter === 'missed'} onClick={() => setFilter('missed')}>Jogos que não palpitei</FilterChip>
<FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>Palpites pendentes</FilterChip>
<FilterChip active={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>Próximos jogos</FilterChip>
```

Mudanças concretas: `mine` sobe (2º); novo `missed` (3º); `pending` desce (4º) e troca rótulo "Sem palpite" → "Palpites pendentes". Linhas 2 e 3 inalteradas. Layout: `flex flex-wrap gap-2` já quebra no mobile; o chip `missed` usa o **estilo padrão** (`bg-secondary`/`bg-brand-purple`), **nunca** o `locked` dourado (`:392-394`), que é reservado a fases de mata-mata não-abertas.

### 4. `readonly` nos `MatchCard` do ramo `missed` (lista agrupada, `:352-361`)

```tsx
<MatchCard
  key={m.matchId}
  match={m}
  prediction={predictionsByMatchId.get(m.matchId)}
  readonly={filter === 'missed'}
  onSave={(home, away) =>
    saveMutation.mutate({ matchId: m.matchId, predictedHome: home, predictedAway: away })
  }
  isSaving={savingMatchIds.has(m.matchId)}
/>
```

Defesa em profundidade: por construção todo `m` em `missed` tem `locked===true` (já gera `disabled` e some o botão Salvar), mas `readonly` torna a intenção explícita e blinda contra um payload com `locked` momentaneamente inconsistente no polling de 30s.

### 5. Empty state + blindagem do agrupamento (`:272-289` e `:331-349`)

Adicionar o ramo `missed` no ternário de empty (item em UX abaixo). E, como blindagem do R3 da QA sem poluir o predicado: no ramo `missed`, garantir que seções marcadas `section.locked` (`:320,331`) **não** rendereizem cards. Como `sections.locked` deriva de `predictionsOpen===false` (`:169`), o banner dourado já as suprime — e como esses jogos não deveriam estar em `missed`, a combinação predicado-limpo + supressão-de-seção-locked cobre o caso-borda teórico **sem código defensivo extra**. Validar via teste B5.

## UX

### Rótulos e ordem (narrativa esquerda→direita)
`Todos` (visão geral) → `Meus palpites` (o que fiz) → `Jogos que não palpitei` (o que perdi, histórico) → `Palpites pendentes` (o que falta, acionável) → `Próximos jogos` (urgência).

### Read-only (`missed`)
Todos os cards são `locked===true`: card `opacity-70` (`MatchCard.tsx:86`), inputs `disabled` (`:52,135,148`), **sem** botão "Salvar palpite" (`:179`), badge **"Palpite finalizado"** vermelho (`LockedBadge.tsx:51-63`). Passar `readonly` reforça. Nenhum caminho de edição parte deste filtro.

### Card sem palpite — risco de "0 × 0" falso (R2)
Como jogos em `missed` **nunca** têm `prediction`, o `MatchCard` pré-preenche `"0 × 0"` desabilitado (`MatchCard.tsx:40-41`), que pode ler como "palpitou 0–0" — contraria a transparência pretendida. **Decisão:** tratar como melhoria recomendada **opcional** no `MatchCard`: quando `readonly && prediction === undefined`, exibir um selo neutro **"Sem palpite registrado"** (ou `— × —`) no lugar dos inputs. Reusa o slot do placar, não muda a assinatura de props. Se não couber neste deploy, o chip ainda cumpre a regra; sinalizar ao dono para validar. (Conflito Frontend "0×0 é aceitável" × QA/UX "engana": resolvido como opcional-recomendado, não bloqueante.)

### Contadores / header
Header `{totalPredictions}/{totalMatches} jogos palpitados` (`:191-194`) **permanece** como default. Recomendado (opcional): tornar o subtítulo função de `filter` — `missed` → "X jogos fechados sem palpite", `pending` → "X jogos abertos esperando seu palpite", usando `filteredMatches.length` (sem query nova). **Sem badge numérico nos chips.** Não corrigir o denominador (inclui mata-mata; pré-existente).

### Estados vazios (`:272-289`, ramo offline tem prioridade — não tocar)
| Filtro | Mensagem |
|---|---|
| `missed` | **"Você não perdeu nenhum jogo — palpitou em tudo que fechou. 🎉"** (novo ramo) |
| `pending` | **"Você palpitou em todos os jogos em aberto. 🎉"** (atualizar de "…disponíveis", pois agora = só abertos) |
| `mine` | "Você ainda não palpitou em nenhum jogo." (manter) |
| `upcoming` | "Nenhum jogo próximo em aberto." (manter) |

## Critérios de aceite

**Chip "Jogos que não palpitei" (`missed`)**
1. Existe chip rotulado exatamente **"Jogos que não palpitei"** que ativa `filter === 'missed'`.
2. Com `missed` ativo, a lista contém **exatamente** os jogos com `m.locked === true` **e** sem palpite (`!predictionsByMatchId.has`). Dado {travado-sem-palpite, travado-com-palpite, aberto-sem-palpite, mata-mata-não-aberto} → só o **primeiro** aparece.
3. Em `missed`, nenhum jogo aberto (`!m.locked`) aparece.
4. Em `missed`, nenhum jogo já palpitado aparece (mesmo travado).
5. Cards de `missed` são read-only: inputs desabilitados, sem botão "Salvar palpite", badge "Palpite finalizado". Nenhuma interação cria/edita palpite.
6. Empty state de `missed` exibe **"Você não perdeu nenhum jogo — palpitou em tudo que fechou. 🎉"**.

**Chip "Palpites pendentes" (rename de `pending`)**
7. O chip antes "Sem palpite" exibe **"Palpites pendentes"**, mantendo `filter === 'pending'`.
8. Com `pending` ativo, a lista = **exatamente** `!m.locked && m.predictionsOpen !== false && !has(matchId)`. Nenhum travado aparece.
9. Cards de `pending` permanecem editáveis e salvam via mutação existente.
10. Empty state de `pending` exibe **"Você palpitou em todos os jogos em aberto. 🎉"**.

**Ordem e disjunção**
11. Linha 1 na ordem: **Todos · Meus palpites · Jogos que não palpitei · Palpites pendentes · Próximos jogos**.
12. Para qualquer dataset, **nenhum** jogo aparece em `missed` e `pending` simultaneamente (disjunção por `m.locked` booleano).
13. Para qualquer dataset de jogos de grupo liberados (`predictionsOpen !== false`): `pending ⊎ missed ⊎ mine` = esse conjunto, dois-a-dois disjuntos.

**Mata-mata não aberto**
14. Jogo com `predictionsOpen === false` **não** aparece em `missed` nem em `pending`. Em `missed`, fases bloqueadas não listam cards (banner dourado só no chip da própria fase).

**Reatividade e regressão**
15. Ao salvar palpite de jogo aberto, ele sai de `pending`, entra em `mine` em tempo real (cache otimista `:99-111`), sem reload.
16. Ao `m.locked` virar `true` no refetch (30s), o jogo migra `pending → missed` automaticamente (`useMemo` dep `[matches, filter, predictionsByMatchId]`).
17. "Todos", "Meus palpites", "Próximos jogos", grupos A–L e mata-mata mantêm comportamento idêntico (sem regressão); cada chip mantém highlight `active` correto.

## Casos de borda

| # | Cenário | `missed` | `pending` |
|---|---|---|---|
| B1 | Travado por kickoff, sem palpite | ✅ | ❌ |
| B2 | Travado por admin (antes do kickoff), sem palpite | ✅ | ❌ |
| B3 | Travado, **com** palpite | ❌ (é `mine`) | ❌ |
| B4 | Aberto, sem palpite | ❌ | ✅ |
| B5 | **Mata-mata fase não aberta** (`predictionsOpen===false`, `locked===false`) | ❌ | ❌ |
| B6 | Palpite removido por outra via (se existir) → refetch sem o matchId | segue `m.locked` | se aberto → reentra |
| B7 | Transição aberto→travado em tempo real (refetch) | migra para cá | sai daqui |
| B8 | Payload com `locked` ausente/`undefined` | `undefined===true` ⇒ `false` ⇒ não entra; cai em "aberto" → `pending`. Não estoura. | |
| B9 | **Teórico:** `locked=true` + `predictionsOpen=false` | predicado deixaria entrar, mas `sections.locked` suprime os cards (banner dourado) → não rendereiza | ❌ |
| B10 | Digitando placar em `pending` quando o jogo trava (B7) | inputs desabilitam, botão some — testar sem crash/perda de foco | |

Notas: B1/B2 são indistinguíveis no DTO (`MatchPublic` não expõe `lockedManually`) e isso é **correto** — ambos são "fechei, não palpitei". B6 só é testável se houver fluxo real de remoção (hoje só há upsert `:83-116`) — confirmar com o time. R1 (janela badge-local "finalizando…" × `m.locked` ainda `false` por até 30s) é limitação conhecida e aceita: o filtro segue o servidor (verdade da pontuação); apenas documentar.

## Plano de teste

**Automatizado (recomendado, baixo custo — predicados são funções puras):** extrair os predicados de `filteredMatches` para funções testáveis e cobrir B1–B10 com `locked ∈ {true,false,undefined}` × `predictionsOpen ∈ {true,false,undefined}` × `has ∈ {true,false}`. Asserção central: **`pending`, `missed`, `mine` disjuntos dois-a-dois e união == grupos liberados** (CA12/CA13). Verificar antes se há harness de teste no frontend (`package.json`).

**Manual (smoke):**
1. Usuário com mix (grupos travados-sem-palpite, abertos-sem-palpite, com-palpite). Conferir B1–B7.
2. `missed`: só travados-sem-palpite, todos read-only, badge "Palpite finalizado", agrupados por grupo, sem input habilitado.
3. `pending`: só abertos-sem-palpite, editáveis, botão Salvar aparece ao mudar placar.
4. **Disjunção:** listar matchIds de `pending` e `missed` → interseção vazia; repetir após forçar um lock (B7).
5. Mata-mata fechado-por-janela: ausente em `missed` e `pending`; banner cadeado só no chip da fase (B5/B9).
6. Os 5 empty states + offline (desligar rede → mensagem offline tem prioridade).
7. Reorder/rename visual; navegar todos os chips sem highlight órfão; grupos A–L e mata-mata sem regressão (CA17).

## Arquivos a editar

| Arquivo | Edições |
|---|---|
| **`frontend/src/pages/Palpites.tsx`** | (1) ramo `'missed'` em `filteredMatches` `:125-138`; (2) reordenar + renomear chips Linha 1 `:200-213`; (3) `readonly={filter === 'missed'}` no `MatchCard` agrupado `:352-361`; (4) empty state `missed` + texto de `pending` `:272-289`; (5) opcional: subtítulo do header reativo `:191-194`. |
| **`frontend/src/components/bolao/MatchCard.tsx`** | **Opcional/recomendado:** quando `readonly && prediction === undefined`, exibir "Sem palpite registrado" / "— × —" no lugar de "0 × 0" `:40-41,128-150`. Sem mudança de assinatura. |
| **`frontend/src/components/bolao/LockedBadge.tsx`** | Sem mudança (já cobre "Palpite finalizado"). |
| **`frontend/src/lib/types-domain.ts`** | Sem mudança (`locked`, `predictionsOpen` já bastam). |

**Sem backend, sem novo componente, sem mudança de dados.** Os dois ajustes opcionais (selo "sem palpite" no card; subtítulo reativo) elevam a qualidade da transparência mas não bloqueiam o deploy.