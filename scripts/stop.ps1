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

# A conferência de que o processo é `node` importa MAIS aqui do que nos outros
# scripts: este é o único que mata. O .pid sobrevive a reboot e o Windows
# reaproveita número, então parar pelo número cru significaria, depois de
# reiniciar a máquina, derrubar o programa que herdou o PID.
function PidRegistrado($caminho) {
    $bruto = @(Get-Content $caminho -ErrorAction SilentlyContinue)
    $numero = 0
    if ($bruto.Count -eq 0 -or -not [int]::TryParse($bruto[0], [ref]$numero)) { return 0 }
    return $numero
}

function ProcessoNode($numero) {
    if ($numero -le 0) { return $null }
    $processo = Get-Process -Id $numero -ErrorAction SilentlyContinue
    if ($processo -and $processo.ProcessName -eq 'node') { return $processo }
    return $null
}

if (-not (Test-Path $arquivoPid)) {
    Aviso "Nenhum integrador registrado — nada a encerrar."
    exit 0
}

$processoPid = PidRegistrado $arquivoPid
$processo = ProcessoNode $processoPid

if (-not $processo) {
    if ($processoPid -le 0) {
        Aviso "Registro ilegível em $arquivoPid. Limpando."
    } else {
        Aviso "Não há processo node com o PID $processoPid. Limpando o registro."
    }
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
