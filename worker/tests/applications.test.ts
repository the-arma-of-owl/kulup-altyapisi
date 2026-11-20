import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ApplicationsService, type NotifyRequest } from '../server/applications.js'
import { PayloadClient, PayloadError } from '../server/payload.js'
import { TemplatesService } from '../server/templates.js'
import { MailService } from '../server/mail.js'
import { applicationValues } from '../shared/applicationVars.js'

const member = { id: 1, fullName: '<b>Ada</b> Su', email: 'ada@example.invalid',
  phone: '+900000000001', department: 'Bilgisayar', year: '2', status: 'approved' }
const core = { id: 2, fullName: 'Bora Su', email: 'bora@example.invalid',
  phone: '+900000000002', department: 'Yazılım', grade: '3', area: 'Tasarım', status: 'accepted' }

async function harness() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-applications-'))
  const rows: Record<string, Array<Record<string, unknown>>> = {
    'member-applications': [member, { ...member, id: 3, status: 'rejected' }, { ...member, id: 4, status: 'pending' }],
    'core-team-applications': [core, { ...core, id: 5, status: 'rejected' }, { ...core, id: 6, status: 'interview' }],
  }
  const calls: Array<{ route: string; method: string; body?: unknown }> = []
  const sent: Array<{ to: string; subject: string; html: string }> = []
  let subject = 'Merhaba {{ad}}'
  let html = '<script>alert(1)</script><p onclick="go()">{{adSoyad}} {{bolum}} {{sinif}} {{alan}}</p>'
  let message = 'Merhaba {{ad}}'
  const payload = { request: async (route: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ route, method: options?.method ?? 'GET', body: options?.body })
    if (route === '/wa-queue') return { data: {} }
    if (route.startsWith('/email-templates/')) return { data: { subject, html } }
    if (route.startsWith('/whatsapp-templates/')) return { data: { message } }
    const match = /^\/(member-applications|core-team-applications)(?:\/(\d+))?\?/.exec(route)
    if (!match) throw new Error(route)
    const records = rows[match[1]]
    if (match[2]) {
      const item = records.find((record) => record.id === Number(match[2]))
      if (!item) throw new PayloadError('Yok', 404)
      return { data: item }
    }
    const page = Number(new URLSearchParams(route.split('?')[1]).get('page'))
    return { data: { docs: page === 1 ? records.slice(0, 2) : records.slice(2), hasNextPage: page === 1 } }
  } } as PayloadClient
  const mail = { sendPaced: async (to: string, mailSubject: string, mailHtml: string) => {
    sent.push({ to, subject: mailSubject, html: mailHtml })
  } } as MailService
  const service = new ApplicationsService(payload, new TemplatesService(payload), mail, dir)
  const input: NotifyRequest = { kind: 'members', ids: [1], decision: 'accepted',
    mailTemplateId: 7, whatsappTemplateId: 8, confirmed: true, confirmCount: 1 }
  return { service, input, rows, calls, sent, dir,
    setSubject: (value: string) => { subject = value }, setHtml: (value: string) => { html = value },
    setMessage: (value: string) => { message = value } }
}

const status = (code: number) => (error: unknown) => error instanceof PayloadError && error.status === code
const deliveries = (calls: Array<{ route: string; method: string; body?: unknown }>) => calls.filter((call) => call.route === '/wa-queue')

test('iki başvuru türünün sekmeleri sayfalı okunur ve durumlar doğru eşlenir', async () => {
  const h = await harness()
  assert.deepEqual((await h.service.list('members', 'accepted')).map((item) => item.id), [1])
  assert.deepEqual((await h.service.list('members', 'rejected')).map((item) => item.id), [3])
  assert.deepEqual((await h.service.list('core-team', 'accepted')).map((item) => item.id), [2])
  assert.deepEqual((await h.service.list('core-team', 'rejected')).map((item) => item.id), [5])
  assert.equal((await h.service.list('core-team', 'all')).length, 3)
  assert.ok(h.calls.some((call) => call.route.includes('page=2')))
  assert.ok(h.calls.filter((call) => call.route.includes('?')).every((call) => call.route.includes('limit=500') && call.route.includes('depth=0')))
  await assert.rejects(h.service.list('members', 'invalid' as never), status(400))
  assert.deepEqual(applicationValues(core, 'core-team'), { adSoyad: 'Bora Su', ad: 'Bora', bolum: 'Yazılım', sinif: '3', alan: 'Tasarım' })
})

test('onay, sayı, karar, id ve şablon hataları hiçbir gönderim başlatmaz', async () => {
  const h = await harness()
  for (const invalid of [
    { confirmed: false }, { confirmCount: 2 }, { ids: [] }, { ids: [1, 1], confirmCount: 2 },
    { ids: [0] }, { decision: 'pending' }, { mailTemplateId: null, whatsappTemplateId: null },
  ]) await assert.rejects(h.service.notify({ ...h.input, ...invalid } as NotifyRequest), status(400))
  assert.equal(h.sent.length, 0)
  assert.equal(deliveries(h.calls).length, 0)
})

test('CMS kaydı yeniden okunur; bulunmayan ve kararı uyuşmayan kayıt bütün partiyi durdurur', async () => {
  const h = await harness()
  await assert.rejects(h.service.notify({ ...h.input, ids: [1, 99], confirmCount: 2 }), status(404))
  await assert.rejects(h.service.notify({ ...h.input, ids: [1, 4], confirmCount: 2 }), status(400))
  assert.equal(h.sent.length, 0)
  assert.equal(deliveries(h.calls).length, 0)
  assert.equal(h.calls.some((call) => call.method === 'PATCH'), false)
})

test('tekrar 409 döner; açık tekrar onayıyla geçer ve bildirim tarihi listede görünür', async () => {
  const h = await harness()
  await h.service.notify(h.input)
  await assert.rejects(h.service.notify(h.input), status(409))
  assert.equal(h.sent.length, 1)
  assert.equal(deliveries(h.calls).length, 1)
  await h.service.notify({ ...h.input, repeatConfirmed: true })
  assert.equal(h.sent.length, 2)
  assert.equal(deliveries(h.calls).length, 2)
  assert.match((await h.service.list('members', 'accepted'))[0].notified.accepted || '', /^\d{4}-/)
})

test('bilinmeyen değişken tüm kanalları ve tüm kişileri önceden durdurur', async () => {
  const h = await harness()
  h.setMessage('{{olmayan}}')
  await assert.rejects(h.service.notify({ ...h.input, ids: [1, 3], decision: 'rejected', confirmCount: 2 }), status(400))
  assert.equal(h.sent.length, 0)
  assert.equal(deliveries(h.calls).length, 0)
})

test('mail HTML temizlenir ve değişkenler kaçar; WhatsApp yalnız karar kuyruğuna yazılır', async () => {
  const h = await harness()
  const result = await h.service.notify(h.input)
  assert.equal(result.results[0].mail, 'sent')
  assert.equal(result.results[0].whatsapp, 'queued')
  assert.doesNotMatch(h.sent[0].html, /<script|onclick/i)
  assert.match(h.sent[0].html, /&lt;b&gt;Ada&lt;\/b&gt;/)
  assert.deepEqual(deliveries(h.calls)[0].body, {
    to: '900000000001', message: 'Merhaba <b>Ada</b>', source: 'decision', status: 'pending',
  })
  assert.equal(h.calls.some((call) => call.method === 'PATCH'), false)
  const historyPath = path.join(h.dir, 'application-notices.json')
  const file = await readFile(historyPath, 'utf8')
  assert.doesNotMatch(file, /@|900000000001|phone|email/i)
  if (process.platform !== 'win32') assert.equal((await stat(historyPath)).mode & 0o777, 0o600)
})

test('red kararında WhatsApp isteğe bağlıdır; Core Team alanı doldurulur', async () => {
  const h = await harness()
  h.setHtml('<p>{{alan}} {{sinif}}</p>')
  const result = await h.service.notify({ ...h.input, kind: 'core-team', ids: [5],
    decision: 'rejected', whatsappTemplateId: null })
  assert.equal(result.results[0].whatsapp, 'skipped')
  assert.equal(h.sent[0].html, '<p>Tasarım 3</p>')
  assert.equal(deliveries(h.calls).length, 0)
})
