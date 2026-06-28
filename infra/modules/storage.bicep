// =========================================================================
// Storage Account — requerido pelas Azure Functions
// =========================================================================
// Standard LRS é o mais barato. 5GB free tier para blob.
// Nome deve ser 3-24 chars, lowercase, alfanumérico (sem hífens).
// =========================================================================

@description('Nome global da storage account (lowercase, sem hífens, 3-24 chars).')
@minLength(3)
@maxLength(24)
param name string

param location string
param tags object

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true  // requerido pelas Functions
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

output id string = storage.id
output name string = storage.name
output primaryEndpoint string = storage.properties.primaryEndpoints.blob

@secure()
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
