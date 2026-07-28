#!/usr/bin/env bash
#
# Sobe o integrador em segundo plano.
#
#   ./scripts/start.sh              modo normal
#   ./scripts/start.sh --debug      detalhe por leitura (calibração)
#   ./scripts/start.sh --foreground preso ao terminal, log ao vivo
#
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

arquivo_pid='.run/integrador.pid'
saida='logs/console.out.log'

verde=$'\033[32m'; amarelo=$'\033[33m'; vermelho=$'\033[31m'; azul=$'\033[36m'; fim=$'\033[0m'
ok()   { printf '  %s[ok]%s %s\n' "$verde" "$fim" "$1"; }
erro() { printf '  %s[x]%s  %s\n' "$vermelho" "$fim" "$1"; }

modo_debug=0
primeiro_plano=0
for arg in "$@"; do
  case "$arg" in
    --debug)      modo_debug=1 ;;
    --foreground) primeiro_plano=1 ;;
    *) erro "Opção desconhecida: $arg"; exit 1 ;;
  esac
done

# ------------------------------------------------- Já está rodando? --------
if [ -f "$arquivo_pid" ]; then
  pid_anterior="$(cat "$arquivo_pid")"
  if kill -0 "$pid_anterior" 2>/dev/null; then
    erro "O integrador já está rodando (PID $pid_anterior)."
    echo "  Use ./scripts/stop.sh antes de subir de novo."
    exit 1
  fi
  # PID órfão: o processo morreu sem limpar.
  rm -f "$arquivo_pid"
fi

# ------------------------------------------------------- Pré-requisitos ----
if [ ! -f dist/main.js ]; then
  echo "  Projeto não compilado. Compilando..."
  npm run build
fi

if [ ! -f config/config.json ]; then
  erro "config/config.json não existe. Rode ./scripts/install.sh primeiro."
  exit 1
fi

# ------------------------------------------------------- Credencial -------
# O .env existe só para a conveniência de quem opera: quem lê a variável é o
# processo, não o arquivo. O integrador nunca lê .env por conta própria.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${HOLYRICS_TOKEN:-}" ]; then
  erro "HOLYRICS_TOKEN não está definido."
  echo "  Coloque o token no arquivo .env, ou defina na sessão:"
  echo "    export HOLYRICS_TOKEN=seu-token"
  exit 1
fi

[ "$modo_debug" -eq 1 ] && export LOG_LEVEL=debug

mkdir -p .run logs

# ------------------------------------------------------------- Sobe --------
if [ "$primeiro_plano" -eq 1 ]; then
  printf '  %sRodando neste terminal. Ctrl+C encerra.%s\n\n' "$azul" "$fim"
  exec node dist/main.js
fi

nohup node dist/main.js > "$saida" 2>&1 &
processo=$!

sleep 2

if ! kill -0 "$processo" 2>/dev/null; then
  erro "O integrador subiu e morreu logo em seguida."
  echo "  Provavelmente é configuração inválida. O motivo está em $saida:"
  tail -n 20 "$saida" || true
  exit 1
fi

echo "$processo" > "$arquivo_pid"

ok "Integrador rodando (PID $processo)"
if [ "$modo_debug" -eq 1 ]; then
  printf '  %sModo debug: cada leitura vai para o log. Bom para calibrar,%s\n' "$amarelo" "$fim"
  printf '  %sruim para deixar ligado o culto inteiro.%s\n' "$amarelo" "$fim"
fi
echo "  Log de eventos: logs/integrador.*.log"
echo "  Acompanhar ao vivo:  tail -f logs/integrador.1.log"
echo "  Encerrar:            ./scripts/stop.sh"
