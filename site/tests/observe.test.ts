import test from 'node:test'
import assert from 'node:assert/strict'
import { clientHeaders, getClientIp, sendSiteEvent } from '../src/lib/observe'
import { handleFormPost } from '../src/lib/cmsProxy'

test('ziyaretçi IP: x-forwarded-for yok sayılır, Cloudflare kenarında cf-connecting-ip kullanılır', () => {
  assert.equal(getClientIp(new Headers({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '85.1.2.3' })), '85.1.2.3')
  assert.equal(getClientIp(new Headers({ 'x-real-ip': '172.70.1.1', 'cf-connecting-ip': '85.9.9.9' })), '85.9.9.9')
  assert.equal(getClientIp(new Headers({ 'x-real-ip': '85.1.2.3', 'cf-connecting-ip': '1.1.1.1' })), '85.1.2.3')
  assert.equal(getClientIp(new Headers()), 'unknown')
})

test('CMS başlıkları: geçersiz IP ve kontrol karakterleri iletilmez', () => {
  assert.deepEqual(clientHeaders('unknown', null), {})
  assert.deepEqual(clientHeaders('85.1.2.3', 'Mozilla/5.0\u0000  (iPhone)'), { 'x-byt-client-ip': '85.1.2.3', 'x-byt-client-ua': 'Mozilla/5.0 (iPhone)' })
  assert.deepEqual(clientHeaders('bozuk değer', 'x'), { 'x-byt-client-ua': 'x' })
})

test('olaylar iç anahtarla CMS ingest ucuna gider; anahtar yoksa istek atılmaz', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return Response.json({ ok: true }) }) as typeof fetch
  assert.equal(await sendSiteEvent({ type: 'site_error', where: 'test', reason: 'kota' }, { fetcher, cmsUrl: 'http://cms.invalid', internalKey: 'k' }), true)
  assert.equal(calls[0].url, 'http://cms.invalid/api/obs/ingest')
  assert.equal((calls[0].init?.headers as Record<string, string>)['x-internal-api-key'], 'k')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { type: 'site_error', where: 'test', reason: 'kota' })
  const original = console.error
  console.error = () => {}
  try {
    assert.equal(await sendSiteEvent({ type: 'site_error', where: 'test', reason: 'x' }, { fetcher, cmsUrl: 'http://cms.invalid', internalKey: '' }), false)
  } finally { console.error = original }
  assert.equal(calls.length, 1)
})

test('form CMS isteği ziyaretçi IP ve tarayıcısını iletir', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return Response.json({ doc: {} }, { status: 201 }) }) as typeof fetch
  const result = await handleFormPost({ pathParts: ['contact-messages'], ip: '85.1.2.3', userAgent: 'Mozilla/5.0 (Android)', turnstileToken: null,
    contentLength: null, readJson: async () => ({ fullName: 'A', email: 'a@example.invalid', subject: 's', message: 'm' }) },
  { fetcher, cmsUrl: 'http://cms.invalid', internalKey: 'k', turnstileSecret: undefined, checkRateLimit: () => true, nodeEnv: 'test' })
  assert.equal(result.status, 201)
  const headers = calls[0].init?.headers as Record<string, string>
  assert.equal(headers['x-byt-client-ip'], '85.1.2.3')
  assert.equal(headers['x-byt-client-ua'], 'Mozilla/5.0 (Android)')
})
