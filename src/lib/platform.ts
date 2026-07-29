// platform.ts — resolución de rutas/binarios que cambian según el sistema
// operativo, en un solo lugar. Antes cada script/archivo que necesitaba
// encontrar el Python del venv o un binario del venv (yt-dlp, etc.) repetía
// a mano `python/venv/Scripts/python.exe` (layout de Windows) sin ninguna
// rama para Linux/macOS/Termux (`python/venv/bin/python`) — funcionaba en
// Windows y fallaba o caía silenciosamente al binario del sistema en
// cualquier otro SO. Ver plan de multiplataforma.
//
// Duplicado a propósito en scripts/_platform.js (JS plano, sin tsc) — ver el
// comentario de ese archivo para el porqué. scripts/_platform.test.js
// verifica que los dos no se desincronicen.

import { join } from 'path'

export const IS_WINDOWS = process.platform === 'win32'
export const IS_MAC     = process.platform === 'darwin'
export const IS_LINUX   = process.platform === 'linux'

/** Agrega ".exe" solo en Windows — mismo patrón que ya usaba src/index.ts para el binario de Rust. */
export function exeName(name: string): string {
  return IS_WINDOWS ? `${name}.exe` : name
}

/** Ruta al Python del venv del proyecto: Scripts/python.exe en Windows, bin/python en el resto. */
export function venvPythonPath(cwd: string = process.cwd()): string {
  return IS_WINDOWS
    ? join(cwd, 'python', 'venv', 'Scripts', 'python.exe')
    : join(cwd, 'python', 'venv', 'bin', 'python')
}

/** Ruta a un binario instalado dentro del venv (yt-dlp, etc.) — mismo criterio que venvPythonPath. */
export function venvBinPath(name: string, cwd: string = process.cwd()): string {
  return IS_WINDOWS
    ? join(cwd, 'python', 'venv', 'Scripts', exeName(name))
    : join(cwd, 'python', 'venv', 'bin', name)
}

/** Nombre del Python del sistema fuera del venv — 'python' en Windows, 'python3' en el resto. */
export function systemPython(): string {
  return IS_WINDOWS ? 'python' : 'python3'
}
