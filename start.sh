#!/usr/bin/env bash
# WinsiBot — arranque para Termux y Linux.
#
#   ./start.sh          prepara lo que falte y arranca el bot supervisado
#   NO_COLOR=1 ./start.sh   sin colores (también sin TTY: nohup, un log)
#
# Qué hace, en orden:
#   1. Verifica Node (20.12 o más nuevo).
#   2. Instala las dependencias si faltan (npm install, que también baja el
#      binario de la Session API para esta plataforma).
#   3. Compila si dist/ no existe o si hay algo en src/ más nuevo (después de
#      un git pull, sin acordarse de `npm run build`).
#   4. En Termux, pide un wake lock: con la pantalla apagada Android duerme la
#      CPU y mata los procesos que no lo tienen.
#   5. Arranca el SUPERVISOR (dist/supervisor.js), que reinicia el bot si se
#      cae o si se cuelga sin morir, y lo lanza con las banderas de memoria
#      (generación joven de 4 MB; en Termux, además, el heap con techo de
#      512 MB). Hasta la 8.17.0 este script lanzaba dist/index.js directo y se
#      salteaba las dos cosas.
#
# Ctrl+C detiene el bot. Si el supervisor mismo muere, se lo vuelve a lanzar
# con espera creciente.

cd "$(dirname "$0")" || exit 1

# ─── Colores, solo en una terminal de verdad ─────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RESET=$'\033[0m'; BOLD=$'\033[1m'; DIM=$'\033[2m'
  VERDE=$'\033[38;5;46m'; VERDE2=$'\033[38;5;28m'; AMARILLO=$'\033[1;33m'; ROJO=$'\033[0;31m'; CIAN=$'\033[0;36m'
else
  RESET=''; BOLD=''; DIM=''; VERDE=''; VERDE2=''; AMARILLO=''; ROJO=''; CIAN=''
fi
ok()    { printf '  %s✔%s  %s\n' "$VERDE" "$RESET" "$1"; }
aviso() { printf '  %s◆%s  %s\n' "$AMARILLO" "$RESET" "$1"; }
error() { printf '  %s✗%s  %s\n' "$ROJO" "$RESET" "$1"; }
nota()  { printf '     %s%s%s\n' "$DIM" "$1" "$RESET"; }

EN_TERMUX=0
if [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *com.termux* ]]; then EN_TERMUX=1; fi

# ─── Node ────────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  error "Node.js no está instalado."
  if [ $EN_TERMUX -eq 1 ]; then nota "pkg install nodejs-lts"; else nota "https://nodejs.org (20.12 o más nuevo)"; fi
  exit 1
fi
NODE_V=$(node -p 'process.versions.node')
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=12)?0:1)'; then
  error "Node $NODE_V es muy viejo: hace falta 20.12 o más nuevo."
  if [ $EN_TERMUX -eq 1 ]; then nota "pkg upgrade nodejs-lts"; fi
  exit 1
fi
VERSION=$(node -p 'require("./package.json").version' 2>/dev/null || echo '?')

# ─── Encabezado ──────────────────────────────────────────────────────────────
[ -t 1 ] && clear
printf '\n  %s%sWinsiBot v%s%s  %s%s%s\n' "$BOLD" "$VERDE" "$VERSION" "$RESET" "$DIM" "$([ $EN_TERMUX -eq 1 ] && echo Termux || uname -s)" "$RESET"
printf '  %s──────────────────────────────%s\n' "$VERDE2" "$RESET"
nota "Node $NODE_V"
echo

# ─── Dependencias ────────────────────────────────────────────────────────────
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  aviso "Instalando dependencias (npm install)…"
  if ! npm install; then error "npm install falló: revisá los errores de arriba."; exit 1; fi
  ok "Dependencias listas"
fi

# ─── Compilar si hace falta ──────────────────────────────────────────────────
if [ ! -f dist/index.js ] || [ -n "$(find src -newer dist/index.js -type f 2>/dev/null | head -n 1)" ]; then
  aviso "Compilando (hay cambios en src/)…"
  if ! npm run build; then error "La compilación falló: revisá los errores de arriba."; exit 1; fi
  ok "Compilado"
fi

# ─── Termux: que Android no duerma el bot ────────────────────────────────────
WAKE=0
if [ $EN_TERMUX -eq 1 ]; then
  if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock && WAKE=1 && ok "Wake lock activo (la pantalla se puede apagar)"
  else
    aviso "Sin termux-wake-lock: con la pantalla apagada Android puede pausar el bot."
    nota "Instalá la app Termux:API y: pkg install termux-api"
  fi
fi

# ffmpeg-static (npm) no trae binario para Android: en Termux va aparte. Sin
# él no hay stickers animados, notas de voz ni efectos de audio.
if [ $EN_TERMUX -eq 1 ] && ! command -v ffmpeg >/dev/null 2>&1; then
  aviso "Sin ffmpeg: no van a andar los stickers animados, #tts ni los efectos de audio."
  nota "pkg install ffmpeg"
fi

soltar() { [ $WAKE -eq 1 ] && command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock; }

# ─── Ctrl+C / SIGTERM: salir sin reiniciar ───────────────────────────────────
CORRIENDO=1
trap 'CORRIENDO=0' INT TERM
trap 'stty sane 2>/dev/null; soltar' EXIT

# ─── El supervisor, y relanzarlo si muere ────────────────────────────────────
INTENTO=0
while [ $CORRIENDO -eq 1 ]; do
  INICIO=$(date +%s)
  node dist/supervisor.js
  CODIGO=$?
  # Node puede dejar la terminal en modo raw al salir.
  stty sane 2>/dev/null || true

  # Ctrl+C (130), SIGTERM (143) o salida normal: no se relanza.
  if [ $CORRIENDO -eq 0 ] || [ $CODIGO -eq 0 ] || [ $CODIGO -eq 130 ] || [ $CODIGO -eq 143 ]; then
    echo
    ok "WinsiBot detenido"
    echo
    break
  fi

  # Si muere enseguida una y otra vez, se espera cada vez más (hasta 60 s).
  if [ $(( $(date +%s) - INICIO )) -lt 30 ]; then INTENTO=$((INTENTO + 1)); else INTENTO=0; fi
  ESPERA=$(( INTENTO * INTENTO * 2 + 2 ))
  [ $ESPERA -gt 60 ] && ESPERA=60
  echo
  error "El supervisor terminó con código $CODIGO $(date '+%H:%M:%S')"
  nota "se relanza en ${ESPERA}s (Ctrl+C para salir)"
  sleep "$ESPERA" || break
done
