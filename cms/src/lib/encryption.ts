import crypto from 'node:crypto'

// API anahtarlarını DB'de şifreli tutmak için (ABT lib/encryption mantığı).
// Biçim: `enc:v1:<iv_hex>:<tag_hex>:<şifreli_hex>` (AES-256-GCM).
// Anahtar ENCRYPTION_KEY, yoksa PAYLOAD_SECRET'tan türetilir. Önek olmayan değerler düz metin
// kabul edilir ve olduğu gibi döner: geçişte DB'deki eski düz anahtarlar çalışmaya devam eder,
// panelden bir kez kaydedilince şifrelenir.

const PREFIX = 'enc:v1:'

function key(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY || process.env.PAYLOAD_SECRET
  if (!secret) return null
  return crypto.createHash('sha256').update(`byt-api-key:${secret}`).digest()
}

export const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX)

export function encryptSecret(value: unknown): unknown {
  if (typeof value !== 'string' || !value || isEncrypted(value)) return value
  const k = key()
  if (!k) return value // Sır yoksa (yalnız yerel geliştirme) düz kalır
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(value: unknown, logger?: { error: (msg: unknown) => void }): unknown {
  if (!isEncrypted(value)) return value
  const k = key()
  const [ivHex, tagHex, dataHex] = value.slice(PREFIX.length).split(':')
  try {
    if (!k || !ivHex || !tagHex || dataHex === undefined) throw new Error('anahtar veya biçim eksik')
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    // Değerin kendisi loglanmaz.
    ;(logger ?? console).error('[encryption] Şifreli API anahtarı çözülemedi (PAYLOAD_SECRET/ENCRYPTION_KEY değişmiş olabilir).')
    return ''
  }
}

/** Payload text alanına eklenecek şifreleme kancaları. */
export const encryptedFieldHooks = {
  beforeChange: [({ value }: { value?: unknown }) => encryptSecret(value)],
  afterRead: [({ value, req }: { value?: unknown; req?: { payload?: { logger?: { error: (msg: unknown) => void } } } }) =>
    decryptSecret(value, req?.payload?.logger)],
}
