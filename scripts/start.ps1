<#
.SYNOPSIS
  Sobe o integrador em segundo plano.

.PARAMETER Debug
  Registra o detalhe de cada leitura — as 8 regiões de cor e o ΔE. É o modo
  usado para calibrar a região e o limiar. Enche o log depressa; não deixe
  ligado durante um culto inteiro.

.PARAMETER Foreground
  Roda preso a esta janela, mostrando o log ao vivo. Ctrl+C encerra.

.EXAMPLE
  .\scripts\start.ps1
  .\scripts\start.ps1 -Debug
#>

param(
    [switch]$Debug,
    [switch]$Foreground
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$arquivoPid = '.run\integrador.pid'
$saidaConsole = 'logs\console.out.log'
$saidaErro = 'logs\console.err.log'

function Erro($texto) { Write-Host "  [x]  $texto" -ForegroundColor Red }
function Ok($texto)   { Write-Host "  [ok] $texto" -ForegroundColor Green }

# ------------------------------------------------- Já está rodando? --------
if (Test-Path $arquivoPid) {
    $pidAnterior = Get-Content $arquivoPid
    $vivo = Get-Process -Id $pidAnterior -ErrorAction SilentlyContinue
    if ($vivo) {
        Erro "O integrador já está rodando (PID $pidAnterior)."
        Write-Host "  Use .\scripts\stop.ps1 antes de subir de novo."
        exit 1
    }
    # PID órfão: o processo morreu sem limpar. Segue em frente.
    Remove-Item $arquivoPid -Force
}

# ------------------------------------------------------- Pré-requisitos ----
if (-not (Test-Path 'dist\main.js')) {
    Write-Host "  Projeto não compilado. Compilando..."
    npm run build
}

if (-not (Test-Path 'config\config.json')) {
    Erro "config\config.json não existe. Rode .\scripts\install.ps1 primeiro."
    exit 1
}

# ------------------------------------------------------- Credencial -------
# O .env existe só para a conveniência de quem opera: quem lê a variável é o
# processo, não o arquivo. O integrador nunca lê .env por conta própria.
if (Test-Path '.env') {
    Get-Content '.env' | ForEach-Object {
        $linha = $_.Trim()
        if ($linha -and -not $linha.StartsWith('#')) {
            $par = $linha -split '=', 2
            if ($par.Count -eq 2) {
                $nome = $par[0].Trim()
                $valor = $par[1].Trim().Trim('"').Trim("'")
                Set-Item -Path "env:$nome" -Value $valor
            }
        }
    }
}

if (-not $env:HOLYRICS_TOKEN) {
    Erro "HOLYRICS_TOKEN não está definido."
    Write-Host "  Coloque o token no arquivo .env, ou defina na sessão:"
    Write-Host '    $env:HOLYRICS_TOKEN = "seu-token"' -ForegroundColor White
    exit 1
}

if ($Debug) { $env:LOG_LEVEL = 'debug' }

New-Item -ItemType Directory -Force -Path '.run', 'logs' | Out-Null

# ------------------------------------------------------------- Sobe --------
if ($Foreground) {
    Write-Host "  Rodando nesta janela. Ctrl+C encerra.`n" -ForegroundColor Cyan
    node dist\main.js
    exit $LASTEXITCODE
}

$processo = Start-Process -FilePath 'node' `
    -ArgumentList 'dist\main.js' `
    -WorkingDirectory $raiz `
    -RedirectStandardOutput $saidaConsole `
    -RedirectStandardError $saidaErro `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Seconds 2

if ($processo.HasExited) {
    Erro "O integrador subiu e morreu logo em seguida (código $($processo.ExitCode))."
    Write-Host "  Provavelmente é configuração inválida. O motivo está em:"
    Write-Host "    $saidaErro" -ForegroundColor White
    if (Test-Path $saidaErro) { Get-Content $saidaErro -Tail 20 }
    exit 1
}

$processo.Id | Set-Content $arquivoPid

Ok "Integrador rodando (PID $($processo.Id))"
if ($Debug) {
    Write-Host "  Modo debug: cada leitura vai para o log. Bom para calibrar," -ForegroundColor Yellow
    Write-Host "  ruim para deixar ligado o culto inteiro." -ForegroundColor Yellow
}
Write-Host "  Log de eventos: logs\integrador.*.log"
Write-Host "  Acompanhar ao vivo:  Get-Content logs\integrador.1.log -Wait -Tail 20"
Write-Host "  Encerrar:            .\scripts\stop.ps1"
