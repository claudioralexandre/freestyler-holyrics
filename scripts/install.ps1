# Instala tudo que o integrador precisa para rodar nesta maquina.
#
# Verifica o Node.js (instalando se faltar), baixa as dependencias, compila o
# projeto e prepara os arquivos de configuracao. Pode ser executado varias
# vezes - nao refaz o que ja esta pronto.
#
#   .\scripts\install.ps1
#
# Cabecalho em comentario de linha, e texto sem acento, de proposito.
#
# O Windows PowerShell 5.1 deixou o BOM do arquivo entrar como caractere no
# fluxo. Com isso o bloco de comentario da linha 1 parou de abrir e TODO o
# cabecalho virou comando, em todos os scripts. Tirar o BOM resolve isso, mas
# ai o 5.1 le o arquivo como ANSI e todo acento vira lixo na tela.
#
# ASCII em comentario de linha nao depende de nenhum dos dois. E, se um
# caractere solto voltar a cair na linha 1, ele estraga UMA linha em vez do
# arquivo inteiro.

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
    Ok "Node $(node --version) ja instalado"
} else {
    if ($maior -eq 0) {
        Aviso "Node.js nao encontrado."
    } else {
        Aviso "Node v$maior encontrado, mas o projeto exige $NODE_MINIMO ou superior."
    }

    $temWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)

    if ($temWinget) {
        Write-Host "  Instalando via winget (a instalacao pode pedir confirmacao)..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

        # O PATH da sessao atual nao enxerga o que acabou de ser instalado.
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('Path', 'User')

        if ((VersaoMaiorDoNode) -lt $NODE_MINIMO) {
            Erro "O Node foi instalado, mas esta janela ainda nao o enxerga."
            Write-Host "  Feche este PowerShell, abra outro e rode este script de novo."
            exit 1
        }
        Ok "Node $(node --version) instalado"
    } else {
        Erro "winget nao esta disponivel nesta maquina."
        Write-Host "  Baixe e instale o Node.js $NODE_MINIMO+ manualmente:"
        Write-Host "    https://nodejs.org/en/download" -ForegroundColor White
        Write-Host "  Depois rode este script novamente."
        exit 1
    }
}

# --------------------------------------------------------- Dependencias ----
Passo "Dependencias do projeto"

if (Test-Path 'package-lock.json') {
    npm ci
} else {
    npm install
}
Ok "Dependencias instaladas"

# ---------------------------------------------------------------- Build ----
Passo "Compilacao"

npm run build
Ok "Compilado em dist\"

# --------------------------------------------------------- Configuracao ----
Passo "Configuracao"

if (-not (Test-Path 'config\config.json')) {
    Copy-Item 'config\config.example.json' 'config\config.json'
    Ok "config\config.json criado a partir do exemplo"
    Aviso "Ajuste a porta do Holyrics e, depois do primeiro teste, a regiao e o limiar."
} else {
    Ok "config\config.json ja existe (mantido como esta)"
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Ok ".env criado a partir do exemplo"
    Aviso "Abra o .env e coloque o token do Holyrics em HOLYRICS_TOKEN."
} else {
    Ok ".env ja existe (mantido como esta)"
}

# ---------------------------------------------------------------- Testes ---
Passo "Testes"

npm test
Ok "Suite passou - a logica de cor funciona sem o Holyrics estar aberto"

# ------------------------------------------------------------- Resumo ------
Write-Host "`n=== Pronto ===" -ForegroundColor Cyan
# Sem here-string de proposito: o Windows PowerShell 5.1 nao reconhece
# o terminador quando o arquivo chega com fim de linha LF, e o script inteiro
# morre em ParserError antes de executar a primeira linha.
$resumo = @(
    ''
    '  Antes do primeiro teste real, falta UMA coisa sua:'
    ''
    '    Colocar o token do Holyrics no arquivo .env'
    ''
    '  O token e a unica configuracao que NAO se ajusta pela pagina, de proposito:'
    '  ela nao tem senha, entao nao guarda segredo.'
    ''
    '  Todo o resto - porta do API Server, nome do grupo seguidor, cor de repouso,'
    '  regiao, limiar, cores por tag - se acerta pelo painel, com o servico no ar:'
    ''
    '    http://127.0.0.1:13000'
    ''
    '  O grupo seguidor vira uma LISTA quando a mesa responde: voce escolhe, nao'
    '  digita. E as tags do tema em exibicao aparecem clicaveis - mapear uma cor e'
    '  clicar nela, sem redigitar.'
    ''
    '  Depois:'
    ''
    '    .\scripts\start.ps1          sobe o integrador em segundo plano'
    '    .\scripts\start.ps1 -Debug   sobe com detalhe por leitura, para calibrar'
    '    .\scripts\status.ps1         mostra se esta rodando e os ultimos eventos'
    '    .\scripts\stop.ps1           encerra'
    ''
    '  Se o nome do grupo estiver errado, o log lista os nomes validos na linha'
    '  "inventario do Freestyler" e nenhuma luz e comandada - nao ha dano, so'
    '  silencio. Para rodar SEM comandar luz, remova o bloco freestyler inteiro.'
    ''
    '  A regiao de cor, o limiar e o tempo limite ja foram calibrados contra o'
    '  Holyrics real em 2026-07-28. Nao sao mais chute.'
    ''
)
Write-Host ($resumo -join [Environment]::NewLine)
