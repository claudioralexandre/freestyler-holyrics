<#
.SYNOPSIS
  Encerra o integrador.

.DESCRIPTION
  Para o processo registrado por start.ps1. Não mexe no Holyrics nem no
  Freestyler.

.EXAMPLE
  .\scripts\stop.ps1
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$arquivoPid = '.run\integrador.pid'

function Ok($texto)    { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  [!]  $texto" -ForegroundColor Yellow }

if (-not (Test-Path $arquivoPid)) {
    Aviso "Nenhum integrador registrado — nada a encerrar."
    exit 0
}

$processoPid = Get-Content $arquivoPid
$processo = Get-Process -Id $processoPid -ErrorAction SilentlyContinue

if (-not $processo) {
    Aviso "O processo $processoPid não existe mais. Limpando o registro."
    Remove-Item $arquivoPid -Force
    exit 0
}

Stop-Process -Id $processoPid -Force
Start-Sleep -Milliseconds 500
Remove-Item $arquivoPid -Force

Ok "Integrador encerrado (PID $processoPid)"

# O Windows não tem encerramento gracioso para processo de console: o log é
# escrito por um worker separado, e as últimas linhas podem se perder. O que já
# foi gravado permanece íntegro.
Write-Host "  As últimas linhas do log podem ter se perdido no encerramento."
