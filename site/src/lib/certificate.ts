import { CERTIFICATE_CODE, type VerifiedCertificate } from './certificateShared'

export { CERTIFICATE_CODE, normalizeCertificateCode, linkedInAddUrl, linkedInShareUrl, certificateTypeLabel } from './certificateShared'
export type { VerifiedCertificate } from './certificateShared'

const CMS_URL = (process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')

/** CMS doğrulama ucunu sunucudan çağırır (iç anahtar CMS'teki IP sınırından muaf tutar). */
export async function fetchCertificate(code: string): Promise<VerifiedCertificate | null> {
  if (!CERTIFICATE_CODE.test(code)) return null
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (process.env.INTERNAL_API_KEY) headers['x-internal-api-key'] = process.env.INTERNAL_API_KEY
    const res = await fetch(`${CMS_URL}/api/certificates/verify?code=${encodeURIComponent(code)}`, {
      headers, next: { revalidate: 300, tags: ['certificates'] }, signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json() as VerifiedCertificate & { valid?: boolean }
    return data.valid === true && data.code === code ? data : null
  } catch { return null }
}
