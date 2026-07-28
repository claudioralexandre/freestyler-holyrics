#!/usr/bin/env bash
#
# Mostra se o integrador está rodando e o que ele registrou por último.
#
#   ./scripts/status.sh
#
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

arquivo_pid='.run/integrador.pid'
azul=$'\033[36m'; verde=$'\033[32m'; amarelo=$'\033[33m'; fim=$'\033[0m'

printf '\n%s=== Integrador ===%s\n' "$azul" "$fim"

if [ -f "$arquivo_pid" ]; then
  processo="$(cat "$arquivo_pid")"
  if kill -0 "$processo" 2>/dev/null; then
    tempo="$(ps -o etime= -p "$processo" 2>/dev/null | tr -d ' ' || echo '?')"
    printf '  %srodando%s (PID %s, há %s)\n' "$verde" "$fim" "$processo" "$tempo"
  else
    printf '  %sregistrado como PID %s, mas o processo não existe%s\n' "$amarelo" "$processo" "$fim"
    echo "  (rode ./scripts/stop.sh para limpar)"
  fi
else
  printf '  %sparado%s\n' "$amarelo" "$fim"
fi

log="$(ls -t logs/integrador*.log 2>/dev/null | head -1 || true)"

if [ -z "$log" ]; then
  printf '\n  Nenhum log ainda.\n\n'
  exit 0
fi

printf '\n%s=== Últimos eventos (%s) ===%s\n' "$azul" "$(basename "$log")" "$fim"

tail -n 15 "$log" | node -e '
const linhas = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
for (const l of linhas) {
  try {
    const d = JSON.parse(l);
    const hora = new Date(d.time).toTimeString().slice(0, 8);
    console.log(`  ${hora}  ${d.msg}`);
  } catch {
    console.log(`  ${l}`);
  }
}
'

echo
