// =========================================================================
// Cosmos DB (NoSQL API) — banco do bolão
// =========================================================================
// Provisiona conta + database + 14 containers (9 de dados: users, predictions,
// specials, matches-cache, leaderboard, groups, players, config, audit-log;
// + 5 leases-* para os checkpoints do Change Feed) com partition keys otimizadas.
//
// Free Tier: 1000 RU/s + 25GB grátis forever. Limite: 1 conta com free tier
// por subscription. Os 1000 RU/s são compartilhados entre todos os containers
// quando provisionados no nível de database (que é o que fazemos aqui).
// =========================================================================

@description('Nome global da conta Cosmos.')
param accountName string

@description('Nome do database.')
param databaseName string

@description('Localização Azure.')
param location string

@description('Tags.')
param tags object

@description('Habilita Free Tier (1000 RU/s grátis). Apenas 1 por subscription.')
param enableFreeTier bool = true

@description('Throughput total compartilhado no database (mínimo 400, free tier cobre 1000).')
param sharedThroughput int = 1000

// -------------------------------------------------------------------------
// Conta Cosmos
// -------------------------------------------------------------------------

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-08-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableFreeTier
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: []
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

// -------------------------------------------------------------------------
// Database com throughput compartilhado (cabe no free tier)
// -------------------------------------------------------------------------

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-08-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: {
      throughput: sharedThroughput
    }
  }
}

// -------------------------------------------------------------------------
// Containers
// -------------------------------------------------------------------------

// Helper: definição padrão de índice. Indexa todos os paths exceto _etag
// (otimização padrão recomendada pela Microsoft).
var defaultIndexingPolicy = {
  indexingMode: 'consistent'
  automatic: true
  includedPaths: [
    { path: '/*' }
  ]
  excludedPaths: [
    { path: '/_etag/?' }
  ]
}

// users: cadastros do bolão. PK por userId (hot path: validar login do user X).
resource containerUsers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: [ '/userId' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
      uniqueKeyPolicy: {
        uniqueKeys: [
          { paths: [ '/email' ] }
        ]
      }
    }
  }
}

// predictions: palpites de jogos. PK por userId (hot path: meus palpites).
// Composite indexes para listar palpites ordenados por kickoff.
resource containerPredictions 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'predictions'
  properties: {
    resource: {
      id: 'predictions'
      partitionKey: {
        paths: [ '/userId' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/_etag/?' } ]
        compositeIndexes: [
          [
            { path: '/userId', order: 'ascending' }
            { path: '/kickoffUtc', order: 'ascending' }
          ]
          // S4.5 (E-2): otimiza Function calc-predictions query
          // SELECT * FROM c WHERE c.matchId = X — cross-partition, agora indexado
          [
            { path: '/matchId', order: 'ascending' }
            { path: '/points', order: 'ascending' }
          ]
        ]
      }
    }
  }
}

// specials: palpites especiais (campeão, top 4, artilheiro). 1 doc por user.
resource containerSpecials 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'specials'
  properties: {
    resource: {
      id: 'specials'
      partitionKey: {
        paths: [ '/userId' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// matches-cache: cópia local dos jogos puxados do main app.
// PK por groupCode pra ler grupo inteiro em 1 query barata.
resource containerMatches 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'matches-cache'
  properties: {
    resource: {
      id: 'matches-cache'
      partitionKey: {
        paths: [ '/groupCode' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// leaderboard: ranking agregado. PK por season (single shard).
// Dataset pequeno, leitura rápida do ranking inteiro.
resource containerLeaderboard 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leaderboard'
  properties: {
    resource: {
      id: 'leaderboard'
      partitionKey: {
        paths: [ '/season' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/_etag/?' } ]
        compositeIndexes: [
          [
            { path: '/season', order: 'ascending' }
            { path: '/totalPoints', order: 'descending' }
          ]
        ]
      }
    }
  }
}

// groups: composição de grupos da Copa. PK por season (single shard).
// Dataset minúsculo (12 docs por season). Adicionado em S2.1.
resource containerGroups 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'groups'
  properties: {
    resource: {
      id: 'groups'
      partitionKey: {
        paths: [ '/season' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// players: catálogo de jogadores p/ o artilheiro. PK por season (single shard).
// 48 docs (1 por seleção, ~26 jogadores cada). Espelha groups.
resource containerPlayers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'players'
  properties: {
    resource: {
      id: 'players'
      partitionKey: {
        paths: [ '/season' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// config: configurações globais administradas pelo admin. PK por scope.
// Dataset minúsculo (1 doc 'specials-lock', extensível). Adicionado em S2.7.
resource containerConfig 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'config'
  properties: {
    resource: {
      id: 'config'
      partitionKey: {
        paths: [ '/scope' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// =========================================================================
// Lease containers para Cosmos Change Feed (S3 Functions)
// =========================================================================
// Cada Function changefeed-triggered precisa de seu próprio container de lease.
// PK fixo /id (padrão Azure Functions SDK).
// Dataset minúsculo (~1 doc por lease), throughput shared do database.

resource containerLeasesCalc 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leases-calc'
  properties: {
    resource: {
      id: 'leases-calc'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

resource containerLeasesSpecials 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leases-specials'
  properties: {
    resource: {
      id: 'leases-specials'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

resource containerLeasesAggPred 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leases-aggregate-predictions'
  properties: {
    resource: {
      id: 'leases-aggregate-predictions'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

resource containerLeasesAggSpec 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leases-aggregate-specials'
  properties: {
    resource: {
      id: 'leases-aggregate-specials'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// emit-leaderboard-update lease (S3.5)
resource containerLeasesEmit 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'leases-emit-leaderboard'
  properties: {
    resource: {
      id: 'leases-emit-leaderboard'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: defaultIndexingPolicy
    }
  }
}

// audit-log: rastreio de ações administrativas (S4.5.3)
// PK por performedBy → query "tudo que admin X fez" é PK lookup barato.
// TTL 1 ano (Cosmos auto-delete antigos), evita crescer infinito.
resource containerAuditLog 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: database
  name: 'audit-log'
  properties: {
    resource: {
      id: 'audit-log'
      partitionKey: {
        paths: [ '/performedBy' ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/_etag/?' } ]
        compositeIndexes: [
          [
            { path: '/performedBy', order: 'ascending' }
            { path: '/timestamp', order: 'descending' }
          ]
          [
            { path: '/targetUserId', order: 'ascending' }
            { path: '/timestamp', order: 'descending' }
          ]
        ]
      }
      defaultTtl: 31536000
    }
  }
}

// -------------------------------------------------------------------------
// Outputs
// -------------------------------------------------------------------------

output endpoint string = cosmos.properties.documentEndpoint
output accountName string = cosmos.name
output databaseName string = database.name
@secure()
output primaryKey string = cosmos.listKeys().primaryMasterKey
