# Configura Railway (API + frontend + variáveis + domínios)
# Pré-requisito: token em .env.railway ou $env:RAILWAY_TOKEN
#
# Uso:
#   cd c:\PlanoIdeal\comparador-leads
#   copy .env.railway.example .env.railway
#   notepad .env.railway   # preencha RAILWAY_TOKEN e DATABASE_URL
#   .\scripts\railway-setup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$envFile = Join-Path $Root ".env.railway"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $k = $k.Trim()
    $v = $v.Trim().Trim('"').Trim("'")
    if ($k -and -not [Environment]::GetEnvironmentVariable($k)) {
      [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
  }
}

if (-not $env:RAILWAY_TOKEN) {
  Write-Host ""
  Write-Host "Token Railway ausente." -ForegroundColor Yellow
  Write-Host "1) https://railway.com/account/tokens"
  Write-Host "2) Preencha .env.railway (copie de .env.railway.example)"
  Write-Host "3) Rode este script de novo"
  Write-Host ""
  Write-Host "Alternativa CLI (interativo):"
  Write-Host "  railway login"
  Write-Host "  node scripts/railway-setup.mjs"
  exit 1
}

$whoami = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  $env:RAILWAY_TOKEN = $env:RAILWAY_TOKEN
}

Write-Host "Executando setup via API Railway..." -ForegroundColor Cyan
node (Join-Path $Root "scripts\railway-setup.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Opcional: conferir variáveis" -ForegroundColor Gray
Write-Host "  railway link -p cooperative-acceptance"
Write-Host "  railway variables -s plano-ideal-api"
