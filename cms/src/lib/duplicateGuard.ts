import { APIError, type CollectionBeforeValidateHook } from 'payload'

// Aynı kişinin tekrar başvurusunu engeller (spam ve başkasının numarasına mesaj yağdırma).
// Etkinlik kayıtlarında yalnız e-posta denetlenir: kayıtta otomatik WhatsApp yok, aynı telefonu paylaşanlar kayıt olabilmeli.
// Yalnız siteden gelen kayıtlarda (iç anahtar, req.user yok); panelden yönetici ekleyebilir.
// Kampüs/NAT arkasındaki farklı öğrenciler etkilenmez: denetim IP'ye değil kişiye göre.

// E-posta adresleri ASCII: toLocaleLowerCase('tr-TR') 'I'yı 'ı' yapar ve SALIH@… ile salih@… eşleşmez.
export const normalizeEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase()

/** Telefonu son 10 haneye indirger (+90 / 0 öneki ve boşluklar yok sayılır). */
export function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function isDuplicate(candidate: { email?: unknown; phone?: unknown }, existing: Array<{ email?: unknown; phone?: unknown }>,
  checkPhone = true): boolean {
  const email = normalizeEmail(candidate.email)
  const phone = checkPhone ? normalizePhone(candidate.phone) : ''
  return existing.some((row) =>
    (email !== '' && normalizeEmail(row.email) === email) || (phone.length === 10 && normalizePhone(row.phone) === phone))
}

const DAY_MS = 24 * 3600_000

export const rejectDuplicateSubmission = (options: { collection: 'event-registrations' | 'member-applications' | 'core-team-applications'; message: string; checkPhone?: boolean }):
  CollectionBeforeValidateHook => async ({ data, operation, req }) => {
    if (operation !== 'create' || !data || req.user) return data
    const where = options.collection === 'event-registrations'
      ? (data.event ? { event: { equals: typeof data.event === 'object' ? data.event.id : data.event } } : null)
      : { createdAt: { greater_than: new Date(Date.now() - DAY_MS).toISOString() } }
    if (!where) return data
    const { docs } = await req.payload.find({ collection: options.collection, where, limit: 5000, depth: 0,
      overrideAccess: true, req, select: { email: true, phone: true } as never })
    if (isDuplicate(data, docs as Array<{ email?: unknown; phone?: unknown }>, options.checkPhone ?? true)) throw new APIError(options.message, 409, undefined, true)
    return data
  }
