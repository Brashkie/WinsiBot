"""
Compilar spam_guard.c en Windows
Ejecutar: python spam_guard_build.py
"""
import subprocess
import sys
from pathlib import Path

HERE    = Path(__file__).parent
SRC     = HERE / 'spam_guard.c'
OUT_DLL = HERE / 'spam_guard.dll'

GCC_PATHS = [
    r'C:\msys64\mingw64\bin\gcc.exe',
    r'C:\msys2\mingw64\bin\gcc.exe',
    r'C:\MinGW\bin\gcc.exe',
    'gcc',
]

def find_gcc() -> str | None:
    for gcc in GCC_PATHS:
        try:
            r = subprocess.run([gcc, '--version'], capture_output=True)
            if r.returncode == 0:
                return gcc
        except FileNotFoundError:
            continue
    return None

def build():
    gcc = find_gcc()
    if not gcc:
        print('✗ gcc no encontrado')
        return False

    print(f'  gcc: {gcc}')
    cmd = [gcc, '-O2', '-shared', '-o', str(OUT_DLL), str(SRC), '-lws2_32']
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.stderr:
        print(f'stderr: {result.stderr}')

    if result.returncode == 0 and OUT_DLL.exists():
        print(f'✔ Compilado: {OUT_DLL} ({OUT_DLL.stat().st_size} bytes)')
        return True

    print(f'✗ Error — returncode: {result.returncode}')
    return False

if __name__ == '__main__':
    success = build()
    sys.exit(0 if success else 1)