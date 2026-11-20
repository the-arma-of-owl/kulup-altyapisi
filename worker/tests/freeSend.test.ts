import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FreeSendService, parseRecipientFile, parseRecipientFileRequest } from '../server/freeSend.js'
import type { PayloadClient } from '../server/payload.js'
import { MailService } from '../server/mail.js'
import type { SendHistoryStore } from '../server/sendHistory.js'
import type { FreeSendRequest, HistoryRecipient, SendHistoryRun } from '../shared/types.js'
import { PayloadError } from '../server/payload.js'

test('etkinlik süzgeçleri, test kayıtları ve iki sayfa', async () => {
  const calls: string[] = []
  const rows = [
    { id: 1, fullName: 'Bir', email: ' A@ORNEK.TEST ', status: 'accepted', checkedInAt: '2026-01-01', gateFields: { masa: '4' } },
    { id: 2, fullName: 'İki', email: 'b@ornek.test', status: 'accepted' },
    { id: 3, fullName: 'Üç', email: 'c@ornek.test', status: 'pending' },
    { id: 4, fullName: 'Dört', email: 'd@ornek.test', status: 'accepted', isTest: true },
  ]
  const payload = { request: async (url: string) => {
    calls.push(url)
    const page = Number(new URLSearchParams(url.split('?')[1]).get('page'))
    return { data: { docs: page === 1 ? rows.slice(0, 2) : rows.slice(2), hasNextPage: page === 1 } }
  } } as unknown as PayloadClient
  const service = new FreeSendService(payload, {} as never, {} as never)
  const source = { kind: 'event' as const, eventId: 8 }
  assert.deepEqual((await service.recipients({ ...source, filter: 'accepted' })).map((item) => item.id), ['event-registrations:1', 'event-registrations:2'])
  assert.deepEqual((await service.recipients({ ...source, filter: 'checkedIn' })).map((item) => item.id), ['event-registrations:1'])
  assert.deepEqual((await service.recipients({ ...source, filter: 'notCheckedIn' })).map((item) => item.id), ['event-registrations:2'])
  assert.equal((await service.recipients({ ...source, filter: 'all' })).length, 3)
  assert.equal((await service.recipients({ ...source, filter: 'all', includeTest: true })).length, 4)
  assert.equal((await service.recipients({ ...source, filter: 'all' }))[0].email, 'a@ornek.test')
  assert.equal((await service.recipients({ ...source, filter: 'all' }))[0].variables.masa, '4')
  assert.ok(calls.every((url) => url.includes('limit=500') && url.includes('depth=0')))
  assert.ok(calls.some((url) => url.includes('page=2')))
})

test('CSV BOM, noktalı virgül, tırnak ve reddedilen satırlar', () => {
  const csv = '\uFEFFname;email;phone;note;__proto__\n"Ada; Su";" ADA@EXAMPLE.INVALID ";;"iki ""tırnak""";tehlike\nEksik;;;metin;\n'
  const result = parseRecipientFile(csv, 'csv')
  assert.equal(result.recipients[0].name, 'Ada; Su')
  assert.equal(result.recipients[0].email, 'ada@example.invalid')
  assert.equal(result.recipients[0].variables.note, 'iki "tırnak"')
  assert.equal(Object.hasOwn(result.recipients[0].variables, '__proto__'), false)
  assert.deepEqual(result.rejected.map((item) => item.row), [3])
})

test('JSON dizi ve 2000 satır sınırı', () => {
  assert.throws(() => parseRecipientFile('{}', 'json'), /dizi/)
  assert.throws(() => parseRecipientFile(`name,email\n${'Kişi,test@example.invalid\n'.repeat(2001)}`, 'csv'), /2000/)
  const result = parseRecipientFile('[{"name":"Kişi","phone":"+900000000001","custom":42}]', 'json')
  assert.equal(result.recipients[0].phone, '900000000001')
  assert.equal(result.recipients[0].variables.custom, 42)
})

test('dosya önizleme isteği CSV satırlarını döndürür ve geçersiz girdiyi 400 reddeder', () => {
  const result = parseRecipientFileRequest({ text: 'name,email\nAda,test@example.invalid\nEksik,\nBora,bora@example.invalid\n', format: 'csv' })
  assert.deepEqual(result.docs.map((item) => item.id), ['file:2', 'file:4'])
  assert.deepEqual(result.skipped.map((item) => item.row), [3])
  for (const input of [
    { text: 'a'.repeat(1024 * 1024 + 1), format: 'csv' },
    { text: '', format: 'xml' },
    { text: 123, format: 'csv' },
  ]) assert.throws(() => parseRecipientFileRequest(input), (error: unknown) => error instanceof PayloadError && error.status === 400)
})

function harness(rows: Array<Record<string, unknown>> = [
  { id: 1, fullName: '<b>Ada</b> Su', email: 'ada@example.invalid', phone: '+900000000001', status: 'accepted' },
  { id: 2, fullName: 'Bora Su', email: 'bora@example.invalid', phone: '+900000000002', status: 'accepted' },
]) {
  const queue: unknown[] = [], sent: Array<{ to: string; subject: string; html: string }> = []
  const runs: SendHistoryRun[] = []
  let failTo = ''
  let hold: Promise<void> | null = null
  const payload = { request: async (path: string, options?: { body?: unknown }) => {
    if (path.startsWith('/event-registrations?')) return { data: { docs: rows, hasNextPage: false } }
    if (path === '/wa-queue') { queue.push(options?.body); return { data: {} } }
    throw new Error(path)
  } } as PayloadClient
  const mail = { sendPaced: async (to: string, subject: string, html: string) => {
    if (hold) await hold
    sent.push({ to, subject, html })
    if (to === failTo) throw new Error('Sahte mail hatası')
  } } as MailService
  const history = {
    read: async () => runs,
    failedRecipients: async (id: string) => runs.find((run) => run.id === id)?.recipients.filter((item) => item.status === 'failed') ?? [],
    append: async (id: string, label: string, recipient: HistoryRecipient) => {
      let run = runs.find((item) => item.id === id)
      if (!run) { run = { id, label, createdAt: '', recipients: [] }; runs.push(run) }
      run.recipients.push(recipient)
    },
  } as SendHistoryStore
  return { service: new FreeSendService(payload, mail, history), sent, queue, runs,
    fail: (to: string) => { failTo = to }, hold: (promise: Promise<void> | null) => { hold = promise } }
}

const request = (ids = ['event-registrations:1', 'event-registrations:2']): FreeSendRequest => ({
  confirmed: true, confirmCount: ids.length, label: 'Duyuru', channels: { mail: true, whatsapp: true },
  mail: { subject: 'Merhaba {{ad}}', html: '<p>{{adSoyad}}</p>' },
  whatsapp: { message: 'Merhaba {{ad}}' },
  target: { source: { kind: 'event', eventId: 5, filter: 'all' }, ids },
})

async function complete(service: FreeSendService): Promise<void> {
  for (let i = 0; i < 100 && service.status().running; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(service.status().running, false)
}

test('onay, sayı, kanal, seçili id ve bilinmeyen değişken gönderimden önce doğrulanır', async () => {
  const h = harness()
  const invalid = [
    { ...request(), confirmed: false },
    { ...request(), confirmCount: 1 },
    { ...request(), channels: {} },
    { ...request(), target: { source: { kind: 'event', eventId: 5, filter: 'all' }, ids: ['event-registrations:9'] }, confirmCount: 1 },
    { ...request(), mail: { subject: '{{yok}}', html: 'İçerik' } },
  ]
  for (const body of invalid) await assert.rejects(h.service.send(body as FreeSendRequest),
    (error: unknown) => error instanceof PayloadError && error.status === 400)
  assert.equal(h.sent.length, 0)
  assert.equal(h.queue.length, 0)
})

test('test kaydı açık izin ister; WhatsApp yalnız bekleyen toplu kuyruğa girer', async () => {
  const h = harness([{ id: 1, fullName: 'Deneme', email: 'test@example.invalid', phone: '+900000000001', isTest: true }])
  const body = request(['event-registrations:1'])
  await assert.rejects(h.service.send(body), (error: unknown) => error instanceof PayloadError && error.status === 400)
  assert.equal(h.sent.length, 0)
  assert.equal(h.queue.length, 0)
  await h.service.send({ ...body, allowTest: true })
  await complete(h.service)
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.queue[0], { to: '900000000001', message: 'Merhaba Deneme', source: 'bulk', status: 'pending',
    relatedEvent: 5, relatedRegistration: 1 })
})

test('mail hatası diğer alıcıyı durdurmaz; yeniden yalnız başarısızı gönderir ve HTML kaçar', async () => {
  const h = harness()
  h.fail('ada@example.invalid')
  const first = await h.service.send(request())
  await complete(h.service)
  assert.equal(h.runs[0].recipients[0].status, 'failed')
  assert.equal(h.runs[0].recipients[1].status, 'sent')
  assert.match(h.sent[0].html, /&lt;b&gt;Ada&lt;\/b&gt;/)
  assert.equal(h.queue.length, 2)
  h.fail('')
  const retry = await h.service.send({ ...request(), confirmCount: 1, target: { retryRunId: first.runId } })
  await complete(h.service)
  assert.notEqual(retry.runId, first.runId)
  assert.equal(h.runs[1].label, 'Duyuru (yeniden)')
  assert.deepEqual(h.runs[1].recipients.map((item) => item.id), ['event-registrations:1'])
  assert.equal(h.sent.length, 3)
  assert.equal(h.queue.length, 2)
  assert.equal(h.runs[1].recipients[0].whatsapp, 'queued')
})

test('serbest mail gönderiminde HTML temizliği değişkenlerden önce uygulanır', async () => {
  const h = harness([{ id: 1, fullName: 'Ada', email: 'ada@example.invalid', status: 'accepted' }])
  await h.service.send({ ...request(['event-registrations:1']), channels: { mail: true },
    mail: { subject: 'Merhaba {{ad}}', html: '<script>alert(1)</script><p onclick="go()">{{ad}}</p><a href="javascript:go()">Bağlantı</a>' } })
  await complete(h.service)
  assert.equal(h.sent.length, 1)
  assert.doesNotMatch(h.sent[0].html, /<script|onclick|javascript:/i)
  assert.match(h.sent[0].html, /<p>Ada<\/p>/)
})

test('eşzamanlı ikinci çalıştırma 409 alır', async () => {
  const h = harness()
  let release!: () => void
  h.hold(new Promise<void>((resolve) => { release = resolve }))
  await h.service.send(request(['event-registrations:1']))
  await assert.rejects(h.service.send(request(['event-registrations:2'])),
    (error: unknown) => error instanceof PayloadError && error.status === 409)
  release()
  await complete(h.service)
})

test('dosya satırları sunucuda yeniden ayrıştırılır ve yalnız seçilen satır kullanılır', async () => {
  const h = harness([])
  const body = { ...request(), confirmCount: 1, channels: { mail: true },
    target: { file: { format: 'csv' as const,
      text: 'name,email\nAda,ada@example.invalid\nBora,bora@example.invalid\n' }, rows: [3] } }
  await h.service.send(body)
  await complete(h.service)
  assert.deepEqual(h.sent.map((item) => item.to), ['bora@example.invalid'])
  assert.equal(h.runs[0].recipients[0].id, 'file:3')
  assert.equal(h.queue.length, 0)
  await assert.rejects(h.service.send({ ...body, target: { ...body.target, rows: [9] } }),
    (error: unknown) => error instanceof PayloadError && error.status === 400)
})

test('ortak mail hizmeti eşzamanlı çağrıları sıraya koyar ve 429 için bir kez dener', async () => {
  const calls: string[] = []
  let attempts = 0
  const payload = { request: async (_path: string, options: { body: { to: string } }) => {
    calls.push(options.body.to)
    if (options.body.to === 'a@example.invalid' && attempts++ === 0) throw new PayloadError('Sınır', 429)
    return { data: { ok: true } }
  } } as PayloadClient
  const mail = new MailService(payload, 0, 0)
  await Promise.all([
    mail.sendPaced('a@example.invalid', 'Konu', '<p>A</p>'),
    mail.sendPaced('b@example.invalid', 'Konu', '<p>B</p>'),
  ])
  assert.deepEqual(calls, ['a@example.invalid', 'a@example.invalid', 'b@example.invalid'])
})

test('karışık liste sunucuda yeniden doğrulanır', async () => {
  const { validateRecipientList } = await import('../server/freeSend.js')
  const list = validateRecipientList([
    { id: 'event-registrations:5', name: ' Ada ', email: ' ADA@EXAMPLE.INVALID ', phone: '0532 000 00 07', isTest: false, relatedEvent: 7, variables: { masa: 'A7', __proto__x: 1, 'kötü anahtar': 'x', obj: { a: 1 } }, status: 'failed' },
    { id: 'manual:abc-1', name: 'Bora', phone: '905550000003' },
  ])
  assert.deepEqual(list[0], { id: 'event-registrations:5', name: 'Ada', email: 'ada@example.invalid', phone: '905320000007', isTest: false, variables: Object.assign(Object.create(null), { masa: 'A7' }), relatedEvent: 7 })
  assert.equal(list[1].relatedEvent, undefined)
  for (const bad of [[], [{ id: 'x', name: 'A', email: 'a@b.co' }], [{ id: 'manual:1', name: '', email: 'a@b.co' }], [{ id: 'manual:1', name: 'A' }],
    [{ id: 'manual:1', name: 'A', phone: '123' }], [{ id: 'manual:1', name: 'A', email: 'a@b.co' }, { id: 'manual:1', name: 'B', email: 'b@b.co' }]]) {
    assert.throws(() => validateRecipientList(bad), PayloadError)
  }
})
