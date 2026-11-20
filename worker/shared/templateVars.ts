import type { Registration, WorkerEvent } from './types.js'
import { CONFIG } from '../server/config.js'

export const templateKeys = ['adSoyad', 'ad', 'etkinlik', 'tarih', 'saat', 'konum', 'konumLinki', 'biletLinki', 'masa'] as const
type Context = { registration: Registration; event: WorkerEvent }

export function gateFieldValues(gateFields: unknown): Record<string, string> {
  const values: Record<string, string> = Object.create(null)
  if (gateFields === null || typeof gateFields !== 'object' || Array.isArray(gateFields)) return values
  const prototype = Object.getPrototypeOf(gateFields)
  if (prototype !== Object.prototype && prototype !== null) return values

  let count = 0
  for (const [key, value] of Object.entries(gateFields)) {
    if (count >= 20) break
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) continue
    values[key] = String(value).trim().slice(0, 200)
    count++
  }
  return values
}

/**
 * Kişi adı mesaja girerken: link ve WhatsApp biçim karakterleri ayıklanır (ada yazılan sahte bilet linki
 * QR'ı bozmasın ya da gerçek link gibi görünmesin).
 */
export const plainName = (input: unknown): string =>
  String(input ?? '').replace(/(?:https?:\/\/|www\.)\S*/gi, '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)

const escapeHtml = (input: string): string => input.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export function templateValues({ registration, event }: Context): Record<string, string> {
  const date = event.date ? new Date(event.date) : null
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null
  const gateFields = gateFieldValues(registration.gateFields)
  return {
    ...gateFields,
    adSoyad: plainName(registration.fullName), ad: plainName(registration.fullName).split(' ')[0] || '',
    etkinlik: event.title || '',
    tarih: validDate ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(validDate) : '',
    saat: validDate ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(validDate) : '',
    konum: event.location || '', konumLinki: event.locationLink || '',
    biletLinki: registration.ticketToken ? CONFIG.ticketUrl(registration.ticketToken) : '',
    masa: gateFields.masa || '',
  }
}

export function fillTemplate(input: string, context: Context, html = false): { text: string; warnings: string[] } {
  return fillValues(input, templateValues(context), html)
}

export function fillValues(input: string, values: Record<string, string>, html = false): { text: string; warnings: string[] } {
  const warnings: string[] = []
  const text = input.replace(/\{\{([^{}]+)\}\}/g, (match, raw: string) => {
    const key = raw.trim()
    if (!Object.hasOwn(values, key)) { warnings.push(`Bilinmeyen değişken: ${key}`); return match }
    if (!values[key]) warnings.push(`Boş değişken: ${key}`)
    return html ? escapeHtml(values[key]) : values[key]
  })
  if (/\{\{[^}]*<[^>]*>[^}]*\}\}/.test(input) || /\{\{[^}]*<[^>]*>/.test(input)) {
    warnings.push('HTML etiketleri bir değişkeni bölmüş olabilir; şablonu kontrol edin.')
  }
  return { text, warnings }
}
