import type { Recipient, Registration, WorkerEvent } from '../../shared/types.js'
import { templateValues } from '../../shared/templateVars.js'

export type JsonRow = Record<string, unknown>
export type MessageRecipient = { recipient: Recipient; registration?: Registration }
const keyPattern = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const plain = (value: unknown): value is string | number | boolean => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))

/** Telefonu WhatsApp kuyruğunun beklediği 90XXXXXXXXXX biçimine getirir; geçersizse boş. */
export function recipientPhone(value?: string): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return /^90\d{10}$/.test(digits) ? digits : /^0?5\d{9}$/.test(digits) ? `90${digits.slice(-10)}` : ''
}

/** JSON metni: dizi ya da { "kayitlar": [...] }; her kayıt nesne ve id içermeli (ABT ile aynı kural). */
export function jsonRowsFrom(text: string): JsonRow[] {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('JSON okunamadı; biçimi kontrol edin.') }
  const rows = Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { kayitlar?: unknown }).kayitlar) ? (parsed as { kayitlar: unknown[] }).kayitlar : null
  if (!rows) throw new Error('JSON bir dizi veya { "kayitlar": [...] } biçiminde olmalıdır.')
  if (rows.length > 2000) throw new Error('JSON’da en fazla 2000 kayıt olabilir.')
  if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) throw new Error('JSON listesindeki her kayıt bir nesne olmalıdır.')
  if ((rows as JsonRow[]).some((row) => row.id === undefined || row.id === null || row.id === '')) throw new Error('Her JSON kaydında eşleştirme için "id" alanı bulunmalıdır.')
  return rows as JsonRow[]
}

/** Düz alanlar olduğu gibi, bir alt düzey nesne "ust_alt" adıyla değişken olur. */
export function jsonVariables(row: JsonRow): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (plain(value) && keyPattern.test(key)) values[key] = String(value).slice(0, 500)
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as JsonRow)) {
        const name = `${key}_${inner}`
        if (plain(innerValue) && keyPattern.test(name)) values[name] = String(innerValue).slice(0, 500)
      }
    }
  }
  return values
}

/** Etkinlik katılımcıları + JSON: eşleşen kayda JSON alanları eklenir, eşleşmeyen ve telefonu olan kayıt harici alıcıdır. */
export function messageRecipients(event: WorkerEvent, registrations: Registration[], rows: JsonRow[], includeTest: boolean): MessageRecipient[] {
  const rowsById = new Map(rows.map((row) => [String(row.id), row]))
  const matched = new Set<string>()
  const people = registrations.filter((registration) => includeTest || !registration.isTest).map((registration): MessageRecipient => {
    const row = rowsById.get(String(registration.id))
    if (row) matched.add(String(registration.id))
    const extra = row ? jsonVariables(row) : {}
    const name = extra.tamAd || extra.adSoyad || registration.fullName
    return { registration, recipient: { id: `event-registrations:${registration.id}`, name, email: registration.email, phone: extra.telefon || extra.phone || registration.phone,
      isTest: Boolean(registration.isTest), relatedEvent: event.id, variables: { ...templateValues({ registration: { ...registration, fullName: name }, event }), ...extra } } }
  })
  const external = rows.flatMap((row, index): MessageRecipient[] => {
    const id = String(row.id)
    if (matched.has(id)) return []
    const extra = jsonVariables(row)
    const phone = extra.telefon || extra.phone || extra.to || ''
    if (!phone) return []
    const name = extra.tamAd || extra.adSoyad || extra.ad || `JSON kaydı ${id}`
    const fake = { id: 0, event: event.id, fullName: name, email: extra.eposta || extra.email, phone, status: 'accepted' } as Registration
    return [{ recipient: { id: `json:${id.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60) || 'kayit'}-${index}`, name, email: fake.email, phone, isTest: false,
      variables: { ...templateValues({ registration: fake, event }), ...extra } } }]
  })
  return [...people, ...external]
}
