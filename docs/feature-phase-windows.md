# Feature: Janelas de fase ("Abre em DD/MM") — mata-mata visível mas bloqueado

> **Status:** especificação aprovada (planejamento de squad) — **implementar após 13h de 03/06**.
> **Objetivo:** o usuário ver que existem fases após os grupos (16-avos→final), em estado
> **bloqueado com aviso** "abre em DD/MM — volte para palpitar", e os palpites dessas fases
> só serem aceitos a partir da data (com **enforcement no backend**, não só UI).

## 1. Problema
Hoje só existe o conceito de **"trancado"** (vermelho) = `computeMatchLocked` (finished | lockedManually | now ≥ kickoff−30min). Não há "ainda não abriu". Resultado: jogos de mata-mata ou não aparecem (não semeados) ou aparecem **já palpitáveis**. Queremos um 2º conceito, **ortogonal**: **"abre em DD/MM"**.

## 2. Modelo de dados — doc único de config
Um doc no container `config` (PK `/scope`), espelhando `SpecialsLockConfigDoc` (`backend/src/types/domain.ts:~218`):

```ts
// backend/src/types/domain.ts (novo)
export interface PhaseWindowsConfigDoc {
  id: 'phase-windows';
  scope: 'global';                                // partition key
  value: Partial<Record<MatchPhase, string>>;     // fase -> openUtc (ISO). Ausente = aberta.
  updatedBy?: string;
  updatedAt: string;
}
```
Exemplo `value`:
```json
{ "round-of-32":"2026-06-06T11:00:00Z", "round-of-16":"2026-06-06T11:00:00Z",
  "quarter":"2026-06-06T11:00:00Z", "semi":"2026-06-07T11:00:00Z",
  "third-place":"2026-06-07T11:00:00Z", "final":"2026-06-07T11:00:00Z" }
```
`group` nunca é listado → grupos jamais bloqueados. **Sobrevive a re-seeds** (seed só escreve `matches-cache`).

## 3. Backend (additivo, backward-compatible)
**3.1 Nova função** em `backend/src/services/match-lock.ts` (ortogonal ao `computeMatchLocked`, que continua = "tarde demais"):
```ts
export function isPredictionOpen(
  doc: MatchCacheDoc,
  windows: Partial<Record<MatchPhase, string>>,
  nowMs = Date.now(),
): { open: boolean; opensUtc?: string } {
  const openUtc = windows[doc.phase];
  if (!openUtc) return { open: true };               // ausente => aberta (grupos/compat)
  const openMs = Date.parse(openUtc);
  if (!Number.isFinite(openMs)) return { open: true };
  return { open: nowMs >= openMs, opensUtc: openUtc };
}
```
**3.2 DTO** `MatchPublic` (`domain.ts:~104` + frontend `types-domain.ts:~33`) ganha:
```ts
predictionsOpen: boolean;   // false só quando antes de opensUtc
opensUtc?: string;          // presente quando há janela
```
**3.3 Popular os campos:** em `backend/src/routes/matches.ts` (`toPublic` ~:21 e `router.get('/')` ~:52) ler o doc `phase-windows` **uma vez por request** (point read no `config`, como o specials-lock) e preencher `predictionsOpen`/`opensUtc`.

**3.4 Enforcement (inegociável):** em `backend/src/routes/predictions.ts`:
- POST upsert, após o lock atual (`~:111`):
```ts
const { open, opensUtc } = isPredictionOpen(match, windows, nowMs);
if (!open) throw new ConflictError(`Os palpites desta fase abrem em ${opensUtc}.`);
```
- DELETE (`~:269`): mesma checagem.
Reusa `ConflictError` (409) — zero novo tipo de erro.

**3.5 Admin** em `backend/src/routes/admin.ts`: `GET`/`PUT /api/admin/config/phase-windows` copiando os handlers do `specials-lock` (`admin.ts:~76/:86`). PUT body `{ windows: Partial<Record<MatchPhase,string>> }`, validado com Zod (ISO). `requireAdmin` já aplicado.

## 4. Frontend (mínimo)
- **`MatchCard.tsx`** (`~:51`): estado **distinto** do lock de kickoff:
```ts
const notYetOpen = match.predictionsOpen === false;
const disabled = locked || notYetOpen || readonly || isSaving;
```
  Quando `notYetOpen`: ocultar botão Salvar e mostrar badge **âmbar** "Abre em DD/MM" (NÃO o vermelho "Trancado" de `LockedBadge` ~:104). Formatar `match.opensUtc` em pt-BR (BRT).
- **`LockedBadge.tsx`**: adicionar variante "abre em" (ícone `CalendarClock`, cor `copa-gold/âmbar`) — ou um `<span>` inline no card.
- **`Palpites.tsx`**: seções de fase **já renderizam** (via `phases.ts`); ajustar o filtro `pending` (`~:118`) para **não** contar jogos `predictionsOpen === false`. Banner âmbar por fase (ver §5).
- **`phases.ts`**: já tem rótulos/ordem (incl. `round-of-32` = "16-avos de final").

## 5. UX + textos (PT-BR)
- **Sempre mostrar a seção da fase** (mesmo fechada) → usuário sabe que existe.
- **Banner âmbar por fase** (distinto do vermelho):
  > ⏳ **16-avos de final — abre em 06/06**
  > Os confrontos são definidos após a fase de grupos. Volte em **06/06** para palpitar.
- **Banner na Home** (opcional): "🔓 As Oitavas abrem em DD/MM. Prepare seus palpites!"
- **Card/seção bloqueada (refinamento pedido):**
  - **Ícone de cadeado** 🔒 na seção/card da fase fechada.
  - **Não clicável / sem interação:** inputs de placar desabilitados e o card **não responde ao clique** (cursor `not-allowed`; `pointer-events-none` nos controles), pra ninguém tentar palpitar.
  - **Tooltip no hover:** ao passar o mouse sobre o cadeado/card, exibir **"Libera em DD/MM às HH:mm"** (data de `opensUtc` em BRT). Reusar um `Tooltip` (shadcn/radix) já presente no projeto.
  - **Liberação:** a fase só abre **após a data `opensUtc`** (auto) **ou liberação manual do admin** (admin pode antecipar/ajustar via `PUT /api/admin/config/phase-windows`). Até lá, permanece cadeada.
- **Badge por card** (quando já há confronto): "Abre em 06/06" (âmbar) + cadeado.
- **TBD (cup real):** mostrar **só o banner da fase**, sem cards "A definir × A definir". Quando o admin semeia os confrontos reais, os cards aparecem sob a fase ainda **cadeada** e liberam na data/ao serem liberados.
- **Lembrete (nice-to-have):** push PWA / `toast` no dia "Nova fase liberada 🎉".

## 6. Datas das janelas
- **Ensaio (comprimido):** 16-avos/oitavas/quartas → **06/06**; semis/3º/final → **07/06**.
- **Cup real (confirmar no calendário FIFA):** 16-avos ~28/06, oitavas ~04/07, quartas ~09/07, semis ~14/07, 3º/final ~18–19/07.
- Datas em **UTC** no doc, exibidas em **BRT**. Admin edita sem redeploy.

## 7. Escopo
- **MVP:** doc `phase-windows` + `isPredictionOpen` + campos no `MatchPublic` + enforcement + endpoint admin + banner/badge âmbar + auto-abertura na data.
- **Depois:** push/lembrete, cards "A definir" por jogo, countdown.

## 8. Critérios de aceite
- [ ] Fase de mata-mata aparece **visível e bloqueada** com banner "Abre em DD/MM".
- [ ] Tentativa de palpite em fase fechada é **rejeitada pelo backend (409)**, não só na UI.
- [ ] Na data (`opensUtc`), a fase **abre sozinha** (palpites aceitos) — sem ação manual.
- [ ] Admin define/edita `opensUtc` por fase **sem redeploy**.
- [ ] Sem o doc `phase-windows`, comportamento idêntico ao de hoje (grupos não afetados).
- [ ] Estado "abre em" é **visualmente distinto** do "trancado" (âmbar vs vermelho).

## 9. Riscos
- **Fuso/data errada** → abre cedo/tarde: armazenar UTC, exibir BRT, conferir no admin.
- **Backend não enforça** → palpite via API fura o bloqueio: gate server-side + teste.
- **Confusão do usuário** → cópia clara, inputs desabilitados.

## 10. Checklist de implementação (passo a passo)
1. [ ] `domain.ts`: `PhaseWindowsConfigDoc` + campos `predictionsOpen`/`opensUtc` em `MatchPublic`.
2. [ ] `match-lock.ts`: `isPredictionOpen()`.
3. [ ] `matches.ts`: ler `phase-windows` 1×/request, preencher os campos em `toPublic`.
4. [ ] `predictions.ts`: enforcement no POST e DELETE.
5. [ ] `admin.ts`: `GET`/`PUT /api/admin/config/phase-windows` (copiar de specials-lock).
6. [ ] Frontend `types-domain.ts`: campos no `MatchPublic`.
7. [ ] Frontend `MatchCard.tsx` + `LockedBadge.tsx`: estado/badge "abre em" (âmbar).
8. [ ] Frontend `Palpites.tsx`: filtro `pending` ignora `predictionsOpen===false`; banner por fase.
9. [ ] Build/typecheck (backend, frontend) + commit → **deploy backend + frontend**.
10. [ ] `PUT /api/admin/config/phase-windows` com as datas do ensaio (16-avos→06/06, etc.).
11. [ ] Validar: fase mostra "Abre em 06/06"; palpite rejeitado (409); abre sozinha em 06/06.

**Esforço:** ~0,75 dia. **Deploys:** backend + frontend. **Migração:** nenhuma.

## 11. Plano de teste no ensaio
Após implementar (pós-13h), setar as janelas (passo 10) e confirmar com a equipe que as fases de mata-mata aparecem como **"Abre em 06/06"** e que **não** aceitam palpite até lá; depois validar a **auto-abertura** em 06/06.
