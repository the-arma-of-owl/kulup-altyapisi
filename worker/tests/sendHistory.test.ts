import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SendHistoryStore, type HistoryRecipient } from '../server/sendHistory.js'

const recipient = (id: string, status: 'sent' | 'failed' = 'sent'): HistoryRecipient =>
  ({ id, name: 'Örnek Kişi', email: 'test@example.invalid', phone: '+900000000001', isTest: false, variables: {}, status })

test('geçmiş son 20 çalıştırmayı tutar, aynı alıcıyı günceller ve başarısızları ayırır', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-history-test-'))
  try {
    const store = new SendHistoryStore(dir)
    await Promise.all(Array.from({ length: 21 }, (_, i) => store.append(`run-${i}`, 'Örnek', recipient(`person-${i}`))))
    assert.equal((await store.read()).length, 20)
    assert.equal((await store.read()).some((run) => run.id === 'run-0'), false)
    await store.append('run-20', 'Örnek', { ...recipient('person-20', 'failed'), error: `Bearer secret123 ${'x'.repeat(400)}` })
    await store.append('run-20', 'Örnek', recipient('other'))
    const run = (await store.read()).find((item) => item.id === 'run-20')!
    assert.equal(run.recipients.length, 2)
    assert.deepEqual((await store.failedRecipients('run-20')).map((item) => item.id), ['person-20'])
    assert.ok(run.recipients[0].error!.length <= 300)
    assert.ok(!run.recipients[0].error!.includes('secret123'))
    if (process.platform !== 'win32') assert.equal((await stat(path.join(dir, 'send-history.json'))).mode & 0o777, 0o600)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('bozuk JSON boş listeye döner, diğer okuma hataları yayılır', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-history-test-'))
  try {
    const store = new SendHistoryStore(dir)
    assert.deepEqual(await store.read(), [])
    await writeFile(path.join(dir, 'send-history.json'), '{')
    assert.deepEqual(await store.read(), [])
    await rm(path.join(dir, 'send-history.json'))
    await (await import('node:fs/promises')).mkdir(path.join(dir, 'send-history.json'))
    await assert.rejects(store.read())
  } finally { await rm(dir, { recursive: true, force: true }) }
})
