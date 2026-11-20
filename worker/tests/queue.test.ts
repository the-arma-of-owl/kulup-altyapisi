import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { QueueService } from '../server/queue.js'
import type { PayloadClient } from '../server/payload.js'
import type { WhatsAppManager } from '../server/whatsapp.js'
import { CONFIG } from '../server/config.js'

test('eşzamanlı kuyruk istekleri mesajları birer kez gönderir', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'kulup-queue-test-'))
  const records = [1, 2].map((id) => ({ id, to: '+900000000001', message: String(id), source: 'decision', status: 'pending', attempts: 0, createdAt: new Date().toISOString() }))
  let sends = 0
  const payload = { request: async (url: string, options?: { body?: { status?: string } }) => {
    if (url.startsWith('/wa-queue?')) return { data: { docs: records.filter((item) => item.status === 'pending') } }
    const id = Number(url.split('/').pop())
    const item = records.find((record) => record.id === id)!
    if (options?.body?.status) item.status = options.body.status
    return { data: item }
  } } as unknown as PayloadClient
  const whatsapp = { connected: () => true, send: async () => { sends++ } } as unknown as WhatsAppManager
  const queue = new QueueService(payload, whatsapp, userData, { now: Date.now, wait: async () => undefined, gap: () => 0 })
  try {
    const [first, second] = await Promise.all([queue.send([1, 2]), queue.send([1, 2])])
    assert.equal(first.sent, 2)
    assert.equal(second.sent, 0)
    assert.equal(sends, 2)
    assert.deepEqual(await queue.uncertainIds(), [])
  } finally { await rm(userData, { recursive: true, force: true }) }
})

test('kuyruk bilet QR görselini yalnız uygun karar mesajına ekler', async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'kulup-queue-test-'))
  const link = CONFIG.ticketUrl('0000000789abcdef')
  const records = [
    { id: 1, to: '+900000000001', message: `Biletin: ${link}`, source: 'decision', mediaUrl: undefined as string | undefined, status: 'pending', attempts: 0, createdAt: new Date().toISOString() },
    { id: 2, to: '+900000000001', message: `Biletin: ${link}`, source: 'decision', mediaUrl: 'https://medya.invalid/resim.png', status: 'pending', attempts: 0, createdAt: new Date().toISOString() },
    { id: 3, to: '+900000000001', message: `Biletin: ${link}`, source: 'gate', mediaUrl: undefined as string | undefined, status: 'pending', attempts: 0, createdAt: new Date().toISOString() },
    { id: 4, to: '+900000000001', message: `${'a'.repeat(1001)} ${link}`, source: 'decision', mediaUrl: undefined as string | undefined, status: 'pending', attempts: 0, createdAt: new Date().toISOString() },
  ]
  const sent: Array<{ message: string; media: unknown }> = []
  const payload = { request: async (url: string, options?: { body?: { status?: string } }) => {
    if (url.startsWith('/wa-queue?')) return { data: { docs: records.filter((item) => item.status === 'pending'), hasNextPage: false } }
    const id = Number(url.split('/').pop())
    const item = records.find((record) => record.id === id)!
    if (options?.body?.status) item.status = options.body.status
    return { data: item }
  } } as unknown as PayloadClient
  const whatsapp = { connected: () => true, send: async (_to: string, message: string, media?: unknown) => {
    sent.push({ message, media })
  } } as unknown as WhatsAppManager
  const queue = new QueueService(payload, whatsapp, userData, { now: Date.now, wait: async () => undefined, gap: () => 0 })
  try {
    assert.equal((await queue.send([1, 2, 3, 4])).sent, 4)
    assert.equal(sent.length, 4)
    const qr = sent[0].media as { mimetype: string; filename: string; data: string }
    assert.equal(qr.mimetype, 'image/png')
    assert.equal(qr.filename, 'bilet-qr.png')
    assert.deepEqual(Buffer.from(qr.data, 'base64').subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    assert.equal(sent[0].message, records[0].message)
    assert.equal(sent[1].media, records[1].mediaUrl)
    assert.equal(sent[2].media, undefined)
    assert.equal(sent[3].media, undefined)
  } finally { await rm(userData, { recursive: true, force: true }) }
})
