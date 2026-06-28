// =========================================================================
// Function App (Windows Consumption Y1) — pontuação via Change Feed do Cosmos
// =========================================================================
// Consumption Plan Y1: 1M execuções/mês + 400k GB-s grátis FOREVER.
// Funções (Change Feed da matches-cache/predictions/specials):
//   - calc-predictions / calc-specials  → pontos por palpite/especial
//   - aggregate-leaderboard             → agrega pontos no leaderboard
//   - emit-leaderboard-update           → push em tempo real (SignalR)
//   - health-check-cron                 → timer de saúde
// Windows (não Linux): stamps de Linux Consumption têm disponibilidade
// regional irregular; Windows Y1 está em todos. Node roda idêntico.
// =========================================================================

param name string
param location string
param tags object

@secure()
param storageConnectionString string

param cosmosEndpoint string
@secure()
param cosmosKey string
param cosmosDatabase string

@secure()
param signalRConnectionString string

param appInsightsConnectionString string

param mainApiBaseUrl string

// -------------------------------------------------------------------------
// Consumption Plan (Y1 Windows)
// Razão Windows: stamps de Linux Consumption têm disponibilidade
// regional irregular; Windows Y1 está em todos os stamps.
// Node funciona idêntico em Windows + Y1 (mesmo runtime).
// -------------------------------------------------------------------------

resource consumptionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: false  // Windows
  }
}

// -------------------------------------------------------------------------
// Function App
// -------------------------------------------------------------------------

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: consumptionPlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      // Windows Functions: node version controlada via WEBSITE_NODE_DEFAULT_VERSION
      // ao invés de linuxFxVersion
      use32BitWorkerProcess: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [ '*' ]
        supportCredentials: false
      }
      appSettings: [
        // Runtime obrigatórios
        { name: 'AzureWebJobsStorage',      value: storageConnectionString }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: storageConnectionString }
        { name: 'WEBSITE_CONTENTSHARE',     value: toLower(name) }
        // Cosmos (acessado por SDK ou Cosmos binding)
        { name: 'COSMOS_ENDPOINT',          value: cosmosEndpoint }
        { name: 'COSMOS_KEY',               value: cosmosKey }
        { name: 'COSMOS_DATABASE',          value: cosmosDatabase }
        { name: 'CosmosDbConnection__accountEndpoint', value: cosmosEndpoint }  // Para binding moderno
        // OBRIGATÓRIO: connection string completa usada pelos triggers de Change Feed
        // (calc-predictions/calc-specials/aggregate-*/emit-*). Sem ela o host fica
        // "Running" mas a pontuação NUNCA roda (falha silenciosa). Self-host: o Bicep
        // já injeta aqui, sem depender do GitHub Actions nem de passo manual no Portal.
        { name: 'AzureWebJobsCosmosDBConnection', value: 'AccountEndpoint=${cosmosEndpoint};AccountKey=${cosmosKey};' }
        // SignalR (output binding)
        { name: 'AzureSignalRConnectionString', value: signalRConnectionString }
        // Integration
        { name: 'MAIN_API_BASE_URL',        value: mainApiBaseUrl }
        // Observability
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        // Build at deploy
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'ENABLE_ORYX_BUILD',        value: 'true' }
      ]
    }
  }
}

output id string = functionApp.id
output name string = functionApp.name
output defaultHostName string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
