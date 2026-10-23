// platform.ts — lo que cambia según el sistema operativo, en un solo lugar.
//
// Hasta la 8.14.0 también resolvía el Python del venv y sus binarios. Python
// salió del proyecto en la 8.15.0, y con él esas tres funciones.
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

/** Ruta a un binario externo del proyecto (ffmpeg, yt-dlp...), que viven en bin/. */
export function binPath(name: string, cwd: string = process.cwd()): string {
  return join(cwd, 'bin', exeName(name))
}
