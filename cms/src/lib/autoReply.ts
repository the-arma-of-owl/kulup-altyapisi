import type { PayloadRequest } from 'payload'
import { sendObservedEmail } from './obs/mailLog'

// Form gönderilince başvurana giden otomatik "başvurunuz alındı" mailleri.
// Şablonlar Mail Şablonları koleksiyonunda bu amaçlarla tutulur; aktif şablon yoksa mail gitmez.
export const autoReplyPurposes = {
  member: 'member-application-received',
  event: 'event-registration-received',
  coreTeam: 'coreteam-application-received',
} as const
export type AutoReplyPurpose = typeof autoReplyPurposes[keyof typeof autoReplyPurposes]

const escapeHtml = (input: string): string => input.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

type EventLike = { id?: number; title?: string | null; date?: string | null; location?: string | null; locationLink?: string | null }

export function autoReplyValues(fullName: string, event?: EventLike | null): Record<string, string> {
  const date = event?.date ? new Date(event.date) : null
  const valid = date && !Number.isNaN(date.getTime()) ? date : null
  return {
    adSoyad: fullName, ad: fullName.trim().split(/\s+/)[0] || '',
    etkinlik: event?.title || '',
    tarih: valid ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(valid) : '',
    saat: valid ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(valid) : '',
    konum: event?.location || '', konumLinki: event?.locationLink || '',
  }
}

export function fillAutoReply(input: string, values: Record<string, string>, html: boolean): string {
  return input.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) =>
    key in values ? (html ? escapeHtml(values[key]) : values[key]) : match)
}

/** Hata fırlatmaz: form kaydı mail yüzünden asla başarısız olmamalı. */
export async function sendAutoReply(req: PayloadRequest, purpose: AutoReplyPurpose,
  doc: { email?: string | null; fullName?: string | null }, event?: EventLike | null): Promise<void> {
  try {
    if (req.context?.restore === true) return
    if (!doc.email) return
    if (!process.env.RESEND_API_KEY) {
      req.payload.logger.warn({ msg: 'Otomatik cevap atlandı: RESEND_API_KEY yok', purpose })
      return
    }
    const where = { and: [{ purpose: { equals: purpose } }, { isActive: { equals: true } }] }
    const { docs } = await req.payload.find({
      collection: 'email-templates', where, limit: 20, depth: 0, overrideAccess: true, req,
    })
    // Etkinliğe özel şablon varsa o, yoksa genel (etkinliksiz) şablon
    const eventId = event?.id
    const template = docs.find((t) => eventId && (t.relatedEvent === eventId || (t.relatedEvent as { id?: number } | null)?.id === eventId))
      ?? docs.find((t) => !t.relatedEvent)
    if (!template) return
    const values = autoReplyValues(doc.fullName || '', event)
    await sendObservedEmail(req.payload, {
      to: doc.email,
      subject: fillAutoReply(template.subject, values, false),
      html: fillAutoReply(template.html, values, true),
    }, { purpose: 'auto-reply', recipientName: doc.fullName || undefined, eventTitle: event?.title || undefined })
  } catch (error) {
    req.payload.logger.error({ msg: 'Otomatik cevap maili gönderilemedi', purpose, err: error instanceof Error ? error.message : String(error) })
  }
}
