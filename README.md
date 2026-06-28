# Bolão TFTEC Cloud — FIFA World Cup 2026

Aplicação independente de palpites da Copa do Mundo FIFA 2026, parte do evento educacional **TFTEC Cloud**. Construída como exemplo prático de arquitetura distribuída na Azure.

> Este projeto é **separado** do app principal de vendas de ingressos (`fifa2026-tickets-dev`). Os dois apps são independentes e podem ser deployados de forma autônoma.

---

## 🏗️ Arquitetura

```
Frontend (React + Vite + TS)
        │
        ▼
Backend (Express + TS)
        │
   ┌────┴─────────┐
   ▼              ▼
Cosmos DB     SignalR Service
   ▲              ▲
   │              │
Azure Functions ──┘
(sync-matches, calculate-points)
```

**Stack:**
- Frontend: React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Express + TypeScript + @azure/cosmos SDK
- Auth: bcrypt + JWT (próprio do bolão)
- Database: Azure Cosmos DB (NoSQL)
- Async: Azure Functions (Node 20, Consumption Plan)
- Real-time: Azure SignalR Service (Free tier)
- Deploy: Azure App Service B1 Linux
- CI/CD: GitHub Actions

**Recursos Azure (todos free tier ou trial-compatible):**
- Resource Group: `rg-fifa-bolao` (East US)
- App Service Plan B1 (Linux Node 20)
- Cosmos DB (Free Tier — 1000 RU/s, 25GB)
- Functions (Consumption — 1M req/mês free forever)
- SignalR Service (Free — 20 conexões)
- Storage Account (req. das Functions — 5GB free)
- Application Insights (5GB/mês free)

---

## 🚀 Quickstart

```bash
# 1. Pré-requisitos
- Conta Azure (trial ou paga)
- Azure CLI (az)
- Node 20+
- Git

# 2. Clone
git clone https://github.com/TFTEC/fifa2026-bolao-dev
cd fifa2026-bolao-dev

# 3. Provisionar infra Azure (Bicep)
az login
az group create --name rg-fifa-bolao --location eastus
az deployment group create \
  --resource-group rg-fifa-bolao \
  --template-file infra/main.bicep \
  --parameters infra/parameters.example.json

# 4. Popular Cosmos com dados iniciais
npm install
npm run seed

# 5. Deploy (método canônico — Run-From-Package)
bash scripts/deploy.sh
```

Documentação detalhada em [`docs/`](./docs).

📘 **Para deploy do código no Azure, sempre use [`docs/deploy-runbook.md`](./docs/deploy-runbook.md).**
Procedimento validado, 5-8 min, 7 smoke tests automáticos.

---

## 📚 Documentação

### Guias de reprodução (3 caminhos)
| Caminho | Quando usar |
|---|---|
| 📘 [`docs/setup-bicep.md`](docs/setup-bicep.md) | **Oficial.** IaC reproduzível e idempotente |
| ⚙️ [`docs/setup-cli.md`](docs/setup-cli.md) | Aprender Azure CLI imperativo |
| 🖼️ [`docs/setup-portal.md`](docs/setup-portal.md) | Visual, primeira vez no Azure |

### Referência
| Doc | Conteúdo |
|---|---|
| 🏗️ [`docs/architecture.md`](docs/architecture.md) | Arquitetura completa + diagrama + fluxos |
| 🚀 [`docs/deploy-runbook.md`](docs/deploy-runbook.md) | **Runbook oficial de deploy (Run-From-Package)** |
| 🏆 [`docs/scoring-rules.md`](docs/scoring-rules.md) | Regras de pontuação com exemplos |
| 🔥 [`docs/troubleshooting.md`](docs/troubleshooting.md) | Problemas comuns + soluções |
| 🎨 [`docs/brand/`](docs/brand/) | Identidade visual TFTEC Cloud |
| 📦 [`backend/README.md`](backend/README.md) | API endpoints e estrutura |
| 🏗️ [`infra/README.md`](infra/README.md) | Detalhes dos templates Bicep |
| 📋 [`SPRINT.md`](SPRINT.md) | Sprint tracker (status atual) |
| 📋 [`DECISIONS.md`](DECISIONS.md) | ADRs (decisões arquiteturais) |

---

## 🎯 Sprint Atual

Acompanhe em [`SPRINT.md`](./SPRINT.md). Decisões arquiteturais em [`DECISIONS.md`](./DECISIONS.md).

---

## 📄 Licença

Uso educacional — TFTEC Cloud 2026.
