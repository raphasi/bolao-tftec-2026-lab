// =========================================================================
// App Service Plan + App Service (backend Express + frontend estático)
// =========================================================================
// B1 Linux Node 20 LTS. Always On habilitado pra evitar cold start.
// O app é deployado como Node app — backend Express serve API e arquivos
// estáticos do build do frontend (dist/).
// =========================================================================

param planName string
param appName string
param location string
param tags object

@description('SKU do App Service Plan. B1 mínimo recomendado para Always On.')
@allowed([ 'F1', 'B1', 'B2', 'S1', 'P1V2' ])
param skuName string = 'B1'

// Endereços e credenciais injetados como app settings
param cosmosEndpoint string
@secure()
param cosmosKey string
param cosmosDatabase string

@secure()
param signalRConnectionString string

param appInsightsConnectionString string

@secure()
param jwtSecret string

param mainApiBaseUrl string

// -------------------------------------------------------------------------
// App Service Plan (Linux)
// -------------------------------------------------------------------------

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  kind: 'linux'
  properties: {
    reserved: true  // Linux marker
  }
}

// -------------------------------------------------------------------------
// App Service (Linux Node 20)
// -------------------------------------------------------------------------

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'  // Managed Identity para futuro acesso a Key Vault
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: skuName != 'F1'  // F1 não suporta Always On
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/health'
      appCommandLine: 'node backend/dist/server.js'
      appSettings: [
        // Cosmos
        { name: 'COSMOS_ENDPOINT',          value: cosmosEndpoint }
        { name: 'COSMOS_KEY',               value: cosmosKey }
        { name: 'COSMOS_DATABASE',          value: cosmosDatabase }
        // SignalR
        { name: 'SIGNALR_CONNECTION_STRING', value: signalRConnectionString }
        // Auth
        { name: 'JWT_SECRET',               value: jwtSecret }
        { name: 'JWT_EXPIRES_IN',           value: '7d' }
        // Integration
        { name: 'MAIN_API_BASE_URL',        value: mainApiBaseUrl }
        // Runtime
        { name: 'NODE_ENV',                 value: 'production' }
        { name: 'PORT',                     value: '8080' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        // Observability
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'ApplicationInsightsAgent_EXTENSION_VERSION', value: '~3' }
        { name: 'XDT_MicrosoftApplicationInsights_Mode', value: 'recommended' }
      ]
    }
  }
}

// -------------------------------------------------------------------------
// Outputs
// -------------------------------------------------------------------------

output appServiceId string = app.id
output appServiceName string = app.name
output defaultHostName string = app.properties.defaultHostName
output principalId string = app.identity.principalId
output planId string = plan.id
