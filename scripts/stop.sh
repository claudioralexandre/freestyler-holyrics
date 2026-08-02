#!/usr/bin/env bash
#
# Encerra o integrador, com chance de terminar o ciclo em andamento.
# Não mexe no Holyrics nem no Freestyler.
#
#   ./scripts/stop.sh
#
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

arquivo_pid='.run/integrador.pid'

# O .run/integrador.pid sobrevive a reboot e o sistema reaproveita numero de
# PID: depois de reiniciar, o numero registrado provavelmente pertence a outro
# programa. Conferir que o processo e `node` e o que separa "o integrador esta
# no ar" de "alguem herdou o numero" — sem isso o stop.sh mata o programa errado.
# O basename e por causa do macOS, onde `ps -o comm=` devolve o caminho inteiro.
processo_eh_node() {
  local numero="${1:-}" nome
  case "$numero" in ''|*[!0-9]*) return 1 ;; esac
  nome="$(ps -p "$numero" -o comm= 2>/dev/null | tr -d ' ')"
  [ "${nome##*/}" = 'node' ]
}

verde=$'\033[32m'; amarelo=$'\033[33m'; fim=$'\033[0m'
ok()    { printf '  %s[ok]%s %s\n' "$verde" "$fim" "$1"; }
aviso() { printf '  %s[!]%s  %s\n' "$amarelo" "$fim" "$1"; }

if [ ! -f "$arquivo_pid" ]; then
  aviso "Nenhum integrador registrado — nada a encerrar."
  exit 0
fi

processo="$(cat "$arquivo_pid")"

if ! processo_eh_node "$processo"; then
  aviso "Não há processo node com o PID $processo. Limpando o registro."
  rm -f "$arquivo_pid"
  exit 0
fi

# SIGTERM primeiro: o integrador trata o sinal, fecha o ciclo em andamento e
# deixa o log íntegro.
kill -TERM "$processo"

for _ in $(seq 1 20); do
  kill -0 "$processo" 2>/dev/null || break
  sleep 0.25
done

if kill -0 "$processo" 2>/dev/null; then
  aviso "Não encerrou em 5s. Forçando."
  kill -KILL "$processo"
  sleep 0.5
fi

rm -f "$arquivo_pid"
ok "Integrador encerrado (PID $processo)"
