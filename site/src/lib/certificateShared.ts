import { KULUP } from './kulup'
// Sertifika kodu: <ÖNEK>-YYYY-TÜR-<20 karakter>. Önek kulup.config.json → sertifika.onEk
// (CMS üretir; cms/src/collections/Certificates.ts ile aynı biçim)
export const CERTIFICATE_PREFIX = KULUP.sertifika.onEk
export const CERTIFICATE_CODE = new RegExp(`^${CERTIFICATE_PREFIX}-\\d{4}-(KTLM|BSRI|TSKR)-[2-9A-HJKMNP-Z]{20}$`)

export type VerifiedCertificate = {
  code: string
  fullName: string
  type: 'participation' | 'achievement' | 'appreciation'
  issueDate: string
  event: { title: string; date?: string } | null
  imageUrl: string | null
  pdfUrl: string | null
}

/** Kullanıcının yazdığı kodu sadeleştirir (boşluk, küçük harf); geçersizse null. */
export function normalizeCertificateCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '')
  return CERTIFICATE_CODE.test(code) ? code : null
}

export const certificateTypeLabel = (type: VerifiedCertificate['type']) =>
  ({ participation: 'Katılım Sertifikası', achievement: 'Başarı Sertifikası', appreciation: 'Teşekkür Belgesi' })[type] ?? 'Sertifika'

/** LinkedIn profiline "Lisans ve Sertifikalar" olarak ekleme bağlantısı. */
export function linkedInAddUrl(cert: VerifiedCertificate, pageUrl: string): string {
  const issued = new Date(cert.issueDate)
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: `${cert.event?.title ? `${cert.event.title} – ` : ''}${certificateTypeLabel(cert.type)}`,
    organizationName: KULUP.tamAd,
    certUrl: pageUrl,
    certId: cert.code,
  })
  if (!Number.isNaN(issued.getTime())) {
    params.set('issueYear', String(issued.getFullYear()))
    params.set('issueMonth', String(issued.getMonth() + 1))
  }
  return `https://www.linkedin.com/profile/add?${params}`
}

export const linkedInShareUrl = (pageUrl: string) =>
  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`
