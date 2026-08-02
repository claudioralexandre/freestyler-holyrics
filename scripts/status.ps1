<#
.SYNOPSIS
  Mostra se o integrador está rodando e o que ele registrou por último.

.EXAMPLE
  .\scripts\status.ps1
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$arquivoPid = '.run\integrador.pid'

# Ver o comentário em start.ps1: PID registrado não é prova de integrador vivo
# depois de um reboot, porque o Windows reaproveita o número.
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

# Campo opcional sob Set-StrictMode: ler propriedade ausente é ERRO, e o bloco
# painel inteiro é opcional — ausente, a página fica LIGADA nos padrões.
function Campo($objeto, $nome, $padrao) {
    if ($null -eq $objeto) { return $padrao }
    $propriedade = $objeto.PSObject.Properties[$nome]
    if ($null -eq $propriedade -or $null -eq $propriedade.Value) { return $padrao }
    return $propriedade.Value
}

Write-Host "`n=== Integrador ===" -ForegroundColor Cyan

if (Test-Path $arquivoPid) {
    $numero = PidRegistrado $arquivoPid
    $processo = ProcessoNode $numero
    if ($processo) {
        $tempo = (Get-Date) - $processo.StartTime
        Write-Host "  rodando (PID $numero, há $([int]$tempo.TotalMinutes) min)" -ForegroundColor Green
    } elseif ($numero -le 0) {
        Write-Host "  registro ilegível em $arquivoPid" -ForegroundColor Yellow
        Write-Host "  (rode .\scripts\stop.ps1 para limpar)"
    } else {
        Write-Host "  registrado como PID $numero, mas não há processo node com esse número" -ForegroundColor Yellow
        Write-Host "  (rode .\scripts\stop.ps1 para limpar)"
    }
} else {
    Write-Host "  parado" -ForegroundColor Yellow
}

# O painel é a interface principal desde a 004 — dizer só "rodando" deixaria de
# fora justamente a informação que o operador vai usar.
try {
    $pnl = Campo (Get-Content 'config\config.json' -Raw | ConvertFrom-Json) 'painel' $null
    if ((Campo $pnl 'habilitado' $true) -eq $false) {
        Write-Host "  Painel: desligado por configuração" -ForegroundColor Yellow
    } else {
        $h = Campo $pnl 'host' '127.0.0.1'
        $pt = Campo $pnl 'port' 13000
        $url = "http://$($h):$pt"
        try {
            Invoke-WebRequest -Uri "$url/api/estado" -TimeoutSec 2 -UseBasicParsing | Out-Null
            Write-Host "  Painel: $url (respondendo)" -ForegroundColor Green
        } catch {
            Write-Host "  Painel: $url (não respondeu)"
        }
    }
} catch {
    # Silêncio aqui já escondeu problema: sem esta linha, config ilegível e
    # painel ausente produziam a mesma tela — nenhuma menção ao painel.
    Write-Host "  Painel: não consegui ler config\config.json"
}

$log = Get-ChildItem 'logs\integrador*.log' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending |
       Select-Object -First 1

if (-not $log) {
    Write-Host "`n  Nenhum log ainda.`n"
    exit 0
}

Write-Host "`n=== Últimos eventos ($($log.Name)) ===" -ForegroundColor Cyan

Get-Content $log.FullName -Tail 15 | ForEach-Object {
    try {
        $linha = $_ | ConvertFrom-Json
        $hora = ([datetime]$linha.time).ToString('HH:mm:ss')
        Write-Host "  $hora  $($linha.msg)"
    } catch {
        Write-Host "  $_"
    }
}

Write-Host ""
