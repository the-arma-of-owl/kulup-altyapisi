import type { CollectionConfig, Endpoint } from 'payload'
import { randomInt } from 'node:crypto'
import { hasInternalKey, isAdmin } from '../lib/access'
import { requestClient } from '../lib/obs/clientIp'
import { hashIp } from '../lib/obs/privacy'
import { LIMITS, allow } from '../lib/obs/security'
import { KULUP } from '../lib/kulup'

/**
 * Certificates — worker'ın ürettiği sertifikalar (ABT modeli).
 *
 * - Her sertifikanın tahmin edilemez kodu var: <ÖNEK>-YYYY-TÜR-<20 karakter> (önek: kulup.config.json → sertifika.onEk). Doğrulama bu kodla yapılır;
 *   bilet jetonu (ticketToken) artık sertifika bağlantısında kullanılmaz.
 * - Görsel (JPG) ve PDF media'ya (R2) `certificate-<rastgele>` adıyla yüklenir; media listesinde
 *   oturumsuz ziyaretçiye gösterilmez (Media.ts).
 * - Okuma/yazma yalnız admin (worker admin oturumuyla çalışır). Herkese açık erişim yalnız /verify ucundan.
 */

export const CERTIFICATE_TYPES = ['participation', 'achievement', 'appreciation'] as const
const TYPE_CODES: Record<(typeof CERTIFICATE_TYPES)[number], string> = { participation: 'KTLM', achievement: 'BSRI', appreciation: 'TSKR' }
// Karışmayan karakterler (0/O, 1/I/L yok): elle yazılırken hata olmasın
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CERTIFICATE_PREFIX = KULUP.sertifika.onEk
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const CERTIFICATE_CODE = new RegExp(`^${escapeRegExp(CERTIFICATE_PREFIX)}-\\d{4}-(KTLM|BSRI|TSKR)-[2-9A-HJKMNP-Z]{20}$`)

export function newCertificateCode(type: (typeof CERTIFICATE_TYPES)[number], now = new Date()): string {
  let random = ''
  for (let i = 0; i < 20; i++) random += ALPHABET[randomInt(ALPHABET.length)]
  return `${CERTIFICATE_PREFIX}-${now.getFullYear()}-${TYPE_CODES[type]}-${random}`
}

// Doğrulama ucu için IP başına sınır (dakikada 30, paylaşılan depoda); kodun 20 rastgele karakteri asıl korumadır.

const mediaUrl = (value: unknown): string | null =>
  value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string' ? (value as { url: string }).url : null

export const verifyCertificateEndpoint: Endpoint = {
  path: '/verify',
  method: 'get',
  handler: async (req) => {
    // Site sunucusu (iç anahtar) tüm ziyaretçiler için tek IP'den gelir; sınır yalnız doğrudan çağrılara uygulanır.
    if (!hasInternalKey(req.headers)) {
      const limit = LIMITS.certificateVerifyPerIp
      const { allowed } = await allow(req.payload, limit.bucket, hashIp(requestClient(req).ip), limit.max, limit.windowSec)
      if (!allowed) return Response.json({ valid: false, error: 'Çok fazla deneme. Biraz bekleyin.' }, { status: 429 })
    }
    const code = String(new URL(req.url || 'http://x').searchParams.get('code') || '').trim().toUpperCase()
    if (!CERTIFICATE_CODE.test(code)) return Response.json({ valid: false }, { status: 404 })
    const { docs } = await req.payload.find({
      collection: 'certificates', where: { code: { equals: code } }, limit: 1, depth: 1, overrideAccess: true,
    })
    const cert = docs[0] as any
    if (!cert || cert.revoked) return Response.json({ valid: false }, { status: 404 })
    // Kayıt hâlâ onaylı ve katılmış olmalı (S21: onaysız kayıtların adı dönmez)
    const registration = cert.registration && typeof cert.registration === 'object' ? cert.registration : null
    if (registration && (registration.status !== 'accepted' || registration.attended !== true)) {
      return Response.json({ valid: false }, { status: 404 })
    }
    const event = cert.event && typeof cert.event === 'object' ? cert.event : null
    return Response.json({
      valid: true,
      code: cert.code,
      fullName: cert.fullName,
      type: cert.type,
      issueDate: cert.issueDate,
      event: event ? { title: event.title, date: event.date } : null,
      imageUrl: mediaUrl(cert.imageFile),
      pdfUrl: mediaUrl(cert.pdfFile),
      // İptal kısa sürede yansısın: uçta 1 dk, bayat yanıt en çok 5 dk
    }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
  },
}

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  labels: { singular: '🎓 Sertifika', plural: '🎓 Sertifikalar' },
  admin: {
    group: '🎓 Faaliyetler',
    useAsTitle: 'code',
    defaultColumns: ['code', 'fullName', 'type', 'event', 'issueDate', 'revoked'],
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  endpoints: [verifyCertificateEndpoint],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create') {
          const type = (CERTIFICATE_TYPES as readonly string[]).includes(data.type) ? data.type : 'participation'
          data.type = type
          data.code = newCertificateCode(type)
          data.issueDate ??= new Date().toISOString()
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', unique: true, index: true, label: 'Sertifika kodu',
      admin: { readOnly: true, description: 'Oluştururken otomatik üretilir; doğrulama bağlantısı: <site adresi>/sertifika/<kod>' },
      access: { update: () => false } },
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, label: 'Etkinlik' },
    { name: 'registration', type: 'relationship', relationTo: 'event-registrations', label: 'Kayıt' },
    { name: 'fullName', type: 'text', required: true, maxLength: 200, label: 'Ad Soyad (sertifikadaki)' },
    { name: 'type', type: 'select', required: true, defaultValue: 'participation', label: 'Tür',
      options: [
        { label: 'Katılım', value: 'participation' },
        { label: 'Başarı', value: 'achievement' },
        { label: 'Teşekkür', value: 'appreciation' },
      ] },
    { name: 'issueDate', type: 'date', required: true, label: 'Veriliş tarihi' },
    { name: 'imageFile', type: 'upload', relationTo: 'media', label: 'Sertifika görseli (JPG)' },
    { name: 'pdfFile', type: 'upload', relationTo: 'media', label: 'Sertifika PDF' },
    { name: 'revoked', type: 'checkbox', defaultValue: false, label: 'İptal edildi',
      admin: { description: 'İşaretlenirse doğrulama sayfası bu sertifikayı geçersiz gösterir.' } },
  ],
}
