// src/lib/safeMessage.ts
import { WASocket } from '@whiskeysockets/baileys'

const MAX_RETRIES = 3
const RETRY_DELAY = 1500  // ms

export async function safeSend(
    fn: () => Promise<any>,
    retries = MAX_RETRIES
): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn()
        } catch (err: any) {
            const msg = err?.message ?? ''
            const isRetryable = [
                'Connection Closed',
                'Connection Lost',
                'ETIMEDOUT',
                'Stream Errored',
            ].some(e => msg.includes(e))

            if (!isRetryable || i === retries - 1) throw err

            const wait = RETRY_DELAY * (i + 1)  // backoff: 1.5s, 3s, 4.5s
            console.warn(`[safeSend] reintento ${i + 1}/${retries} en ${wait}ms — ${msg}`)
            await new Promise(r => setTimeout(r, wait))
        }
    }
}