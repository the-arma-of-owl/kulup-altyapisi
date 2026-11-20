import { randomBytes } from 'node:crypto'

/** Girdi doğrulama yardımcıları (takım modu). Hepsi saf; hata durumunda null döner. */

export const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  // Kontrol karakterleri (satır sonu hariç) atılır; uzunluk sınırı aşılırsa reddedilir.
  const text = value.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim()
  return text.length <= max ? text : null
}

export const cleanName = (value: unknown, min = 2, max = 60): string | null => {
  const text = cleanText(value, max)?.replace(/\s+/g, ' ')
  return text && text.length >= min ? text : null
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/
export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null
}

/** Parola: 8-128 karakter, en az bir harf ve bir rakam. */
export const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 128 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value) && /\d/.test(value)

/** Yalnız http/https, kullanıcı adı/parola içermeyen, en fazla 300 karakter URL. Boş → ''. */
export function cleanUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 300) return null
  let url: URL
  try { url = new URL(value.trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || !url.hostname.includes('.')) return null
  return url.toString()
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const randomInviteCode = (): string => {
  // Karışan karakterler yok (0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' }
export const teamSlug = (name: string): string => {
  const base = name.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR[c]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${base || 'takim'}-${randomBytes(3).toString('hex')}`
}

export const isPositiveId = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isInteger(value) && value > 0) || (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value))
