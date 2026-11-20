import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Recipient, SendHistoryRun } from '../shared/types.js'
import { availableVariables, buildSendBody, channelCounts, failedCount, previewFor, retryBody } from '../src/ui/freeSendModel.js'

const people: Recipient[] = [
  { id: 'members:1', name: '<b>Ayşe</b> Yılmaz', email: 'test@example.invalid', isTest: true, variables: { bolum: 'Yazılım' } },
  { id: 'members:2', name: 'Deniz', phone: '+900000000001', isTest: false, variables: { bolum: 'Tasarım' } },
]
const state = { recipients: people, selectedIds: ['members:1'], channels: { mail: true, whatsapp: false },
  label: ' Duyuru ', allowTest: false, subject: 'Merhaba {{ad}}', html: '<p>{{ad}}</p>', message: '',
  target: { source: { kind: 'members' as const } } }

test('kanal sayıları yalnız iletişim bilgisi olanları sayar', () => {
  assert.deepEqual(channelCounts(people, { mail: true, whatsapp: true }), { total: 2, mail: 1, whatsapp: 1 })
})
test('değişkenler sıralı ve tekrarsızdır', () => {
  assert.deepEqual(availableVariables(people), ['ad', 'adSoyad', 'bolum'])
})
test('önizleme HTML değerini kaçırır ve bilinmeyeni bildirir', () => {
  const result = previewFor(people[0], '{{ad}}', '<p>{{ad}} {{yok}}</p>', '')
  assert.match(result.html, /&lt;b&gt;Ayşe&lt;\/b&gt;/)
  assert.equal(result.hasUnknown, true)
})
test('gövde seçili kişi sayısını ve test iznini taşır', () => {
  const body = buildSendBody(state)
  assert.ok(!('error' in body))
  assert.equal(body.confirmCount, 1)
  assert.equal(body.allowTest, false)
  assert.equal(body.label, 'Duyuru')
})
test('eksik kanal, etiket, alıcı ve içerik reddedilir', () => {
  for (const change of [{ channels: {} }, { label: '' }, { selectedIds: [] }, { subject: '' }, { html: '' }]) {
    assert.ok('error' in buildSendBody({ ...state, ...change }))
  }
  assert.ok('error' in buildSendBody({ ...state, channels: { whatsapp: true }, message: '' }))
})
test('dosyada seçilen satırlar ve onay sayısı eşleşir', () => {
  const recipients: Recipient[] = [
    { ...people[0], id: 'file:2' }, { ...people[1], id: 'file:3' },
  ]
  const target = { file: { text: 'name,email\nAda,test@example.invalid\nBora,bora@example.invalid', format: 'csv' as const } }
  const body = buildSendBody({ ...state, recipients, selectedIds: ['file:3'], target })
  assert.ok(!('error' in body)); assert.equal(body.confirmCount, 1)
  assert.deepEqual(body.target, { ...target, rows: [3] })
  assert.ok('error' in buildSendBody({ ...state, recipients, selectedIds: [], target }))
  assert.ok('error' in buildSendBody({ ...state, recipients: [{ ...people[0], id: 'file:x' }], selectedIds: ['file:x'], target }))
})
test('başarısızlar için yeniden gönderim yalnız başarısız sayısını onaylar', () => {
  const run: SendHistoryRun = { id: 'run-1', label: 'Duyuru', createdAt: '2026-01-01', recipients: [
    { ...people[0], status: 'failed' }, { ...people[1], status: 'sent' },
  ] }
  assert.equal(failedCount(run), 1)
  const body = retryBody(run, undefined, { mail: true }, { subject: 'Konu', html: '<p>Metin</p>', message: '' })
  assert.ok(!('error' in body)); assert.equal(body.confirmCount, 1)
  assert.deepEqual(body.target, { retryRunId: 'run-1' })
})
test('karışık liste: geçmiş durumları atılır, tekrar eklenmez, elle kişi doğrulanır', async () => {
  const { mergeRecipients, manualRecipient, historyRecipients } = await import('../src/ui/freeSendModel.js')
  const merged = mergeRecipients([people[0]], [people[0], people[1]])
  assert.deepEqual(merged.list.map((item) => item.id), ['members:1', 'members:2'])
  assert.deepEqual(merged.added.map((item) => item.id), ['members:2'])
  assert.deepEqual(manualRecipient('Ada', '0532 000 00 07', 'manual:1'), { id: 'manual:1', name: 'Ada', phone: '905320000007', isTest: false, variables: {} })
  assert.equal((manualRecipient('Ada', 'ADA@Example.invalid', 'manual:2') as Recipient).email, 'ada@example.invalid')
  assert.ok('error' in manualRecipient('', 'x@y.z', 'manual:3') && 'error' in manualRecipient('Ada', '123', 'manual:4'))
  const run: SendHistoryRun = { id: 'r1', createdAt: '', label: 'L', recipients: [
    { ...people[0], status: 'sent', mail: 'sent' }, { ...people[1], status: 'failed', whatsapp: 'failed', error: 'x' }] }
  assert.deepEqual(historyRecipients(run, true).map((item) => item.id), ['members:2'])
  assert.ok(!('status' in historyRecipients(run, false)[0]))
  const body = buildSendBody({ ...state, recipients: historyRecipients(run, false), selectedIds: ['members:1'], target: { list: true } })
  assert.ok(!('error' in body))
  assert.deepEqual(body.target, { list: [{ id: 'members:1', name: people[0].name, email: people[0].email, phone: undefined, isTest: true, variables: people[0].variables }] })
})
