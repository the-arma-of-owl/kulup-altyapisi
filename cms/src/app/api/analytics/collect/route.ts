import { parseExtraOrigins } from '@/lib/origins'
import { analyticsPool } from '@/lib/analytics/db'
import { browserFromUA, createRateLimiter, deviceFromUA, isBotRequest, MAX_BODY_BYTES, parseBatch } from '@/lib/analytics/collect'
import { clientIp, daySalt, visitorHashes } from '@/lib/analytics/hash'
import { KULUP, kokenVaryantlari } from '@/lib/kulup'

// Sitenin `navigator.sendBeacon` ile attığı ziyaretçi olaylarını toplar (sayfa başına tek istek).
// Payload'u başlatmaz; yalnız pg havuzu kullanır. Her durumda 204 döner (beacon yanıtı okunmaz),
// yalnızca yabancı origin 403, aşırı büyük gövde 413 alır.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isProduction = process.env.NODE_ENV === 'production'

function siteOrigins(): string[] {
  return [
    ...(process.env.NEXT_PUBLIC_FRONTEND_URL || '').split(',').map((u) => u.trim().replace(/\/+$/, '')),
    ...kokenVaryantlari(KULUP.adresler.site),
    ...(isProduction ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
    ...parseExtraOrigins(process.env.EXTRA_ALLOWED_ORIGINS),
  ].filter(Boolean)
}

const ORIGINS = new Set(siteOrigins())
const SITE_HOSTS = [...ORIGINS].map((origin) => { try { return new URL(origin).hostname } catch { return '' } }).filter(Boolean)
const allowRequest = createRateLimiter(40, 60_000)
let warned = false

const done = (origin: string | null, status = 204) => new Response(null, {
  status,
  headers: origin && ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin', 'Cache-Control': 'no-store' }
    : { 'Cache-Control': 'no-store' },
})

export function OPTIONS(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin || !ORIGINS.has(origin)) return done(null, 403)
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin || !ORIGINS.has(origin)) return done(null, 403)
  const length = Number(req.headers.get('content-length') || 0)
  if (length > MAX_BODY_BYTES) return done(origin, 413)

  const ua = req.headers.get('user-agent') || ''
  if (isBotRequest(ua, req.headers)) return done(origin)

  const ip = clientIp(req.headers)
  if (!allowRequest(ip)) return done(origin, 429)

  let text = ''
  try { text = await req.text() } catch { return done(origin, 400) }
  if (text.length > MAX_BODY_BYTES) return done(origin, 413)
  let body: unknown
  try { body = JSON.parse(text) } catch { return done(origin, 400) }

  const batch = parseBatch(body, SITE_HOSTS)
  const salt = daySalt()
  if (!batch || !salt) return done(origin)
  const pool = await analyticsPool()
  if (!pool) return done(origin)

  const { visitor, session } = visitorHashes(salt, ip, ua, batch.sid)
  const device = deviceFromUA(ua)
  const browser = browserFromUA(ua)
  const values: unknown[] = []
  const rows = batch.events.map((event) => {
    const meta = event.type === 'pageview' ? { ...(event.meta ?? {}), browser } : event.meta
    const start = values.length
    values.push(event.type, event.path, event.entityType, event.entityId, batch.ref, visitor, session, device, batch.referrerHost, meta ? JSON.stringify(meta) : null)
    return `(${Array.from({ length: 10 }, (_, i) => `$${start + i + 1}`).join(', ')})`
  })

  try {
    await pool.query(
      `INSERT INTO analytics_events (type, path, entity_type, entity_id, ref, visitor_hash, session_hash, device, referrer_host, meta) VALUES ${rows.join(', ')}`,
      values,
    )
  } catch (error) {
    // Tablo henüz yoksa (SQL uygulanmadan yayına alındıysa) siteyi etkilemeden geç; günlükte bir kez uyar.
    if (!warned) { console.warn('analytics_events yazılamadı:', (error as Error).message); warned = true }
  }
  return done(origin)
}
