// =========================================================================
// Azure Front Door Premium + WAF — borda pública do Bolão (ADR-021)
// =========================================================================
// Coloca 1 endpoint AFD Premium na frente das DUAS Web Apps existentes
// (frontend SPA + API), sob o MESMO hostname (same-origin):
//   /api/*  -> origin group da API  (probe /api/health)
//   /*      -> origin group do front (probe /healthz)
//
// WAF Premium em Prevention: Managed DRS 2.1 + Bot Manager 1.1 + custom
// rate-limit NAT-aware escopado em /api/*. Associado ao domínio do endpoint
// por uma securityPolicy.
//
// IMPORTANTE: módulo STANDALONE. NÃO é referenciado por main.bicep — deploy
// isolado p/ NÃO reconciliar o resto do stack de prod:
//   az deployment group create -g rg-fifa-bolao \
//     --template-file infra/modules/frontdoor.bicep \
//     --parameters infra/parameters.frontdoor.json
//
// É ADITIVO: não toca as Web Apps. O lock "só-AFD" (ipSecurityRestrictions
// nas Web Apps) é um passo SEPARADO de cutover, feito só após validar o AFD.
// =========================================================================

targetScope = 'resourceGroup'

@description('Sufixo único dos recursos (igual ao do stack: tftec01).')
@minLength(3)
@maxLength(12)
param nameSuffix string

@description('Prefixo padrão dos recursos.')
param namePrefix string = 'fifa-bolao'

@description('Hostname default da Web App de FRONTEND (sem https://).')
param frontendHostName string

@description('Hostname default da Web App de API (sem https://).')
param apiHostName string

@description('Modo do WAF. Prevention bloqueia; Detection só registra (rollback).')
@allowed([ 'Prevention', 'Detection' ])
param wafMode string = 'Prevention'

@description('Limiar de rate-limit por IP no WAF, escopado em /api/* (janela = rateLimitWindowMinutes). ALTO de propósito: a turma sai por 1 IP via NAT, então o contador é POR-SALA, não por-aluno. Dimensionar por tráfego AGREGADO (N_ativos x ~15 req/min x 5min x folga). 6000/5min ~= 100 ativos com folga; REMEDIR no ensaio.')
param apiRateLimitThreshold int = 6000

@description('Limiar de rate-limit por IP escopado em /api/auth/* (brute-force/credential-stuffing). Baixo: login/register não têm volume legítimo alto nem para a sala toda. Per-IP-EXTERNO estrangula o atacante sem tocar a navegação.')
param authRateLimitThreshold int = 300

@description('Janela do rate-limit em minutos (AFD aceita 1 ou 5).')
@allowed([ 1, 5 ])
param rateLimitWindowMinutes int = 5

@description('Filtro geográfico. Em Detection/calibração deixe Log (só registra tráfego não-BR sem bloquear, p/ não barrar VPN/aluno viajando). Pode virar Block sob ataque no evento.')
@allowed([ 'Log', 'Block' ])
param geoFilterAction string = 'Log'

@description('Hostname do domínio próprio (custom domain) na borda. Vazio = só o domínio default *.azurefd.net.')
param customDomainHostName string = 'bolao.tftec.com.br'

@description('Nome do Key Vault que guarda o cert BYOC do custom domain.')
param keyVaultName string = 'kv-bolao-tftec01'

@description('Nome do secret/certificado no Key Vault (PFX importado).')
param certSecretName string = 'bolao-tftec-com-br'

@description('false = só cria o custom domain + secret (gera o token de validação DNS, NÃO anexa nas rotas). true = anexa o custom domain nas rotas /* e /api/* e na securityPolicy do WAF. Estratégia: 1º deploy false (pegar token) → DNS validar → 2º deploy true.')
param attachCustomDomain bool = false

@description('Tags aplicadas aos recursos.')
param tags object = {
  project: 'fifa2026-bolao'
  managedBy: 'bicep'
  owner: 'tftec-cloud'
  component: 'frontdoor-waf'
}

// -------------------------------------------------------------------------
// Naming
// -------------------------------------------------------------------------
var profileName    = 'afd-${namePrefix}-${nameSuffix}'
var endpointName   = 'fd-${namePrefix}-${nameSuffix}'
var ogWebName      = 'og-web'
var ogApiName      = 'og-api'
var wafPolicyName  = toLower(replace('waf${namePrefix}${nameSuffix}', '-', '')) // alfanumérico only
var secPolicyName  = 'sp-${namePrefix}-${nameSuffix}'

// -------------------------------------------------------------------------
// Front Door Premium profile + endpoint
// -------------------------------------------------------------------------
resource profile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: profileName
  location: 'global'
  tags: tags
  // SystemAssigned: a MI do profile lê o cert BYOC no Key Vault (role Key Vault
  // Secrets User no kv-bolao-tftec01). DECLARAR aqui é OBRIGATÓRIO — sem isto o
  // deploy reconciliaria o profile p/ SEM identidade e o custom domain perderia
  // acesso ao cert.
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Premium_AzureFrontDoor' // Premium = obrigatório p/ Managed Rules (OWASP DRS) + Bot Manager
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: profile
  name: endpointName
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

// -------------------------------------------------------------------------
// Custom domain BYOC — bolao.tftec.com.br servido com cert próprio (PFX) do KV
// -------------------------------------------------------------------------
// Referência ao secret do Key Vault que guarda o PFX importado. O id ARM deste
// recurso (NÃO a URL data-plane) é o que o AFD secret consome.
resource kvCert 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  name: '${keyVaultName}/${certSecretName}'
}

// Secret do AFD apontando pro cert do KV. useLatestVersion: a MI do profile
// puxa a versão atual (auto-rotação se o PFX for re-importado no KV).
resource afdSecret 'Microsoft.Cdn/profiles/secrets@2023-05-01' = {
  parent: profile
  name: 'cert-${certSecretName}'
  properties: {
    parameters: {
      type: 'CustomerCertificate'
      useLatestVersion: true
      secretSource: {
        id: kvCert.id
      }
    }
  }
}

// Custom domain. Validação de posse via DNS TXT (_dnsauth.<host>) — o token sai
// no output. Sem azureDnsZone (a zona é externa: registros criados à mão).
resource customDomain 'Microsoft.Cdn/profiles/customDomains@2023-05-01' = {
  parent: profile
  name: replace(customDomainHostName, '.', '-')
  properties: {
    hostName: customDomainHostName
    tlsSettings: {
      certificateType: 'CustomerCertificate'
      minimumTlsVersion: 'TLS12'
      secret: {
        id: afdSecret.id
      }
    }
  }
}

// -------------------------------------------------------------------------
// Origin group + origin — FRONTEND (probe /healthz)
// -------------------------------------------------------------------------
resource ogWeb 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: profile
  name: ogWebName
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/healthz'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource originWeb 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: ogWeb
  name: 'origin-web'
  properties: {
    hostName: frontendHostName
    originHostHeader: frontendHostName
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

// -------------------------------------------------------------------------
// Origin group + origin — API (probe /api/health — liveness simples, NÃO /full)
// -------------------------------------------------------------------------
resource ogApi 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: profile
  name: ogApiName
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/api/health' // liveness simples; /api/health/full pinga Cosmos e pode dar 503 -> origin Unhealthy
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource originApi 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: ogApi
  name: 'origin-api'
  properties: {
    hostName: apiHostName
    originHostHeader: apiHostName
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

// -------------------------------------------------------------------------
// Rotas — /api/* -> API (sem cache);  /* -> frontend (cache estático)
// AFD casa o padrão mais específico primeiro (/api/* vence /*).
// -------------------------------------------------------------------------
resource routeApi 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'route-api'
  dependsOn: [ originApi ] // origin provisionado antes da rota (dep do customDomain é inferida)
  properties: {
    originGroup: { id: ogApi.id }
    supportedProtocols: [ 'Http', 'Https' ]
    patternsToMatch: [ '/api/*' ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    // só anexa o custom domain quando attachCustomDomain=true (pós-validação DNS)
    customDomains: attachCustomDomain ? [ { id: customDomain.id } ] : []
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    // sem cacheConfiguration = API não é cacheada
  }
}

resource routeWeb 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'route-web'
  dependsOn: [ originWeb, routeApi ] // rotas no mesmo endpoint: criar em série evita corrida
  properties: {
    originGroup: { id: ogWeb.id }
    supportedProtocols: [ 'Http', 'Https' ]
    patternsToMatch: [ '/*' ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    // só anexa o custom domain quando attachCustomDomain=true (pós-validação DNS)
    customDomains: attachCustomDomain ? [ { id: customDomain.id } ] : []
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    cacheConfiguration: {
      queryStringCachingBehavior: 'IgnoreQueryString'
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: [
          'text/html'
          'text/css'
          'application/javascript'
          'application/json'
          'image/svg+xml'
        ]
      }
    }
  }
}

// -------------------------------------------------------------------------
// WAF policy Premium — Prevention: DRS 2.1 + Bot Manager 1.1 + rate-limit /api
// -------------------------------------------------------------------------
resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: wafPolicyName
  location: 'global'
  tags: tags
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: wafMode // Detection no ensaio (D-2/D-1) → Prevention na estreia (11/06)
      // Privacidade: NUNCA logar as senhas dos alunos quando uma regra disparar
      // sobre o corpo de /api/auth (matchedValue iria a claro p/ o Log Analytics).
      logScrubbing: {
        state: 'Enabled'
        scrubbingRules: [
          { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'password', state: 'Enabled' }
          { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'currentPassword', state: 'Enabled' }
          { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'newPassword', state: 'Enabled' }
        ]
      }
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
          ruleSetAction: 'Block'
          // B4: senha/nome NUNCA devem ser inspecionados pelas regras SQLi/XSS —
          // são blobs opacos (vão p/ bcrypt / Cosmos parametrizado / React escapa).
          // Sem isto, senha com ' -- < > or/and dá 403 no login legítimo.
          exclusions: [
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'password' }
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'currentPassword' }
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'newPassword' }
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'name' }
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'homeTeam' }
            { matchVariable: 'RequestBodyJsonArgNames', selectorMatchOperator: 'Equals', selector: 'awayTeam' }
          ]
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.1'
        }
      ]
    }
    customRules: {
      rules: [
        // (80) Bloqueia métodos exóticos — a API só usa GET/POST/PUT/PATCH/1×DELETE.
        {
          name: 'blockExoticMethods'
          enabledState: 'Enabled'
          priority: 80
          ruleType: 'MatchRule'
          matchConditions: [
            {
              matchVariable: 'RequestMethod'
              operator: 'Equal'
              negateCondition: false
              matchValue: [ 'TRACE', 'TRACK', 'CONNECT' ]
            }
          ]
          action: 'Block'
        }
        // (90) Rate-limit APERTADO em /api/auth/* — anti-brute-force, per-IP-externo.
        {
          name: 'authRateLimitPerIp'
          enabledState: 'Enabled'
          priority: 90
          ruleType: 'RateLimitRule'
          rateLimitThreshold: authRateLimitThreshold
          rateLimitDurationInMinutes: rateLimitWindowMinutes
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Contains'
              negateCondition: false
              matchValue: [ '/api/auth/' ]
              transforms: [ 'Lowercase' ]
            }
          ]
          action: 'Block'
        }
        // (100) Rate-limit GERAL de /api/* — guarda volumétrica de borda (DoS).
        {
          name: 'apiRateLimitPerIp'
          enabledState: 'Enabled'
          priority: 100
          ruleType: 'RateLimitRule'
          rateLimitThreshold: apiRateLimitThreshold
          rateLimitDurationInMinutes: rateLimitWindowMinutes
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Contains'
              negateCondition: false
              matchValue: [ '/api/' ]
              transforms: [ 'Lowercase' ]
            }
          ]
          action: 'Block'
        }
        // (110) Geo: tráfego NÃO-BR. Em Log (default) só registra (visibilidade do
        // scanner internacional) sem barrar VPN/aluno viajando; vira Block sob ataque.
        {
          name: 'geoNonBr'
          enabledState: 'Enabled'
          priority: 110
          ruleType: 'MatchRule'
          matchConditions: [
            {
              matchVariable: 'RemoteAddr'
              operator: 'GeoMatch'
              negateCondition: true
              matchValue: [ 'BR' ]
            }
          ]
          action: geoFilterAction
        }
      ]
    }
  }
}

// -------------------------------------------------------------------------
// Security policy — associa o WAF ao domínio default do endpoint (/*)
// -------------------------------------------------------------------------
resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = {
  parent: profile
  name: secPolicyName
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          // WAF cobre o domínio default SEMPRE e o custom domain quando anexado.
          // Sem incluir o custom domain aqui, o tráfego pelo bolao.tftec.com.br
          // passaria SEM WAF.
          domains: attachCustomDomain ? [
            { id: endpoint.id }
            { id: customDomain.id }
          ] : [
            { id: endpoint.id }
          ]
          patternsToMatch: [ '/*' ]
        }
      ]
    }
  }
}

// -------------------------------------------------------------------------
// Outputs — usados no cutover (isolamento por X-Azure-FDID) e na validação
// -------------------------------------------------------------------------
@description('Hostname público do Front Door — a URL que os alunos vão acessar.')
output frontDoorEndpointHostName string = endpoint.properties.hostName

@description('FrontDoorId (GUID) — vai no header X-Azure-FDID p/ isolar as origens só-AFD.')
output frontDoorId string = profile.properties.frontDoorId

output profileName string = profile.name
output wafPolicyName string = wafPolicy.name

// --- Custom domain (DNS / validação) ---
@description('Hostname do custom domain configurado.')
output customDomainHostName string = customDomain.properties.hostName

@description('Estado da validação de posse do domínio (Pending → Approved após o TXT propagar).')
output customDomainValidationState string = customDomain.properties.domainValidationState

@description('Token do registro TXT de validação. Com BYOC (cert próprio cujo CN/SAN bate com o host) o domínio é validado PELO certificado e este token vem null — não é necessário criar TXT.')
output dnsTxtValidationToken string = customDomain.properties.validationProperties.?validationToken ?? 'nao-requerido (BYOC validou pelo certificado)'

@description('Alvo do CNAME: criar CNAME do host do custom domain apontando p/ este hostname do AFD.')
output cnameTarget string = endpoint.properties.hostName
