import { createHmac } from 'node:crypto'

/**
 * KVKK: IP adresi kişisel veridir. Veritabanında ham IP yalnız 7 gün (olay incelemesi, Cloudflare/Vercel
 * engeli için) tutulur; tekrar tespiti ve hız sınırı anahtarları HMAC özetiyle çalışır. IPv4 uzayı küçük
 * olduğundan düz SHA-256 tersine çevrilebilir; bu yüzden gizli anahtarlı HMAC kullanılır.
 */
function hashSecret(): string {
  return process.env.OBS_HASH_SECRET || process.env.PAYLOAD_SECRET || 'byt-obs-yerel'
}

export function hashKey(value: string, purpose = 'ip'): string {
  return createHmac('sha256', hashSecret()).update(`${purpose}:${value}`).digest('hex').slice(0, 32)
}

export const hashIp = (ip: string): string => hashKey(ip || 'unknown', 'ip')

/**
 * KVKK: Telegram üçüncü taraf (yurt dışı) bir hizmettir ve mesajlar grupta süresiz kalır; tam IP oraya gitmez.
 * IPv4 → ilk iki blok (85.105.x.x), IPv6 → ilk iki grup (2a02:4780:…). Aynı kişiyi tanımak için yanına
 * gizli anahtarlı, geri çevrilemeyen kısa etiket konur (#a1b2c3). Tam IP gerekirse (ör. engelleme) 7 gün
 * boyunca yalnız veritabanındaki obs.security_events kaydında durur.
 */
export function maskIp(ip: string | null | undefined): string {
  const value = String(ip ?? '').trim()
  if (!value || value === 'unknown') return 'bilinmiyor'
  const v4 = value.replace(/^::ffff:/i, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return `${v4.split('.').slice(0, 2).join('.')}.x.x`
  if (value.includes(':')) return `${value.split(':').slice(0, 2).join(':')}:…`
  return 'gizli'
}

/** Maskeli IP + kısa etiket: "85.105.x.x #a1b2c3" */
export const ipLabel = (ip: string | null | undefined): string =>
  ip && ip !== 'unknown' ? `${maskIp(ip)} #${hashIp(ip).slice(0, 6)}` : 'bilinmiyor'

const IPV4_IN_TEXT = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(?![\d.])/g
// En az 3 iki nokta içeren onaltılık gruplar (saatler "20:30:00" eşleşmez) ya da "::" kısaltması.
const IPV6_IN_TEXT = /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}(?![0-9a-f:])|(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?![0-9a-f:])/gi

/** Metindeki tüm IP adreslerini maskeler (Telegram'a giden her mesaj için son güvence). */
export function redactIps(text: string): string {
  return text
    .replace(IPV4_IN_TEXT, (_m, a, b) => `${a}.${b}.x.x`)
    .replace(IPV6_IN_TEXT, (m) => `${m.split(':').filter(Boolean).slice(0, 2).join(':')}:…`)
}

export function maskEmail(value: unknown): string {
  const email = String(value ?? '').trim()
  const at = email.indexOf('@')
  if (at < 1) return email ? '***' : '-'
  return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`
}

export function maskPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '-'
}

/** Telegram HTML (parse_mode=HTML) için kaçış. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Uzun hata metinlerini tek satıra indirir ve sırları maskeler. */
export function cleanReason(value: unknown, max = 300): string {
  const text = value instanceof Error ? value.message : String(value ?? '')
  return text
    .replace(/(?:Bearer\s+)[^\s]+/gi, 'Bearer [gizli]')
    .replace(/\bre_[A-Za-z0-9_]+/g, '[gizli]')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[gizli]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const trTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
const trDateTime = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })
export const formatTrTime = (date: Date | string | number): string => trTime.format(new Date(date))
export const formatTrDateTime = (date: Date | string | number): string => trDateTime.format(new Date(date))
