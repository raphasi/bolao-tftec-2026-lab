# Admin Console (S4.5)

Console administrativo do Bolão TFTEC para gestão de usuários e observabilidade do sistema.

## Acesso

Apenas usuários com `role === 'admin'` veem o link **Admin** na navbar. Acesso direto via URL `/admin/*` por user comum redireciona para `/`.

Admin padrão do projeto: `admin@bolao.tftec.com.br`.

## Páginas

### `/admin` — Landing

Dashboard inicial com 4 cards de navegação:
- **Usuários** → `/admin/users`
- **Sistema** → `/admin/system`
- **Configuração** → `/admin/config` (S2.7 — trava de palpites especiais)
- **Resultados** → `/admin/results` (S3.1 — placares oficiais)

### `/admin/users` — Gestão de usuários

Tabela paginated com filtros + ações por linha.

**Filtros:**
- Busca por email/nome (debounce 300ms)
- Role: Todos / Admin / User
- Status: Todos / Ativos / Inativos
- Page size: 20/50/100

**Ações por usuário:**
| Ação | Endpoint | Guard |
|---|---|---|
| Editar nome | `PATCH /api/admin/users/:id` | Email é imutável |
| Promover/Rebaixar role | `PATCH /api/admin/users/:id/role` | Self bloqueado; last-admin bloqueado |
| Desativar/Reativar | `PATCH /api/admin/users/:id/(de\|re)activate` | Self bloqueado; last-admin (de) bloqueado |
| Ver audit log | `GET /api/admin/users/audit-log?targetUserId=X` | — |

**Soft delete:** usuário desativado tem `active: false`. Login retorna `401 "Credenciais inválidas"` (mensagem unificada para não vazar enumeration). Pode ser reativado a qualquer momento.

**Audit log:** cada mutação grava entry em container Cosmos `audit-log` (TTL 1 ano). Drawer mostra últimas 50 entries do usuário ordenadas por timestamp DESC.

### `/admin/system` — KPIs + Infra

Read-only dashboard com auto-refresh a cada 30s (alinhado com cache backend).

**Bolão:** Usuários (total/admins/ativos/inativos), Palpites (total/pontuados/exatos), Jogos (total/finalizados/agendados), Leaderboard (count + líder atual).

**Infrastructure:**
- Cosmos DB: status ping + latência + database + containers
- Function App: estado + 6 functions registered
- App Service: nome + uptime
- SignalR: nome + tier

**Observability:** Errors 24h / Requests 1h / Latency P95 — `null` no MVP (wiring Application Insights em S5+).

**Botão "Forçar atualização":** chama `POST /api/admin/system/cache/invalidate-active` (limpa cache em-memória de validação `active`) + re-fetch stats.

## Segurança

Backend aplica em todas rotas `/admin/*`:
1. `requireAuth` — valida JWT + checa `user.active` (cache LRU 10s)
2. `requireAdmin` — `req.user.role === 'admin'`

**Guards específicos:**
- **Self-demote / Self-deactivate:** retorna `403` antes de mutate
- **Last-admin:** retorna `409` se demote/deactivate deixaria 0 admins ativos
- **Email imutável:** schema Zod do PATCH só aceita `name`
- **passwordHash:** nunca exposto (helper `toPublic` strip)

## Cache de validação `active`

Middleware `requireAuth` chama `isUserActive(userId)` em toda request protegida. Para evitar custar 1 RU por request, há cache em-memória:

- TTL: 10s (curto pra propagação rápida)
- MaxSize: 200 entries (LRU eviction insertion-order)
- Fail-closed: se Cosmos falhar, retorna `false` (bloqueia request)
- Auto-invalidação: após `deactivate`/`reactivate`, cache do user é limpo imediatamente
- Manual flush: `POST /api/admin/system/cache/invalidate-active { userId? }` — sem `userId`, flush total

## Audit Log

Container Cosmos `audit-log`:
- **PK:** `/performedBy` (queries "tudo que admin X fez" são baratas)
- **TTL:** 365 dias
- **Composite indexes:** `(performedBy, timestamp DESC)` + `(targetUserId, timestamp DESC)`
- **Fire-and-forget:** se Cosmos falhar, mutation principal ainda completa (warn no logger pra App Insights)

**Actions tracked:** `role-change`, `soft-delete`, `reactivate`, `name-change`.

## E2E Coverage

`tests/e2e/admin-console.spec.ts` cobre 4 fluxos:
- F7: admin vê link + landing 4 cards
- F8: /admin/users list + filter + search
- F9: /admin/system KPIs + force refresh
- F10: user comum sem link + redirect /admin → /

Rodar: `npm run test:e2e` (live env por default).
