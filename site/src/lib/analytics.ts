// Birinci taraf, çerezsiz ziyaretçi istatistikleri (istemci tarafı).
// Olaylar bellekte toplanır; sayfa değişince, sekme gizlenince veya form gönderilince TEK beacon ile
// CMS'e (`POST {CMS}/api/analytics/collect`) gider → normalde sayfa başına en fazla 1 istek.
// sessionStorage'da yalnızca kampanya kaynağı (ref) ve rastgele sekme oturum numarası tutulur
// (sekme kapanınca silinir; kişisel veri değildir). Sunucu ham IP/UA saklamaz.

export type AnalyticsType = 'pageview' | 'event_view' | 'form_open' | 'form_start' | 'form_submit' | 'robot_question' | 'cta_click'
export type AnalyticsEntity = { entityType?: 'event' | 'blog' | 'achievement' | 'guide'; entityId?: number }
type QueuedEvent = { t: AnalyticsType; p: string; et?: string; ei?: number; m?: Record<string, string | number | boolean> }

const ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_URL
  || `${(process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')}/api/analytics/collect`
const REF_KEY = 'byt_ref'
const SID_KEY = 'byt_sid'
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|phantom|puppeteer|playwright|selenium/i
// Kaynak sayılmayacak bilinen parametreler (?mekatronik gibi çıplak parametre kaynak sayılır)
const IGNORED_PARAMS = new Set(['page', 'q', 'tab', 'lang', 'fbclid', 'gclid', 'igshid', 'si', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])
const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' }

let queue: QueuedEvent[] = []
let enabled: boolean | null = null
let referrerSent = false

/** CMS'teki normalizeRef ile aynı kural: küçük harf, Türkçe harf sadeleşir, [a-z0-9_-], ≤40. */
export function normalizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c] ?? c)
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return value || null
}

/** `?ref=x`, `?utm_source=x` veya çıplak `?x` → kaynak adı. */
export function refFromSearch(search: string): string | null {
  const params = new URLSearchParams(search)
  const explicit = params.get('ref') || params.get('utm_source') || params.get('kaynak')
  if (explicit) return normalizeRef(explicit)
  for (const [key, value] of params) {
    if (value === '' && !IGNORED_PARAMS.has(key.toLowerCase())) return normalizeRef(key)
  }
  return null
}

const session = {
  get(key: string): string | null { try { return window.sessionStorage.getItem(key) } catch { return null } },
  set(key: string, value: string) { try { window.sessionStorage.setItem(key, value) } catch { /* gizli mod vb. */ } },
}

/** CMS'te (Site Ayarları) istatistik kapatıldıysa layout bunu çağırır; sonraki tüm olaylar düşer. */
export function disableAnalytics() {
  enabled = false
  queue = []
}

function isEnabled(): boolean {
  if (enabled !== null) return enabled
  if (typeof window === 'undefined') return false
  enabled = !navigator.webdriver && !BOT_UA.test(navigator.userAgent)
  if (enabled) {
    // İlk girişteki kaynak oturum boyunca saklanır (ilk dokunuş kazanır)
    const ref = refFromSearch(window.location.search)
    if (ref && !session.get(REF_KEY)) session.set(REF_KEY, ref)
  }
  return enabled
}

function sessionId(): string | null {
  let sid = session.get(SID_KEY)
  if (!sid) {
    sid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('')
    session.set(SID_KEY, sid)
  }
  return /^[a-z0-9]{8,32}$/.test(sid) ? sid : null
}

/** Olayı kuyruğa ekler. Sayfa (yol) değiştiyse önceki sayfanın olayları önce gönderilir. */
export function track(type: AnalyticsType, options: AnalyticsEntity & { meta?: QueuedEvent['m']; flush?: boolean } = {}) {
  if (!isEnabled()) return
  const path = window.location.pathname
  if (queue.length && queue[0].p !== path) flush()
  const event: QueuedEvent = { t: type, p: path }
  if (options.entityType && options.entityId) { event.et = options.entityType; event.ei = options.entityId }
  if (options.meta) event.m = options.meta
  queue.push(event)
  if (options.flush || queue.length >= 25) flush()
}

export function flush() {
  if (!queue.length || typeof window === 'undefined') return
  const body: Record<string, unknown> = { e: queue, sid: sessionId() }
  const ref = session.get(REF_KEY)
  if (ref) body.ref = ref
  // Dış yönlendiren yalnızca belgenin ilk gönderiminde anlamlı (SPA geçişlerinde değil)
  if (!referrerSent && document.referrer) body.r = document.referrer
  referrerSent = true
  queue = []
  const payload = JSON.stringify(body)
  try {
    // text/plain: CORS ön isteği (preflight) gerekmez → tek istek
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'text/plain' }))) return
  } catch { /* fetch'e düş */ }
  fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(() => {})
}
