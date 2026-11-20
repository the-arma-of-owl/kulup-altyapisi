import type { PayloadRequest } from 'payload'
import { clientLine } from './security'
import { esc, maskPhone } from './privacy'

/** Kayıt/başvuru bildirimlerine eklenen IP satırı (form kancası req.context'e yazar). */
export function formClientLine(req: PayloadRequest | undefined): string {
  const client = (req?.context as { obsClient?: { ip?: string; ua?: string } } | undefined)?.obsClient
  return client ? `\n${clientLine(client.ip, client.ua)}` : ''
}

/** "📊 Bu etkinlik için 37. başvuru" — afterChange içinde aynı işlem (transaction) üzerinden sayılır. */
export async function eventRegistrationOrdinalLine(req: PayloadRequest, eventId: unknown): Promise<string> {
  if (eventId === undefined || eventId === null || eventId === '') return ''
  try {
    const { totalDocs } = await req.payload.count({
      collection: 'event-registrations', where: { event: { equals: eventId as number } }, overrideAccess: true, req,
    })
    return `\n📊 <b>Bu etkinlik için ${totalDocs}. başvuru</b>`
  } catch (error) {
    console.error('[obs] etkinlik kayıt sayısı alınamadı:', (error as Error)?.message)
    return ''
  }
}

/** "📊 Genel sıra: #152" — üye / core team başvurularında toplam başvuru sayısı. */
export async function applicationOrdinalLine(req: PayloadRequest, collection: 'member-applications' | 'core-team-applications'): Promise<string> {
  try {
    const { totalDocs } = await req.payload.count({ collection, overrideAccess: true, req })
    return `\n📊 <b>Genel sıra: #${totalDocs}</b> (toplam ${totalDocs} başvuru)`
  } catch (error) {
    console.error('[obs] başvuru sayısı alınamadı:', (error as Error)?.message)
    return ''
  }
}

const WA_SOURCE: Record<string, string> = {
  gate: 'Kapı bileti', decision: 'Başvuru kararı', bulk: 'Toplu / sertifika', system: 'Sistem',
}

export function waSourceLabel(source: unknown): string {
  return WA_SOURCE[String(source)] ?? String(source ?? '-')
}

export function waRecipient(name: string | null, to: unknown): string {
  return `${esc(name || 'İsimsiz')} (${esc(maskPhone(to))})`
}

/** WhatsApp hata metnini (worker'dan gelen) anlaşılır nedene çevirir. */
export function describeWaError(error: unknown): string {
  const text = String(error ?? '').trim()
  if (!text) return 'neden bildirilmedi'
  if (/kayıtlı değil|not registered/i.test(text)) return `Numara WhatsApp'ta kayıtlı değil (${text})`
  if (/geçersiz/i.test(text)) return `Telefon numarası geçersiz (${text})`
  if (/bağlı değil|disconnected/i.test(text)) return `WhatsApp bağlantısı yoktu (${text})`
  if (/24 saat/i.test(text)) return text
  if (/izin listesi|allowlist/i.test(text)) return `Test kilidi: numara izin listesinde değil (${text})`
  if (/medya|media|fetch/i.test(text)) return `Ek (görsel) indirilemedi (${text})`
  return text
}
