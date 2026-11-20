import test from 'node:test'
import assert from 'node:assert/strict'
import { linkedInAddUrl, linkedInShareUrl, normalizeCertificateCode, type VerifiedCertificate } from '../src/lib/certificateShared'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const CODE = `${ONEK}-2026-KTLM-ABCDEFGHJKMNPQRSTUVW`

test('sertifika kodu sadeleşir; biçim dışı kodlar reddedilir', () => {
  assert.equal(normalizeCertificateCode(` ${CODE.toLowerCase()} `), CODE)
  assert.equal(normalizeCertificateCode(`${ONEK}-2026-KTLM-ABCDEFGHJKMN PQRSTUVW`), CODE)
  for (const bad of ['', `${ONEK}-42`, 'e061f89fc2b4f193', `${ONEK}-2026-XXXX-ABCDEFGHJKMNPQRSTUVW`, `${ONEK}-2026-KTLM-ABCDEFGHJKMNPQRSTUV0`,
    `${CODE}/../ticket`, `${ONEK}-2026-KTLM-ABCDEFGHJKMNPQRSTUVWX`]) {
    assert.equal(normalizeCertificateCode(bad), null, bad)
  }
})

test('LinkedIn bağlantıları sertifika kodu ve sayfa adresiyle oluşur', () => {
  const cert: VerifiedCertificate = { code: CODE, fullName: 'Ada', type: 'participation', issueDate: '2026-10-15T10:00:00.000Z',
    event: { title: 'Deneme & Etkinlik' }, imageUrl: null, pdfUrl: null }
  const url = new URL(linkedInAddUrl(cert, `https://${SITE_HOST}/sertifika/${CODE}`))
  assert.equal(url.hostname, 'www.linkedin.com')
  assert.equal(url.searchParams.get('certId'), CODE)
  assert.equal(url.searchParams.get('certUrl'), `https://${SITE_HOST}/sertifika/${CODE}`)
  assert.equal(url.searchParams.get('name'), 'Deneme & Etkinlik – Katılım Sertifikası')
  assert.equal(url.searchParams.get('issueYear'), '2026')
  assert.equal(url.searchParams.get('issueMonth'), '10')
  assert.equal(linkedInShareUrl('https://x.invalid/a b'), 'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.invalid%2Fa%20b')
})
