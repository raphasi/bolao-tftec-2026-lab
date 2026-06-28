# Backlog — Tela de Palpites (ajustes a implementar)

> Itens levantados durante o ensaio (03/06). **Não implementar enquanto o time testa** — agendados para depois.

## 1. [BUG/UX] Só jogos da FASE DE GRUPOS podem aparecer como cards palpitáveis
**Sintoma (reportado):** na tela de Palpites aparecem jogos de mata-mata **palpitáveis** e, pior, com **seleções fictícias / repetidas / que nem estão na Copa**. Visualmente ruim e perigoso (palpite em confronto inexistente que pontuaria).

**Causa:**
- O ajuste **2b** (PR #57) fez Palpites renderizar **todas as fases** (grupos + mata-mata).
- O mata-mata foi **semeado para o ensaio com uma lista placeholder** de seleções (`scripts/rehearsal-setup.ts` → `POOL`), porque **o chaveamento real não existe** antes do fim da fase de grupos. Daí os confrontos fictícios.

**Correção pretendida (acoplada à [feature-phase-windows](./feature-phase-windows.md)):**
- Na tela de Palpites, **apenas jogos de grupo aparecem como cards palpitáveis**.
- Mata-mata aparece **somente como aviso de fase** ("Oitavas — Abre em DD/MM"), **sem cards de jogo**, até a janela abrir.
- **Nunca** exibir confronto com seleção placeholder/fictícia como se fosse real.
- **Cup real:** os confrontos do mata-mata só são semeados quando os times se classificam; antes disso, banner/"A definir".
- **Ensaio:** enquanto a feature não entra, opção de **remover os dados de mata-mata** (`matches-cache`, `phase != group`) para a tela ficar limpa — decisão/autorização do dono (data-only, sem deploy).

**Aceite:** Palpites lista só os 72 jogos de grupo como cards; mata-mata só como aviso de data; zero seleção fictícia visível como confronto.

---

## 2. [FEATURE] Aba "Meus palpites"
**Pedido:** na tela de Palpites, uma **guia "Meus palpites"** que mostre **separadamente apenas os jogos já palpitados** pelo usuário.

**Design (frontend, pequeno — `frontend/src/pages/Palpites.tsx`):**
- Hoje os filtros são chips: `Todos` · `Sem palpite` · grupos (A–L) · fases. Já existe `predictionsByMatchId` (mapa matchId→palpite) e o filtro `pending` (sem palpite).
- Adicionar um chip/guia **"Meus palpites"** (`filter === 'mine'`):
  `matches.filter((m) => predictionsByMatchId.has(m.matchId))`.
- Reusar o agrupamento por seção e o `MatchCard` (editável se o jogo ainda estiver aberto; read-only/"Trancado" se travado).
- Contador no cabeçalho (ex.: "X palpites feitos"); estado vazio: "Você ainda não palpitou em nenhum jogo."
- É o complemento do "Sem palpite" — juntos dão a visão completa (feitos vs. faltando).

**Aceite:** a guia mostra exatamente os jogos com palpite do usuário, agrupados; reflete edições/remoções em tempo real; não aparece jogo sem palpite.

**Escopo:** só frontend, 1 deploy. Sem mudança de backend/dados.

---

## 3. [FEATURE] Aba "Próximos jogos"
**Pedido:** uma **guia "Próximos jogos"** na tela de Palpites que liste os **10 próximos jogos** por ordem de **data/hora**, pra o usuário ver de relance o que é mais **urgente** palpitar.

**Design (frontend — `frontend/src/pages/Palpites.tsx`):**
- Novo chip/guia `filter === 'upcoming'`:
  `matches.filter(m => Date.parse(m.kickoffUtc) > Date.now()).sort((a,b)=>kickoff ASC).slice(0,10)`.
- Considerar só jogos **palpitáveis/abertos** (a partir da feature-phase-windows, isso já exclui fases não liberadas).
- Em cada card, destacar **quanto falta para a trava** (kickoff−30min) — reusar a lógica do `LockedBadge` ("Trava em Xh Ymin"). Ordenar do mais urgente ao menos.
- Estado vazio: "Nenhum jogo próximo em aberto."

**Aceite:** mostra exatamente os 10 próximos jogos por data/hora crescente; prioriza o que trava primeiro; atualiza conforme jogos travam.

---

## Ordem sugerida de implementação (pós-ensaio de grupos)
1. `feature-phase-windows` (resolve o item 1 + o cadeado/tooltip: bloqueio + "Abre em DD/MM" + só grupos como cards).
2. Aba "Meus palpites" (item 2).
3. Aba "Próximos jogos" (item 3).
4. (opcional, decisão do dono) limpeza imediata dos dados de mata-mata durante o ensaio, se incomodar antes da feature entrar.

---

## 4. ✅ [ENTREGUE — PR #76] Filtro "Jogos que não palpitei" + renomear/reordenar chips
> Demanda levantada pelo dono em **2026-06-05** (durante o ensaio). **Entregue e deployada no PR #76 (2026-06-07). Spec mantida abaixo para histórico.**

**Pedido:** novo chip **"Jogos que não palpitei"** que mostra os jogos **já fechados (travados)** em que o usuário **não** registrou palpite — pra ficar **transparente** o que ele deixou passar. Mais o **rename** de "Sem palpite" → **"Palpites pendentes"** e a **reordenação** dos botões.

**Ordem final dos chips (decidida):**
`Todos` · `Meus palpites` · `Jogos que não palpitei` · `Palpites pendentes` · `Próximos jogos`

**Semântica (frontend — `frontend/src/pages/Palpites.tsx`):**
- **`Jogos que não palpitei`** (novo, `filter === 'missed'`): jogos **travados/fechados** (`m.locked === true` / passou do kickoff−30) **sem** palpite do usuário → `matches.filter(m => m.locked && !predictionsByMatchId.has(m.matchId))`. **Read-only** (não dá pra palpitar; é histórico do que passou). Estado vazio: "Você não perdeu nenhum jogo — palpitou em tudo que fechou. 🎉".
- **`Palpites pendentes`** (rename do antigo `pending`/"Sem palpite"): trocar o **rótulo** e ajustar o filtro. **✅ DECIDIDO pelo dono (05/06):** "pendentes" mostra **só jogos AINDA ABERTOS sem palpite** (`pending = aberto && sem palpite`) — os fechados-sem-palpite vão pro chip "não palpitei", sem sobreposição.
- Reaproveitar `predictionsByMatchId`, o agrupamento por seção e o `MatchCard` (read-only nos travados).

**Aceite:**
- [x] "Jogos que não palpitei" lista exatamente os jogos travados sem palpite do usuário; não aparece jogo aberto nem jogo já palpitado.
- [x] "Palpites pendentes" mostra os jogos abertos sem palpite (não os fechados).
- [x] Ordem dos chips: Todos · Meus palpites · Jogos que não palpitei · Palpites pendentes · Próximos jogos.
- [x] Mata-mata ainda não aberto (fase fechada por janela) **não** conta como "não palpitei" (não fechou, só não abriu).

**Escopo:** só frontend, 1 deploy. Sem backend/dados.
