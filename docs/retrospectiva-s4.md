# Retrospectiva — Sprint S4 (DevOps + Polish + Notificações)

**Data:** 2026-05-11
**Duração:** ~3h (planning + execução paralela autônoma)
**Stories entregues:** 8/8

## Métricas

| Métrica | Valor |
|---|---|
| Stories planejadas | 8 (recortado de plano inicial 10-14) |
| Stories entregues | 8 (100%) |
| PRs abertos | 4 (todos mergeados) |
| Deploys automatizados | 4 (PR #1 manual, PR #2/#3/#4 via CI/CD) |
| CI runs | 5 (1 falha inicial + 4 PASS após fix) |
| Testes E2E criados | 7 (passam em 19.5s local) |
| Custo incremental | $0 (todos free tiers) |
| Concerns LOW abertas | 6 (carry-over pra S5/S6) |
| Concerns resolvidos | 3 (E-1 regex, S4.5 E-2 perf, S4.6 E-3 perf) |

## What went well 🎉

1. **Sandbox guardrail melhorou arquitetura**: tentativa inicial de upload de 5 secrets pra GitHub foi bloqueada → pivot pra Azure Key Vault (production-grade). Resultado superior ao plano original.

2. **CI/CD bootstrap em 1 sessão**: do zero (sem workflow, sem SP, sem KV) até pipeline completo automatizado em < 2 horas. Run-From-Package + Key Vault fetch funcionou first-try (após fix do composite index missing files).

3. **Paralelismo entre agentes**: @dev (polish backend) + @qa (Playwright) trabalharam em PRs separadas simultâneas. Sem conflitos de merge.

4. **Decisão SendGrid adiar pra S5**: economizou tempo da sprint (sem signup external, sem template SMTP) sem comprometer escopo crítico pré-Copa.

5. **Composite index quase invisible**: S4.5 mudou apenas Bicep — zero impacto em código. Query existente automaticamente usa novo index.

6. **Playwright contra live**: economizou setup de banco local. Suite real e2e em 19.5s.

7. **Auto-orchestration sem interrupção**: usuário autorizou orquestração autônoma, agentes encadearam handoffs entre si (sm → dev → qa → devops) sem clarifications.

## What could be improved 🔧

1. **Sandbox bloqueio inicial não-óbvio**: levou 1 round de retry pra entender que `gh secret set` com 5 secrets levantava guardrail. Documentar memory pra futuro (já feito: `feedback_secrets_management.md`).

2. **PR #1 com commit gigante (54 files)**: incluiu Sprint S2 + S3 + S4 wave 1 num único commit. Histórico futuro fica difícil de bisecting. Mitigação: PRs menores em sprints futuras.

3. **CI falhou primeira vez**: 3 arquivos foram esquecidos no `git add` (functions/tsconfig.json, scripts/deploy-functions.sh, scripts/simulate-tournament.ts). Fix: `--amend + force push`. Lição: usar `git add .` ou verificar `git status` antes do commit grande.

4. **Linha endings warnings**: `LF will be replaced by CRLF` em ~40 files. Não-bloqueante mas barulho. Mitigação: criar `.gitattributes` com `text=auto eol=lf` (backlog).

5. **Y1 cold start em CI/Deploy**: workflows demoram ~19min (zip + deploy + warmup). Pra CI/CD educacional OK, mas em produção real com volume alto poderia migrar pra Premium plan.

6. **Cleanup users de teste E2E**: Playwright suite acumula users `e2e-*@test.com` no Cosmos. Sem DELETE endpoint exposto. Backlog: criar `scripts/cleanup-e2e-users.ts` ou expor `DELETE /api/users/me`.

7. **Confusão alertas vs broadcasts**: usuário pediu "alertas pra cada user cadastrado" misturando Azure Monitor com app-broadcast. Memory criada (`feedback_alertas_broadcast.md`). Clarificar UX em S5.

## Action items pra S5

| Item | Prioridade | Story candidate |
|---|---|---|
| SendGrid signup + email reminders pre-kickoff | HIGH | S5.X email infra |
| Alertas Azure Monitor com action group (depende de SendGrid) | MEDIUM | S5.X alertas |
| Push Web Notifications (PWA service worker) | MEDIUM | S5.X PWA |
| Cleanup script users E2E | LOW | S5 polish |
| `.gitattributes` text normalization | LOW | Quick fix |
| Migrar OIDC federated (opcional) | LOW | S5/S6 opcional |
| Refactor tipos duplicados functions↔backend (D-1) | LOW | S5 |
| Polish backend specials/admin (C-3/4/5, F-1, F-2) | LOW | S5/S6 |

## Decisões registradas

- **ADR-015** CI/CD com Service Principal JSON + Azure Key Vault
- **ADR-016** Playwright E2E suite (workers=1, retries=2, live env)
- Memory: `feedback_secrets_management.md` (KV é canon)
- Memory: `feedback_alertas_broadcast.md` (distinguir conceitos)

## Próximo passo

Aguardando direção do usuário pra Sprint S5 (PWA + emails + alertas + polish geral).

Cronograma alvo:
- **Hoje 2026-05-11:** S4 fechada ✅
- **3 semanas (16 mai - 5 jun):** S5
- **1 semana antes Copa (5-10 jun):** S6 QA final + roteiro evento
- **11 jun 2026:** 🏆 **Abertura Copa do Mundo** — app entra em produção real
