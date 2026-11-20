import assert from 'node:assert/strict'
import test from 'node:test'
import { CONFIG } from '../server/config.js'
import { assertMailAllowed, assertWhatsAppAllowed, parseMailAllowlist, parseWhatsAppAllowlist } from '../server/waAllowlist.js'
import { WhatsAppManager } from '../server/whatsapp.js'

const allowed = '909000000001'
const other = '909000000002'

test('test ortamında izinli numara kabul edilir', () => {
  assert.doesNotThrow(() => assertWhatsAppAllowed(allowed, { isLive: false, allowlist: [allowed] }))
})

test('test ortamında izin listesi dışındaki numara reddedilir', () => {
  assert.throws(() => assertWhatsAppAllowed(other, { isLive: false, allowlist: [allowed] }),
    { name: 'Error', message: 'Test ortamı: numara izin listesinde değil' })
})

test('test ortamında boş liste bütün numaraları reddeder', () => {
  assert.throws(() => assertWhatsAppAllowed(allowed, { isLive: false, allowlist: [] }),
    { message: 'Test ortamı: numara izin listesinde değil' })
})

test('canlı ortamda boş liste gönderime engel olmaz', () => {
  assert.doesNotThrow(() => assertWhatsAppAllowed(other, { isLive: true, allowlist: [] }))
})

test('izin listesi biçimleri normalize edilir ve geçersiz öğeler atılır', () => {
  assert.deepEqual(parseWhatsAppAllowlist('  +90 900 000 00 01 , 0909000000002, 909000000003, ,bozuk,123 '),
    [allowed, other, '909000000003'])
})

test('izinsiz alıcı için WhatsApp istemcisine başvurulmaz', async () => {
  let numberLookups = 0
  let messages = 0
  const manager = new WhatsAppManager('/tmp/kulup-wa-allowlist-test')
  Object.assign(manager, {
    client: {
      getNumberId: async () => { numberLookups++; return { _serialized: 'fake' } },
      sendMessage: async () => { messages++ },
    },
    current: { status: 'connected', message: 'Sahte bağlantı.' },
  })
  const mutableConfig = CONFIG as { isLiveCms: boolean; waAllowlist: readonly string[] }
  const previous = { isLiveCms: CONFIG.isLiveCms, waAllowlist: CONFIG.waAllowlist }
  mutableConfig.isLiveCms = false
  mutableConfig.waAllowlist = [allowed]
  const send = manager.send(other, 'Sahte mesaj')
  Object.assign(mutableConfig, previous)
  await assert.rejects(send, { message: 'Test ortamı: numara izin listesinde değil' })
  assert.equal(numberLookups, 0)
  assert.equal(messages, 0)
})

test('test kilidi: liste doluysa canlı ortamda da yalnız izinli numara', () => {
  assert.doesNotThrow(() => assertWhatsAppAllowed(allowed, { isLive: true, allowlist: [allowed] }))
  assert.throws(() => assertWhatsAppAllowed(other, { isLive: true, allowlist: [allowed] }),
    { message: 'Test ortamı: numara izin listesinde değil' })
})

test('mail test kilidi: liste boşsa serbest, doluysa yalnız izinli adres (büyük/küçük harf duyarsız)', () => {
  assert.deepEqual(parseMailAllowlist(' Test@Example.invalid , bozuk, ,b@c.invalid'), ['test@example.invalid', 'b@c.invalid'])
  assert.doesNotThrow(() => assertMailAllowed('kim@example.invalid', []))
  assert.doesNotThrow(() => assertMailAllowed(' TEST@example.invalid', ['test@example.invalid']))
  assert.throws(() => assertMailAllowed('baska@example.invalid', ['test@example.invalid']),
    { message: 'Test kilidi: e-posta adresi izin listesinde değil' })
})
