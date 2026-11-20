import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { QueueService } from '../server/queue.js'
import { PayloadError, type PayloadClient } from '../server/payload.js'
import type { WhatsAppManager } from '../server/whatsapp.js'
import type { QueueItem } from '../shared/types.js'

const base = Date.parse('2026-09-29T00:00:00.000Z')
const item = (id: number, source: QueueItem['source'], created: number): QueueItem => ({
  id, to: '+900000000001', message: `örnek mesaj ${id}`, source, status: 'pending',
  attempts: 0, createdAt: new Date(created).toISOString(),
})

async function setup(records: QueueItem[]) {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'kulup-queue-approval-'))
  let now = base
  let connected = false
  const sent: number[] = []
  const payload = { request: async (url: string, options?: { body?: { status?: string } }) => {
    if (url.startsWith('/wa-queue?')) {
      const query = new URLSearchParams(url.split('?')[1])
      const page = Number(query.get('page') || 1)
      const pending = records.filter((record) => record.status === 'pending')
      return { data: { docs: pending.slice((page - 1) * 100, page * 100),
        hasNextPage: page * 100 < pending.length, nextPage: page + 1, totalDocs: pending.length } }
    }
    const record = records.find((entry) => entry.id === Number(url.split('/').pop()))!
    if (options?.body?.status) record.status = options.body.status
    return { data: record }
  } } as unknown as PayloadClient
  const whatsapp = {
    connected: () => connected,
    send: async (_to: string, message: string) => {
      const record = records.find((entry) => entry.message === message && entry.status === 'pending')
      if (record) sent.push(record.id)
    },
  } as unknown as WhatsAppManager
  const queue = new QueueService(payload, whatsapp, userData,
    { now: () => now, wait: async () => undefined, gap: () => 0 })
  return {
    queue, sent, userData,
    time: (value: number) => { now = value },
    connect: () => { connected = true; queue.markConnected() },
    disconnect: () => { connected = false; queue.markDisconnected() },
    cleanup: () => rm(userData, { recursive: true, force: true }),
  }
}

test('bağlantı kopukken biriken son 20 dakikalık kapı mesajı yeniden bağlanınca gider', async () => {
  const env = await setup([item(1, 'gate', base - 5 * 60_000)])
  try {
    env.connect()
    assert.equal((await env.queue.runAutomatic()).sent, 1)
    assert.deepEqual(env.sent, [1])
  } finally { await env.cleanup() }
})

test('bağlanmadan önceki eski (20 dakikadan eski) kapı mesajı otomatik turda gitmez', async () => {
  const env = await setup([item(1, 'gate', base - 21 * 60_000)])
  try {
    env.connect()
    assert.equal((await env.queue.runAutomatic()).sent, 0)
    assert.deepEqual(env.sent, [])
  } finally { await env.cleanup() }
})

test('bağlandıktan sonraki kapı mesajı otomatik turda gider', async () => {
  const record = item(1, 'gate', base + 1000)
  const env = await setup([record])
  try {
    env.connect()
    env.time(base + 1000)
    assert.equal((await env.queue.runAutomatic()).sent, 1)
    assert.deepEqual(env.sent, [1])
  } finally { await env.cleanup() }
})

test('bağlantı kopunca kapı izni düşer', async () => {
  const env = await setup([item(1, 'gate', base + 1000)])
  try {
    env.connect()
    env.disconnect()
    await assert.rejects(env.queue.runAutomatic(), (error: unknown) => error instanceof PayloadError && error.status === 409)
    assert.deepEqual(env.sent, [])
  } finally { await env.cleanup() }
})

test('karar onayı yalnız istek sırasında oluşanları kapsar', async () => {
  const env = await setup([item(1, 'decision', base - 1000), item(2, 'decision', base + 1000),
    item(3, 'decision', base + 3000)])
  try {
    env.time(base + 2000)
    env.queue.approveCreatedAfter(base)
    assert.deepEqual((await env.queue.list()).map((entry) => entry.autoSend), [false, true, false])
    env.connect()
    assert.equal((await env.queue.runAutomatic()).sent, 1)
    assert.deepEqual(env.sent, [2])
  } finally { await env.cleanup() }
})

test('24 saatten eski onay penceresi artık uygun sayılmaz', async () => {
  const env = await setup([item(1, 'decision', base + 1000)])
  try {
    env.time(base + 2000)
    env.queue.approveCreatedAfter(base)
    assert.equal((await env.queue.list())[0].autoSend, true)
    env.time(base + 25 * 3600_000)
    env.queue.approveCreatedAfter(base + 24 * 3600_000)
    assert.equal((await env.queue.list())[0].autoSend, false)
  } finally { await env.cleanup() }
})

test('send bağlantı yokken 409 döner ve WhatsApp çağrılmaz', async () => {
  const env = await setup([item(1, 'bulk', base)])
  try {
    await assert.rejects(env.queue.send([1]), (error: unknown) => error instanceof PayloadError && error.status === 409)
    assert.deepEqual(env.sent, [])
  } finally { await env.cleanup() }
})

test('send yalnız seçilen pending kaydı gönderir; belirsiz kaydı atlar', async () => {
  const records = [item(1, 'bulk', base - 1000), item(2, 'bulk', base - 1000),
    item(3, 'bulk', base - 1000)]
  records.forEach((record) => { record.message = String(record.id) })
  const env = await setup(records)
  try {
    await writeFile(path.join(env.userData, 'queue-uncertain.json'), '[3]')
    env.connect()
    const result = await env.queue.send([2, 3])
    assert.equal(result.sent, 1)
    assert.equal(result.uncertain, 1)
    assert.deepEqual(env.sent, [2])
    assert.equal(records[0].status, 'pending')
    assert.equal(records[2].status, 'pending')
  } finally { await env.cleanup() }
})

test('cancel bağlantı yokken yalnız pending seçilen kaydı iptal eder', async () => {
  const records = [item(1, 'bulk', base), item(2, 'bulk', base)]
  const env = await setup(records)
  try {
    assert.deepEqual(await env.queue.cancel([2]), { cancelled: 1 })
    assert.deepEqual(records.map((record) => record.status), ['pending', 'cancelled'])
    assert.deepEqual(env.sent, [])
  } finally { await env.cleanup() }
})

test('list bağlantı yokken sayfalar, otomatik ve belirsiz alanlarını gösterir', async () => {
  const records = Array.from({ length: 101 }, (_, index) => item(index + 1, 'gate', base + 1000))
  const env = await setup(records)
  try {
    await writeFile(path.join(env.userData, 'queue-uncertain.json'), '[101]')
    assert.equal((await env.queue.list()).length, 101)
    env.connect()
    const list = await env.queue.list()
    assert.equal(list[0].autoSend, true)
    assert.equal(list[0].preview, 'örnek mesaj 1')
    assert.equal(list[100].uncertain, true)
    assert.equal(list[100].autoSend, false)
  } finally { await env.cleanup() }
})

test('geçersiz kimlikler 400 olur', async () => {
  const env = await setup([])
  try {
    for (const ids of [[], [0], [1.5], ['1']]) {
      assert.throws(() => env.queue.send(ids), (error: unknown) => error instanceof PayloadError && error.status === 400)
      await assert.rejects(env.queue.cancel(ids), (error: unknown) => error instanceof PayloadError && error.status === 400)
    }
  } finally { await env.cleanup() }
})
