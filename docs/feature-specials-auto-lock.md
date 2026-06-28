# Feature (follow-up): trava automática dos palpites especiais

> **Status:** spec aprovada — **implementar depois** (decisão do dono em 03/06).
> **Objetivo:** os palpites especiais (campeão/vice/3º/4º/artilheiro) devem **fechar
> automaticamente no kickoff do ÚLTIMO jogo da fase de grupos**, recalculado de forma
> dinâmica — robusto a mudanças de calendário (ensaio vs. Copa real), sem precisar
> re-setar a data na mão.

## Hoje (config manual)
O `specials-lock` usa um `lockUtc` **fixo** (timestamp), setado via
`PUT /api/admin/config/specials-lock`. Foi o que fizemos no ensaio (apontando para o
último jogo de grupo de 05/06). Problema: se as datas mudam (reseed ensaio→oficial),
o `lockUtc` fica desatualizado e precisa ser re-setado manualmente.

## Mudança proposta (modo "auto")
Adicionar um modo automático ao `specials-lock`:

- **Doc** `config/specials-lock` (`backend/src/types/domain.ts:SpecialsLockConfigDoc`):
  novo campo `value.auto?: boolean`. Quando `auto === true`, o `lockUtc` efetivo é
  **derivado** (não fixo).
- **Service** `backend/src/services/specials-lock.ts`:
  - novo helper `resolveEffectiveLockUtc(config)`: se `config.value.auto`, faz
    `SELECT VALUE MAX(c.kickoffUtc) FROM c WHERE c.phase = 'group'` na `matches-cache`
    e retorna esse valor; senão retorna `config.value.lockUtc`.
  - `computeSpecialsLocked` / `getSpecialsLockState` passam a usar o `lockUtc` efetivo
    (derivado quando auto). `isTimeBasedLocked` idem.
  - Cache curto (ex.: 30–60s em memória) para a query do MAX, evitando custo por request.
- **Admin** `PUT /api/admin/config/specials-lock`: aceitar `{ auto: true }`
  (alternativa ao `{ lockUtc }`). Mutuamente exclusivos: auto ignora lockUtc fixo.
- **Frontend**: a tela de Especiais/Perfil já mostra o `lockUtc`/contagem — passa a
  exibir o valor **derivado** (ex.: "fecha no último jogo da fase de grupos — 27/06 às HH:mm").
  Serializer admin mostra `auto: true` + a data resolvida.

## Compatibilidade
- Sem `auto` (default), mantém o comportamento atual (lockUtc fixo). Zero regressão.
- Com `auto: true`, mudar/realocar as datas dos jogos de grupo (reseed) **recalcula a
  trava sozinho** — exatamente o que o ensaio→oficial precisa.

## Critérios de aceite
- [ ] Com `auto: true`, a trava efetiva = kickoff do último jogo `phase='group'`.
- [ ] Reseed das datas de grupo → trava recalcula sem intervenção.
- [ ] Enforcement no backend (POST/PUT /specials → 409 após a trava efetiva).
- [ ] Frontend mostra a data derivada + contagem.
- [ ] Sem `auto`, comportamento idêntico ao atual.

## Nota operacional (até implementar)
Enquanto for manual: ao **restaurar as datas oficiais** (pós-ensaio), **re-setar o
`specials-lock`** para o kickoff do último jogo de grupo real (finais de junho) via o
endpoint admin. (Já consta na pendência de "restaurar estado oficial".)
