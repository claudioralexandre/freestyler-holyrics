# Sobe o integrador em segundo plano.
#
#   .\scripts\start.ps1              modo normal
#   .\scripts\start.ps1 -Debug       detalhe por leitura, para calibrar a
#                                    regiao e o limiar. Enche o log depressa;
#                                    nao deixe ligado o culto inteiro.
#   .\scripts\start.ps1 -Foreground  preso a esta janela, log ao vivo
#
# Cabecalho em comentario de linha, e sem acento, de proposito - ver install.ps1.

param(
    [switch]$Debug,
    [switch]$Foreground
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$arquivoPid = '.run\integrador.pid'

# ! Caminho absoluto porque a resolucao do relativo aqui NAO esta verificada no
# Windows PowerShell 5.1, que e onde isto roda. Set-Location muda a localizacao
# do PowerShell, nao o diretorio do processo, e os dois divergem quando o script
# e chamado de dentro de scripts\. Medido no PowerShell 7: o Start-Process
# resolve pela localizacao do PowerShell, e o relativo funcionaria. No 5.1, nao
# sei - e o absoluto torna a pergunta irrelevante.
$saidaConsole = Join-Path $raiz 'logs\console.out.log'
$saidaErro = Join-Path $raiz 'logs\console.err.log'

function Erro($texto) { Write-Host "  [x]  $texto" -ForegroundColor Red }
function Ok($texto)   { Write-Host "  [ok] $texto" -ForegroundColor Green }

# O .run\integrador.pid sobrevive a reboot, e o Windows reaproveita numero de
# PID. Depois de reiniciar a maquina, o numero registrado quase certamente
# pertence a outro programa: sem conferir que o processo e `node`, "ja esta
# rodando" vira recusa de subir por causa de um programa qualquer - e o
# stop.ps1 mataria esse programa.
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

# Set-StrictMode -Version Latest transforma "propriedade que nao existe" em
# ERRO, e todo campo do bloco painel e opcional por definicao - bloco ausente
# LIGA a pagina nos padroes (004/FR-004). Ler direto tropecaria justamente na
# configuracao padrao, e o catch la embaixo traduziria o tropeco em "nao
# consegui ler a porta": mentira, com a pagina no ar.
function Campo($objeto, $nome, $padrao) {
    if ($null -eq $objeto) { return $padrao }
    $propriedade = $objeto.PSObject.Properties[$nome]
    if ($null -eq $propriedade -or $null -eq $propriedade.Value) { return $padrao }
    return $propriedade.Value
}

# ------------------------------------------------- Ja esta rodando? --------
if (Test-Path $arquivoPid) {
    $vivo = ProcessoNode (PidRegistrado $arquivoPid)
    if ($vivo) {
        Erro "O integrador ja esta rodando (PID $($vivo.Id))."
        Write-Host "  Use .\scripts\stop.ps1 antes de subir de novo."
        exit 1
    }
    # PID orfao: o processo morreu sem limpar, ou o numero virou de outro
    # programa depois de um reboot. Segue em frente.
    Remove-Item $arquivoPid -Force
}

# ------------------------------------------------------- Pre-requisitos ----
# Compila quando falta OU quando o fonte e mais novo que o compilado.
#
# So checar a ausencia era um defeito silencioso: depois de um `git pull`, o
# `dist\` continuava la - velho - e o integrador subia com o codigo anterior,
# sem nada indicando.
if (-not (Test-Path 'dist\main.js')) {
    Write-Host "  Projeto nao compilado. Compilando..."
    npm run build
} else {
    $compilado = (Get-Item 'dist\main.js').LastWriteTime
    $maisNovo = Get-ChildItem -Path 'src', 'tsconfig.build.json', 'package.json' -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt $compilado } | Select-Object -First 1
    if ($maisNovo) {
        Write-Host "  Codigo mais novo que a compilacao. Recompilando..."
        npm run build
    }
}

if (-not (Test-Path 'config\config.json')) {
    Erro "config\config.json nao existe. Rode .\scripts\install.ps1 primeiro."
    exit 1
}

# ------------------------------------------------------- Credencial -------
# Carregado aqui porque este script chama `node` direto, sem passar pelos
# scripts do package.json - que desde 2026-08-01 usam `--env-file-if-exists`.
# Os dois caminhos levam ao mesmo lugar.
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
    Erro "HOLYRICS_TOKEN nao esta definido."
    Write-Host "  Coloque o token no arquivo .env, ou defina na sessao:"
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
    Erro "O integrador subiu e morreu logo em seguida (codigo $($processo.ExitCode))."
    Write-Host "  Provavelmente e configuracao invalida. O motivo esta em:"
    Write-Host "    $saidaErro" -ForegroundColor White
    if (Test-Path $saidaErro) { Get-Content $saidaErro -Tail 20 }
    exit 1
}

$processo.Id | Set-Content $arquivoPid

Ok "Integrador rodando (PID $($processo.Id))"

# O painel vem LIGADO por padrao (004/FR-004), e o operador precisa saber onde
# ele esta - anunciar aqui e o que evita ter de abrir o arquivo que a pagina
# existe para ele nao precisar abrir.
try {
    $cfg = Get-Content 'config\config.json' -Raw | ConvertFrom-Json
    $pnl = Campo $cfg 'painel' $null
    if ((Campo $pnl 'habilitado' $true) -eq $false) {
        Write-Host "  Painel: desligado por configuracao" -ForegroundColor Yellow
    } else {
        $h = Campo $pnl 'host' '127.0.0.1'
        $pt = Campo $pnl 'port' 13000
        if ($h -in @('127.0.0.1', 'localhost', '::1')) {
            Write-Host "  Painel: http://$($h):$pt" -ForegroundColor Cyan
        } else {
            Write-Host "  Painel: http://<ip-desta-maquina>:$pt" -ForegroundColor Red
            Write-Host "  Aberto na rede, SEM SENHA: quem alcancar esta maquina edita a configuracao." -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  Painel: nao consegui ler a porta em config\config.json"
}
if ($Debug) {
    Write-Host "  Modo debug: cada leitura vai para o log. Bom para calibrar," -ForegroundColor Yellow
    Write-Host "  ruim para deixar ligado o culto inteiro." -ForegroundColor Yellow
}
Write-Host "  Log de eventos: logs\integrador.*.log"
Write-Host "  Acompanhar ao vivo:  Get-Content logs\integrador.1.log -Wait -Tail 20"
Write-Host "  Encerrar:            .\scripts\stop.ps1"
