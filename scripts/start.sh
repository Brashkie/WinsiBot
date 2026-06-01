#!/bin/bash
set -e

echo "🚀 Iniciando WinsiBot..."

# Iniciar Python API en background
echo "🐍 Iniciando Flask API..."
cd python
pip install -r requirements.txt -q
python -m flask --app api.app run --host=0.0.0.0 --port=5000 &
FLASK_PID=$!
cd ..

# Esperar Flask
sleep 2
echo "✅ Flask API corriendo (PID: $FLASK_PID)"

# Iniciar bot
echo "🤖 Iniciando bot..."
npm run dev

# Cleanup
trap "kill $FLASK_PID" EXIT