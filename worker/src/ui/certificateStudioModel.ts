import { normalizeLayout, type CertificateLayout, type CertificateType } from '../../shared/certificateLayout.js'
import type { CertificateSendRequest } from '../../server/certificates.js'

export type CertificateRecipient = { id: number; fullName: string; email: string; phone: string; certificateType: CertificateType; certificateId: string;
  hasEmail: boolean; hasPhone: boolean; hasToken: boolean; sentAt: string | null; team?: string; award?: string }
export type CertificateTemplate = { type: CertificateType; hasImage: boolean; layout: CertificateLayout; updatedAt: string | null }
export type SendState = { eventId: number | null; rows: CertificateRecipient[]; ids: number[]; templates: CertificateTemplate[];
  mailTemplateId?: number; whatsappTemplateId?: number; includeTest: boolean; repeatConfirmed: boolean;
  confirmStep: 'closed' | 'open'; sending: boolean }

export const canSelectRecipient = (row: CertificateRecipient) => row.hasEmail || row.hasPhone

export function selectRecipients(ids: number[], visible: CertificateRecipient[], checked: boolean): number[] {
  const eligible = new Set(visible.filter(canSelectRecipient).map(row => row.id))
  return checked ? [...new Set([...ids, ...eligible])] : ids.filter(id => !eligible.has(id))
}

export function sendBlockReason(state: SendState): string | null {
  if (state.sending) return 'Gönderim sürüyor.'
  if (!state.eventId) return 'Etkinlik seçin.'
  const unique = new Set(state.ids)
  const selected = state.rows.filter(row => unique.has(row.id))
  if (!unique.size || selected.length !== unique.size || selected.some(row => !canSelectRecipient(row))) return 'En az bir gönderilebilir alıcı seçin.'
  if (selected.length > 500) return 'Bir seferde en fazla 500 kişi seçin.'
  if (selected.some(row => !state.templates.some(template => template.type === row.certificateType && template.hasImage))) return 'Seçili kişinin sertifika türüne şablon yükleyin.'
  if (!state.mailTemplateId && !state.whatsappTemplateId) return 'En az bir kanal şablonu seçin.'
  if (selected.some(row => row.sentAt) && !state.repeatConfirmed) return 'Tekrar gönderim için ayrı onay verin.'
  return null
}

export function buildSendRequest(state: SendState): CertificateSendRequest | null {
  if (state.confirmStep !== 'open' || sendBlockReason(state) || !state.eventId) return null
  const ids = [...new Set(state.ids)]
  return { eventId: state.eventId, ids, confirmed: true, confirmCount: ids.length,
    ...(state.mailTemplateId ? { mailTemplateId: state.mailTemplateId } : {}),
    ...(state.whatsappTemplateId ? { whatsappTemplateId: state.whatsappTemplateId } : {}),
    ...(state.repeatConfirmed ? { repeatConfirmed: true } : {}),
    ...(state.includeTest ? { includeTest: true } : {}) }
}

export function moveCertificateBox(layout: CertificateLayout, field: 'name' | 'id' | 'award', deltaX: number, deltaY: number,
  width: number, height: number): CertificateLayout {
  if (!(width > 0 && height > 0) || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return normalizeLayout(layout)
  const box = layout[field]
  const next = normalizeLayout({ ...layout, [field]: { ...box, x: box.x + deltaX / width * 100, y: box.y + deltaY / height * 100 } })
  next[field].x = Math.min(next[field].x, 100 - next[field].w)
  next[field].y = Math.min(next[field].y, 100 - next[field].h)
  return next
}

/** Sağ alt tutamaçla kutu boyutu (yüzde); sahnenin dışına taşmaz, en az %2. */
export function resizeCertificateBox(layout: CertificateLayout, field: 'name' | 'id' | 'award', deltaX: number, deltaY: number,
  width: number, height: number): CertificateLayout {
  if (!(width > 0 && height > 0) || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return normalizeLayout(layout)
  const box = layout[field]
  const w = Math.min(100 - box.x, Math.max(2, box.w + deltaX / width * 100))
  const h = Math.min(100 - box.y, Math.max(2, box.h + deltaY / height * 100))
  // ABT gibi: kutu büyüyüp küçüldükçe yazı da aynı oranda ölçeklenir
  const scale = box.w > 0 && box.h > 0 ? Math.min(w / box.w, h / box.h) : 1
  return normalizeLayout({ ...layout, [field]: { ...box, w, h, fontSize: Math.round(box.fontSize * scale) } })
}

/** Sertifika gönderiminde dolan değişkenler; başka değişken içeren şablon her alıcıda hata verir. */
export const CERTIFICATE_VARIABLES = ['adSoyad', 'etkinlik', 'sertifikaNo', 'sertifikaLinki', 'takim', 'odul'] as const
export function unknownCertificateVariables(text: string): string[] {
  const keys = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim())
  return [...new Set(keys.filter(key => !(CERTIFICATE_VARIABLES as readonly string[]).includes(key)))]
}

export const toggleId = (selected: ReadonlySet<number>, id: number) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); return next }
export const selectIds = (selected: ReadonlySet<number>, ids: readonly number[]) => new Set([...selected, ...ids])
export const invertIds = (selected: ReadonlySet<number>, ids: readonly number[]) => { const next = new Set(selected); ids.forEach(id => { if (next.has(id)) next.delete(id); else next.add(id) }); return next }
