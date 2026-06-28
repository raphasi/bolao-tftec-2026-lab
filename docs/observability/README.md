# Observability — Bolão TFTEC Cloud

Recursos de observabilidade configurados em Sprint S4.

## Stack

| Componente | Resource Name | Propósito |
|---|---|---|
| **Application Insights** | `ai-fifa-bolao-tftec01` | Telemetria automática (requests, deps, traces, exceptions) |
| **Log Analytics Workspace** | `log-fifa-bolao-tftec01` | Storage backend pros logs (workspace-based) |
| **Health Check Cron** | Function `health-check-cron` | Self-monitoring a cada 5min |

## Como usar

### 1. Acessar logs

1. portal.azure.com → resource group `rg-fifa-bolao`
2. Abrir `ai-fifa-bolao-tftec01`
3. Menu lateral → **Logs**
4. Cole queries do `queries.kql` no editor

### 2. Queries pré-prontas

5 queries essenciais em [`queries.kql`](./queries.kql):

| ID | Query | Quando usar |
|---|---|---|
| **Q1** | Request rate por endpoint | Identificar hot paths e padrões de tráfego |
| **Q2** | Latency p50/p95/p99 | Detectar endpoints lentos (p95 > 1s) |
| **Q3** | Function executions timeline | Confirmar que changefeed está disparando |
| **Q4** | Cosmos RU consumption | Picos de uso (alerta visual se > 800 RU/s do free tier 1000) |
| **Q5** | 5xx errors com stack | Investigar server errors |

3 queries extras comentadas (descomente conforme necessidade):
- Q6: Active users
- Q7: Cold start detection
- Q8: SignalR broadcast success rate

### 3. Dashboard custom (opcional)

Pra montar dashboard fixo no portal:

1. Abra cada query em Logs Analytics
2. Click **Pin to dashboard** (top-right)
3. Selecione "Create new dashboard" ou existente
4. Repita pra 5 queries → dashboard completo

Export do dashboard (JSON) pode ser salvo em `dashboard.json` aqui pra IaC futura.

### 4. Health check automatizado

Function `health-check-cron` (timer trigger a cada 5min) faz `GET /api/health/full`. Logs viram telemetria automaticamente:

```kql
traces
| where cloud_RoleName == "func-fifa-bolao-tftec01"
| where operation_Name == "health-check-cron"
| where timestamp > ago(1h)
| order by timestamp desc
```

Se `cosmos.ok !== true` ou `status !== 'ok'`, log fica em **warn** level — facilita filtro:

```kql
traces
| where severityLevel >= 2  // Warning OR Error
| where cloud_RoleName == "func-fifa-bolao-tftec01"
```

## Alertas (backlog S5)

**Não configurados nesta sprint** — dependem de email infrastructure (SendGrid, adiado pra S5).

Quando S5 chegar, queries dispatch correspondentes:

- 5xx spike (>5 em 5min) → email admin
- Function failures (>3 em 10min) → email admin
- Cosmos RU > 800 sustained 5min → email warning
- Cold start avg > 10s → email info

Definição via `infra/modules/alerts.bicep` (a criar em S5).

## Acesso programático

Application Insights expõe REST API + SDK pra dashboards externos:

```bash
# Connection string (já configurada no Function App + App Service)
az functionapp config appsettings list \
  -g rg-fifa-bolao -n func-fifa-bolao-tftec01 \
  --query "[?name=='APPLICATIONINSIGHTS_CONNECTION_STRING'].value" -o tsv
```

## Custo

App Insights workspace-based:
- **Free tier**: 5GB/mês de ingestão
- **Atual estimado**: <100MB/mês (uso educacional baixo)
- **Custo S4**: $0
