// =========================================================================
// SignalR Service — real-time pra leaderboard
// =========================================================================
// Free tier: 20 conexões concorrentes, 20k mensagens/dia.
// Modo Serverless: usado quando Functions fazem broadcast e clientes se
// conectam diretamente (não precisamos de hub server-side no Express).
// =========================================================================

param name string
param location string
param tags object

@description('SKU. Free_F1 é gratuito (20 conexões), Standard_S1 cobra ~$50/mês (1000 conexões).')
@allowed([ 'Free_F1', 'Standard_S1' ])
param skuName string = 'Free_F1'

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        // Modo Serverless: clientes conectam direto, Functions publicam
        // via output binding. Não precisamos de hub server-side.
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'true'
      }
    ]
    cors: {
      allowedOrigins: [ '*' ]  // restringir em produção
    }
    publicNetworkAccess: 'Enabled'
  }
}

output id string = signalR.id
output name string = signalR.name
output hostName string = signalR.properties.hostName

@secure()
output connectionString string = signalR.listKeys().primaryConnectionString
