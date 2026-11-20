import assert from 'node:assert/strict'
import test from 'node:test'
import { PayloadClient, PayloadError, type Fetcher } from '../server/payload.js'

const networkError = () => new TypeError('fetch failed', { cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }) })
const ok = () => new Response('{"ok":true}', { status: 200 })

test('GET retries one network error with a fresh timeout signal', async () => {
  const signals: (AbortSignal | null | undefined)[] = []
  let calls = 0
  const fetcher: Fetcher = async (_url, init) => {
    signals.push(init.signal)
    if (++calls === 1) throw networkError()
    return ok()
  }
  const { data } = await new PayloadClient(fetcher, 0).request<{ ok: boolean }>('/items')
  assert.equal(data.ok, true)
  assert.equal(calls, 2)
  assert.ok(signals[0])
  assert.notEqual(signals[0], signals[1])
})

test('GET stops after two network failures and hides connection details from caller', async () => {
  let calls = 0
  const client = new PayloadClient(async () => { calls++; throw networkError() }, 0)
  await assert.rejects(client.request('/items'), (error: unknown) =>
    error instanceof PayloadError && error.status === 503 && error.message === 'CMS bağlantısı kurulamadı.')
  assert.equal(calls, 2)
})

for (const method of ['POST', 'PATCH', 'DELETE']) {
  test(`${method} network failure is never retried`, async () => {
    let calls = 0
    const client = new PayloadClient(async () => { calls++; throw networkError() }, 0)
    await assert.rejects(client.request('/items', { method, body: { value: 1 } }),
      (error: unknown) => error instanceof PayloadError && error.status === 503)
    assert.equal(calls, 1)
  })
}

test('GET HTTP 500 preserves the existing message and does not retry', async () => {
  let calls = 0
  const client = new PayloadClient(async () => { calls++; return new Response('{"message":"ignored"}', { status: 500 }) }, 0)
  await assert.rejects(client.request('/items'),
    (error: unknown) => error instanceof PayloadError && error.status === 500 && error.message === 'CMS geçici olarak kullanılamıyor.')
  assert.equal(calls, 1)
})

test('GET timeout is not retried', async () => {
  let calls = 0
  const client = new PayloadClient(async () => { calls++; throw new DOMException('timed out', 'TimeoutError') }, 0)
  await assert.rejects(client.request('/items'),
    (error: unknown) => error instanceof PayloadError && error.status === 503)
  assert.equal(calls, 1)
})

test('network warning includes cause but excludes query string', async () => {
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const client = new PayloadClient(async () => { throw networkError() }, 0)
    await assert.rejects(client.request('/items?secret=hidden'), PayloadError)
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 2)
  assert.match(warnings[0].join(' '), /ECONNRESET/)
  assert.doesNotMatch(warnings.flat().join(' '), /secret|hidden/)
})
