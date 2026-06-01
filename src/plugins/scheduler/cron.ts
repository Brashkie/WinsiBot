import { logger } from '@core/logger.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface IntervalSchedule {
  type: 'interval'
  ms:   number
}

export interface CronSchedule {
  type:    'cron'
  pattern: string   // 5 campos: "min hora dia mes diasem"
}

export type Schedule = IntervalSchedule | CronSchedule

export interface CronJob {
  id:        string
  name:      string
  schedule:  Schedule
  handler:   () => Promise<void>
  enabled:   boolean
  lastRun:   number
  nextRun:   number
  runCount:  number
  failCount: number
  maxFails?: number
}

export interface JobOptions {
  id?:       string
  maxFails?: number
  runNow?:   boolean
}

// ─── Helpers de schedule ──────────────────────────────────────────────────────
export const every = {
  minutes: (n: number): IntervalSchedule  => ({ type: 'interval', ms: n * 60_000 }),
  hours:   (n: number): IntervalSchedule  => ({ type: 'interval', ms: n * 3_600_000 }),
  days:    (n: number): IntervalSchedule  => ({ type: 'interval', ms: n * 86_400_000 }),
  at:      (hh: number, mm = 0): CronSchedule => ({
    type:    'cron',
    pattern: `${mm} ${hh} * * *`,
  }),
  weekly:  (dow: 0|1|2|3|4|5|6, hh: number, mm = 0): CronSchedule => ({
    type:    'cron',
    pattern: `${mm} ${hh} * * ${dow}`,
  }),
}

// ─── Parser de cron (5 campos) ────────────────────────────────────────────────
function matchField(value: number, field: string): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    return !isNaN(step) && step > 0 && value % step === 0
  }
  if (field.includes(',')) {
    return field.split(',').some(f => matchField(value, f.trim()))
  }
  if (field.includes('-')) {
    const parts = field.split('-')
    const lo = Number(parts[0])
    const hi = Number(parts[1])
    return !isNaN(lo) && !isNaN(hi) && value >= lo && value <= hi
  }
  const n = parseInt(field, 10)
  return !isNaN(n) && n === value
}

function matchesCron(pattern: string, d: Date): boolean {
  const f = pattern.trim().split(/\s+/)
  if (f.length !== 5) return false
  const [min, hour, dom, month, dow] = f as [string, string, string, string, string]
  return (
    matchField(d.getMinutes(),    min)   &&
    matchField(d.getHours(),      hour)  &&
    matchField(d.getDate(),       dom)   &&
    matchField(d.getMonth() + 1,  month) &&
    matchField(d.getDay(),        dow)
  )
}

// ─── Cálculo del próximo run ──────────────────────────────────────────────────
function calcNextRun(schedule: Schedule, from = Date.now()): number {
  if (schedule.type === 'interval') {
    return from + schedule.ms
  }
  // cron: buscar el próximo minuto que haga match
  let t = new Date(from)
  t.setSeconds(0, 0)
  t = new Date(t.getTime() + 60_000) // mínimo siguiente minuto
  for (let i = 0; i < 525_600; i++) {
    if (matchesCron(schedule.pattern, t)) return t.getTime()
    t = new Date(t.getTime() + 60_000)
  }
  return from + 24 * 60 * 60_000
}

// ─── Estado del scheduler ─────────────────────────────────────────────────────
const jobs   = new Map<string, CronJob>()
let   ticker: ReturnType<typeof setInterval> | null = null
const TICK_MS = 30_000  // tick cada 30s — resolución mínima de cron

// ─── Ejecutar un job ──────────────────────────────────────────────────────────
async function runJob(job: CronJob): Promise<void> {
  job.lastRun  = Date.now()
  job.nextRun  = calcNextRun(job.schedule, job.lastRun)
  job.runCount += 1

  try {
    await job.handler()
    job.failCount = 0
    logger.debug({ jobId: job.id, run: job.runCount }, `[cron] ✔ ${job.name}`)
  } catch (err) {
    job.failCount += 1
    logger.warn(
      { err, jobId: job.id, failCount: job.failCount },
      `[cron] ✘ ${job.name} — fallo #${job.failCount}`,
    )
    if (job.maxFails && job.failCount >= job.maxFails) {
      job.enabled = false
      logger.warn(
        { jobId: job.id },
        `[cron] ${job.name} deshabilitado tras ${job.failCount} fallos consecutivos`,
      )
    }
  }
}

function tick(): void {
  const now = Date.now()
  for (const job of jobs.values()) {
    if (!job.enabled || now < job.nextRun) continue
    runJob(job).catch(() => {})
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────
export function registerJob(
  name:     string,
  schedule: Schedule,
  handler:  () => Promise<void>,
  opts:     JobOptions = {},
): string {
  const id  = opts.id ?? `${name.toLowerCase().replace(/\W+/g, '_')}_${Date.now()}`
  const now = Date.now()

  if (jobs.has(id)) {
    logger.warn({ jobId: id }, `[cron] job "${id}" ya existía — reemplazado`)
    cancelJob(id)
  }

  const job: CronJob = {
    id,
    name,
    schedule,
    handler,
    enabled:  true,
    lastRun:  0,
    nextRun:  opts.runNow ? now : calcNextRun(schedule, now),
    runCount: 0,
    failCount: 0,
    ...(opts.maxFails !== undefined && { maxFails: opts.maxFails }),
  }

  jobs.set(id, job)
  logger.info(
    { jobId: id, nextRun: new Date(job.nextRun).toISOString() },
    `[cron] "${name}" registrado`,
  )
  return id
}

export function cancelJob(id: string): boolean {
  const ok = jobs.delete(id)
  if (ok) logger.info({ jobId: id }, '[cron] job cancelado')
  return ok
}

export function pauseJob(id: string): void {
  const job = jobs.get(id)
  if (job) { job.enabled = false; logger.debug({ jobId: id }, '[cron] pausado') }
}

export function resumeJob(id: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.enabled   = true
  job.failCount = 0
  job.nextRun   = calcNextRun(job.schedule)
  logger.debug({ jobId: id, nextRun: new Date(job.nextRun).toISOString() }, '[cron] reanudado')
}

export function triggerJob(id: string): Promise<void> | undefined {
  const job = jobs.get(id)
  if (!job) return undefined
  return runJob(job)
}

export function getJobs(): CronJob[] {
  return [...jobs.values()]
}

export function getJob(id: string): CronJob | undefined {
  return jobs.get(id)
}

export function getStats() {
  const all = [...jobs.values()]
  return {
    total:    all.length,
    enabled:  all.filter(j => j.enabled).length,
    disabled: all.filter(j => !j.enabled).length,
    jobs:     all.map(j => ({
      id:        j.id,
      name:      j.name,
      enabled:   j.enabled,
      runCount:  j.runCount,
      failCount: j.failCount,
      lastRun:   j.lastRun ? new Date(j.lastRun).toISOString() : null,
      nextRun:   j.nextRun ? new Date(j.nextRun).toISOString() : null,
    })),
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
export function startScheduler(): void {
  if (ticker) return
  ticker = setInterval(tick, TICK_MS)
  ticker.unref()
  logger.info('[cron] scheduler iniciado')
}

export function stopScheduler(): void {
  if (!ticker) return
  clearInterval(ticker)
  ticker = null
  logger.info('[cron] scheduler detenido')
}
