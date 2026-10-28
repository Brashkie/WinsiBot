// Los descargadores del postinstall (ver scripts/prebuilt.js y
// fetch_cosxamix.js): qué target le toca a cada máquina, cuándo se baja
// Cosxamix y cómo se llama su archivo en la release.
import { describe, expect, it } from 'vitest'
import { target } from './prebuilt.js'
import { loUsa, nombre, version } from './fetch_cosxamix.js'

describe('target', () => {
  it('cada plataforma con su triple', () => {
    expect(target({}, 'win32', 'x64')).toBe('x86_64-pc-windows-msvc')
    expect(target({}, 'linux', 'x64')).toBe('x86_64-unknown-linux-gnu')
    expect(target({}, 'linux', 'arm64')).toBe('aarch64-unknown-linux-gnu')
    expect(target({}, 'darwin', 'arm64')).toBe('aarch64-apple-darwin')
    expect(target({}, 'freebsd', 'x64')).toBeNull()
  })

  it('Termux es Android aunque Node diga linux', () => {
    expect(target({}, 'android', 'arm64')).toBe('aarch64-linux-android')
    expect(target({}, 'linux', 'arm64', '/data/data/com.termux/files/usr')).toBe('aarch64-linux-android')
    expect(target({}, 'android', 'arm')).toBeNull()
  })

  it('lo que cada proyecto publica de más', () => {
    // La Session API: Windows ARM sí, Mac Intel no.
    expect(target({ winArm: true }, 'win32', 'arm64')).toBe('aarch64-pc-windows-msvc')
    expect(target({ winArm: true }, 'darwin', 'x64')).toBeNull()
    // Cosxamix: al revés.
    expect(target({ macIntel: true }, 'darwin', 'x64')).toBe('x86_64-apple-darwin')
    expect(target({ macIntel: true }, 'win32', 'arm64')).toBeNull()
  })
})

describe('Cosxamix', () => {
  it('se baja salvo que el .env apunte a otro lado', () => {
    expect(loUsa('OLLAMA_URL=http://127.0.0.1:11435\n')).toBe(true)
    expect(loUsa('OLLAMA_URL="http://localhost:11435"\r\nOTRA=1')).toBe(true)
    expect(loUsa('OLLAMA_URL=http://localhost:11434')).toBe(false)
    // Comentada no cuenta: lo que vale es la que está activa.
    expect(loUsa('OLLAMA_URL=http://localhost:11434\n# OLLAMA_URL=http://127.0.0.1:11435')).toBe(false)
    // Sin OLLAMA_URL, o sin .env todavía: Cosxamix es lo de por defecto.
    expect(loUsa('# OLLAMA_URL=http://localhost:11434\nOTRA=1')).toBe(true)
    expect(loUsa('')).toBe(true)
    expect(loUsa(undefined)).toBe(true)
    expect(loUsa('OLLAMA_URL=no-es-url')).toBe(false)
  })

  it('el nombre del archivo, como lo arma su release.yml', () => {
    expect(nombre('0.5.1', 'x86_64-pc-windows-msvc')).toBe('cosxamix-0.5.1-x86_64-pc-windows-msvc.exe')
    expect(nombre('0.5.1', 'aarch64-linux-android')).toBe('cosxamix-0.5.1-aarch64-linux-android')
  })

  it('la versión sale de package.json y se puede cambiar', () => {
    expect(version({ config: { cosxamix: '0.5.1' } }, {})).toBe('0.5.1')
    expect(version({ config: { cosxamix: '0.5.1' } }, { COSXAMIX_VERSION: '0.5.0' })).toBe('0.5.0')
    expect(() => version({}, {})).toThrow()
  })
})
