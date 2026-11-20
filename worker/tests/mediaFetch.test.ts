import assert from 'node:assert/strict'
import test from 'node:test'
import { CONFIG } from '../server/config.js'
import { fetchMedia, isPrivateAddress, MediaUrlError, validateMediaUrl } from '../server/mediaFetch.js'
import { WhatsAppManager } from '../server/whatsapp.js'

const hosts = ['cdn.example.test', 'cms.example.test']
const publicLookup = async () => [{ address: '203.0.113.10' }]
const mediaUrl = 'https://cdn.example.test/image.png?sig=hidden'

test('izinli hosttan baytlar, içerik türü ve dosya adı alınır', async () => {
  let calls = 0
  const result = await fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async (_url, init) => {
      calls++
      assert.equal(init?.redirect, 'manual')
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png; charset=utf-8' } })
    }) as typeof fetch,
  })
  assert.equal(calls, 1)
  assert.deepEqual(result.bytes, Buffer.from([1, 2, 3]))
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.filename, 'image.png')
})

test('URL biçimi ve izin listesi denetlenir; hata sorgu dizesini içermez', () => {
  for (const value of [
    'http://cdn.example.test/image.png?sig=hidden',
    'https://cdn.example.test:8443/image.png?sig=hidden',
    'https://cdn.example.test:443/image.png?sig=hidden',
    'https://user:pass@cdn.example.test/image.png?sig=hidden',
    'https://127.0.0.1/image.png?sig=hidden',
    'https://other.example.test/image.png?sig=hidden',
  ]) {
    assert.throws(() => validateMediaUrl(value, hosts), (error: unknown) => {
      assert.ok(error instanceof MediaUrlError)
      assert.ok(!error.message.includes('sig=hidden'))
      assert.ok(error.message.includes(new URL(value).host + '/image.png'))
      return true
    })
  }
  assert.throws(() => validateMediaUrl('bozuk', hosts), MediaUrlError)
})

test('özel IP aralıkları ve IPv4 eşlemeli IPv6 tanınır', () => {
  for (const address of ['0.0.0.1', '10.0.0.5', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '224.0.0.1', '240.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff00::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  assert.equal(isPrivateAddress('203.0.113.10'), false)
  assert.equal(isPrivateAddress('2001:db8::1'), false)
})

test('herhangi bir DNS yanıtı özelse indirme başlamaz', async () => {
  for (const address of ['10.0.0.5', '127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    let fetchCalls = 0
    await assert.rejects(() => fetchMedia(mediaUrl, {
      hosts,
      lookupImpl: async () => [{ address: '203.0.113.10' }, { address }],
      fetchImpl: (async () => { fetchCalls++; throw new Error('çağrılmamalı') }) as typeof fetch,
    }), /özel ağ/)
    assert.equal(fetchCalls, 0, address)
  }
})

test('yönlendirmede hedef ve DNS tekrar denetlenir', async () => {
  let calls = 0
  await assert.rejects(() => fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: 'https://other.example.test/missing.png?sig=secret' } })
    }) as typeof fetch,
  }), (error: unknown) => {
    assert.ok(error instanceof MediaUrlError)
    assert.match(error.message, /other\.example\.test\/missing\.png/)
    assert.ok(!error.message.includes('sig=secret'))
    return true
  })
  assert.equal(calls, 1)

  const resolved: string[] = []
  const result = await fetchMedia('https://cms.example.test/start', {
    hosts,
    lookupImpl: async (hostname) => { resolved.push(hostname); return publicLookup() },
    fetchImpl: (async (_url, init) => {
      assert.equal(init?.redirect, 'manual')
      return resolved.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://cdn.example.test/final.png' } })
        : new Response(new Uint8Array([4]))
    }) as typeof fetch,
  })
  assert.deepEqual(resolved, ['cms.example.test', 'cdn.example.test'])
  assert.deepEqual(result.bytes, Buffer.from([4]))
})

test('dördüncü yönlendirme reddedilir', async () => {
  let calls = 0
  await assert.rejects(() => fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: `/next-${calls}` } })
    }) as typeof fetch,
  }), /çok fazla yönlendirildi/)
  assert.equal(calls, 4)
})

test('yönlendirmedeki açık varsayılan port da reddedilir', async () => {
  await assert.rejects(() => fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async () => new Response(null, {
      status: 302, headers: { location: 'https://cdn.example.test:443/other.png?sig=hidden' },
    })) as typeof fetch,
  }), (error: unknown) => {
    assert.ok(error instanceof MediaUrlError)
    assert.match(error.message, /cdn\.example\.test\/other\.png/)
    assert.ok(!error.message.includes('sig=hidden'))
    return true
  })
})

test('Content-Length ve akış boyutu 4,5 MB ile sınırlıdır', async () => {
  await assert.rejects(() => fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async () => new Response(null, { headers: { 'content-length': '5000000' } })) as typeof fetch,
  }), /4,5 MB/)
  await assert.rejects(() => fetchMedia(mediaUrl, {
    hosts, lookupImpl: publicLookup,
    fetchImpl: (async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(5_000_000)); controller.close() },
    }))) as typeof fetch,
  }), /4,5 MB/)
})

test('medya hatasında WhatsApp sendMessage çağrılmaz', async () => {
  let messages = 0
  const manager = new WhatsAppManager('/tmp/kulup-media-fetch-test')
  Object.assign(manager, {
    client: {
      getNumberId: async () => ({ _serialized: 'fake' }),
      sendMessage: async () => { messages++ },
    },
    current: { status: 'connected', message: 'Sahte bağlantı.' },
  })
  const mutableConfig = CONFIG as { isLiveCms: boolean }
  const previous = CONFIG.isLiveCms
  mutableConfig.isLiveCms = true
  try {
    await assert.rejects(() => manager.send('909000000001', 'Sahte mesaj', 'http://cdn.example.test/image.png'), MediaUrlError)
  } finally { mutableConfig.isLiveCms = previous }
  assert.equal(messages, 0)
})
