// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — LOG CAPTURE
//  Captura stdout/stderr en memoria para el comando !logs.
//  Puerto TypeScript de la lib original de Avenix-Multi / Hepein.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LOGS   = 200
const MAX_ERRORS = 100

interface LogEntry {
  ts:   number
  text: string
}

let _logs:    LogEntry[] = []
let _errors:  LogEntry[] = []
let _active   = false

type WriteArgs = Parameters<typeof process.stdout.write>

let _origOut: (typeof process.stdout.write) | null = null
let _origErr: (typeof process.stderr.write) | null = null

const ANSI_RE = /\x1B\[\d+m/g

function _strip(data: Buffer | string): string {
  return (Buffer.isBuffer(data) ? data.toString('utf8') : String(data)).replace(ANSI_RE, '')
}

// ─── Control ──────────────────────────────────────────────────────────────────

export function startCapture(): void {
  if (_active) return
  _origOut = process.stdout.write.bind(process.stdout)
  _origErr = process.stderr.write.bind(process.stderr)

  process.stdout.write = function (...args: WriteArgs) {
    _logs.push({ ts: Date.now(), text: _strip(args[0] as Buffer | string) })
    if (_logs.length > MAX_LOGS) _logs.shift()
    return (_origOut as any)(...args)
  } as typeof process.stdout.write

  process.stderr.write = function (...args: WriteArgs) {
    _errors.push({ ts: Date.now(), text: _strip(args[0] as Buffer | string) })
    if (_errors.length > MAX_ERRORS) _errors.shift()
    return (_origErr as any)(...args)
  } as typeof process.stderr.write

  _active = true
}

export function stopCapture(): void {
  if (!_active) return
  if (_origOut) process.stdout.write = _origOut
  if (_origErr) process.stderr.write = _origErr
  _origOut = null; _origErr = null
  _active = false
}

export function isCapturing(): boolean { return _active }

// ─── Acceso ───────────────────────────────────────────────────────────────────

export function getLogs(last?: number): string {
  const entries = last ? _logs.slice(-last) : _logs
  return entries.map(e => e.text).join('')
}

export function getErrors(last?: number): string {
  const entries = last ? _errors.slice(-last) : _errors
  return entries.map(e => e.text).join('')
}

export function getStructuredLogs(last?: number): LogEntry[] {
  return last ? _logs.slice(-last) : [..._logs]
}

export function clearLogs(): void  { _logs = [] }
export function clearErrors(): void { _errors = [] }
export function clearAll(): void   { _logs = []; _errors = [] }

export function searchLogs(keyword: string, caseSensitive = false): LogEntry[] {
  const needle = caseSensitive ? keyword : keyword.toLowerCase()
  return _logs.filter(e => (caseSensitive ? e.text : e.text.toLowerCase()).includes(needle))
}

export function stats() {
  return {
    active:      _active,
    logs:        _logs.length,
    errors:      _errors.length,
    logsMaxSize: MAX_LOGS,
    errMaxSize:  MAX_ERRORS,
  }
}
