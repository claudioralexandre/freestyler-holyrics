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
# Compila quando falta OU quando o fonte é mais novo que o compilado.
#
# Só checar a ausência era um defeito silencioso: depois de um `git pull`, o
# `dist/` continuava lá — velho — e o integrador subia com o código anterior,
# sem nada indicando. Medido em 01/08: dist de um dia antes, sem o painel
# dentro, e o operador só descobriria pela porta que não responde.
if [ ! -f dist/main.js ]; then
  echo "  Projeto não compilado. Compilando..."
  npm run build
elif [ -n "$(find src tsconfig.build.json package.json -newer dist/main.js 2>/dev/null | head -1)" ]; then
  echo "  Código mais novo que a compilação. Recompilando..."
  npm run build
fi

if [ ! -f config/config.json ]; then
  erro "config/config.json não existe. Rode ./scripts/install.sh primeiro."
  exit 1
fi

# ------------------------------------------------------- Credencial -------
# Carregado aqui porque este script chama `node` direto, sem passar pelos
# scripts do package.json — que desde 2026-08-01 usam `--env-file-if-exists`.
# Os dois caminhos levam ao mesmo lugar; sem este bloco, subir por aqui pegaria
# só o que já estivesse no ambiente do shell.
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

# O painel vem LIGADO por padrão (004/FR-004), e o operador precisa saber onde
# ele está — anunciar aqui é o que evita ter de abrir o arquivo que a página
# existe para ele não precisar abrir.
painel="$(node -e '
try {
  const c = require("./config/config.json");
  const p = c.painel ?? {};
  if (p.habilitado === false) { console.log("desligado"); process.exit(0); }
  const host = p.host ?? "127.0.0.1";
  const porta = p.port ?? 13000;
  const aberto = host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  console.log((aberto ? "EXPOSTO " : "") + "http://" + (aberto ? "<ip-desta-maquina>" : host) + ":" + porta);
} catch { console.log("?"); }
' 2>/dev/null || echo '?')"

case "$painel" in
  desligado) printf '  Painel: %sdesligado por configuração%s\n' "$amarelo" "$fim" ;;
  EXPOSTO*) printf '  Painel: %s%s%s\n' "$vermelho" "${painel#EXPOSTO }" "$fim"
            printf '  %sAberto na rede, SEM SENHA: quem alcançar esta máquina edita a configuração.%s\n' "$vermelho" "$fim" ;;
  '?')      printf '  Painel: não consegui ler a porta em config/config.json\n' ;;
  *)        printf '  Painel: %s%s%s\n' "$azul" "$painel" "$fim" ;;
esac
if [ "$modo_debug" -eq 1 ]; then
  printf '  %sModo debug: cada leitura vai para o log. Bom para calibrar,%s\n' "$amarelo" "$fim"
  printf '  %sruim para deixar ligado o culto inteiro.%s\n' "$amarelo" "$fim"
fi
echo "  Log de eventos: logs/integrador.*.log"
echo "  Acompanhar ao vivo:  tail -f logs/integrador.1.log"
echo "  Encerrar:            ./scripts/stop.sh"
