import test from 'node:test'
import assert from 'node:assert/strict'
import type { EmailTemplate, WhatsAppTemplate } from '../shared/types.js'
import { applicationCounts, buildNotifyBody, notifyBlocker, repeatCount, selectVisible,
  visibleApplications, type ApplicationRow } from '../src/ui/applicationListModel.js'

const mail: EmailTemplate = { id: 7, name: 'Karar', purpose: 'member-decision', subject: 'Merhaba {{ad}}', html: '<p>{{adSoyad}}</p>' }
const whatsapp: WhatsAppTemplate = { id: 8, name: 'Karar', message: 'Merhaba {{ad}}' }
const members: ApplicationRow[] = [
  { id: 1, fullName: 'Ada Su', email: 'ada@example.invalid', phone: '+900000000001', status: 'approved', notified: {} },
  { id: 2, fullName: 'Bora Su', status: 'rejected', notified: {} },
  { id: 3, fullName: 'Cem Su', status: 'pending', notified: {} },
]
const core: ApplicationRow[] = [
  { id: 4, fullName: 'Deniz Su', status: 'accepted', notified: {} },
  { id: 5, fullName: 'Ece Su', status: 'rejected', notified: {} },
  { id: 6, fullName: 'Deniz Su', status: 'interview', notified: {} },
]

test('iki türde sayaç ve sekme süzme; tümünü seç yalnız görünen satırları etkiler', () => {
  for (const [rows, kind, acceptedId] of [[members, 'members', 1], [core, 'core-team', 4]] as const) {
    assert.deepEqual(applicationCounts(rows, kind), { all: 3, accepted: 1, rejected: 1 })
    assert.deepEqual(visibleApplications(rows, kind, 'accepted').map((row) => row.id), [acceptedId])
    assert.equal(visibleApplications(rows, kind, 'rejected').length, 1)
  }
  const visible = visibleApplications(members, 'members', 'accepted')
  assert.deepEqual(selectVisible([2], visible, true), [2, 1])
  assert.deepEqual(selectVisible([2, 1], visible, false), [2])
})

test('Tümü, uyumsuz durum ve şablonsuz gönderim kapalıdır', () => {
  assert.match(notifyBlocker(members, [1], 'members', 'all', mail) || '', /Kabul veya Red/)
  assert.match(notifyBlocker(members, [1, 2], 'members', 'accepted', mail) || '', /durumu/)
  assert.match(notifyBlocker(members, [1], 'members', 'accepted') || '', /şablon/)
  assert.equal(notifyBlocker(members, [1], 'members', 'accepted', mail), null)
  assert.equal(buildNotifyBody(members, [1], 'members', 'all', mail, undefined, false), null)
})

test('gövde karar, tür ve seçili sayısını taşır; tekrar onayı yalnız işaretlenince gönderilir', () => {
  const rows = [{ ...members[0], notified: { accepted: '2026-09-30T10:00:00.000Z' } },
    { ...members[0], id: 9, notified: { accepted: '2026-09-30T11:00:00.000Z' } }, members[1]]
  assert.equal(repeatCount(rows, 'accepted'), 2)
  const body = buildNotifyBody(rows, [1, 9], 'members', 'accepted', mail, whatsapp, false)
  assert.deepEqual(body, { kind: 'members', ids: [1, 9], decision: 'accepted', confirmed: true,
    confirmCount: 2, mailTemplateId: 7, whatsappTemplateId: 8 })
  assert.deepEqual(buildNotifyBody(rows, [1, 9], 'members', 'accepted', mail, whatsapp, true),
    { ...body, repeatConfirmed: true })
  assert.deepEqual(buildNotifyBody(core, [5], 'core-team', 'rejected', mail, undefined, false),
    { kind: 'core-team', ids: [5], decision: 'rejected', confirmed: true, confirmCount: 1, mailTemplateId: 7 })
})

test('bilinmeyen değişken seçili herhangi bir kişide gönderimi kapatır', () => {
  const unknown = { ...mail, subject: 'Merhaba {{olmayan}}' }
  assert.match(notifyBlocker(members, [1], 'members', 'accepted', unknown) || '', /Bilinmeyen/)
  assert.equal(buildNotifyBody(members, [1], 'members', 'accepted', unknown, undefined, false), null)
})
