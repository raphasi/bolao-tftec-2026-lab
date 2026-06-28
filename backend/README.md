# Bolão Backend — Express + TypeScript

API REST do Bolão TFTEC Cloud. Express 5 + TypeScript + Cosmos DB + JWT.

---

## 🚀 Quickstart

```bash
# 1. Pré-requisitos
npm install     # roda no root (workspace)

# 2. Configurar env (apenas primeira vez)
cp backend/.env.example backend/.env
# Edite backend/.env preenchendo COSMOS_ENDPOINT, COSMOS_KEY, JWT_SECRET

# 3. Rodar em modo dev (hot reload via tsx watch)
npm run dev --workspace=backend

# 4. Testar
curl http://localhost:3001/api/health
curl http://localhost:3001/api/health/full
```

---

## 📋 Rotas implementadas (Block 1.4)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/health` | público | liveness simples (uptime, version) |
| GET | `/api/health/full` | público | inclui ping no Cosmos |
| POST | `/api/auth/register` | público | cria usuário (e-mail, senha, nome) |
| POST | `/api/auth/login` | público | login com e-mail e senha → JWT |
| GET | `/api/auth/me` | Bearer | retorna usuário atual |

### Próximos blocks adicionarão:
- `/api/predictions` — CRUD de palpites com lock por kickoff
- `/api/specials` — palpites especiais (campeão, top 4, artilheiro)
- `/api/leaderboard` — ranking real-time
- `/api/admin/*` — administração (recalcular pontuação, gerenciar usuários)

---

## 🏗️ Arquitetura

```
backend/src/
├── server.ts                ← bootstrap Express
├── config/
│   ├── env.ts               ← validação Zod das env vars
│   └── logger.ts            ← pino logger (JSON em prod, pretty em dev)
├── services/
│   ├── cosmos.ts            ← cliente Cosmos singleton + helpers tipados
│   └── jwt.ts               ← sign/verify tokens
├── middleware/
│   ├── auth.ts              ← requireAuth, requireAdmin, optionalAuth
│   └── error-handler.ts     ← centraliza ZodError, HttpError, Error
├── routes/
│   ├── index.ts             ← aggregator
│   ├── health.ts            ← /api/health, /api/health/full
│   └── auth.ts              ← /api/auth/{register,login,me}
├── types/
│   └── http.ts              ← augment Express.Request com req.user
└── utils/
    └── http-errors.ts       ← HttpError, BadRequestError, etc
```

---

## 🛡️ Camadas de segurança

| Camada | Implementação |
|---|---|
| HTTPS | Forçado pelo App Service (httpsOnly: true em Bicep) |
| Helmet | CSP, HSTS, X-Frame-Options, etc. |
| CORS | Origins configurados via env CORS_ORIGINS |
| Rate limit global | 100 req/min por IP (configurável) |
| Rate limit auth | 10 req/min em /register e /login |
| JWT | HS256, expira em 7d (configurável) |
| Bcrypt | 10 rounds (configurável) |
| Body size | 256kb máximo |
| Senha mínima | 8 chars |
| Timing attack | Bcrypt rodado mesmo em e-mail inexistente |

---

## 🧪 Modo dev vs prod

| Modo | Logger | CSP | Stack traces |
|---|---|---|---|
| `development` | pretty colorido | desabilitada | retornadas no JSON |
| `production` | JSON estruturado | habilitada | apenas em logs |

Switch automático via `NODE_ENV`.

---

## 📦 Build de produção

```bash
npm run build --workspace=backend
# Gera backend/dist/server.js

npm start --workspace=backend
# Roda node backend/dist/server.js
```

O App Service usa `appCommandLine: 'node backend/dist/server.js'` (definido em `infra/modules/appservice.bicep`).

---

## 🐛 Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `Variáveis de ambiente inválidas` no startup | `.env` faltando ou inválido | `cp .env.example .env` e preencher |
| `cosmos ping failed` | Cosmos não acessível | Verificar `COSMOS_ENDPOINT`/`COSMOS_KEY`, rede |
| `TOO_MANY_REQUESTS` no login | Rate limit estourado | Esperar 1 min ou ajustar `RATE_LIMIT_*` |
| `Token inválido` no Bearer | JWT expirado ou JWT_SECRET diferente | Re-login |
| Build falha com `Cannot find module` | npm install não rodou no root | Rodar `npm install` no root do monorepo |
