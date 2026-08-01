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

# O painel é a interface principal desde a 004 — dizer só "rodando" deixaria de
# fora justamente a informação que o operador vai usar.
painel="$(node -e '
try {
  const p = (require("./config/config.json").painel) ?? {};
  if (p.habilitado === false) { console.log("desligado"); process.exit(0); }
  console.log("http://" + (p.host ?? "127.0.0.1") + ":" + (p.port ?? 13000));
} catch { console.log("?"); }
' 2>/dev/null || echo '?')"

if [ "$painel" = 'desligado' ]; then
  printf '  Painel: %sdesligado por configuração%s\n' "$amarelo" "$fim"
elif [ "$painel" != '?' ]; then
  if curl -s -o /dev/null --max-time 2 "$painel/api/estado" 2>/dev/null; then
    printf '  Painel: %s%s%s (respondendo)\n' "$verde" "$painel" "$fim"
  else
    printf '  Painel: %s (não respondeu)\n' "$painel"
  fi
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
