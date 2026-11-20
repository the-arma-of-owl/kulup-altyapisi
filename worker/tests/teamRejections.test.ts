import test from 'node:test'
import assert from 'node:assert/strict'
import { TeamRejectionsService } from '../server/teamRejections.js'
import { PayloadClient, PayloadError } from '../server/payload.js'
import { TemplatesService } from '../server/templates.js'
import { MailService } from '../server/mail.js'
import { recipientCount, teamRejectionBlocker, teamRejectionValues, type TeamRejectionRequest } from '../shared/teamRejections.js'

function harness() {
  const teams: Array<Record<string, unknown>> = [
    { id: 1, name: 'Kod Kartalları', status: 'rejected', event: 5, adminNote: 'Proje fikri kapsam dışı', rejectionMailSentAt: null },
    { id: 2, name: 'Bit Avcıları', status: 'rejected', event: 5, adminNote: '', rejectionMailSentAt: '2026-10-16T08:00:00.000Z' },
    { id: 3, name: 'Seçilenler', status: 'accepted', event: 5 },
  ]
  const registrations = [
    { id: 50, event: 5, email: 'Deniz@example.invalid', phone: '05320000000', ticketToken: 'abcdef0000000789', status: 'accepted' },
    { id: 51, event: 5, email: 'eda@example.invalid', phone: '', ticketToken: 'fedcba9876543210', status: 'pending' },
  ]
  const queued: Array<Record<string, unknown>> = []
  const attachmentsSeen: unknown[] = []
  const memberships = [
    { id: 10, team: 1, participant: 100, role: 'captain', status: 'accepted' },
    { id: 11, team: 1, participant: 101, role: 'member', status: 'accepted' },
    { id: 12, team: 1, participant: 102, role: 'member', status: 'left' },
    { id: 13, team: 2, participant: 103, role: 'captain', status: 'accepted' },
    { id: 14, team: 3, participant: 104, role: 'captain', status: 'accepted' },
    { id: 15, team: 3, participant: 105, role: 'member', status: 'accepted' },
  ]
  const participants = [
    { id: 100, fullName: 'Ada <b>Su</b>', email: 'ada@example.invalid' },
    { id: 101, fullName: 'Bora Su', email: 'bora@example.invalid' },
    { id: 102, fullName: 'Ayrılan Kişi', email: 'ayrilan@example.invalid' },
    { id: 103, fullName: 'Cem Su', email: 'cem@example.invalid' },
    { id: 104, fullName: 'Deniz Test', email: 'deniz@example.invalid' },
    { id: 105, fullName: 'Eda Test', email: 'eda@example.invalid' },
  ]
  const calls: Array<{ route: string; method: string; body?: unknown }> = []
  const sent: Array<{ to: string; subject: string; html: string }> = []
  let html = '<p>{{adSoyad}} — {{takim}} / {{etkinlik}} · {{yoneticiNotu}}</p>'
  const params = (route: string) => new URLSearchParams(route.split('?')[1] ?? '')
  const payload = { request: async (route: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ route, method: options?.method ?? 'GET', body: options?.body })
    if (route.startsWith('/events/5')) return { data: { id: 5, title: 'Kulüp Hackathon', date: '2026-11-01T07:00:00.000Z', location: 'Örnek Kongre Merkezi' } }
    if (route.startsWith('/email-templates/')) return { data: { subject: 'Başvurun hakkında, {{ad}}', html } }
    if (route.startsWith('/whatsapp-templates/')) return { data: { id: 9, name: 'WA', message: 'Hoş geldin {{ad}}, {{takim}} kabul edildi: {{biletLinki}}' } }
    if (route === '/wa-queue' && options?.method === 'POST') { queued.push(options.body as Record<string, unknown>); return { data: { doc: { id: queued.length } } } }
    if (route.startsWith('/event-registrations?')) return { data: { docs: registrations, hasNextPage: false } }
    if (/^\/teams\/\d+$/.test(route) && options?.method === 'PATCH') {
      const team = teams.find((t) => t.id === Number(route.split('/')[2]))!
      Object.assign(team, options.body)
      return { data: { doc: team } }
    }
    const q = params(route)
    if (route.startsWith('/teams?')) {
      return { data: { docs: teams.filter((t) => t.status === q.get('where[status][equals]') && String(t.event) === q.get('where[event][equals]')), hasNextPage: false } }
    }
    if (route.startsWith('/team-memberships?')) {
      const ids = (q.get('where[team][in]') ?? '').split(',').map(Number)
      return { data: { docs: memberships.filter((m) => ids.includes(m.team) && m.status === q.get('where[status][equals]')), hasNextPage: false } }
    }
    if (route.startsWith('/participants?')) {
      const ids = (q.get('where[id][in]') ?? '').split(',').map(Number)
      return { data: { docs: participants.filter((p) => ids.includes(p.id)), hasNextPage: false } }
    }
    throw new Error(route)
  } } as PayloadClient
  const mail = { sendPaced: async (to: string, subject: string, mailHtml: string, attachments?: unknown) => {
    attachmentsSeen.push(attachments)
    if (to.startsWith('bora')) throw new Error('Test kilidi: e-posta adresi izin listesinde değil')
    sent.push({ to, subject, html: mailHtml })
  } } as MailService
  const service = new TeamRejectionsService(payload, new TemplatesService(payload), mail)
  const input: TeamRejectionRequest = { eventId: 5, teamIds: [1], mailTemplateId: 7, confirmed: true, confirmCount: 2 }
  return { service, input, teams, calls, sent, queued, registrations, attachmentsSeen, setHtml: (value: string) => { html = value } }
}
const status = (code: number) => (error: unknown) => error instanceof PayloadError && error.status === code

test('yalnız reddedilen takımlar ve kabul edilmiş üyeleri listelenir (ayrılan üye alıcı değil)', async () => {
  const h = harness()
  const list = await h.service.list(5)
  assert.equal(list.event.title, 'Kulüp Hackathon')
  assert.deepEqual(list.teams.map((t) => t.id), [1, 2])
  assert.deepEqual(list.teams[0].recipients.map((r) => [r.email, r.role]), [['ada@example.invalid', 'captain'], ['bora@example.invalid', 'member']])
  assert.equal(list.teams[1].mailSentAt, '2026-10-16T08:00:00.000Z')
  await assert.rejects(h.service.list(0), status(400))
})

test('ret maili üyelere gider, HTML kaçışlı; başarılı takım CMS\'te işaretlenir', async () => {
  const h = harness()
  const { results } = await h.service.send(h.input)
  assert.equal(h.sent.length, 1) // bora test kilidine takıldı → başarısız sayılır
  assert.equal(h.sent[0].to, 'ada@example.invalid')
  assert.equal(h.sent[0].subject, 'Başvurun hakkında, Ada')
  assert.match(h.sent[0].html, /Ada &lt;b&gt;Su&lt;\/b&gt; — Kod Kartalları \/ Kulüp Hackathon · Proje fikri kapsam dışı/)
  assert.deepEqual({ ...results[0], markedAt: Boolean(results[0].markedAt) }, { teamId: 1, teamName: 'Kod Kartalları', sent: 1, failed: 1, skipped: 0, markedAt: true })
  const patch = h.calls.find((c) => c.method === 'PATCH')!
  assert.equal(patch.route, '/teams/1')
  assert.ok((patch.body as { rejectionMailSentAt: string }).rejectionMailSentAt)
  // İşaretli takıma ikinci gönderim ayrı onay ister
  await assert.rejects(h.service.send(h.input), status(409))
  await h.service.send({ ...h.input, repeatConfirmed: true })
  assert.equal(h.sent.length, 2)
})

test('geçersiz istek, sayı uyuşmazlığı, reddedilmemiş takım ve bilinmeyen değişken gönderim başlatmaz', async () => {
  const h = harness()
  for (const invalid of [{ confirmed: false }, { teamIds: [] }, { teamIds: [1, 1] }, { mailTemplateId: 0 }, { eventId: -1 }]) {
    await assert.rejects(h.service.send({ ...h.input, ...invalid } as TeamRejectionRequest), status(400))
  }
  await assert.rejects(h.service.send({ ...h.input, confirmCount: 5 }), status(409))
  await assert.rejects(h.service.send({ ...h.input, teamIds: [3] }), status(409)) // kabul edilmiş takıma ret gitmez
  h.setHtml('{{bilinmeyen}}')
  await assert.rejects(h.service.send(h.input), status(400))
  assert.equal(h.sent.length, 0)
  assert.equal(h.calls.filter((c) => c.method === 'PATCH').length, 0)
})

test('arayüz kuralları: şablon, alıcı ve değişken denetimi', () => {
  const team = { id: 1, name: 'T', adminNote: '', mailSentAt: null, recipients: [{ participantId: 1, name: 'Ada Su', email: 'a@x.invalid', role: 'captain' as const }] }
  const empty = { ...team, id: 2, recipients: [{ participantId: 2, name: 'B', email: '', role: 'captain' as const }] }
  const template = { subject: 'Merhaba {{ad}}', html: '{{takim}}' }
  assert.equal(teamRejectionBlocker([], 'E', template), 'En az bir reddedilen takım seçin.')
  assert.equal(teamRejectionBlocker([team], 'E', undefined), 'Mail şablonu seçin.')
  assert.equal(teamRejectionBlocker([empty], 'E', template), 'Seçili takımlarda e-postası olan üye yok.')
  assert.equal(teamRejectionBlocker([team], 'E', { subject: '{{x}}', html: '' }), 'Bilinmeyen değişkenleri düzeltin.')
  assert.equal(teamRejectionBlocker([team, empty], 'E', template), null)
  assert.equal(recipientCount([team, empty]), 1)
  assert.deepEqual(teamRejectionValues(team, team.recipients[0], 'E'), { adSoyad: 'Ada Su', ad: 'Ada', takim: 'T', etkinlik: 'E', yoneticiNotu: '',
    biletLinki: '', tarih: '', saat: '', konum: '', konumLinki: '' })
  // Şablon bilet linki istiyorsa bileti olmayan üye gönderimi durdurur
  assert.match(teamRejectionBlocker([team], 'E', { subject: 'x', html: '{{biletLinki}}' }, 'accepted') ?? '', /Bileti olmayan üye/)
  const ticketed = { ...team, recipients: [{ ...team.recipients[0], ticketToken: 'abcdef0000000789', registrationStatus: 'accepted' }] }
  assert.equal(teamRejectionBlocker([ticketed], 'E', { subject: 'x', html: '{{biletLinki}}' }, 'accepted'), null)
  assert.equal(teamRejectionBlocker([ticketed], 'E', template, 'accepted', { message: '{{yok}}' }), 'WhatsApp şablonunda bilinmeyen değişken var.')
})

test('kabul maili: yalnız kabul edilen takım listelenir, işaret acceptanceMailSentAt alanına yazılır', async () => {
  const h = harness()
  const list = await h.service.list(5, 'accepted')
  assert.equal(list.decision, 'accepted')
  assert.deepEqual(list.teams.map((t) => t.id), [3])
  await assert.rejects(h.service.send({ ...h.input, decision: 'accepted' }), status(409)) // reddedilen takıma kabul gitmez
  await assert.rejects(h.service.send({ ...h.input, decision: 'onay' } as unknown as TeamRejectionRequest), status(400))
})

test('kabul + bilet: üyelerin kayıtları e-postayla eşleşir; bilet linki, QR eki ve WhatsApp kuyruğu', async () => {
  const h = harness()
  const list = await h.service.list(5, 'accepted')
  const [deniz, eda] = list.teams[0].recipients
  assert.deepEqual([deniz.phone, deniz.ticketToken, deniz.registrationStatus], ['05320000000', 'abcdef0000000789', 'accepted'])
  assert.equal(eda.registrationStatus, 'pending')
  h.setHtml('<p>{{adSoyad}} · {{takim}} · {{tarih}} · <a href="{{biletLinki}}">{{biletLinki}}</a></p>')
  const input: TeamRejectionRequest = { eventId: 5, decision: 'accepted', teamIds: [3], mailTemplateId: 7, whatsappTemplateId: 9, confirmed: true, confirmCount: 2 }
  // Eda'nın kaydı henüz kabul edilmemiş → bilet yok → gönderim başlamaz
  await assert.rejects(h.service.send(input), status(409))
  assert.equal(h.sent.length, 0)
  h.registrations[1].status = 'accepted'
  const { results } = await h.service.send(input)
  assert.equal(h.sent.length, 2)
  assert.match(h.sent[0].html, /\/ticket\/abcdef0000000789/)
  assert.match(h.sent[0].html, /1 Kasım 2026/)
  const attachment = (h.attachmentsSeen[0] as Array<{ filename: string; contentType: string }>)[0]
  assert.deepEqual([attachment.filename, attachment.contentType], ['bilet-qr.png', 'image/png'])
  // WhatsApp yalnız telefonu olana, karar kaynağıyla (QR görseli kuyruğu işlerken eklenir)
  assert.equal(h.queued.length, 1)
  assert.equal(h.queued[0].to, '05320000000')
  assert.equal(h.queued[0].source, 'decision')
  assert.match(String(h.queued[0].message), /Hoş geldin Deniz, Seçilenler kabul edildi: .*\/ticket\/abcdef0000000789/)
  assert.equal(results[0].whatsapp, 1)
  assert.ok(h.teams[2].acceptanceMailSentAt)
})
