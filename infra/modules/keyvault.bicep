// =========================================================================
// Azure Key Vault — secrets management do bolão (S4)
// =========================================================================
// Armazena secrets que antes ficavam em App Service env vars OU GitHub:
//   - cosmos-endpoint, cosmos-key, cosmos-database
//   - jwt-secret
//   - signalr-connection-string
//   - sendgrid-api-key (placeholder pra S5)
//
// Acesso:
//   - Service Principal github-actions-bolao: role 'Key Vault Secrets User'
//   - Managed identities de App Service/Function (futuro S5)
//
// Standard tier (free para até 25K operações/mês — suficiente).
// =========================================================================

@description('Nome do Key Vault (3-24 chars, alphanumeric+hyphens).')
@minLength(3)
@maxLength(24)
param name string

@description('Localização Azure (mesmo região do rg).')
param location string

@description('Tags.')
param tags object

@description('AAD tenant ID (default = tenant da subscription).')
param tenantId string = subscription().tenantId

@description('Object ID do Service Principal github-actions-bolao para grant de leitura.')
param githubActionsSpObjectId string = ''

// -------------------------------------------------------------------------
// Key Vault — RBAC mode (preferred over access policies)
// -------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: null
    publicNetworkAccess: 'Enabled'
    accessPolicies: []
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// -------------------------------------------------------------------------
// Role assignment: SP github-actions-bolao → Key Vault Secrets User
// -------------------------------------------------------------------------
// Role definition ID built-in 'Key Vault Secrets User': 4633458b-17de-408a-b874-0445c86b69e6
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource githubSpRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(githubActionsSpObjectId)) {
  name: guid(keyVault.id, githubActionsSpObjectId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: githubActionsSpObjectId
    principalType: 'ServicePrincipal'
  }
}

// -------------------------------------------------------------------------
// Outputs
// -------------------------------------------------------------------------
output vaultName string = keyVault.name
output vaultUri string = keyVault.properties.vaultUri
