import assert from 'node:assert/strict'
import test from 'node:test'
import QRCode from 'qrcode'
import { CONFIG } from '../server/config.js'
import { isTicketToken, ticketQrMedia, ticketQrPng, ticketQrText, ticketTokenFromMessage } from '../server/tickets.js'
import { WhatsAppManager } from '../server/whatsapp.js'

const token = '0000000789abcdef'
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test('mesajdaki bilet bağlantısı yalnız yapılandırılmış kökenden ve tek token ile kabul edilir', () => {
  const siteUrl = 'https://ornek.test'
  const link = `${siteUrl}/ticket/${token}`
  assert.equal(ticketTokenFromMessage(`Biletin: ${link}`, siteUrl), token)
  for (const origin of ['https://kotu.test', 'https://x.ornek.test', 'http://ornek.test']) {
    assert.equal(ticketTokenFromMessage(`Biletin: ${origin}/ticket/${token}`, siteUrl), null)
  }
  assert.equal(ticketTokenFromMessage(`${link} ${siteUrl}/ticket/abcdef0000000789`, siteUrl), null)
  assert.equal(ticketTokenFromMessage(`${link} ${link}`, siteUrl), token)
  assert.equal(ticketTokenFromMessage(`${siteUrl}/ticket/WA-TEST-1`, siteUrl), null)
  assert.equal(ticketTokenFromMessage(`${siteUrl}/ticket/${'a'.repeat(128)}x`, siteUrl), null)
  assert.equal(ticketTokenFromMessage(`x.${link}`, siteUrl), null)
  assert.equal(ticketTokenFromMessage(null, siteUrl), null)
  assert.equal(ticketTokenFromMessage(42, siteUrl), null)
  assert.equal(ticketTokenFromMessage('https://ornxek.test/ticket/0000000789abcdef', 'https://orn.ek.test'), null)
  assert.equal(ticketTokenFromMessage('https://orn.ek.test/ticket/0000000789abcdef', 'https://orn.ek.test'), token)
})

test('bilet QR kodu geçerli PNG üretir ve yapılandırılmış bilet adresini kodlar', async () => {
  assert.equal(isTicketToken(token), true)
  const text = ticketQrText(token)
  assert.equal(text, CONFIG.ticketUrl(token))
  assert.deepEqual(QRCode.create(text).segments, QRCode.create(CONFIG.ticketUrl(token)).segments)
  const png = await ticketQrPng(token)
  const expected = await QRCode.toBuffer(CONFIG.ticketUrl(token), {
    type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M',
  })
  assert.deepEqual(png, expected)
  assert.ok(Buffer.isBuffer(png))
  assert.ok(png.length > pngSignature.length)
  assert.deepEqual(png.subarray(0, pngSignature.length), pngSignature)
})

test('geçersiz bilet kodu güvenli hata verir', async () => {
  for (const value of ['', 'kısa', '../../etc', 'a b', 'a'.repeat(129), 42, null]) {
    assert.equal(isTicketToken(value), false)
    await assert.rejects(() => ticketQrPng(value as string), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, 'Bilet kodu geçersiz.')
      if (String(value)) assert.ok(!error.message.includes(String(value)))
      return true
    })
  }
})

test('yerel QR medyası sabit dosya adı ve PNG verisi taşır', async () => {
  const media = await ticketQrMedia(token)
  assert.equal(media.mimetype, 'image/png')
  assert.equal(media.filename, 'bilet-qr.png')
  assert.ok(!media.filename.includes(token))
  assert.deepEqual(Buffer.from(media.data, 'base64').subarray(0, pngSignature.length), pngSignature)
})

test('WhatsApp yerel görseli indirmeden sahte istemciye iletir', async () => {
  const sent: Array<{ id: string; media: unknown; caption: string | undefined }> = []
  const manager = new WhatsAppManager('/tmp/kulup-ticket-test')
  Object.assign(manager, {
    client: {
      getNumberId: async () => ({ _serialized: 'fake' }),
      sendMessage: async (id: string, media: unknown, options?: { caption: string }) => {
        sent.push({ id, media, caption: options?.caption })
      },
    },
    current: { status: 'connected', message: 'Sahte bağlantı.' },
  })
  const mutableConfig = CONFIG as { isLiveCms: boolean; waAllowlist: readonly string[] }
  const previous = { isLiveCms: CONFIG.isLiveCms, waAllowlist: CONFIG.waAllowlist }
  mutableConfig.isLiveCms = false
  mutableConfig.waAllowlist = ['901000000001']
  try {
    await manager.send('+901000000001', 'Sahte bilet', await ticketQrMedia(token))
  } finally {
    mutableConfig.isLiveCms = previous.isLiveCms
    mutableConfig.waAllowlist = previous.waAllowlist
  }
  assert.equal(sent.length, 1)
  assert.equal(sent[0].id, 'fake')
  assert.equal(sent[0].caption, 'Sahte bilet')
  const media = sent[0].media as { mimetype: string; data: string; filename: string }
  assert.equal(media.mimetype, 'image/png')
  assert.equal(media.filename, 'bilet-qr.png')
  assert.deepEqual(Buffer.from(media.data, 'base64').subarray(0, pngSignature.length), pngSignature)
})
