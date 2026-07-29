"""
Compilar spam_guard.c — multiplataforma (Windows/Linux/macOS)
Ejecutar: python spam_guard_build.py

El .c ya es portable (ver su propio header — usa #ifdef _WIN32 para el
EXPORT y documenta ambos comandos de compilación). Lo único que cambiaba
por SO era: qué gcc buscar, el nombre del archivo de salida, y si hace
falta -lws2_32 (Windows) o -fPIC (POSIX, requerido para libs compartidas).
"""
import subprocess
import sys
from pathlib import Path

# La consola de Windows en cp1252 no puede imprimir ✗/✔ directo — reconfigurar
# a UTF-8 evita el UnicodeEncodeError sin tener que sacar los símbolos.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

HERE = Path(__file__).parent
SRC  = HERE / 'spam_guard.c'

IS_WINDOWS = sys.platform == 'win32'
IS_MAC     = sys.platform == 'darwin'

if IS_WINDOWS:
    OUT_LIB = HERE / 'spam_guard.dll'
elif IS_MAC:
    OUT_LIB = HERE / 'spam_guard.dylib'
else:
    OUT_LIB = HERE / 'spam_guard.so'

GCC_CANDIDATES = [
    r'C:\msys64\mingw64\bin\gcc.exe',
    r'C:\msys2\mingw64\bin\gcc.exe',
    r'C:\MinGW\bin\gcc.exe',
    'gcc',
] if IS_WINDOWS else [
    'cc', 'gcc', 'clang',
]

def find_compiler() -> str | None:
    for cc in GCC_CANDIDATES:
        try:
            r = subprocess.run([cc, '--version'], capture_output=True)
            if r.returncode == 0:
                return cc
        except FileNotFoundError:
            continue
    return None

def build():
    cc = find_compiler()
    if not cc:
        hint = 'instalá MSYS2/MinGW' if IS_WINDOWS else 'instalá build-essential (Linux) o Xcode Command Line Tools (macOS)'
        print(f'✗ Compilador de C no encontrado — {hint}')
        return False

    print(f'  compilador: {cc}')

    if IS_WINDOWS:
        cmd = [cc, '-O2', '-shared', '-o', str(OUT_LIB), str(SRC), '-lws2_32']
    else:
        # -fPIC: obligatorio en Linux/macOS para compilar una lib compartida.
        # Rama de macOS sin verificar en vivo (no hay Mac disponible acá) —
        # mismo comando que Linux, gcc/clang de Xcode lo soporta igual.
        cmd = [cc, '-O2', '-shared', '-fPIC', '-o', str(OUT_LIB), str(SRC)]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.stderr:
        print(f'stderr: {result.stderr}')

    if result.returncode == 0 and OUT_LIB.exists():
        print(f'✔ Compilado: {OUT_LIB} ({OUT_LIB.stat().st_size} bytes)')
        return True

    print(f'✗ Error — returncode: {result.returncode}')
    return False

if __name__ == '__main__':
    success = build()
    sys.exit(0 if success else 1)