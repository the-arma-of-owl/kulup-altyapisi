// Ziyaretçi istatistikleri: sitenin gönderdiği beacon gövdesini doğrulayan saf yardımcılar.
// Ham IP / UA burada yalnızca hash ve cihaz türü üretmek için kullanılır, hiçbir yere yazılmaz.

export const EVENT_TYPES = ['pageview', 'event_view', 'form_open', 'form_start', 'form_submit', 'robot_question', 'cta_click'] as const
export type AnalyticsType = (typeof EVENT_TYPES)[number]
export const ENTITY_TYPES = ['event', 'blog', 'achievement', 'guide'] as const

export const MAX_BODY_BYTES = 8 * 1024
export const MAX_EVENTS = 30

export type CleanEvent = {
  type: AnalyticsType
  path: string
  entityType: string | null
  entityId: number | null
  meta: Record<string, string | number | boolean> | null
}

export type CleanBatch = {
  events: CleanEvent[]
  ref: string | null
  referrerHost: string | null
  sid: string | null
}

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' }

/** Kampanya kaynağı: küçük harf, Türkçe harfler sadeleşir, yalnız [a-z0-9_-], en çok 40 karakter. */
export function normalizeRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.replace(/[çğıİöşüÇĞÖŞÜ]/g, (char) => TR_MAP[char] ?? char)
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return value.length > 0 ? value : null
}

/** Sorgu dizesi ve parça atılır; bilet jetonu ve sertifika kodu gibi kişiye bağlı parçalar maskelenir. */
export function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
  let path = raw.split(/[?#]/)[0].slice(0, 300)
  try { path = decodeURI(path) } catch { /* olduğu gibi kalsın */ }
  path = path
    .replace(/^\/(tr|en)(?=\/|$)/, '')
    .replace(/^\/ticket\/[^/]+/, '/ticket/[jeton]')
    .replace(/^\/sertifika\/[^/]+/, '/sertifika/[kod]')
    .replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path || '/'
}

export function referrerHostFrom(raw: unknown, siteHosts: string[]): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const host = new URL(raw).hostname.toLowerCase().slice(0, 100)
    if (!host || siteHosts.includes(host)) return null
    return host
  } catch { return null }
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|pagespeed|phantom|puppeteer|playwright|selenium|curl|wget|python|axios|node-fetch|go-http|java\/|httpclient|okhttp|monitor|uptime|vercel-screenshot|scanner/i

export function isBotRequest(ua: string, headers: Headers): boolean {
  if (!ua || ua.length < 20) return true
  if (BOT_UA.test(ua)) return true
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-purpose') ?? ''} ${headers.get('x-moz') ?? ''}`
  return /prefetch|preview|prerender/i.test(purpose)
}

export function deviceFromUA(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone|opera mini/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function browserFromUA(ua: string): string {
  if (/edg(e|a|ios)?\//i.test(ua)) return 'edge'
  if (/opr\/|opera/i.test(ua)) return 'opera'
  if (/samsungbrowser/i.test(ua)) return 'samsung'
  if (/yabrowser/i.test(ua)) return 'yandex'
  if (/firefox|fxios/i.test(ua)) return 'firefox'
  if (/chrome|crios|chromium/i.test(ua)) return 'chrome'
  if (/safari/i.test(ua)) return 'safari'
  return 'other'
}

function cleanMeta(raw: unknown): Record<string, string | number | boolean> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
    if (!/^[a-zA-Z_]{1,20}$/.test(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, 80)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean') out[key] = value
  }
  return Object.keys(out).length ? out : null
}

/**
 * Gövde biçimi (site `site/src/lib/analytics.ts` ile aynı):
 * { ref?: string, r?: referrer URL, sid?: sekme oturum no., e: [{ t: type, p: path, et?: entityType, ei?: entityId, m?: meta }] }
 */
export function parseBatch(body: unknown, siteHosts: string[]): CleanBatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  if (!Array.isArray(raw.e) || raw.e.length === 0) return null
  const events: CleanEvent[] = []
  for (const item of raw.e.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== 'object') continue
    const event = item as Record<string, unknown>
    if (!EVENT_TYPES.includes(event.t as AnalyticsType)) continue
    const path = sanitizePath(event.p)
    if (!path) continue
    const entityType = ENTITY_TYPES.includes(event.et as (typeof ENTITY_TYPES)[number]) ? String(event.et) : null
    const entityId = entityType && Number.isSafeInteger(event.ei) && (event.ei as number) > 0 ? (event.ei as number) : null
    events.push({ type: event.t as AnalyticsType, path, entityType: entityId ? entityType : null, entityId, meta: cleanMeta(event.m) })
  }
  if (!events.length) return null
  const sid = typeof raw.sid === 'string' && /^[a-z0-9]{8,32}$/.test(raw.sid) ? raw.sid : null
  return { events, ref: normalizeRef(raw.ref), referrerHost: referrerHostFrom(raw.r, siteHosts), sid }
}

/** Basit sabit pencereli hız sınırı (örnek başına, bellekte). */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>()
  return (key: string): boolean => {
    const time = now()
    if (hits.size > 5000) for (const [k, v] of hits) if (time - v.start >= windowMs) hits.delete(k)
    const entry = hits.get(key)
    if (!entry || time - entry.start >= windowMs) { hits.set(key, { start: time, count: 1 }); return true }
    entry.count += 1
    return entry.count <= limit
  }
}
