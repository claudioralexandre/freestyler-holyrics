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

Write-Host "`n=== Integrador ===" -ForegroundColor Cyan

if (Test-Path $arquivoPid) {
    $processoPid = Get-Content $arquivoPid
    $processo = Get-Process -Id $processoPid -ErrorAction SilentlyContinue
    if ($processo) {
        $tempo = (Get-Date) - $processo.StartTime
        Write-Host "  rodando (PID $processoPid, há $([int]$tempo.TotalMinutes) min)" -ForegroundColor Green
    } else {
        Write-Host "  registrado como PID $processoPid, mas o processo não existe" -ForegroundColor Yellow
        Write-Host "  (rode .\scripts\stop.ps1 para limpar)"
    }
} else {
    Write-Host "  parado" -ForegroundColor Yellow
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
