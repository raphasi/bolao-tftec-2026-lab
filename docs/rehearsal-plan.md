# Plano de Ensaio (Dry-Run) — Bolão TFTEC 2026

> **Status:** rascunho para aprovação · **Autor:** squad (PM/Arch/QA/DevOps) · **Data:** 2026-06-02
> **Estreia real:** 2026-06-11 (fase de grupos). **Ambiente do ensaio:** PRODUÇÃO (`tftec01`).

## 1. Objetivo
Validar, com a equipe real (~10 pessoas), o **ciclo completo** do bolão antes da estreia:
cadastro/login → palpites → **fechamento (trava)** → resultados → **pontuação 25/15/0** → especiais →
**leaderboard + desempate** → tempo real (SignalR) — **incluindo o mata-mata**.

## 2. Escopo e decisões registradas
- **Ambiente:** produção, com sequência **backup → ajustar datas → testar → validar → zerar → restaurar**.
- **Escopo:** **grupos + mata-mata** (mata-mata semeado; ver §6). "Real de verdade".
- **Cadência:** **multi-dia** (~03→07/06): fase de grupos encerrada até **05/06**, Copa encerrada até **07/06**. Horários de jogo **aleatórios entre 08h–23h BRT** (dispara a trava automática ao natural). Equipe palpita **todos** os jogos (padrão real). Mata-mata do ensaio: **oitavas→final** (16 jogos); a Rodada de 32 ("16-avos") fica para a operação do mata-mata real (fim de junho).
- **Contas:** equipe usa **contas reais** → limpeza por **reset soft total** no fim (não por prefixo).
- **Permissões:** autorizado editar o Cosmos manualmente e subir throughput temporariamente.
- **Pré-requisitos já entregues:** ✅ fix do desempate (perfectScores/createdAt) em prod; ✅ UI de fases de mata-mata (PR #57).

## 3. ⚠️ Achados de segurança (obrigatórios antes de executar)
1. **Não há rollback nativo:** backup do Cosmos é *Periodic* (retenção 8h; restore = ticket + conta nova). → **Gate nº 1:** criar e **testar** `backup-all`/`restore-all` (export/import JSON) antes de QUALQUER mutação.
2. **Nunca usar `reset:hard`** em prod (derruba índices compostos e não limpa *leases* do change-feed). Usar só `reset` soft.
3. **`reset` NÃO limpa `config` nem `audit-log`.** Se o ensaio gravar `tournament-final`/`specials-lock`, é preciso **apagar esses docs manualmente** (Data Explorer). `specials-lock` por tempo não destrava via API.
4. **Pausar as Azure Functions** durante mutação/zeragem (evita o change-feed processar estado parcial e empurrar leaderboard errado ao vivo). Religar só para testar e por último.
5. **Senha do admin:** reset+seed restaura a senha padrão — **preservar o admin real a partir do backup**.

## 4. Containers (referência)
Backup obrigatório (8): `users, predictions, specials, matches-cache, leaderboard, groups, config, audit-log`.
Ephemerais (não restaurar): `leases-*` (checkpoints do change-feed).

## 5. Runbook — 6 fases

### Fase 0 — Prep (não-destrutiva) ✅ scripts prontos (typecheck OK)
- `scripts/backup-all.ts` (export JSON dos 8 containers de dados, incl. `config`/`audit-log`).
- `scripts/restore-all.ts` (upsert idempotente; dry-run por padrão, `--apply` para gravar).
- `scripts/rehearsal-setup.ts` (embaralha datas dos 72 grupos em 03–05/06 + semeia mata-mata oitavas→final em 06–07/06; dry-run por padrão, `--apply`).
- **Testar o restore num DB de rascunho.** Confirmar `.env` aponta para a prod (`COSMOS_ENDPOINT`).
- **Gate:** restore validado ✅.

### Fase 1 — Backup total
- `npx tsx scripts/backup-all.ts` → `backups/<ISO>/<container>.json`; copiar para fora da máquina (blob privado).
- (Belt-and-suspenders) export manual de `matches-cache` e `leaderboard` no Data Explorer.

### Fase 2 — Ajustar datas + semear mata-mata (Functions PAUSADAS)
- Parar o Functions app.
- `npx tsx scripts/rehearsal-setup.ts` (dry-run) → conferir → `--apply`: embaralha as datas dos 72 grupos (03–05/06, 08–23h BRT, aleatório) e semeia o mata-mata oitavas→final (06–07/06).
- A trava de 30min dispara naturalmente conforme os horários aleatórios chegam; para finalizar um jogo antes do kickoff (se necessário), usar `PATCH /admin/matches/:id/early-finish`.

### Fase 3 — Ensaio ao vivo (Functions LIGADAS)
- Religar Functions. Rodar o run-of-show (§7) ao longo dos dias 03→07/06.

### Fase 4 — Validação
- Preencher a matriz de testes (§8) e os critérios GO/NO-GO (§9).

### Fase 5 — Zerar (Functions PAUSADAS)
- Parar Functions. `npm run reset` (soft). Apagar manualmente `config` de teste (`tournament-final`/`specials-lock`). Opcional: limpar `audit-log` do ensaio.

### Fase 6 — Restaurar estado oficial
- `npm run seed` (recria admin + 72 jogos oficiais com datas corretas + grupos). Restaurar admin real do backup se a senha tiver sido alterada.
- `npm run recalc:dry` (deve indicar 0 finalizados). Religar Functions por último.
- **Gates de smoke:** `count=72`, datas oficiais (diff com a fixture), 0 usuários de teste, leaderboard vazio, nenhum `_originalKickoff` remanescente, `config` sem `tournament-final`.

## 6. Mata-mata — como é semeado
O motor é agnóstico de fase; a UI (PR #57) já rotula as fases. Documento de jogo:
`{ matchId: 73+, groupCode: "<fase>", phase: "round-of-16|quarter|semi|third-place|final", homeTeam, awayTeam, homeFlag, awayFlag, kickoffUtc, status: "scheduled", homeScore: null, awayScore: null, pointsCalculatedAt: null }`.
Sem avanço automático de chave — os confrontos são definidos manualmente (o ensaio é o dry-run desse procedimento real do fim de junho).

## 7. Run-of-show (multi-dia, resumido)
| Dia | Foco | Operador (admin) | Equipe |
|---|---|---|---|
| 03/06 | Abertura grupos | datas/seed prontos; abrir 1ª rodada | cadastram (contas reais), palpitam rodada 1 |
| 03–05/06 | Fase de grupos | finaliza jogos conforme "acontecem"; observar pontuação/leaderboard | palpitam; acompanham pontos e ranking ao vivo |
| 05/06 | Fim de grupos | encerra últimos jogos de grupo | conferem leaderboard pós-grupos |
| 06/06 | Mata-mata | cadastra confrontos (oitavas/quartas); abre palpites | palpitam mata-mata (UI mostra "Oitavas", etc.) |
| 07/06 | Final | finaliza até a final; lança `tournament-final` (especiais) | conferem especiais + ranking final |

**Comms à equipe (T-24h):** "Ensaio ao vivo; jogos/datas são FAKE; **todos os dados serão apagados no fim** — palpitem à vontade, nada conta; no dia 11 vocês refazem."

## 8. Matriz de testes (resumo do detalhamento)
| ID | O que valida | Esperado |
|---|---|---|
| TC-01 | Smoke / status / `/api/matches` | 200; jogos listados |
| TC-02/03/05 | Palpite criar/editar/excluir (jogo aberto) | 201/204; persiste |
| TC-04 | Range inválido (placar >20) | 400 |
| TC-06 | Palpite a kickoff−31min | 201 (aceito) |
| TC-07 | Palpite a kickoff−29min (trava natural) | **409** |
| TC-08 | Lock manual do admin | 409 |
| TC-09 | Placar exato (palpite 2-1, result 2-1) | **25** + perfectScores+1 |
| TC-10/11 | Acerto de vencedor / empate | **15** |
| TC-12 | Erro de vencedor | **0** |
| TC-13 | Sem palpite | 0 / sem doc |
| TC-14 | Reeditar resultado | re-pontua (~15s) |
| TC-15/16/17 | Especiais input / top4 distinto / pontuação+bônus | 201 / 400 / pontos + bônus 50 |
| TC-18 | Trava de especiais | 409 após `lockUtc` |
| TC-19 | Leaderboard agrega + rank | total = match+special; rank sequencial |
| TC-20 | **Desempate perfectScores** (empate 75: A=3 exatos vs B=5 vencedores) | A acima de B |
| TC-21 | **Desempate createdAt** (palpites idênticos; cadastros escalonados) | cadastro mais antigo acima |
| TC-22 | Tempo real (~10 clientes) | leaderboard reordena sem F5 |
| TC-KO  | Mata-mata: palpitar/travar/pontuar oitavas→final; UI rotula fases | igual a grupo (25/15/0); rótulos corretos |

> Pipeline é assíncrono (~15s, até ~1min em cold start): **esperar + refresh** antes de marcar FAIL.

## 9. GO / NO-GO (estreia 11/06)
**Bloqueia** se: trava falha/hora errada · pontuação diverge de 25/15/0 · palpite some · leaderboard não atualiza após resultado · desempate erra · **reset deixa sujeira ou datas oficiais erradas** (`count≠72`).
**Não bloqueia:** tempo real falhar p/ 1 usuário (fallback de polling) · cosméticos menores · cold start inicial.

## 10. Cronograma
| Data | Ação |
|---|---|
| 02/06 | decisões ✅; fix desempate live; UI mata-mata (PR #57) |
| 03/06 | Fase 0 (scripts + backup testado) → Fase 1/2 (backup + datas + seed mata-mata) |
| 03–05/06 | ensaio fase de grupos |
| 06–07/06 | ensaio mata-mata + especiais + validação |
| 08–09/06 | buffer de correções → **Fase 5/6 (zerar + restaurar)** + smoke |
| 10/06 | **freeze** (só hotfix) + backup do leaderboard |
| 11/06 | **estreia real** (só fase de grupos; mata-mata real começa fim de junho) |

## 11. Decisões confirmadas
- ✅ Calendário: grupos 03–05/06, mata-mata 06–07/06.
- ✅ Horários **aleatórios 08h–23h BRT** (gerados pelo `rehearsal-setup.ts`).
- ✅ Equipe palpita **todos** os jogos.
- ✅ Mata-mata do ensaio = oitavas→final (16-avos fica para a operação real).

## 12. Execução
Recomendado conduzir as fases (especialmente 1–6, que tocam a prod) numa **sessão aberta em `C:\Projetos-aios\TFTEC-Bolao-2026`**, com o `.env` apontando para a Cosmos de produção. Ordem: Fase 0 (testar restore) → Fase 1 (backup) → Fase 2 (setup) → Fase 3–4 (ensaio) → Fase 5–6 (zerar + restaurar) → smoke.
