#!/usr/bin/env bash
# WinsiBot — auto-restart para Termux / Linux
# Ctrl+C detiene el bot sin reiniciar.

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'

RESTARTS=0
RUNNING=1
LAST_EXIT=$(date +%s)
RAPID=0

# ─── Ctrl+C / SIGTERM → salida limpia ─────────────────────────────────────────
trap '
  RUNNING=0
  echo ""
  echo -e "  ${YELLOW}◆${RESET}${BOLD} WinsiBot detenido${RESET}"
  echo ""
  exit 0
' INT TERM

# ─── Header ───────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "  ${CYAN}${BOLD}WinsiBot v8.0.0${RESET}  ${DIM}Termux Auto-Restart${RESET}"
echo -e "  ${DIM}──────────────────────────────────────${RESET}"
echo -e "  ${DIM}Node: $(node -v 2>/dev/null || echo 'no encontrado')${RESET}"
echo ""

# ─── Verificar Node ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✗${RESET} Node.js no encontrado."
  echo -e "  ${DIM}Termux:${RESET}  pkg install nodejs"
  echo -e "  ${DIM}Linux:${RESET}   sudo apt install nodejs npm"
  exit 1
fi

# ─── Build si no existe dist/ ─────────────────────────────────────────────────
if [ ! -f dist/index.js ]; then
  echo -e "  ${YELLOW}⚠${RESET}  dist/index.js no encontrado — compilando..."
  npm run build
  if [ $? -ne 0 ]; then
    echo -e "  ${RED}✗${RESET} Build fallido. Revisa los errores arriba."
    exit 1
  fi
  echo -e "  ${GREEN}✔${RESET}  Build listo"
  echo ""
fi

# ─── Loop de reinicio ─────────────────────────────────────────────────────────
while [ "$RUNNING" -eq 1 ]; do
  RESTARTS=$((RESTARTS + 1))
  TS=$(date '+%H:%M:%S')

  if [ $RESTARTS -gt 1 ]; then
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_EXIT))

    # Backoff exponencial si el bot muere en menos de 30s consecutivos
    if [ $ELAPSED -lt 30 ]; then
      RAPID=$((RAPID + 1))
    else
      RAPID=0
    fi

    DELAY=$((2 * RAPID + 2))
    [ $DELAY -gt 15 ] && DELAY=15

    echo ""
    echo -e "  ${YELLOW}↻${RESET}  Reinicio ${BOLD}#${RESTARTS}${RESET}  ${DIM}${TS}${RESET}  ${DIM}(esperando ${DELAY}s)${RESET}"
    sleep "$DELAY"
    [ "$RUNNING" -eq 0 ] && break
    echo ""
  fi

  # ─── Lanzar con límite de memoria (importante en Termux) ──────────────────
  node --max-old-space-size=512 dist/index.js
  EXIT_CODE=$?

  # Restaurar terminal — Node puede dejar stdin en raw mode al salir
  stty sane 2>/dev/null || true

  LAST_EXIT=$(date +%s)

  # Salida limpia por señal (130=SIGINT, 143=SIGTERM) o exit 0 → no reiniciar
  if [ "$RUNNING" -eq 0 ]; then break; fi
  if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 130 ] || [ "$EXIT_CODE" -eq 143 ]; then
    echo ""
    echo -e "  ${GREEN}◆${RESET}  Bot detenido normalmente (código ${EXIT_CODE})"
    echo ""
    break
  fi

  echo -e "  ${RED}◈${RESET}  Caído — código ${EXIT_CODE}  ${DIM}${TS}${RESET}"
done
