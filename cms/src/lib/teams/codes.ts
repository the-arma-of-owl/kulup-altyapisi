import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * 6 haneli e-posta kodları (kayıt doğrulama, parola sıfırlama).
 * Veritabanında yalnız HMAC-SHA256 özeti (gizli anahtar + amaç + e-posta + kod) tutulur; kod günlüğe yazılmaz.
 * Süre 15 dk, en fazla 5 hatalı deneme; sonra yeni kod istenmeli.
 */
export const CODE_TTL_MS = 15 * 60 * 1000
export const CODE_MAX_ATTEMPTS = 5

export type CodePurpose = 'verify' | 'reset'
export type StoredCode = { hash?: string | null; expires?: string | Date | null; attempts?: number | null }

function secret(): string {
  const value = process.env.PARTICIPANT_CODE_SECRET || process.env.PAYLOAD_SECRET
  if (!value) throw new Error('PAYLOAD_SECRET tanımlı değil')
  return value
}

export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashCode = (purpose: CodePurpose, email: string, code: string): string =>
  createHmac('sha256', secret()).update(`participant-code:${purpose}:${email.toLowerCase()}:${code}`).digest('hex')

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'too_many' | 'wrong'; attempts: number }

/** Kodu denetler. Hatalı denemede yeni deneme sayısını döner (çağıran kaydeder). */
export function checkCode(stored: StoredCode, purpose: CodePurpose, email: string, code: unknown, now = Date.now()): CodeCheck {
  const attempts = Number(stored.attempts) || 0
  if (!stored.hash || !stored.expires) return { ok: false, reason: 'missing', attempts }
  if (new Date(stored.expires).getTime() < now) return { ok: false, reason: 'expired', attempts }
  if (attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: 'too_many', attempts }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return { ok: false, reason: 'wrong', attempts: attempts + 1 }
  const expected = Buffer.from(stored.hash, 'hex')
  const actual = Buffer.from(hashCode(purpose, email, code), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'wrong', attempts: attempts + 1 }
  return { ok: true }
}

export const CODE_MESSAGES: Record<Exclude<CodeCheck, { ok: true }>['reason'], string> = {
  missing: 'Geçerli bir kod yok. Yeni kod isteyin.',
  expired: 'Kodun süresi doldu. Yeni kod isteyin.',
  too_many: 'Çok fazla hatalı deneme. Yeni kod isteyin.',
  wrong: 'Kod hatalı.',
}
