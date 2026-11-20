import { createHmac } from 'node:crypto'

// Günlük tuz: sır (env) + İstanbul takvim günü → HMAC. Veritabanına yazılmaz, yalnızca bellekte tutulur;
// gün değişince eskisi bellekten atılır. Sır bilinmeden eski günün tuzu (dolayısıyla hash'lerin
// IP'ye geri eşlenmesi) üretilemez. ANALYTICS_SALT_SECRET yoksa PAYLOAD_SECRET'tan türetilir.

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
let cached: { day: string; salt: Buffer } | null = null

export function istanbulDay(date = new Date()): string {
  return dayFormat.format(date)
}

function secret(): string {
  return process.env.ANALYTICS_SALT_SECRET || process.env.PAYLOAD_SECRET || ''
}

export function daySalt(date = new Date()): Buffer | null {
  const key = secret()
  if (!key) return null
  const day = istanbulDay(date)
  if (cached?.day !== day) {
    cached = { day, salt: createHmac('sha256', `byt-analytics-salt:${key}`).update(day).digest() }
  }
  return cached.salt
}

const hmac = (salt: Buffer, value: string) => createHmac('sha256', salt).update(value).digest('base64url').slice(0, 22)

/** Ziyaretçi: IP + UA (gün içinde aynı cihaz/ağ). Oturum: ziyaretçi + sekme no. (yoksa ziyaretçi). */
export function visitorHashes(salt: Buffer, ip: string, ua: string, sid: string | null) {
  const visitor = hmac(salt, `v|${ip}|${ua}`)
  const session = hmac(salt, `s|${visitor}|${sid ?? '-'}`)
  return { visitor, session }
}

export function clientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip')
    || headers.get('x-real-ip')
    || (headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || '0.0.0.0'
}
