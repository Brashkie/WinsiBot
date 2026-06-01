#!/bin/bash
set -e
echo "🔨 Compilando módulos Cython..."
cd python/cython_ext
python setup.py build_ext --inplace
echo "✅ Compilación completada"