/**
 * session.ts v3 — Cliente TypeScript para winsibot-session-api v3
 * Colócalo en src/lib/session.ts de WinsiBot v8
 */

const API_URL = process.env.SESSION_API_URL ?? "http://127.0.0.1:3001";
const API_KEY  = process.env.SESSION_API_KEY ?? "";

const baseHeaders = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...baseHeaders, ...init?.headers },
  });
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SnapMeta {
  path:      string;
  sizeBytes: number;
  ts:        string;
}

export interface HealthResult {
  ok:                 boolean;
  sessionId:          string;
  healthy:            boolean;
  corruptionDetected: boolean;
  lastSnapshot:       SnapMeta | null;
  ts:                 string;
}

// ── SessionClient ─────────────────────────────────────────────────────────────

export class SessionClient {
  constructor(private readonly sessionId: string) {}

  /** Guarda creds en Rust (lock + snapshot + atomic write) */
  async save(creds: unknown): Promise<void> {
    const data = Buffer.from(JSON.stringify(creds)).toString("base64");
    await apiFetch("/write", {
      method: "POST",
      body: JSON.stringify({ sessionId: this.sessionId, data }),
    });
  }

  /** Lee creds desde disco */
  async load(): Promise<unknown> {
    const res = await apiFetch<{ data: string }>(`/read?sessionId=${this.sessionId}`);
    return JSON.parse(Buffer.from(res.data, "base64").toString("utf8"));
  }

  /** Health detallado: healthy, corruptionDetected, lastSnapshot */
  async health(): Promise<HealthResult> {
    return apiFetch<HealthResult>(`/healthy?sessionId=${this.sessionId}`);
  }

  /** true si creds.json existe y es JSON válido */
  async isHealthy(): Promise<boolean> {
    try {
      const h = await this.health();
      return h.healthy;
    } catch {
      return false;
    }
  }

  /** Recupera desde el snapshot más reciente válido */
  async recover(): Promise<string | null> {
    try {
      const res = await apiFetch<{ message: string }>("/recover", {
        method: "POST",
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
      return res.message;
    } catch {
      return null;
    }
  }

  /** Lista snapshots disponibles */
  async snapshots(): Promise<string[]> {
    const res = await apiFetch<{ snapshots: string[] }>(`/snapshots?sessionId=${this.sessionId}`);
    return res.snapshots;
  }

  /**
   * Llama esto al arrancar el bot.
   * Si la sesión está corrupta, recupera automáticamente.
   */
  async ensureHealthy(): Promise<void> {
    const h = await this.health().catch(() => null);
    if (!h || h.corruptionDetected) {
      console.warn(`[Session:${this.sessionId}] ⚠️  corrupción detectada, recuperando...`);
      const result = await this.recover();
      if (result) {
        console.log(`[Session:${this.sessionId}] ✅ ${result}`);
      } else {
        console.error(`[Session:${this.sessionId}] ❌ sin snapshots — sesión nueva`);
      }
    }
  }
}

// ── Helpers globales ──────────────────────────────────────────────────────────

export async function listActiveSessions(): Promise<string[]> {
  const res = await apiFetch<{ sessions: string[] }>("/sessions");
  return res.sessions;
}

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/live`);
    return res.ok;
  } catch {
    return false;
  }
}
