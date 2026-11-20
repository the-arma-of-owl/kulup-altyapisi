import { after } from 'next/server'

/**
 * Site → CMS gözlem köprüsü. Site Telegram'a doğrudan yazmaz; olaylar CMS'in /api/obs/ingest ucuna
 * (iç anahtarla) gider, orada IP sayacı tutulur, konu (topic) ve birleştirme kurallarıyla bildirilir.
 * Yanıt kullanıcıya döndükten sonra (after) gönderilir; hata olursa ziyaretçi etkilenmez.
 */

// https://www.cloudflare.com/ips/ (ABT clientIp.ts ile aynı mantık)
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]

const v4ToInt = (ip: string): number | null => {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    const n = Number(part)
    if (!/^\d{1,3}$/.test(part) || n > 255) return null
    value = value * 256 + n
  }
  return value
}

const isCloudflareV4 = (ip: string): boolean => {
  const value = v4ToInt(ip)
  if (value === null) return false
  return CLOUDFLARE_V4.some((cidr) => {
    const [base, bits] = cidr.split('/')
    const size = 2 ** (32 - Number(bits))
    return Math.floor(value / size) === Math.floor((v4ToInt(base) ?? -1) / size)
  })
}

const looksLikeIp = (ip: string) => ip.length <= 45 && (v4ToInt(ip) !== null || /^[0-9a-f:]+$/i.test(ip) && ip.includes(':'))

/**
 * Ziyaretçi IP'si: Vercel'de x-real-ip istemcinin değiştiremediği bağlantı adresidir. Cloudflare arkasında
 * bu adres bir CF kenar sunucusudur; yalnız o durumda cf-connecting-ip'e güvenilir. x-forwarded-for'un
 * ilk öğesini istemci yazabildiği için kullanılmaz.
 */
export function getClientIp(headers: Headers): string {
  const connecting = headers.get('x-real-ip')?.trim() || headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || ''
  const cf = headers.get('cf-connecting-ip')?.trim() || ''
  if (cf && connecting && isCloudflareV4(connecting) && looksLikeIp(cf)) return cf
  return connecting || 'unknown'
}

/** CMS'e iletilecek ziyaretçi başlıkları (yalnız iç anahtarla birlikte kabul edilir). */
export function clientHeaders(ip: string, userAgent: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  if (ip && ip !== 'unknown' && looksLikeIp(ip)) headers['x-byt-client-ip'] = ip
  const ua = String(userAgent ?? '').replace(/[^\x20-\x7E]/g, '').slice(0, 300)
  if (ua) headers['x-byt-client-ua'] = ua
  return headers
}

export type SiteEvent =
  | { type: 'form_rejected'; ip: string; ua?: string | null; form: string; status: number; reason: string }
  | { type: 'site_error'; where: string; reason: string }

export async function sendSiteEvent(event: SiteEvent, deps: { fetcher?: typeof fetch; cmsUrl?: string; internalKey?: string } = {}): Promise<boolean> {
  const cmsUrl = deps.cmsUrl ?? (process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001')
  const key = deps.internalKey ?? process.env.INTERNAL_API_KEY
  if (!key) {
    console.error('[observe] INTERNAL_API_KEY eksik; olay CMS\'e iletilemedi:', event.type)
    return false
  }
  try {
    const response = await (deps.fetcher ?? fetch)(`${cmsUrl}/api/obs/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': key },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!response.ok) console.error(`[observe] CMS olay ucu ${response.status} döndü (${event.type})`)
    return response.ok
  } catch (error) {
    console.error('[observe] CMS olay ucuna ulaşılamadı:', event.type, (error as Error)?.message)
    return false
  }
}

/** Yanıttan sonra gönder; istek bağlamı yoksa (test) hemen gönder. */
export function reportSiteEvent(event: SiteEvent): void {
  try {
    after(() => sendSiteEvent(event).then(() => undefined))
  } catch {
    void sendSiteEvent(event)
  }
}
