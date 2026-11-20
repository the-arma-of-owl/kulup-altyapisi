import type { PayloadClient } from './payload.js'
import { maskText } from './log.js'

/**
 * Worker olaylarını CMS'e (POST /api/worker/event) bildirir; CMS bunları Telegram'a ve gün sonu raporuna
 * işler. Worker Telegram anahtarı taşımaz. Gönderim beklenmez (ana işi yavaşlatmaz), hata yutulur ama
 * yerel günlüğe yazılır. Oturum yokken olaylar kısa bir kuyrukta bekler, oturum açılınca gönderilir.
 * Aynı hata kısa sürede tekrar ederse (ör. 5 sn'de bir dönen kuyruk turu) yalnız bir kez gönderilir.
 */

export type TelemetryKind =
  | 'worker_started' | 'worker_error'
  | 'wa_connected' | 'wa_disconnected' | 'wa_auth_failure' | 'wa_reconnect_exhausted' | 'wa_start_failed'
  | 'queue_error' | 'queue_interrupted' | 'queue_run'
  | 'certificate_result' | 'certificate_failed' | 'certificate_batch'
  | 'send_batch'

export type TelemetryData = Record<string, string | number | boolean | null | undefined>
export type Reporter = (kind: TelemetryKind, data?: TelemetryData, options?: { dedupeKey?: string; dedupeMs?: number }) => void
export const noopReporter: Reporter = () => undefined

type Sender = Pick<PayloadClient, 'request'>

export class Telemetry {
  private readonly pending: Array<{ kind: TelemetryKind; data: TelemetryData }> = []
  private readonly recent = new Map<string, number>()
  private flushing: Promise<void> | null = null

  constructor(private readonly payload: Sender, private readonly authenticated: () => boolean,
    private readonly now: () => number = Date.now, private readonly maxPending = 100) {}

  readonly report: Reporter = (kind, data = {}, options = {}) => {
    const key = options.dedupeKey
    if (key) {
      const last = this.recent.get(key)
      if (last !== undefined && this.now() - last < (options.dedupeMs ?? 600_000)) return
      this.recent.set(key, this.now())
      if (this.recent.size > 500) this.recent.clear()
    }
    const clean: TelemetryData = {}
    for (const [name, value] of Object.entries(data)) {
      if (value === undefined) continue
      clean[name] = typeof value === 'string' ? maskText(value).slice(0, 300) : value
    }
    this.pending.push({ kind, data: clean })
    if (this.pending.length > this.maxPending) this.pending.splice(0, this.pending.length - this.maxPending)
    void this.flush()
  }

  /** Bekleyen olayları sırayla gönderir; oturum yoksa bekletir. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    this.flushing = (async () => {
      while (this.pending.length && this.authenticated()) {
        const event = this.pending[0]
        try {
          await this.payload.request('/worker/event', { method: 'POST', body: event, skipSessionCheck: true })
        } catch (error) {
          // Ağ yoksa sonra yeniden denenir; 4xx (geçersiz olay / yetki) tekrar denenmez.
          const status = (error as { status?: number })?.status ?? 0
          if (status === 0 || status >= 500) { console.warn('[telemetry] CMS\'e iletilemedi, bekletiliyor'); break }
          console.warn(`[telemetry] olay reddedildi (${status}): ${event.kind}`)
        }
        this.pending.shift()
      }
    })().finally(() => { this.flushing = null })
    return this.flushing
  }

  pendingCount(): number { return this.pending.length }
}
