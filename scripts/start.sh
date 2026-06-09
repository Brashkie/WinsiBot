#!/usr/bin/env bash
# scripts/start.sh — Inicia todos los servicios de WinsiBot (Linux / macOS / WSL)
# Uso: npm run start:linux   o   bash scripts/start.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PY="$ROOT/python/venv/bin/python"
DIST="$ROOT/dist/index.js"
PIDS=()

[ ! -f "$VENV_PY" ] && VENV_PY="python3"

# Cleanup al salir
cleanup() {
  echo ""
  echo "  Deteniendo servicios..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Detener Redis daemonizado si lo iniciamos nosotros
  redis-cli shutdown nosave 2>/dev/null || true
  echo "  Listo."
}
trap cleanup EXIT INT TERM

if [ ! -f "$DIST" ]; then
  echo "  ERROR: dist/index.js no encontrado. Ejecuta: npm run build"
  exit 1
fi

echo ""
echo "  WinsiBot — Iniciando servicios (Linux/macOS)"
echo "  ─────────────────────────────────────────────"

# ─── Redis ────────────────────────────────────────────────────────────────────
echo -n "  [1/4] Redis..."
if command -v redis-server &>/dev/null; then
  redis-server --daemonize yes --loglevel warning &>/dev/null || true
  echo " OK"
else
  echo " no disponible (apt install redis-server)"
fi

# ─── Flask / Python AI ───────────────────────────────────────────────────────
echo -n "  [2/4] Flask (uvicorn)..."
if [ -f "$ROOT/python/venv/bin/python" ] || command -v python3 &>/dev/null; then
  "$VENV_PY" -m uvicorn api.app:app \
    --host 127.0.0.1 --port 5000 \
    --workers 1 --log-level warning --no-access-log \
    &>/dev/null &
  FLASK_PID=$!
  PIDS+=("$FLASK_PID")
  echo " PID $FLASK_PID"
else
  echo " venv no encontrado (npm run setup)"
fi

# ─── Rust API ─────────────────────────────────────────────────────────────────
echo -n "  [3/4] Rust API..."
RUST_BIN=$(find "$ROOT/rust/target/release" -maxdepth 1 -type f -executable ! -name "*.d" 2>/dev/null | head -1)
if [ -n "$RUST_BIN" ]; then
  "$RUST_BIN" &>/dev/null &
  RUST_PID=$!
  PIDS+=("$RUST_PID")
  echo " PID $RUST_PID  ($(basename "$RUST_BIN"))"
else
  echo " no compilado (npm run rust:build)"
fi

# ─── Esperar ──────────────────────────────────────────────────────────────────
echo "  Esperando 3s para que arranquen..."
sleep 3

# ─── Bot ──────────────────────────────────────────────────────────────────────
echo ""
echo "  [4/4] Bot iniciando..."
echo ""
node "$DIST"
