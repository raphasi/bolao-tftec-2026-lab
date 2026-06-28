// =========================================================================
// Frontend Web App (SPA servida por mini-servidor Express)
// =========================================================================
// Reusa o MESMO App Service Plan do backend (passe planId). Serve o build do
// frontend (frontend/dist) via frontend-server/server.js. A URL da API vai
// embutida no build (VITE_API_BASE_URL), então este app não precisa de Cosmos
// nem JWT — só runtime Node + startup. Healthcheck em /healthz.
// =========================================================================

param appName string
param location string
param tags object

@description('Id do App Service Plan existente (reusa o plan do backend).')
param planId string

@description('SKU do plan — usado só pra decidir Always On (F1 não suporta).')
param skuName string = 'B1'

resource frontend 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: planId
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: skuName != 'F1'
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/healthz'
      appCommandLine: 'node server.js'
      appSettings: [
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'PORT', value: '8080' }
      ]
    }
  }
}

output appServiceName string = frontend.name
output defaultHostName string = frontend.properties.defaultHostName
