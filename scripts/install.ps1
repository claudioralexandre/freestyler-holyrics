<#
.SYNOPSIS
  Instala tudo que o integrador precisa para rodar nesta máquina.

.DESCRIPTION
  Verifica o Node.js (instalando se faltar), baixa as dependências, compila o
  projeto e prepara os arquivos de configuração. Pode ser executado várias
  vezes — não refaz o que já está pronto.

.EXAMPLE
  .\scripts\install.ps1
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$NODE_MINIMO = 22
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Passo($texto) { Write-Host "`n=== $texto ===" -ForegroundColor Cyan }
function Ok($texto)    { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  [!]  $texto" -ForegroundColor Yellow }
function Erro($texto)  { Write-Host "  [x]  $texto" -ForegroundColor Red }

# ---------------------------------------------------------------- Node.js ---
Passo "Node.js $NODE_MINIMO ou superior"

function VersaoMaiorDoNode {
    try {
        $bruta = (& node --version) 2>$null
        if ($LASTEXITCODE -ne 0) { return 0 }
        return [int]($bruta -replace '^v', '' -split '\.')[0]
    } catch {
        return 0
    }
}

$maior = VersaoMaiorDoNode

if ($maior -ge $NODE_MINIMO) {
    Ok "Node $(node --version) já instalado"
} else {
    if ($maior -eq 0) {
        Aviso "Node.js não encontrado."
    } else {
        Aviso "Node v$maior encontrado, mas o projeto exige $NODE_MINIMO ou superior."
    }

    $temWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)

    if ($temWinget) {
        Write-Host "  Instalando via winget (a instalação pode pedir confirmação)..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

        # O PATH da sessão atual não enxerga o que acabou de ser instalado.
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('Path', 'User')

        if ((VersaoMaiorDoNode) -lt $NODE_MINIMO) {
            Erro "O Node foi instalado, mas esta janela ainda não o enxerga."
            Write-Host "  Feche este PowerShell, abra outro e rode este script de novo."
            exit 1
        }
        Ok "Node $(node --version) instalado"
    } else {
        Erro "winget não está disponível nesta máquina."
        Write-Host "  Baixe e instale o Node.js $NODE_MINIMO+ manualmente:"
        Write-Host "    https://nodejs.org/en/download" -ForegroundColor White
        Write-Host "  Depois rode este script novamente."
        exit 1
    }
}

# --------------------------------------------------------- Dependências ----
Passo "Dependências do projeto"

if (Test-Path 'package-lock.json') {
    npm ci
} else {
    npm install
}
Ok "Dependências instaladas"

# ---------------------------------------------------------------- Build ----
Passo "Compilação"

npm run build
Ok "Compilado em dist\"

# --------------------------------------------------------- Configuração ----
Passo "Configuração"

if (-not (Test-Path 'config\config.json')) {
    Copy-Item 'config\config.example.json' 'config\config.json'
    Ok "config\config.json criado a partir do exemplo"
    Aviso "Ajuste a porta do Holyrics e, depois do primeiro teste, a região e o limiar."
} else {
    Ok "config\config.json já existe (mantido como está)"
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Ok ".env criado a partir do exemplo"
    Aviso "Abra o .env e coloque o token do Holyrics em HOLYRICS_TOKEN."
} else {
    Ok ".env já existe (mantido como está)"
}

# ---------------------------------------------------------------- Testes ---
Passo "Testes"

npm test
Ok "Suíte passou — a lógica de cor funciona sem o Holyrics estar aberto"

# ------------------------------------------------------------- Resumo ------
Write-Host "`n=== Pronto ===" -ForegroundColor Cyan
Write-Host @"

  Antes do primeiro teste real, faltam duas coisas suas:

    1. Colocar o token do Holyrics no arquivo .env
    2. Conferir a porta do API Server em config\config.json

  Depois:

    .\scripts\start.ps1          sobe o integrador em segundo plano
    .\scripts\start.ps1 -Debug   sobe com detalhe por leitura, para calibrar
    .\scripts\status.ps1         mostra se está rodando e os últimos eventos
    .\scripts\stop.ps1           encerra

  ATENÇÃO: a região de cor e o limiar em config\config.json ainda são chute.
  Só o teste real, com o telão à vista, define os valores certos.

"@
