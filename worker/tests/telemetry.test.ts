import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Telemetry } from '../server/telemetry.js'
import { PayloadClient, PayloadError, UPLOAD_TIMEOUT_MS, type Fetcher } from '../server/payload.js'
import { MailService } from '../server/mail.js'
import { chromePath } from '../server/chrome.js'
import { certificateFontStack, certificateFonts } from '../shared/certificateLayout.js'

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const warn = console.warn
  console.warn = () => {}
  try { return await fn() } finally { console.warn = warn }
}

test('telemetri: oturum yokken bekletir, açılınca sırayla gönderir; tekrarı tekilleştirir; sırları maskeler', async () => {
  const sent: Array<{ url: string; body: unknown; skip?: boolean }> = []
  let authed = false
  let clock = 0
  const t = new Telemetry({ request: async (url: string, init?: { body?: unknown; skipSessionCheck?: boolean }) => {
    sent.push({ url, body: init?.body, skip: init?.skipSessionCheck }); return { data: {}, response: {} as never }
  } } as never, () => authed, () => clock)
  t.report('wa_disconnected', { reason: 'koptu' })
  t.report('queue_error', { message: 'Bearer abc.def hata' }, { dedupeKey: 'q', dedupeMs: 1000 })
  t.report('queue_error', { message: 'aynı' }, { dedupeKey: 'q', dedupeMs: 1000 })
  await t.flush()
  assert.equal(sent.length, 0)
  assert.equal(t.pendingCount(), 2)
  authed = true
  await t.flush()
  assert.deepEqual(sent.map(s => s.url), ['/worker/event', '/worker/event'])
  assert.deepEqual(sent[0].body, { kind: 'wa_disconnected', data: { reason: 'koptu' } })
  assert.equal(sent[0].skip, true)
  assert.match(JSON.stringify(sent[1].body), /Bearer \[gizli\]/)
  clock = 2000
  t.report('queue_error', { message: 'yine' }, { dedupeKey: 'q', dedupeMs: 1000 })
  await t.flush()
  assert.equal(sent.length, 3)
})

test('telemetri: ağ hatasında olayı tutar, 4xx reddinde bırakır', async () => {
  let mode: 'down' | 'reject' | 'ok' = 'down'
  const t = new Telemetry({ request: async () => {
    if (mode === 'down') throw new PayloadError('CMS bağlantısı kurulamadı.', 503)
    if (mode === 'reject') throw new PayloadError('Bilinmeyen olay', 400)
    return { data: {}, response: {} as never }
  } } as never, () => true)
  await quiet(async () => { t.report('worker_started'); await t.flush() })
  assert.equal(t.pendingCount(), 1)
  mode = 'reject'
  await quiet(() => t.flush())
  assert.equal(t.pendingCount(), 0)
})

test('dosya yüklemesi Connection: close ve uzun zaman aşımıyla gider; JSON istekleri değişmez', async () => {
  const seen: Array<Record<string, string>> = []
  const fetcher: Fetcher = async (_url, init) => {
    seen.push(init.headers as Record<string, string>)
    return { ok: true, status: 200, json: async () => ({ ok: true }), headers: { getSetCookie: () => [] } }
  }
  const client = new PayloadClient(fetcher, 0)
  const form = new FormData()
  form.append('file', new Blob(['x']), 'a.png')
  await client.request('/media', { method: 'POST', body: form })
  await client.request('/items', { method: 'POST', body: { a: 1 } })
  assert.equal(seen[0].Connection, 'close')
  assert.equal(seen[0]['Content-Type'], undefined)
  assert.equal(seen[1].Connection, undefined)
  assert.equal(UPLOAD_TIMEOUT_MS, 60_000)
})

test('CMS hata gövdesindeki "error" alanı mesaja taşınır', async () => {
  const fetcher: Fetcher = async () => ({ ok: false, status: 423, json: async () => ({ ok: false, error: 'Acil kilit açık' }), headers: { getSetCookie: () => [] } })
  await assert.rejects(new PayloadClient(fetcher, 0).request('/worker/send-email', { method: 'POST', body: {} }),
    (error: unknown) => error instanceof PayloadError && error.message === 'Acil kilit açık' && error.status === 423)
})

test('mail bağlam bilgisi yalnız verilirse gövdeye eklenir', async () => {
  const bodies: unknown[] = []
  const mail = new MailService({ request: async (_url: string, init: { body: unknown }) => { bodies.push(init.body); return { data: { ok: true } } } } as never, 0, 0)
  await mail.sendPaced('a@example.invalid', 'K', '<p>x</p>')
  await mail.sendPaced('a@example.invalid', 'K', '<p>x</p>', undefined, { purpose: 'free-send', recipientName: 'Ali', batchIndex: 1, batchTotal: 3 })
  assert.equal('meta' in (bodies[0] as object), false)
  assert.deepEqual((bodies[1] as { meta: unknown }).meta, { purpose: 'free-send', recipientName: 'Ali', batchIndex: 1, batchTotal: 3 })
})

test('paketli uygulamada Chrome yoksa açık hata verir', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-chrome-'))
  const argv = process.argv
  try {
    await mkdir(path.join(dir, '.puppeteer-cache', 'chrome', 'win-146'), { recursive: true })
    process.argv = [...argv, `--resources-path=${dir}`]
    assert.throws(() => chromePath(), /Paket içindeki Chrome bulunamadı: .*\.puppeteer-cache/)
  } finally {
    process.argv = argv
    await rm(dir, { recursive: true, force: true })
  }
})

test('sertifika yazı tipleri Windows ve Linux\'ta bulunan yedeklere iner', () => {
  for (const font of certificateFonts) assert.match(certificateFontStack(font), /(sans-)?serif$/)
  assert.match(certificateFontStack('Inter'), /'Segoe UI'.*Arial/)
  assert.match(certificateFontStack('DejaVu Sans'), /Verdana/)
  // Google Fonts'tan eklenen aile önde, yoksa Arial yığınına iner; güvensiz ad hiç yazılmaz
  assert.equal(certificateFontStack('Great Vibes'), `'Great Vibes',${certificateFontStack('Arial')}`)
  assert.equal(certificateFontStack("x';}"), certificateFontStack('Arial'))
})
