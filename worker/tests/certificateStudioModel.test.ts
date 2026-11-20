import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultLayout } from '../shared/certificateLayout.js'
import { buildSendRequest, canSelectRecipient, moveCertificateBox, selectRecipients, sendBlockReason,
  type CertificateRecipient, type SendState } from '../src/ui/certificateStudioModel.js'

const row = (id: number, overrides: Partial<CertificateRecipient> = {}): CertificateRecipient => ({
  id, fullName: `Örnek ${id}`, email: '', phone: '', certificateType: 'participation', certificateId: `TST-${id}`,
  hasEmail: true, hasPhone: false, hasToken: true, sentAt: null, ...overrides,
})
const state = (overrides: Partial<SendState> = {}): SendState => ({
  eventId: 1, rows: [row(1)], ids: [1], templates: [{ type: 'participation', hasImage: true, layout: defaultLayout(), updatedAt: null }],
  mailTemplateId: 2, includeTest: false, repeatConfirmed: false, confirmStep: 'open', sending: false, ...overrides,
})

test('yalnız kanalı olan alıcı seçilir; tümünü seç mevcut seçimi korur', () => {
  const rows = [row(1), row(2, { hasEmail: false, hasPhone: true }), row(3, { hasEmail: false, hasPhone: false })]
  assert.equal(canSelectRecipient(rows[2]), false)
  assert.deepEqual(selectRecipients([9], rows, true), [9, 1, 2])
  assert.deepEqual(selectRecipients([9, 1, 2], rows, false), [9])
})

test('gönderim engelleri', () => {
  assert.match(sendBlockReason(state({ ids: [] }))!, /alıcı/)
  assert.match(sendBlockReason(state({ templates: [] }))!, /şablon/)
  assert.match(sendBlockReason(state({ mailTemplateId: undefined }))!, /kanal/)
  assert.match(sendBlockReason(state({ rows: [row(1, { sentAt: '2026-01-01T00:00:00Z' })] }))!, /Tekrar/)
  assert.match(sendBlockReason(state({ sending: true }))!, /sürüyor/)
  assert.equal(sendBlockReason(state()), null)
})

test('istek yalnız açık modalda ve geçerli onayla kurulur', () => {
  assert.equal(buildSendRequest(state({ confirmStep: 'closed' })), null)
  assert.equal(buildSendRequest(state({ rows: [row(1, { sentAt: '2026-01-01T00:00:00Z' })] })), null)
  assert.deepEqual(buildSendRequest(state()), { eventId: 1, ids: [1], confirmed: true, confirmCount: 1, mailTemplateId: 2 })
  assert.deepEqual(buildSendRequest(state({ repeatConfirmed: true, includeTest: true, whatsappTemplateId: 3 })),
    { eventId: 1, ids: [1], confirmed: true, confirmCount: 1, mailTemplateId: 2, whatsappTemplateId: 3, repeatConfirmed: true, includeTest: true })
})

test('sürükleme pikseli yüzdeye çevirir ve kutuyu görüntü içinde tutar', () => {
  const layout = defaultLayout()
  const moved = moveCertificateBox(layout, 'name', 100, -50, 1000, 500)
  assert.equal(moved.name.x, 25)
  assert.equal(moved.name.y, 35)
  const outside = moveCertificateBox(layout, 'name', 10000, 10000, 1000, 500)
  assert.equal(outside.name.x + outside.name.w, 100)
  assert.equal(outside.name.y + outside.name.h, 100)
  const negative = moveCertificateBox(layout, 'id', -10000, -10000, 1000, 500)
  assert.equal(negative.id.x, 0)
  assert.equal(negative.id.y, 0)
})

test('tutamaçla boyutlandırma sahne içinde kalır; yazı boyutu sunucuyla aynı hesaplanır', async () => {
  const { resizeCertificateBox } = await import('../src/ui/certificateStudioModel')
  const { defaultLayout, fittedFontSize } = await import('../shared/certificateLayout.js')
  const layout = defaultLayout()
  const grown = resizeCertificateBox(layout, 'name', 1000, 1000, 1000, 1000)
  assert.equal(grown.name.w, 100 - layout.name.x)
  assert.equal(grown.name.h, 100 - layout.name.y)
  const shrunk = resizeCertificateBox(layout, 'name', -5000, -5000, 1000, 1000)
  assert.deepEqual([shrunk.name.w, shrunk.name.h], [2, 2])
  const halved = resizeCertificateBox(layout, 'name', -350, -40, 1000, 1000)
  assert.equal(halved.name.fontSize, layout.name.fontSize / 2)
  assert.equal(fittedFontSize({ fontSize: 48, w: 70 }, 'Ada', 1600), 48)
  assert.ok(fittedFontSize({ fontSize: 48, w: 10 }, 'Çok Uzun Bir Ad Soyad Örneği', 1600) < 48)
})

test('sertifika şablonunda dolmayan değişkenler bulunur', async () => {
  const { unknownCertificateVariables } = await import('../src/ui/certificateStudioModel')
  assert.deepEqual(unknownCertificateVariables('Merhaba {{adSoyad}} {{ biletLinki }} {{sertifikaLinki}} {{masa}}'), ['biletLinki', 'masa'])
})
