import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type EncryptedEnvelope = {
  v: 1
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  data: string
}

export const parseSessionKey = (value: string | undefined): Buffer | null => {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null
  const key = Buffer.from(value, 'base64')
  return key.length === 32 && key.toString('base64') === value ? key : null
}

export const isEncryptedEnvelope = (value: unknown): value is EncryptedEnvelope => {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<EncryptedEnvelope>
  return envelope.v === 1 && envelope.alg === 'aes-256-gcm' &&
    typeof envelope.iv === 'string' && typeof envelope.tag === 'string' &&
    typeof envelope.data === 'string'
}

export const encryptSession = (json: string, key: Buffer): EncryptedEnvelope => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }
}

export const decryptSession = (envelope: EncryptedEnvelope, key: Buffer): string => {
  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Geçersiz oturum zarfı.')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
