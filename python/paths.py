# -*- coding: utf-8 -*-
r"""Donde esta la raiz del proyecto, tanto interpretado como compilado.

Interpretado, la raiz sale de `__file__`: este archivo vive en `python/`, asi
que son dos niveles por encima.

Compilado con Nuitka `--onefile`, `__file__` **no sirve**: apunta al directorio
temporal en el que el binario se extrae a si mismo en cada arranque
(`...\Temp\onefile_1672_178697_5LhiBbcXiew\paths.py`), un sitio que se borra al
salir y donde no hay ni `.env`, ni `auth/`, ni `data/`. Era un bug real y
visible: `manage.exe status` informaba *"auth dir missing"* teniendo 8422
archivos en `auth/`, y mostraba el puerto por defecto en vez del del `.env`.

Las dos pistas habituales tampoco valen aqui:

* `sys.frozen` es **False** bajo Nuitka — eso lo define PyInstaller.
* `sys.executable` apunta al `python.exe` del directorio temporal.

La que si apunta al ejecutable de verdad es `__compiled__.containing_dir`, que
Nuitka inyecta en **todos** los modulos compilados y no solo en el principal
(comprobado con un binario de prueba). El binario se publica en `python/bin/`,
o sea tambien dos niveles por encima de la raiz: el calculo es el mismo y lo
unico que cambia es el punto de partida.
"""
import os
from pathlib import Path


def _raiz() -> Path:
    # Escape para quien mueva el binario fuera de `python/bin/`.
    desde_entorno = os.environ.get('WINSIBOT_ROOT')
    if desde_entorno:
        return Path(desde_entorno).resolve()

    compilado = globals().get('__compiled__')
    if compilado is not None:
        return Path(compilado.containing_dir).resolve().parent.parent

    return Path(__file__).resolve().parent.parent


ROOT = _raiz()
