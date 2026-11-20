import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_OG_IMAGE, clampText, formatDateRange, lexicalToPlainText, ogImageFromMedia, pageMetadata } from '../src/lib/seo'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


test('CMS görseli küçültülmüş JPEG adresine çevrilir, boyut hesaplanır', () => {
  const img = ogImageFromMedia({ url: `https://${CDN_HOST}/a b#.png`, mimeType: 'image/png', width: 2400, height: 1200 }, 'Kapak')
  assert.equal(img?.url, `/api/og?src=${encodeURIComponent(`https://${CDN_HOST}/a b%23.png`)}&w=1200`)
  assert.equal(img?.type, 'image/jpeg')
  assert.equal(img?.width, 1200)
  assert.equal(img?.height, 600)
})

test('dikey görselde genişlik 828, küçük görsel büyütülmez', () => {
  assert.equal(ogImageFromMedia({ url: `https://${CDN_HOST}/d.jpg`, width: 1845, height: 3281 }, '')?.url.endsWith('&w=828'), true)
  const small = ogImageFromMedia({ url: `https://${CDN_HOST}/k.png`, width: 690, height: 383 }, '')
  assert.deepEqual([small?.width, small?.height], [690, 383])
})

test('video, boş ve izinsiz alan adı', () => {
  assert.equal(ogImageFromMedia({ url: `https://${CDN_HOST}/v.mp4`, mimeType: 'video/mp4' }, ''), null)
  assert.equal(ogImageFromMedia(null, ''), null)
  assert.deepEqual(ogImageFromMedia('https://ornek.org/x.jpg', 'x'), { url: 'https://ornek.org/x.jpg', alt: 'x' })
})

test('pageMetadata eksiksiz OG/Twitter üretir; görsel yoksa varsayılan', () => {
  const m = pageMetadata({ title: 'Blog', description: 'Açıklama', path: '/blog' })
  const og = m.openGraph as Record<string, unknown>
  assert.equal(og.url, '/blog')
  assert.equal(og.siteName, `${KULUP.kisaAd} — ${KULUP.tamAd}`)
  assert.equal(og.locale, 'tr_TR')
  assert.deepEqual(og.images, [DEFAULT_OG_IMAGE])
  assert.deepEqual(m.alternates, { canonical: '/blog' })
  assert.equal((m.twitter as Record<string, unknown>).card, 'summary_large_image')
  const gizli = pageMetadata({ title: 'Bilet', description: 'x', noindex: true })
  assert.equal('url' in (gizli.openGraph as object), false)
  assert.equal(gizli.alternates, undefined)
})

test('metin yardımcıları', () => {
  assert.equal(clampText('bir iki üç dört', 10), 'bir iki…')
  assert.equal(formatDateRange('2026-10-16T12:00:00.000Z', '2026-10-24T12:00:00.000Z'), '16 Ekim 2026 – 24 Ekim 2026')
  assert.equal(formatDateRange('gecersiz'), '')
  const lexical = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Merhaba' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'dünya' }] }] } }
  assert.equal(lexicalToPlainText(lexical), 'Merhaba dünya')
})
