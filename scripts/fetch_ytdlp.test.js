// Qué ejecutable de yt-dlp corresponde a cada máquina (ver scripts/fetch_ytdlp.js).
import { describe, expect, it } from 'vitest'
import { asset, sumaDe } from './fetch_ytdlp.js'

describe('fetch_ytdlp', () => {
  it('el ejecutable de cada plataforma, y nada en Termux', () => {
    expect(asset('win32', 'x64', undefined)).toBe('yt-dlp.exe')
    expect(asset('win32', 'arm64', undefined)).toBe('yt-dlp_arm64.exe')
    expect(asset('linux', 'x64', undefined)).toBe('yt-dlp_linux')
    expect(asset('linux', 'arm64', undefined)).toBe('yt-dlp_linux_aarch64')
    expect(asset('darwin', 'arm64', undefined)).toBe('yt-dlp_macos')
    expect(asset('android', 'arm64', undefined)).toBe(null)
    expect(asset('linux', 'arm64', '/data/data/com.termux/files/usr')).toBe(null)
    expect(asset('linux', 'riscv64', undefined)).toBe(null)
  })

  it('lee la suma de su archivo, y solo una suma bien formada', () => {
    const h = 'a'.repeat(64)
    const sums = `${'b'.repeat(64)}  yt-dlp\n${h}  yt-dlp.exe\nbasura  yt-dlp_linux\n`
    expect(sumaDe(sums, 'yt-dlp.exe')).toBe(h)
    expect(sumaDe(sums, 'yt-dlp_linux')).toBe(null)
    expect(sumaDe(sums, 'yt-dlp_macos')).toBe(null)
  })
})
