import type { Endpoint } from 'payload'
import { hasVerifiedTotp } from './requireTotp'
import { MailError, type MailAttachment } from './resend'
import { MAIL_PURPOSES, sendObservedEmail, type MailContext, type MailPurpose } from './obs/mailLog'
import { LIMITS, PANIC_MESSAGE, allow, getPanic } from './obs/security'
import { hashKey } from './obs/privacy'

const MAX_BODY = 4 * 1024 * 1024

const reply = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status })

export const sendWorkerEmail: Endpoint = {
  path: '/worker/send-email',
  method: 'post',
  handler: async (req) => {
    const user = req.user as (typeof req.user & { hasTotp?: boolean; _strategy?: string }) | null
    if (!user) return reply(401, 'Oturum açmanız gerekiyor')
    if (!hasVerifiedTotp(user) || !(user as { roles?: string[] | null }).roles?.includes('admin')) {
      return reply(403, 'İki adımlı doğrulaması tamamlanmış yönetici gerekiyor')
    }

    const length = Number(req.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_BODY) return reply(413, 'İstek 4 MB sınırını aşıyor')
    let body: unknown
    try {
      const raw = await req.text()
      if (Buffer.byteLength(raw) > MAX_BODY) return reply(413, 'İstek 4 MB sınırını aşıyor')
      body = JSON.parse(raw)
    } catch {
      return reply(400, 'Geçersiz JSON')
    }
    if (!body || typeof body !== 'object') return reply(400, 'Geçersiz istek')
    const data = body as Record<string, unknown>
    if (typeof data.to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to) ||
        typeof data.subject !== 'string' || !data.subject.trim() ||
        typeof data.html !== 'string' || !data.html.trim()) {
      return reply(400, 'Alıcı, konu veya HTML geçersiz')
    }
    const attachments = data.attachments
    if (attachments !== undefined && (!Array.isArray(attachments) ||
      attachments.some((item) => !item || typeof item.filename !== 'string' ||
        typeof item.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.contentBase64) ||
        typeof item.contentType !== 'string'))) {
      return reply(400, 'Ek dosya geçersiz')
    }

    if ((await getPanic(req.payload)).active) return reply(423, PANIC_MESSAGE)
    if (!process.env.RESEND_API_KEY) return reply(503, 'Mail servisi yapılandırılmamış')

    // Kullanıcı başına dakikalık sınır; paylaşılan depoda (sunucusuz örnekler arasında ortak).
    const { allowed } = await allow(req.payload, LIMITS.workerMailPerUser.bucket, hashKey(String(user.id), 'user'),
      LIMITS.workerMailPerUser.max, LIMITS.workerMailPerUser.windowSec)
    if (!allowed) return reply(429, 'Dakikalık mail sınırına ulaşıldı')

    try {
      const { id } = await sendObservedEmail(req.payload, {
        to: data.to, subject: data.subject, html: data.html,
        attachments: attachments as MailAttachment[] | undefined,
      }, { ...parseMailMeta(data.meta), actor: typeof user.email === 'string' ? user.email : undefined })
      return Response.json({ ok: true, id })
    } catch (error) {
      if (error instanceof MailError) {
        req.payload.logger.error({ msg: 'Worker maili gönderilemedi', err: error.message })
        const quota = error.provider?.status === 429
        return reply(error.status, error.status === 403 ? 'Staging: alıcı izin listesinde değil'
          : error.status === 503 ? 'Mail servisi yapılandırılmamış'
            : quota ? `Mail servisi gönderimi reddetti: Resend kota/hız sınırı (${error.provider?.code || '429'})`
              : 'Mail servisi gönderimi reddetti')
      }
      return reply(502, 'Mail servisine ulaşılamıyor')
    }
  },
}

/** Worker'ın isteğe bağlı bağlam bilgisi (kimin için, hangi amaçla, toplu gönderimde kaçıncı). Geçersizse yok sayılır. */
export function parseMailMeta(value: unknown): MailContext {
  const meta = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const text = (input: unknown, max: number) => typeof input === 'string' && input.trim() ? input.trim().slice(0, max) : undefined
  const purpose: MailPurpose = (MAIL_PURPOSES as readonly string[]).includes(String(meta.purpose)) ? meta.purpose as MailPurpose : 'other'
  const index = Number(meta.batchIndex), total = Number(meta.batchTotal)
  const batch = Number.isSafeInteger(index) && Number.isSafeInteger(total) && index >= 1 && total >= index && total <= 100_000
    ? { index, total, label: text(meta.batchLabel, 120) } : undefined
  return { purpose, recipientName: text(meta.recipientName, 120), eventTitle: text(meta.eventTitle, 160), batch,
    silentSuccess: purpose === 'certificate' }
}
