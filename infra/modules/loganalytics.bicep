// =========================================================================
// Log Analytics Workspace — backing store do Application Insights
// =========================================================================
// Workspace-based AI é o padrão atual da Microsoft (clássico foi deprecated
// em 2024). 5GB/mês free, retenção 30 dias no PerGB2018.
// =========================================================================

param name string
param location string
param tags object

@description('Retenção em dias. Free tier permite até 30 dias.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: 1
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

output workspaceId string = workspace.id
output workspaceName string = workspace.name
