import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Katılımcı oturumu (BFF): CMS'in verdiği Payload JWT'si tarayıcıya hiç verilmez; SİTE alan adında
 * HttpOnly + Secure + SameSite=Lax çerezde AES-256-GCM ile şifreli/imzalı durur. Site API rotaları çerezi
 * çözüp CMS'e sunucudan "Authorization: JWT" ile gider. Anahtar: PARTICIPANT_SESSION_SECRET (en az 32 karakter).
 */

export const SESSION_MAX_AGE = 3 * 24 * 3600 // CMS participants tokenExpiration ile aynı

export const sessionCookieName = (nodeEnv = process.env.NODE_ENV): string =>
  nodeEnv === 'production' ? '__Host-byt_katilimci' : 'byt_katilimci'

export const sessionCookieOptions = (nodeEnv = process.env.NODE_ENV, maxAge = SESSION_MAX_AGE) => ({
  httpOnly: true,
  secure: nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})

/**
 * Çıkış: çerezi silmek için aynı ad + aynı öznitelikler (canlıda __Host- öneki Secure ve Path=/ ister) ve Max-Age=0.
 * Expires de geçmişe çekilir (eski tarayıcılar için).
 */
export const clearedSessionCookieOptions = (nodeEnv = process.env.NODE_ENV) => ({
  ...sessionCookieOptions(nodeEnv, 0),
  expires: new Date(0),
})

export type SessionData = { token: string; exp: number; uid: string }

function key(secret: string | undefined): Buffer {
  if (!secret || secret.length < 32) throw new Error('PARTICIPANT_SESSION_SECRET en az 32 karakter olmalı')
  return createHash('sha256').update(`byt-participant-session:${secret}`).digest()
}

export function sealSession(data: SessionData, secret = process.env.PARTICIPANT_SESSION_SECRET): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

/** Bozuk, kurcalanmış, süresi dolmuş ya da anahtarsız çerez → null (hata fırlatmaz). */
export function openSession(value: string | undefined | null, secret = process.env.PARTICIPANT_SESSION_SECRET, now = Date.now()): SessionData | null {
  if (!value || value.length > 4096) return null
  const [version, iv, tag, body] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !body) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const json = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
    const data = JSON.parse(json) as Partial<SessionData>
    if (typeof data.token !== 'string' || typeof data.exp !== 'number' || typeof data.uid !== 'string') return null
    if (data.exp * 1000 <= now) return null
    return { token: data.token, exp: data.exp, uid: data.uid }
  } catch {
    return null
  }
}
