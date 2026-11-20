import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CertificateSendService, CertificateStore, certificateRecipients } from '../server/certificates.js'
import { MailService } from '../server/mail.js'
import { PayloadError } from '../server/payload.js'
import { defaultLayout } from '../shared/certificateLayout.js'

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,3,232,0,0,2,88,8,2,0,0,0])
const reg = (id = 1) => ({ id, event: 7, fullName: 'Ada <Deneme>', email: 'test@example.invalid',
  phone: '+900000000001', ticketToken: 'fake-token', status: 'accepted', attended: true,
  isTest: false, certificateType: 'participation' })
const request = (ids = [1]) => ({ eventId: 7, ids, mailTemplateId: 2, whatsappTemplateId: 3,
  confirmed: true as const, confirmCount: ids.length })

const CODE = 'TST-2026-KTLM-ABCDEFGHJKMNPQRSTUVW'
const IMAGE_URL = 'https://cdn.example.invalid/certificate-abc.png'

async function harness(options: { registrations?: Record<number, ReturnType<typeof reg>>;
  pdf?: Buffer; onRender?: () => void; holdMail?: Promise<void>; mailSubject?: string; failUpload?: boolean; failUploadOnce?: boolean } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-certificate-send-'))
  const store = new CertificateStore(dir)
  await store.saveTemplate('participation', { imageBase64: png.toString('base64'), layout: defaultLayout() })
  const calls: Array<{ url: string; body?: unknown }> = []
  const registrations = options.registrations ?? { 1: reg() }
  // Sahte CMS sertifika kayıtları (kayıt id → sertifika)
  const certs = new Map<number, { id: number; code: string; fullName: string; imageFile?: { url: string } | null; pdfFile?: { url: string } | null }>()
  let mediaId = 100
  const payload = { request: async (url: string, init?: { method?: string; body?: unknown }) => {
    if (init?.body) calls.push({ url, body: init.body })
    if (url.startsWith('/certificates?')) {
      const regId = Number(new URLSearchParams(url.split('?')[1]).get('where[registration][equals]'))
      const found = certs.get(regId)
      return { data: { docs: found ? [found] : [], totalDocs: found ? 1 : 0 } }
    }
    if (url === '/certificates' && init?.method === 'POST') {
      const body = init.body as { registration: number; fullName: string }
      const doc = { id: 50 + body.registration, code: CODE, fullName: body.fullName }
      certs.set(body.registration, doc)
      return { data: { doc } }
    }
    if (url === '/media' && init?.method === 'POST') {
      if (options.failUpload) throw new PayloadError('Yükleme başarısız.', 500)
      if (options.failUploadOnce) { options.failUploadOnce = false; throw new PayloadError('CMS bağlantısı kurulamadı.', 503) }
      return { data: { doc: { id: ++mediaId, url: IMAGE_URL } } }
    }
    if (url.startsWith('/certificates/') && init?.method === 'PATCH') {
      const cert = [...certs.values()].find(c => `/certificates/${c.id}` === url)!
      cert.imageFile = { url: IMAGE_URL }; cert.pdfFile = { url: 'https://cdn.example.invalid/certificate-abc.pdf' }
      return { data: { doc: cert } }
    }
    if (url.startsWith('/event-registrations/')) {
      const id = Number(url.split('/')[2]?.split('?')[0])
      if (!registrations[id]) throw new PayloadError('Kayıt yok.', 404)
      return { data: registrations[id] }
    }
    if (url.startsWith('/events/')) return { data: { id: 7, title: 'Deneme Etkinliği' } }
    if (url.startsWith('/email-templates/')) return { data: { subject: options.mailSubject ?? '{{adSoyad}} {{sertifikaNo}}',
      html: '<p>{{adSoyad}} {{etkinlik}} {{sertifikaLinki}}</p>' } }
    if (url.startsWith('/whatsapp-templates/')) return { data: { message: '{{adSoyad}} {{sertifikaLinki}}' } }
    return { data: { ok: true } }
  } }
  let renders = 0, closes = 0
  const factory = async () => ({ render: async () => {
    renders++; options.onRender?.()
    return { png: Buffer.from('fake'), pdf: options.pdf ?? Buffer.from('%PDF-fake') }
  }, close: async () => { closes++ } })
  const realMail = new MailService(payload as never, 0, 0)
  const mail = options.holdMail ? { sendPaced: async (...args: Parameters<MailService['sendPaced']>) => {
    await options.holdMail
    return realMail.sendPaced(...args)
  } } : realMail
  const service = new CertificateSendService(payload as never, { mail: async (id: number) => (await payload.request('/email-templates/' + id)).data,
    whatsApp: async (id: number) => (await payload.request('/whatsapp-templates/' + id)).data } as never,
  mail as MailService, store, dir, factory)
  service.uploadRetryDelayMs = 0
  const reports: Array<{ kind: string; data?: Record<string, unknown> }> = []
  service.reporter = (kind, data) => { reports.push({ kind, data }) }
  return { reports, dir, store, service, calls, get renders() { return renders }, get closes() { return closes },
    cleanup: () => rm(dir, { recursive: true, force: true }) }
}

test('onay ve seçim hataları gönderim yapmaz', async () => {
  const h = await harness()
  try {
    for (const change of [{ confirmed: false }, { confirmCount: 2 }, { ids: [1, 1], confirmCount: 2 },
      { ids: [] as number[], confirmCount: 0 }, { mailTemplateId: null, whatsappTemplateId: null }]) {
      await assert.rejects(h.service.send({ ...request(), ...change } as never), { status: 400 })
    }
    assert.deepEqual(h.calls, [])
  } finally { await h.cleanup() }
})

test('yeniden okunan kayıtlardan biri uygunsuzsa bütün grup reddedilir', async () => {
  for (const changed of [{ attended: false }, { event: 8 }, { isTest: true }]) {
    const h = await harness({ registrations: { 1: reg(), 2: { ...reg(2), ...changed } } })
    try {
      await assert.rejects(h.service.send(request([1, 2])), { status: 409 })
      assert.deepEqual(h.calls, [])
    } finally { await h.cleanup() }
  }
})

test('PDF eki, WA kuyruğu ve kişisel verisiz atomik geçmiş', async () => {
  const h = await harness()
  try {
    assert.deepEqual(await h.service.send(request()), { results: [{ id: 1, mail: 'sent', whatsapp: 'queued', code: CODE }] })
    // Görsel ve PDF rastgele adla media'ya yüklenir ve sertifika kaydına bağlanır
    const uploads = h.calls.filter(c => c.url === '/media').map(c => (c.body as FormData).get('file') as File)
    assert.deepEqual(uploads.map(file => /^certificate-[0-9a-f]{48}\.(png|pdf)$/.test(file.name)), [true, true])
    assert.ok(h.calls.some(c => c.url === '/certificates/51'))
    const email = h.calls.find(c => c.url === '/worker/send-email')!.body as { attachments: Array<{ filename: string; contentBase64: string; contentType: string }>; html: string }
    assert.deepEqual(email.attachments, [{ filename: `sertifika-${CODE}.pdf`,
      contentBase64: Buffer.from('%PDF-fake').toString('base64'), contentType: 'application/pdf' }])
    assert.match(email.html, /Ada &lt;Deneme&gt;/)
    const wa = h.calls.find(c => c.url === '/wa-queue')!.body as Record<string, unknown>
    assert.deepEqual({ source: wa.source, status: wa.status, relatedEvent: wa.relatedEvent,
      relatedRegistration: wa.relatedRegistration, to: wa.to },
    { source: 'bulk', status: 'pending', relatedEvent: 7, relatedRegistration: 1, to: '900000000001' })
    // Bağlantı sertifika koduyla; bilet jetonu açığa çıkmaz. WhatsApp'a sertifika görseli eklenir.
    assert.match(String(wa.message), new RegExp(`/sertifika/${CODE}`))
    assert.doesNotMatch(String(wa.message), /fake-token/)
    assert.equal(wa.mediaUrl, IMAGE_URL)
    const file = path.join(h.dir, 'certificate-sends.json')
    const raw = await readFile(file, 'utf8')
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.doesNotMatch(raw, /example\.invalid|\+9000|Ada|fake-token/)
    assert.deepEqual((await readdir(h.dir)).filter(name => name.endsWith('.tmp')), [])
    assert.deepEqual(JSON.parse(raw)[0], { eventId: 7, registrationId: 1, type: 'participation',
      at: JSON.parse(raw)[0].at, mail: 'sent', whatsapp: 'queued' })
    const recipients = await certificateRecipients({ request: async () => ({ data: { docs: [reg()], totalDocs: 1 } }) } as never,
      7, { history: h.service.history })
    assert.equal(recipients[0].sentAt, JSON.parse(raw)[0].at)
    assert.equal(h.renders, 1)
    assert.equal(h.closes, 1)
    const before = h.calls.length
    await assert.rejects(h.service.send(request()), { status: 409 })
    assert.equal(h.calls.length, before)
    // Tekrar gönderimde aynı sertifika kullanılır; dosyalar yeniden yüklenmez
    assert.deepEqual(await h.service.send({ ...request(), repeatConfirmed: true }), { results: [{ id: 1, mail: 'sent', whatsapp: 'queued', code: CODE }] })
    assert.equal(h.calls.filter(c => c.url === '/media').length, 2)
  } finally { await h.cleanup() }
})

test('şablonsuz tür render edilmez; büyük ek mail gönderilmez', async () => {
  const missing = await harness({ registrations: { 1: { ...reg(), certificateType: 'achievement' } } })
  try {
    assert.deepEqual(await missing.service.send(request()), { results: [{ id: 1, mail: 'skipped', whatsapp: 'skipped', error: 'Şablon yok' }] })
    assert.equal(missing.renders, 0)
    assert.deepEqual(missing.calls, [])
  } finally { await missing.cleanup() }
  const huge = await harness({ pdf: Buffer.alloc(3 * 1024 * 1024) })
  try {
    const result = await huge.service.send({ ...request(), whatsappTemplateId: null })
    assert.deepEqual(result, { results: [{ id: 1, mail: 'failed', whatsapp: 'skipped', code: CODE, error: 'Ek çok büyük' }] })
    assert.equal(huge.calls.some(c => c.url === '/worker/send-email'), false)
    assert.deepEqual(await huge.service.history.read(), [])
  } finally { await huge.cleanup() }
})

test('iki kanal başarısızsa geçmişe gönderildi yazılmaz', async () => {
  const h = await harness({ registrations: { 1: { ...reg(), phone: 'invalid' } } })
  try {
    const result = await h.service.send(request())
    assert.equal(result.results[0].mail, 'sent')
    assert.equal(result.results[0].whatsapp, 'failed')
  } finally { await h.cleanup() }
  const failed = await harness({ registrations: { 1: { ...reg(), phone: 'invalid' } }, pdf: Buffer.alloc(3 * 1024 * 1024) })
  try {
    const result = await failed.service.send(request())
    assert.deepEqual([result.results[0].mail, result.results[0].whatsapp], ['failed', 'failed'])
    assert.deepEqual(await failed.service.history.read(), [])
    assert.equal(failed.calls.some(c => c.url === '/worker/send-email' || c.url === '/wa-queue'), false)
  } finally { await failed.cleanup() }
})

test('R2/CMS yüklemesi başarısızsa mail ve WhatsApp gönderilmez', async () => {
  const h = await harness({ failUpload: true })
  try {
    const result = await h.service.send(request())
    assert.deepEqual(result, { results: [{ id: 1, mail: 'skipped', whatsapp: 'skipped', error: 'Sertifika üretilemedi veya yüklenemedi' }] })
    assert.equal(h.calls.some(c => c.url === '/worker/send-email' || c.url === '/wa-queue'), false)
    assert.deepEqual(await h.service.history.read(), [])
  } finally { await h.cleanup() }
})

test('onaylanmamış (accepted olmayan) kayda sertifika gönderilmez', async () => {
  const h = await harness({ registrations: { 1: { ...reg(), status: 'pending' } } })
  try {
    await assert.rejects(h.service.send(request()), { status: 409 })
    assert.equal(h.renders, 0)
  } finally { await h.cleanup() }
})

test('bilinmeyen değişken bütün gönderimi 400 ile durdurur', async () => {
  const h = await harness({ mailSubject: '{{olmayan}}' })
  try {
    await assert.rejects(h.service.send(request()), { status: 400 })
    assert.deepEqual(h.calls, [])
    assert.equal(h.renders, 0)
  } finally { await h.cleanup() }
})

test('eksiz mail isteğinin gövdesi değişmez', async () => {
  const calls: unknown[] = []
  const mail = new MailService({ request: async (_url: string, init: { body: unknown }) => {
    calls.push(init.body)
    return { data: { ok: true } }
  } } as never, 0, 0)
  await mail.sendPaced('test@example.invalid', 'Konu', '<p>Metin</p>')
  assert.deepEqual(calls, [{ to: 'test@example.invalid', subject: 'Konu', html: '<p>Metin</p>' }])
})

test('eşzamanlı ikinci gönderim 409', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const h = await harness({ holdMail: gate })
  try {
    const first = h.service.send(request())
    await new Promise<void>(resolve => setImmediate(resolve))
    await assert.rejects(h.service.send(request()), { status: 409 })
    release()
    await first
  } finally { release(); await h.cleanup() }
})

test('bir toplu gönderimde tek renderer oturumu kullanılır', async () => {
  const h = await harness({ registrations: { 1: reg(), 2: reg(2) } })
  try {
    const result = await h.service.send({ ...request([1, 2]), whatsappTemplateId: null })
    assert.deepEqual(result.results.map(item => item.mail), ['sent', 'sent'])
    assert.equal(h.renders, 2)
    assert.equal(h.closes, 1)
  } finally { await h.cleanup() }
})

test('kişi bazında sonuç ve toplu özet CMS\'e bildirilir; mail bağlamla gider', async () => {
  const h = await harness({ registrations: { 1: reg(), 2: reg(2) } })
  try {
    await h.service.send(request([1, 2]))
    const results = h.reports.filter(r => r.kind === 'certificate_result')
    assert.equal(results.length, 2)
    assert.deepEqual({ ...results[1].data, code: undefined }, { name: 'Ada <Deneme>', code: undefined, eventTitle: 'Deneme Etkinliği', mail: 'sent', whatsapp: 'queued', error: undefined, index: 2, total: 2 })
    assert.deepEqual(h.reports.at(-1), { kind: 'certificate_batch', data: { eventTitle: 'Deneme Etkinliği', total: 2, mailSent: 2, mailFailed: 0, waQueued: 2, waFailed: 0, failed: 0 } })
    const meta = (h.calls.find(c => c.url === '/worker/send-email')!.body as { meta: unknown }).meta
    assert.deepEqual(meta, { purpose: 'certificate', recipientName: 'Ada <Deneme>', eventTitle: 'Deneme Etkinliği', batchIndex: 1, batchTotal: 2 })
  } finally { await h.cleanup() }
})

test('medya yüklemesi bağlantı hatasında bir kez yeniden denenir; kalıcı hata nedeniyle bildirilir', async () => {
  const once = await harness({ failUploadOnce: true })
  try {
    assert.deepEqual(await once.service.send(request()), { results: [{ id: 1, mail: 'sent', whatsapp: 'queued', code: CODE }] })
  } finally { await once.cleanup() }
  const always = await harness({ failUpload: true })
  try {
    await always.service.send(request())
    const failed = always.reports.find(r => r.kind === 'certificate_failed')
    assert.equal(failed?.data?.name, 'Ada <Deneme>')
    assert.match(String(failed?.data?.reason), /Yükleme başarısız/)
    assert.equal(always.calls.filter(c => c.url === '/media').length, 2)
  } finally { await always.cleanup() }
})

test('kişi başına seçilen tür kullanılır; listede olmayan kişiye tür verilemez', async () => {
  const h = await harness()
  try {
    await assert.rejects(h.service.send({ ...request(), types: { 2: 'achievement' } } as never), { status: 400 })
    await assert.rejects(h.service.send({ ...request(), types: { 1: 'bogus' } } as never), { status: 400 })
    // Başarı şablonu yüklenmediği için o kişi atlanır (katılım şablonu kullanılmaz)
    assert.deepEqual(await h.service.send({ ...request(), types: { 1: 'achievement' } }), { results: [{ id: 1, mail: 'skipped', whatsapp: 'skipped', error: 'Şablon yok' }] })
    await h.store.saveTemplate('achievement', { imageBase64: png.toString('base64'), layout: defaultLayout() })
    const sent = await h.service.send({ ...request(), types: { 1: 'achievement' } })
    assert.equal(sent.results[0].mail, 'sent')
    assert.ok(h.calls.some(c => c.url === '/certificates' && (c.body as { type: string }).type === 'achievement'))
  } finally { await h.cleanup() }
})
