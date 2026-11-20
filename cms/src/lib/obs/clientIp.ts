import { hasInternalKey } from '../access'

/**
 * Ziyaretçinin gerçek IP'si (ABT abt-backend/src/lib/clientIp.ts'ten uyarlandı).
 *
 * Vercel'de `x-real-ip` bağlantıyı açan adrestir; istemci değiştiremez. Alan adı Cloudflare
 * arkasındaysa bu adres bir Cloudflare kenar sunucusudur; yalnız o durumda `cf-connecting-ip`
 * güvenilir. `x-forwarded-for`'un ilk öğesini istemci belirleyebildiği için kullanılmaz.
 *
 * Site sunucusu (iç anahtarla gelen form istekleri) ziyaretçi IP'sini `x-byt-client-ip` ile iletir;
 * bu başlık yalnız geçerli iç anahtar varsa kabul edilir.
 */

// https://www.cloudflare.com/ips/ — liste değişirse güncellenmeli.
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]
const CLOUDFLARE_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
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

const v6ToBigInt = (ip: string): bigint | null => {
  if (!ip.includes(':') || ip.includes('.')) return null
  const [head, tail = ''] = ip.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = 8 - headParts.length - tailParts.length
  if (missing < 0 || (!ip.includes('::') && missing !== 0)) return null
  const parts = [...headParts, ...Array(missing).fill('0'), ...tailParts]
  let value = BigInt(0)
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
    value = (value << BigInt(16)) + BigInt(parseInt(part, 16))
  }
  return value
}

const inV4 = (ip: number, cidr: string): boolean => {
  const [base, bits] = cidr.split('/')
  const baseInt = v4ToInt(base)
  if (baseInt === null) return false
  const size = 2 ** (32 - Number(bits))
  return Math.floor(ip / size) === Math.floor(baseInt / size)
}

const inV6 = (ip: bigint, cidr: string): boolean => {
  const [base, bits] = cidr.split('/')
  const baseInt = v6ToBigInt(base)
  if (baseInt === null) return false
  const shift = BigInt(128 - Number(bits))
  return ip >> shift === baseInt >> shift
}

export const isValidIp = (ip: string): boolean =>
  ip.length <= 45 && (v4ToInt(ip) !== null || v6ToBigInt(ip.toLowerCase()) !== null)

export const isCloudflareIp = (ip: string): boolean => {
  const v4 = v4ToInt(ip)
  if (v4 !== null) return CLOUDFLARE_V4.some((cidr) => inV4(v4, cidr))
  const v6 = v6ToBigInt(ip.toLowerCase())
  if (v6 !== null) return CLOUDFLARE_V6.some((cidr) => inV6(v6, cidr))
  return false
}

type HeaderSource = { headers?: unknown } | Headers

export const readHeader = (source: HeaderSource | undefined | null, name: string): string => {
  if (!source) return ''
  const headers = (source instanceof Headers ? source : (source as { headers?: unknown }).headers) as
    | { get?: (key: string) => string | null; [key: string]: unknown }
    | undefined
  const value = typeof headers?.get === 'function' ? headers.get(name) : headers?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

export const getClientIp = (source: HeaderSource | undefined | null): string => {
  const connecting =
    readHeader(source, 'x-real-ip') ||
    readHeader(source, 'x-vercel-forwarded-for').split(',')[0].trim()
  const cf = readHeader(source, 'cf-connecting-ip')
  if (cf && connecting && isCloudflareIp(connecting) && isValidIp(cf)) return cf
  return connecting || 'unknown'
}

/** İstek sahibinin IP'si ve tarayıcı bilgisi; site sunucusunun ilettiği ziyaretçi bilgisi önceliklidir. */
export function requestClient(source: HeaderSource | undefined | null): { ip: string; ua: string; viaSite: boolean } {
  const headers = source instanceof Headers ? source : (source as { headers?: unknown } | null)?.headers
  if (headers && hasInternalKey(headers as Headers)) {
    const forwarded = readHeader(source, 'x-byt-client-ip')
    if (forwarded && isValidIp(forwarded)) {
      return { ip: forwarded, ua: readHeader(source, 'x-byt-client-ua').slice(0, 300), viaSite: true }
    }
  }
  return { ip: getClientIp(source), ua: readHeader(source, 'user-agent').slice(0, 300), viaSite: false }
}

/** Kısa cihaz özeti: "Mobil · Android · Chrome", "Masaüstü · Windows · Firefox", "Worker / sunucu". */
export function describeDevice(ua: string | null | undefined): string {
  const value = String(ua || '')
  if (!value) return 'bilinmiyor'
  if (/^undici|node-fetch|^node$/i.test(value) || /\bnode\b/i.test(value) && !/mozilla/i.test(value)) return 'Worker / sunucu'
  if (/bot|crawl|spider|curl|wget|python|httpclient|postman|insomnia|go-http/i.test(value)) {
    const tool = /(curl|wget|python[\w-]*|postman|insomnia|go-http-client|[\w-]*bot)/i.exec(value)?.[1]
    return `Otomatik araç${tool ? ` (${tool.slice(0, 30)})` : ''}`
  }
  const os = /iphone|ipad|ios/i.test(value) ? 'iOS'
    : /android/i.test(value) ? 'Android'
      : /windows/i.test(value) ? 'Windows'
        : /mac os x|macintosh/i.test(value) ? 'macOS'
          : /linux/i.test(value) ? 'Linux' : 'diğer'
  const browser = /edg\//i.test(value) ? 'Edge'
    : /opr\/|opera/i.test(value) ? 'Opera'
      : /samsungbrowser/i.test(value) ? 'Samsung'
        : /firefox|fxios/i.test(value) ? 'Firefox'
          : /chrome|crios/i.test(value) ? 'Chrome'
            : /safari/i.test(value) ? 'Safari' : 'tarayıcı'
  const kind = /mobi|iphone|android(?!.*tablet)/i.test(value) ? 'Mobil' : /ipad|tablet/i.test(value) ? 'Tablet' : 'Masaüstü'
  return `${kind} · ${os} · ${browser}`
}
