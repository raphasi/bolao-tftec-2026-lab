#requires -Version 7.0
<#
  Valida o ambiente do Bolão (Fase 10.1) ponta a ponta e mostra OK/FALHA por item.

  Uso (PowerShell 7+ / pwsh):
    pwsh scripts/validate-lab.ps1 `
      -ApiApp app-dev-bl-bend-cin-001 `
      -FrontApp app-dev-bl-fend-cin-001 `
      -FuncApp func-dev-bl-cin-001 `
      -ResourceGroup rg-prd-bl-cin-001

  Sem parametros, usa os nomes-padrao do guia (variante "prd").
  Pre-requisito: Azure CLI logado (az login) — necessario so para o check das Functions.
#>
param(
  [string]$ApiApp        = "app-prd-bl-bend-cin-001",
  [string]$FrontApp      = "app-prd-bl-fend-cin-001",
  [string]$FuncApp       = "func-prd-bl-cin-001",
  [string]$ResourceGroup = "rg-prd-bl-cin-001",
  [int]$ExpectedMatches  = 72
)

$api = "https://$ApiApp.azurewebsites.net"
$fe  = "https://$FrontApp.azurewebsites.net"
$script:pass = 0
$script:fail = 0

function Check {
  param([string]$Name, [scriptblock]$Test)
  try {
    $detail = & $Test
    $suffix = if ($detail) { " — $detail" } else { "" }
    Write-Host ("  [ OK ]  {0}{1}" -f $Name, $suffix) -ForegroundColor Green
    $script:pass++
  } catch {
    Write-Host ("  [FALHA] {0} — {1}" -f $Name, $_.Exception.Message) -ForegroundColor Red
    $script:fail++
  }
}

Write-Host "`n=== Validacao do Bolao (Fase 10.1) ===" -ForegroundColor Cyan
Write-Host "API:      $api"
Write-Host "Frontend: $fe"
Write-Host "Functions: $FuncApp (RG $ResourceGroup)`n"

# 1) API viva
Check "API viva (/api/health)" {
  $r = Invoke-RestMethod "$api/api/health" -TimeoutSec 30
  if ($r.status -ne 'ok') { throw "status=$($r.status)" }
  "status=ok"
}

# 2) API + Cosmos
Check "API + Cosmos (/api/health/full)" {
  $r = Invoke-RestMethod "$api/api/health/full" -TimeoutSec 30
  if (-not $r.dependencies.cosmos.ok) { throw "cosmos.ok=false" }
  "cosmos ok ($($r.dependencies.cosmos.latencyMs)ms)"
}

# 3) API tem dados (depende do seed - Fase 9)
Check "API tem dados (/api/matches = $ExpectedMatches)" {
  $r = Invoke-RestMethod "$api/api/matches" -TimeoutSec 30
  if ($r.count -ne $ExpectedMatches) { throw "count=$($r.count) (rodou o seed da Fase 9?)" }
  "$($r.count) jogos"
}

# 4) Frontend vivo
Check "Frontend vivo (/healthz)" {
  $r = Invoke-WebRequest "$fe/healthz" -TimeoutSec 30 -UseBasicParsing
  if ("$($r.Content)" -notmatch 'ok') { throw "corpo='$($r.Content)'" }
  "ok"
}

# 5) Site abre
Check "Site abre (/ = 200)" {
  $r = Invoke-WebRequest "$fe/" -TimeoutSec 30 -UseBasicParsing
  if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
  "HTTP 200"
}

# 6) Functions registradas (precisa az login). Node 24 nao indexa -> precisa Node 22.
Check "Functions registradas (6 esperadas)" {
  $expected = @('calc-predictions','calc-specials','aggregate-from-predictions',
                'aggregate-from-specials','emit-leaderboard-update','health-check-cron')
  # Retry: chamadas ARM podem cair por reset de rede (ConnectionReset). Distinguimos
  # "az falhou" (exit != 0 -> retry) de "lista vazia de verdade" (exit 0 e sem saida).
  $raw = $null; $azOk = $false
  for ($i = 1; $i -le 3; $i++) {
    $raw = az functionapp function list -g $ResourceGroup -n $FuncApp --query "[].name" -o tsv 2>$null
    if ($LASTEXITCODE -eq 0) { $azOk = $true; break }
    Start-Sleep -Seconds 3
  }
  if (-not $azOk) { throw "az falhou (rede/login) apos 3 tentativas — rode 'az login' e tente de novo" }
  # $raw ja vem como array de linhas (uma por function). Nome = parte apos o ultimo '/'.
  $got = @($raw | ForEach-Object { ($_ -split '/')[-1].Trim() } | Where-Object { $_ })
  if ($got.Count -eq 0) { throw "0 functions indexadas — Function App em Node 24? deve ser ~22 (ver Fase 6.4 / Troubleshooting)" }
  $missing = @($expected | Where-Object { $_ -notin $got })
  if ($missing.Count -gt 0) { throw "faltando: $($missing -join ', ')" }
  "$($got.Count) registradas"
}

$color = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("`n=== Resumo: {0} OK / {1} FALHA ===" -f $script:pass, $script:fail) -ForegroundColor $color
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
