import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ogImagePath, parseOgRequest } from '../src/lib/ogImage'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const SITE = `https://${SITE_HOST}`
const parse = (query: string) => parseOgRequest(new URL(`https://${SITE_HOST}/api/og?${query}`), SITE)

test('ogImagePath adresi parseOgRequest ile aynı kaynağa ve genişliğe döner', () => {
  const src = `https://${CDN_HOST}/a b%23.png`
  const req = new URL(ogImagePath(src, 1200), SITE)
  const parsed = parseOgRequest(req, SITE)
  assert.equal(parsed?.src.href, `https://${CDN_HOST}/a%20b%23.png`)
  assert.equal(parsed?.width, 1200)
  assert.equal(parseOgRequest(new URL(ogImagePath('/media/kapak.jpg', 828), SITE), SITE)?.src.href, `${SITE}/media/kapak.jpg`)
})

test('genişlik yalnız 828 ya da 1200, tam bu yazımla', () => {
  const src = encodeURIComponent(`https://${CDN_HOST}/k.png`)
  assert.equal(parse(`src=${src}&w=640`), null)
  assert.equal(parse(`src=${src}&w=1200.0`), null)
  assert.equal(parse(`src=${src}&w=01200`), null)
  assert.equal(parse(`src=${src}`), null)
})

test('fazladan parametre ya da kaynakta sorgu/çapa önbelleği deleceği için reddedilir', () => {
  const src = `https://${CDN_HOST}/k.png`
  assert.equal(parse(`src=${encodeURIComponent(src)}&w=1200&v=2`), null)
  assert.equal(parse(`src=${encodeURIComponent(src)}&src=${encodeURIComponent(src)}&w=1200`), null)
  assert.equal(parse(`src=${encodeURIComponent(`${src}?v=1`)}&w=1200`), null)
  assert.equal(parse(`src=${encodeURIComponent(`${src}#x`)}&w=1200`), null)
})

test('izinsiz alan, http, kullanıcı bilgisi, port ve başka alana çözülen yol reddedilir', () => {
  for (const src of [
    'https://ornek.org/x.png',
    `https://${SITE_HOST}.evil.org/x.png`,
    `http://${CDN_HOST}/x.png`,
    `https://u:p@${CDN_HOST}/x.png`,
    `https://${CDN_HOST}:8443/x.png`,
    '//evil.org/x.png',
    '/\\evil.org/x.png',
    '/api/og',
    '/_next/image',
    'javascript:alert(1)',
    '',
  ]) {
    assert.equal(parse(`src=${encodeURIComponent(src)}&w=1200`), null, src)
  }
})
