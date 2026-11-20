import QRCode from 'qrcode'
import { CONFIG } from './config.js'

export function isTicketToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value)
}

export function ticketTokenFromMessage(message: unknown, siteUrl = CONFIG.siteUrl): string | null {
  if (typeof message !== 'string') return null
  const origin = siteUrl.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const links = new RegExp(`(^|[^A-Za-z0-9.])${origin}/ticket/([A-Za-z0-9_-]+)(?![A-Za-z0-9_-])`, 'g')
  const tokens = new Set<string>()
  for (const match of message.matchAll(links)) {
    const token = match[2]
    if (!isTicketToken(token)) return null
    tokens.add(token)
    if (tokens.size > 1) return null
  }
  return tokens.values().next().value ?? null
}

export function ticketQrText(token: string): string {
  if (!isTicketToken(token)) throw new Error('Bilet kodu geçersiz.')
  return CONFIG.ticketUrl(token)
}

export async function ticketQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(ticketQrText(token), {
    type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M',
  })
}

export async function ticketQrMedia(token: string): Promise<{ mimetype: 'image/png'; data: string; filename: 'bilet-qr.png' }> {
  const png = await ticketQrPng(token)
  return { mimetype: 'image/png', data: png.toString('base64'), filename: 'bilet-qr.png' }
}

/** Mail gövdesinde tek bir bilet linki varsa QR görseli eki (yoksa ek yok). */
export async function ticketQrMail(html: string): Promise<Array<{ filename: string; contentBase64: string; contentType: string }> | undefined> {
  const token = ticketTokenFromMessage(html.replace(/&amp;/g, '&'))
  if (!token) return undefined
  try {
    const png = await ticketQrPng(token)
    return [{ filename: 'bilet-qr.png', contentBase64: png.toString('base64'), contentType: 'image/png' }]
  } catch { return undefined }
}
