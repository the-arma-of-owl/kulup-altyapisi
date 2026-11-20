import type { FreeSendRequest, FreeSendSource, Recipient, SendHistoryRun } from '../../shared/types.js'
import { fillValues } from '../../shared/templateVars.js'

type Channels = FreeSendRequest['channels']
type Content = { subject: string; html: string; message: string }
export type SendState = Content & {
  recipients: Recipient[]; selectedIds: string[]; channels: Channels; label: string; allowTest: boolean;
  target: { source: FreeSendSource } | { file: { text: string; format: 'json' | 'csv' } } | { list: true }
}

export function channelCounts(recipients: Recipient[], channels: Channels) {
  return { total: recipients.length,
    mail: channels.mail ? recipients.filter((item) => Boolean(item.email)).length : 0,
    whatsapp: channels.whatsapp ? recipients.filter((item) => Boolean(item.phone)).length : 0 }
}
export function availableVariables(recipients: Recipient[]): string[] {
  return [...new Set(['ad', 'adSoyad', ...recipients.flatMap((item) => Object.keys(item.variables || {}))])].sort((a, b) => a.localeCompare(b, 'tr'))
}
export function previewFor(recipient: Recipient, subject: string, html: string, message: string) {
  const values: Record<string, string> = Object.create(null)
  for (const [key, value] of Object.entries(recipient.variables || {})) values[key] = String(value ?? '')
  values.adSoyad = recipient.name
  values.ad = recipient.name.trim().split(/\s+/)[0] || ''
  const renderedSubject = fillValues(subject, values)
  const renderedHtml = fillValues(html, values, true)
  const renderedMessage = fillValues(message, values)
  const warnings = [...renderedSubject.warnings, ...renderedHtml.warnings, ...renderedMessage.warnings]
  return { subject: renderedSubject.text, html: renderedHtml.text, message: renderedMessage.text,
    warnings, hasUnknown: warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')) }
}
export function buildSendBody(state: SendState): FreeSendRequest | { error: string } {
  if (!state.channels.mail && !state.channels.whatsapp) return { error: 'En az bir kanal seçin.' }
  if (!state.label.trim()) return { error: 'Etiket gerekli.' }
  if (state.channels.mail && (!state.subject.trim() || !state.html.trim())) return { error: 'Mail konusu ve HTML gerekli.' }
  if (state.channels.whatsapp && !state.message.trim()) return { error: 'WhatsApp metni gerekli.' }
  const selected = state.recipients.filter((item) => state.selectedIds.includes(item.id))
  const rows = 'file' in state.target ? selected.map((item) => /^file:([1-9]\d*)$/.exec(item.id)?.[1]).map(Number) : []
  if ('file' in state.target && (rows.some((row) => !Number.isSafeInteger(row)) || new Set(rows).size !== rows.length)) {
    return { error: 'Seçilen dosya satırları geçersiz.' }
  }
  const count = selected.length
  if (!Number.isInteger(count) || count < 1 || count > 2000) return { error: 'Gönderilecek alıcı sayısı gerekli (1–2000).' }
  const target: FreeSendRequest['target'] = 'list' in state.target ? { list: selected.map(plainRecipient) }
    : 'source' in state.target ? { source: state.target.source, ids: selected.map((item) => item.id) }
    : { file: state.target.file, rows }
  return { confirmed: true, confirmCount: count, allowTest: state.allowTest, label: state.label.trim(),
    channels: state.channels, ...(state.channels.mail ? { mail: { subject: state.subject, html: state.html } } : {}),
    ...(state.channels.whatsapp ? { whatsapp: { message: state.message } } : {}), target }
}
export function failedCount(run: SendHistoryRun): number {
  return run.recipients.filter((item) => item.status === 'failed').length
}
export function retryBody(run: SendHistoryRun, label: string | undefined, channels: Channels, content: Content): FreeSendRequest | { error: string } {
  const count = failedCount(run)
  if (!count) return { error: 'Başarısız alıcı yok.' }
  if (!channels.mail && !channels.whatsapp) return { error: 'En az bir kanal seçin.' }
  if (channels.mail && (!content.subject.trim() || !content.html.trim())) return { error: 'Mail konusu ve HTML gerekli.' }
  if (channels.whatsapp && !content.message.trim()) return { error: 'WhatsApp metni gerekli.' }
  return { confirmed: true, confirmCount: count, label: (label || run.label).trim(), channels,
    ...(channels.mail ? { mail: { subject: content.subject, html: content.html } } : {}),
    ...(channels.whatsapp ? { whatsapp: { message: content.message } } : {}), target: { retryRunId: run.id } }
}

/** Geçmişten gelen satırdaki önceki gönderim durumlarını atar; sunucuya yalnız alıcı bilgisi gider. */
export function plainRecipient(item: Recipient): Recipient {
  return { id: item.id, name: item.name, email: item.email, phone: item.phone, isTest: item.isTest, variables: item.variables || {},
    ...(item.relatedEvent ? { relatedEvent: item.relatedEvent } : {}) }
}
/** ABT gibi listeye ekleme: aynı kimlikli kişi ikinci kez eklenmez. */
export function mergeRecipients(current: Recipient[], incoming: Recipient[]): { list: Recipient[]; added: Recipient[] } {
  const ids = new Set(current.map((item) => item.id))
  const added = incoming.filter((item) => !ids.has(item.id) && (ids.add(item.id), true))
  return { list: [...current, ...added], added }
}
/** Elle eklenen kişi: hedef @ içeriyorsa e-posta, değilse telefon. */
export function manualRecipient(name: string, target: string, id: string): Recipient | { error: string } {
  const cleanName = name.trim(), cleanTarget = target.trim()
  if (!cleanName) return { error: 'Ad soyad gerekli.' }
  if (cleanTarget.includes('@')) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanTarget)) return { error: 'E-posta geçersiz.' }
    return { id, name: cleanName, email: cleanTarget.toLowerCase(), isTest: false, variables: {} }
  }
  const digits = cleanTarget.replace(/\D/g, '')
  const phone = /^90\d{10}$/.test(digits) ? digits : /^0?5\d{9}$/.test(digits) ? `90${digits.slice(-10)}` : ''
  if (!phone) return { error: 'Telefon geçersiz (ör. 0532 000 00 00).' }
  return { id, name: cleanName, phone, isTest: false, variables: {} }
}
/** "Önceki liste": geçmiş gönderimin alıcıları aynen ya da yalnız başarısızlar. */
export function historyRecipients(run: SendHistoryRun, failedOnly: boolean): Recipient[] {
  return run.recipients.filter((item) => !failedOnly || item.status === 'failed').map(plainRecipient)
}
