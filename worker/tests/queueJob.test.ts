import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { QueueService } from '../server/queue.js'
import type { PayloadClient } from '../server/payload.js'
import { describeDisconnect, type WhatsAppManager } from '../server/whatsapp.js'
import type { QueueItem } from '../shared/types.js'

const base = Date.parse('2026-10-15T00:00:00.000Z')
const item = (id: number): QueueItem => ({
  id, to: '+900000000001', message: `iş mesajı ${id}`, source: 'decision', status: 'pending',
  attempts: 0, createdAt: new Date(base).toISOString(),
})

async function setup(records: QueueItem[], dropAfter: number) {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'kulup-queue-job-'))
  let connected = true
  const sent: number[] = []
  const payload = { request: async (url: string, options?: { body?: { status?: string } }) => {
    if (url.startsWith('/wa-queue?')) {
      const pending = records.filter((record) => record.status === 'pending')
      return { data: { docs: pending, hasNextPage: false, totalDocs: pending.length } }
    }
    const record = records.find((entry) => entry.id === Number(url.split('/').pop()))!
    if (options?.body?.status) record.status = options.body.status
    return { data: record }
  } } as unknown as PayloadClient
  let queue: QueueService
  const whatsapp = {
    connected: () => connected,
    status: () => ({ status: connected ? 'connected' : 'disconnected', message: '',
      unexpectedDisconnect: connected ? undefined : { at: new Date(base).toISOString(), reason: 'Bağlantı koptu (TEST).' } }),
    send: async (_to: string, message: string) => {
      const record = records.find((entry) => entry.message === message)!
      sent.push(record.id)
      // Belirlenen sayıda mesajdan sonra bağlantı kopar.
      if (sent.length === dropAfter) { connected = false; queue.markDisconnected() }
    },
  } as unknown as WhatsAppManager
  queue = new QueueService(payload, whatsapp, userData, { now: () => base, wait: async () => undefined, gap: () => 0 })
  return {
    queue, sent,
    reconnect: () => { connected = true; queue.markConnected() },
    cleanup: () => rm(userData, { recursive: true, force: true }),
  }
}

test('bağlantı koparsa yarıda kalan iş kaydedilir; Devam et kalanları gönderir', async () => {
  const records = [item(1), item(2), item(3)]
  const env = await setup(records, 1)
  try {
    const first = await env.queue.send([1, 2, 3])
    assert.equal(first.sent, 1)
    const job = await env.queue.interruptedJob()
    assert.ok(job)
    assert.deepEqual(job.remaining, [2, 3])
    assert.equal(job.sent, 1)
    assert.equal(job.total, 3)
    assert.equal(job.reason, 'Bağlantı koptu (TEST).')

    env.reconnect()
    const resumed = await env.queue.resumeJob()
    assert.equal(resumed.sent, 2)
    assert.deepEqual(env.sent, [1, 2, 3])
    assert.equal(await env.queue.interruptedJob(), null)
  } finally { await env.cleanup() }
})

test('Vazgeç yarım işi temizler; bağlı değilken devam reddedilir', async () => {
  const env = await setup([item(1), item(2)], 1)
  try {
    await env.queue.send([1, 2])
    await assert.rejects(env.queue.resumeJob(), { message: 'WhatsApp bağlı değil.' })
    await env.queue.discardJob()
    assert.equal(await env.queue.interruptedJob(), null)
  } finally { await env.cleanup() }
})

test('kopma sebepleri Türkçeleşir; telefondan çıkışta yeniden bağlanma denenmez', () => {
  assert.equal(describeDisconnect('LOGOUT').retry, false)
  assert.equal(describeDisconnect('CONFLICT').retry, true)
  assert.match(describeDisconnect('CONFLICT').text, /başka bir yerde/)
  assert.equal(describeDisconnect(undefined).text, 'Bağlantı koptu.')
})
