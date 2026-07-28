#!/usr/bin/env bash
#
# Instala tudo que o integrador precisa para rodar nesta máquina.
#
# Pode ser executado várias vezes — não refaz o que já está pronto.
#
#   ./scripts/install.sh
#
set -euo pipefail

NODE_MINIMO=22
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

azul=$'\033[36m'; verde=$'\033[32m'; amarelo=$'\033[33m'; vermelho=$'\033[31m'; fim=$'\033[0m'
passo() { printf '\n%s=== %s ===%s\n' "$azul" "$1" "$fim"; }
ok()    { printf '  %s[ok]%s %s\n' "$verde" "$fim" "$1"; }
aviso() { printf '  %s[!]%s  %s\n' "$amarelo" "$fim" "$1"; }
erro()  { printf '  %s[x]%s  %s\n' "$vermelho" "$fim" "$1"; }

versao_maior_do_node() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node --version | sed 's/^v//' | cut -d. -f1
}

# ---------------------------------------------------------------- Node.js ---
passo "Node.js $NODE_MINIMO ou superior"

maior="$(versao_maior_do_node)"

if [ "$maior" -ge "$NODE_MINIMO" ]; then
  ok "Node $(node --version) já instalado"
else
  if [ "$maior" -eq 0 ]; then
    aviso "Node.js não encontrado."
  else
    aviso "Node v$maior encontrado, mas o projeto exige $NODE_MINIMO ou superior."
  fi

  # Se o nvm já existe nesta máquina, é o caminho menos invasivo.
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    echo "  nvm encontrado. Instalando Node $NODE_MINIMO..."
    nvm install "$NODE_MINIMO"
    nvm use "$NODE_MINIMO"
    ok "Node $(node --version) ativo"
  else
    erro "Não há Node adequado nem nvm instalado nesta máquina."
    echo
    echo "  Instale o Node $NODE_MINIMO+ por um destes caminhos e rode este script de novo:"
    echo
    echo "    nvm (recomendado, não precisa de root):"
    echo "      https://github.com/nvm-sh/nvm#installing-and-updating"
    echo
    echo "    pacote da distribuição:"
    echo "      https://nodejs.org/en/download/package-manager"
    echo
    echo "  Este script não baixa e executa instaladores da internet por conta"
    echo "  própria — essa decisão é sua."
    exit 1
  fi
fi

# --------------------------------------------------------- Dependências ----
passo "Dependências do projeto"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
ok "Dependências instaladas"

# ---------------------------------------------------------------- Build ----
passo "Compilação"
npm run build
ok "Compilado em dist/"

# --------------------------------------------------------- Configuração ----
passo "Configuração"

if [ ! -f config/config.json ]; then
  cp config/config.example.json config/config.json
  ok "config/config.json criado a partir do exemplo"
  aviso "Ajuste a porta do Holyrics e, depois do primeiro teste, a região e o limiar."
else
  ok "config/config.json já existe (mantido como está)"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  ok ".env criado a partir do exemplo"
  aviso "Abra o .env e coloque o token do Holyrics em HOLYRICS_TOKEN."
else
  ok ".env já existe (mantido como está)"
fi

# ---------------------------------------------------------------- Testes ---
passo "Testes"
npm test
ok "Suíte passou — a lógica de cor funciona sem o Holyrics estar aberto"

# ------------------------------------------------------------- Resumo ------
printf '\n%s=== Pronto ===%s\n' "$azul" "$fim"
cat <<'FIM'

  Antes do primeiro teste real, faltam duas coisas suas:

    1. Colocar o token do Holyrics no arquivo .env
    2. Conferir a porta do API Server em config/config.json

  Depois:

    ./scripts/start.sh           sobe o integrador em segundo plano
    ./scripts/start.sh --debug   sobe com detalhe por leitura, para calibrar
    ./scripts/status.sh          mostra se está rodando e os últimos eventos
    ./scripts/stop.sh            encerra

  ATENÇÃO: a região de cor e o limiar em config/config.json ainda são chute.
  Só o teste real, com o telão à vista, define os valores certos.

FIM
