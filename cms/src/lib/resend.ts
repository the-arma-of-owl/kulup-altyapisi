import { KULUP } from './kulup'

// Resend üzerinden mail gönderimi — anahtar yalnızca CMS ortamında (RESEND_API_KEY) durur.
export const DEFAULT_FROM = `${KULUP.eposta.gonderenAd} <${KULUP.eposta.gonderen}>`

export type MailAttachment = { filename: string; contentBase64: string; contentType: string }

/** Resend yanıt başlıklarından okunan kota/hız bilgisi (başlık yoksa alan boş kalır). */
export type ResendQuota = { dailyUsed?: number; monthlyUsed?: number; rateLimit?: number; rateRemaining?: number }

export class MailError extends Error {
  constructor(message: string, public readonly status: number, public readonly provider?: {
    status?: number; code?: string; message?: string; quota?: ResendQuota; network?: boolean
  }) { super(message) }
}

function readQuota(headers: Headers | undefined): ResendQuota | undefined {
  if (!headers || typeof headers.get !== 'function') return undefined
  const number = (name: string) => {
    const value = Number(headers.get(name))
    return headers.get(name) !== null && Number.isFinite(value) ? value : undefined
  }
  const quota: ResendQuota = {
    dailyUsed: number('x-resend-daily-quota'), monthlyUsed: number('x-resend-monthly-quota'),
    rateLimit: number('ratelimit-limit'), rateRemaining: number('ratelimit-remaining'),
  }
  return Object.values(quota).some((value) => value !== undefined) ? quota : undefined
}

export function stagingMailGuard(
  to: string, subject: string,
  env: { BYT_STAGING?: string; STAGING_MAIL_ALLOWLIST?: string } = {
    BYT_STAGING: process.env.BYT_STAGING,
    STAGING_MAIL_ALLOWLIST: process.env.STAGING_MAIL_ALLOWLIST,
  },
): { allowed: boolean; subject: string } {
  if (env.BYT_STAGING !== '1') return { allowed: true, subject }
  const allowed = (env.STAGING_MAIL_ALLOWLIST ?? '').split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
    .includes(to.trim().toLowerCase())
  return { allowed, subject: subject.startsWith('[STAGING] ') ? subject : `[STAGING] ${subject}` }
}

function maskedAddress(address: string): string {
  const [local, domain] = address.trim().split('@')
  return local && domain ? `${local[0]}***@${domain}` : '***'
}

export async function sendResendEmail(input: {
  to: string; subject: string; html: string; attachments?: MailAttachment[]
}): Promise<{ id: string | null; quota?: ResendQuota }> {
  const guard = stagingMailGuard(input.to, input.subject)
  if (!guard.allowed) {
    console.warn('staging: izin listesi dışı mail gönderilmedi', maskedAddress(input.to))
    throw new MailError('Staging: alıcı izin listesinde değil', 403, { code: 'staging_blocked' })
  }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new MailError('Mail servisi yapılandırılmamış', 503, { code: 'missing_api_key' })
  const url = process.env.NODE_ENV === 'production'
    ? 'https://api.resend.com/emails'
    : process.env.RESEND_API_URL || 'https://api.resend.com/emails'
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || DEFAULT_FROM,
        to: [input.to], subject: guard.subject, html: input.html,
        ...(input.attachments ? { attachments: input.attachments.map((item) => ({
          filename: item.filename, content: item.contentBase64, content_type: item.contentType,
        })) } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new MailError('Mail servisine ulaşılamıyor', 502, { network: true, code: timeout ? 'timeout' : 'network',
      message: error instanceof Error ? error.message.slice(0, 200) : undefined })
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let parsed: { name?: unknown; message?: unknown } = {}
    try { parsed = JSON.parse(detail) } catch { /* Resend gövdesi JSON değilse ham metin kalır */ }
    throw new MailError(`Mail servisi gönderimi reddetti (${response.status}) ${detail.slice(0, 200)}`, 502, {
      status: response.status,
      code: typeof parsed.name === 'string' ? parsed.name.slice(0, 60) : undefined,
      message: typeof parsed.message === 'string' ? parsed.message.slice(0, 200) : detail.slice(0, 200),
      quota: readQuota(response.headers),
    })
  }
  const result = await response.json().catch(() => ({})) as { id?: string }
  const quota = readQuota(response.headers)
  return quota ? { id: result.id ?? null, quota } : { id: result.id ?? null }
}
