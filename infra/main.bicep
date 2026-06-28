// =========================================================================
// Bolão TFTEC Cloud — Infraestrutura Azure (orquestrador)
// =========================================================================
// Provisiona toda a infraestrutura do bolão num único deployment:
//   - Cosmos DB (Free Tier) com database e 14 containers
//   - App Service Plan B1 Linux + App Service (backend Express)
//   - Frontend Web App (SPA, reusa o mesmo plan)
//   - Storage Account (requerido pelas Functions)
//   - Function App (Consumption) — pontuação via Change Feed
//   - SignalR Service (Free tier, modo serverless)
//   - Application Insights + Log Analytics Workspace
//
// Como executar:
//   az group create --name rg-fifa-bolao --location eastus
//   az deployment group create \
//     --resource-group rg-fifa-bolao \
//     --template-file infra/main.bicep \
//     --parameters infra/parameters.example.json \
//     --parameters nameSuffix=<seu-id-unico>
//
// Cabe inteiramente no trial de $200 + free tiers (Cosmos 1000 RU/s,
// Functions 1M req/mês, SignalR 20 conexões, AppInsights 5GB).
// =========================================================================

targetScope = 'resourceGroup'

// -------------------------------------------------------------------------
// Parameters
// -------------------------------------------------------------------------

@description('Localização Azure dos recursos. Numa conta trial, a quota de App Service costuma ser zero na maioria das regiões (erro "Total VMs: 0"). ANTES de escolher, descubra uma região que a SUA trial libera: crie um App Service Plan F1 de teste em algumas regiões (az appservice plan create --sku F1) e use a que funcionar. East US é a mais barata quando disponível.')
param location string = 'eastus'

@description('Sufixo único para os recursos (3-12 chars, lowercase). Exemplo: rapha01, joao2026. Garante unicidade global.')
@minLength(3)
@maxLength(12)
param nameSuffix string

@description('Prefixo padrão dos recursos.')
param namePrefix string = 'fifa-bolao'

@description('Ambiente: dev | stage | prod')
@allowed([ 'dev', 'stage', 'prod' ])
param environment string = 'dev'

@description('Tags aplicadas a todos os recursos.')
param tags object = {
  project: 'fifa2026-bolao'
  managedBy: 'bicep'
  owner: 'tftec-cloud'
  environment: environment
}

@description('Habilita Free Tier no Cosmos DB. Apenas 1 conta com free tier por subscription. Deixe true se ainda não tem outra.')
param cosmosEnableFreeTier bool = true

@description('SKU do App Service Plan. B1 é o mínimo com Always On.')
@allowed([ 'F1', 'B1', 'B2', 'S1', 'P1V2' ])
param appServiceSkuName string = 'B1'

@description('Segredo usado para assinar JWTs no backend. Use openssl rand -base64 32.')
@secure()
param jwtSecret string

@description('OPCIONAL. URL base de uma API externa de jogos (integração avançada). No self-host pode ficar em branco — o app funciona sem ela.')
param mainApiBaseUrl string = ''

// -------------------------------------------------------------------------
// Variáveis derivadas — naming dos recursos
// -------------------------------------------------------------------------

var cosmosAccountName     = 'cosmos-${namePrefix}-${nameSuffix}'
var cosmosDatabaseName    = 'bolao2026'
var appServicePlanName    = 'plan-${namePrefix}-${nameSuffix}'
var appServiceName        = 'app-${namePrefix}-${nameSuffix}'
var frontendAppName       = 'app-${namePrefix}-web-${nameSuffix}'
var functionAppName       = 'func-${namePrefix}-${nameSuffix}'
var storageAccountName    = toLower(replace('st${namePrefix}${nameSuffix}', '-', ''))
var signalRName           = 'signalr-${namePrefix}-${nameSuffix}'
var appInsightsName       = 'ai-${namePrefix}-${nameSuffix}'
var logAnalyticsName      = 'log-${namePrefix}-${nameSuffix}'

// -------------------------------------------------------------------------
// Módulos
// -------------------------------------------------------------------------

module logAnalytics 'modules/loganalytics.bicep' = {
  name: 'deploy-loganalytics'
  params: {
    name: logAnalyticsName
    location: location
    tags: tags
  }
}

module appInsights 'modules/appinsights.bicep' = {
  name: 'deploy-appinsights'
  params: {
    name: appInsightsName
    location: location
    tags: tags
    workspaceId: logAnalytics.outputs.workspaceId
  }
}

module cosmos 'modules/cosmos.bicep' = {
  name: 'deploy-cosmos'
  params: {
    accountName: cosmosAccountName
    databaseName: cosmosDatabaseName
    location: location
    tags: tags
    enableFreeTier: cosmosEnableFreeTier
  }
}

module storage 'modules/storage.bicep' = {
  name: 'deploy-storage'
  params: {
    name: storageAccountName
    location: location
    tags: tags
  }
}

module signalr 'modules/signalr.bicep' = {
  name: 'deploy-signalr'
  params: {
    name: signalRName
    location: location
    tags: tags
  }
}

module appService 'modules/appservice.bicep' = {
  name: 'deploy-appservice'
  params: {
    planName: appServicePlanName
    appName: appServiceName
    location: location
    tags: tags
    skuName: appServiceSkuName
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmos.outputs.primaryKey
    cosmosDatabase: cosmosDatabaseName
    signalRConnectionString: signalr.outputs.connectionString
    appInsightsConnectionString: appInsights.outputs.connectionString
    jwtSecret: jwtSecret
    mainApiBaseUrl: mainApiBaseUrl
  }
}

// Frontend Web App — reusa o MESMO plan do backend (sem custo de plan extra).
module frontend 'modules/frontend.bicep' = {
  name: 'deploy-frontend'
  params: {
    appName: frontendAppName
    location: location
    tags: tags
    planId: appService.outputs.planId
    skuName: appServiceSkuName
  }
}

module functionApp 'modules/functions.bicep' = {
  name: 'deploy-functions'
  params: {
    name: functionAppName
    location: location
    tags: tags
    storageConnectionString: storage.outputs.connectionString
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmos.outputs.primaryKey
    cosmosDatabase: cosmosDatabaseName
    signalRConnectionString: signalr.outputs.connectionString
    appInsightsConnectionString: appInsights.outputs.connectionString
    mainApiBaseUrl: mainApiBaseUrl
  }
}

// -------------------------------------------------------------------------
// Outputs (úteis para CI/CD e seed script)
// -------------------------------------------------------------------------

output cosmosEndpoint string = cosmos.outputs.endpoint
output cosmosDatabaseName string = cosmosDatabaseName
output appServiceUrl string = appService.outputs.defaultHostName
output frontendUrl string = frontend.outputs.defaultHostName
output functionAppName string = functionApp.outputs.name
output signalRHostName string = signalr.outputs.hostName
output appInsightsConnectionString string = appInsights.outputs.connectionString

@description('Comando para popular o Cosmos com seed inicial após o deploy.')
output seedCommand string = 'COSMOS_ENDPOINT=${cosmos.outputs.endpoint} COSMOS_DATABASE=${cosmosDatabaseName} npm run seed'
