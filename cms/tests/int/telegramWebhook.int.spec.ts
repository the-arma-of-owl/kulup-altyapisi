import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkWebhookAuth, isRestorableCollection, isRestorableDoc, RESTORE_COLLECTIONS } from '../../src/lib/telegramWebhook'

const mocks = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(), downloadTelegramFile: vi.fn(), performBackupAndSend: vi.fn(),
  getPayload: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), sendResendEmail: vi.fn(),
  isTelegramAdmin: vi.fn(), telegramSend: vi.fn(),
}))
vi.mock('@/lib/telegram', () => ({
  TELEGRAM_CHAT_ID: '-1000000000001',
  sendTelegramMessage: mocks.sendTelegramMessage,
  downloadTelegramFile: mocks.downloadTelegramFile,
  isTelegramAdmin: mocks.isTelegramAdmin,
  telegramSend: mocks.telegramSend,
}))
vi.mock('@/lib/backup', () => ({ performBackupAndSend: mocks.performBackupAndSend }))
vi.mock('payload', () => ({ getPayload: mocks.getPayload }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('../../src/lib/resend', () => ({ sendResendEmail: mocks.sendResendEmail }))

import { POST } from '../../src/app/api/telegram/webhook/route'
import { sendAutoReply, autoReplyPurposes } from '../../src/lib/autoReply'

const secret = 'test-webhook-secret'
const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET
const originalResendKey = process.env.RESEND_API_KEY

function request(body: unknown, header: string | null = secret): Request {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: header === null ? {} : { 'x-telegram-bot-api-secret-token': header },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function message(text: string, id = '-1000000000001') {
  return { message: { chat: { id }, text } }
}

function restoreRequest() {
  return request({ message: {
    chat: { id: '-1000000000001' }, from: { id: 42 }, caption: '/restore',
    document: { file_id: 'fake-file', file_name: 'yedek.json' },
  } })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Beklenmeyen fetch çağrısı') }))
  process.env.TELEGRAM_WEBHOOK_SECRET = secret
  mocks.getPayload.mockResolvedValue({ find: mocks.find, create: mocks.create, update: mocks.update })
  mocks.find.mockResolvedValue({ docs: [] })
  mocks.performBackupAndSend.mockResolvedValue(true)
  mocks.downloadTelegramFile.mockResolvedValue(Buffer.from('{}'))
  mocks.isTelegramAdmin.mockResolvedValue(true)
  mocks.telegramSend.mockResolvedValue({ ok: true, status: 200 })
})

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET
  else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalResendKey
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('saf webhook doğrulaması', () => {
  it('sır yoksa 503, yanlış başlıkta 401, tam başlıkta 200 verir', () => {
    for (const missing of [undefined, '', '   ']) {
      expect(checkWebhookAuth(secret, missing)).toBe(503)
    }
    for (const header of [null, '', 'test-webhook-secre', 'test-webhook-secretx', 'Test-webhook-secret']) {
      expect(checkWebhookAuth(header, secret)).toBe(401)
    }
    expect(checkWebhookAuth(secret, secret)).toBe(200)
  })

  it('yalnız 13 koleksiyon slug değerini kabul eder', () => {
    expect(RESTORE_COLLECTIONS).toHaveLength(13)
    for (const slug of RESTORE_COLLECTIONS) expect(isRestorableCollection(slug)).toBe(true)
    for (const slug of ['users', 'media', 'email-templates', 'wa-queue', 'payload-preferences',
      'globals', '__proto__', 'constructor', 'Users', 'users ', '', 42, null]) {
      expect(isRestorableCollection(slug)).toBe(false)
    }
  })

  it('yalnız düz nesne ve geçerli kimliği kabul eder', () => {
    for (const doc of [{ id: 1 }, { id: 'abc' }]) expect(isRestorableDoc(doc)).toBe(true)
    for (const doc of [null, [], 'x', {}, { id: {} }, { id: NaN }, { id: '' }, { id: 'x'.repeat(65) }]) {
      expect(isRestorableDoc(doc)).toBe(false)
    }
  })
})

describe('webhook rotası', () => {
  it('sır yoksa gövdeyi veya dış işlemleri açmaz', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const response = await POST(request('{'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Yapılandırma eksik' })
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
    expect(mocks.performBackupAndSend).not.toHaveBeenCalled()
    expect(mocks.getPayload).not.toHaveBeenCalled()
  })

  it.each([null, 'wrong'])('eksik veya yanlış başlıkta işlem yapmaz (%s)', async (header) => {
    const response = await POST(request(message('/yedekle'), header))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
    expect(mocks.performBackupAndSend).not.toHaveBeenCalled()
    expect(mocks.getPayload).not.toHaveBeenCalled()
  })

  it('geçerli ping ve yedekleme akışlarını korur', async () => {
    const ping = await POST(request(message('/ping')))
    expect(ping.status).toBe(200)
    expect(await ping.json()).toEqual({ ok: true })
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage.mock.calls[0][0]).toContain('Pong')
    mocks.sendTelegramMessage.mockClear()
    const backup = await POST(request(message('/yedekle')))
    expect(backup.status).toBe(200)
    expect(await backup.json()).toEqual({ ok: true })
    expect(mocks.performBackupAndSend).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(2)
  })

  it('yanlış sohbet kimliğinde işlem yapmaz', async () => {
    const response = await POST(request(message('/yedekle', '0')))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
    expect(mocks.performBackupAndSend).not.toHaveBeenCalled()
    expect(mocks.getPayload).not.toHaveBeenCalled()
  })

  it('yalnız izinli belgeleri oluşturur ve atlananları bildirir', async () => {
    const data = {
      users: [{ id: 1, email: 'test@example.invalid', roles: ['admin'] }],
      globals: { 'site-settings': {} },
      events: [{ id: 7, title: 'Deneme' }],
      'event-registrations': [{ id: 9, fullName: 'Deneme Kişi', email: 'test@example.invalid' }, 'bozuk'],
    }
    mocks.downloadTelegramFile.mockResolvedValue(Buffer.from(JSON.stringify(data)))
    const response = await POST(restoreRequest())
    expect(response.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.find).toHaveBeenCalledTimes(2)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.create.mock.calls.map(([arg]) => arg.collection)).toEqual(['events', 'event-registrations'])
    for (const call of [...mocks.find.mock.calls, ...mocks.create.mock.calls]) {
      expect(call[0].context).toEqual({ restore: true })
      expect(call[0].collection).not.toBe('users')
    }
    const report = mocks.sendTelegramMessage.mock.calls.at(-1)?.[0] as string
    expect(report).toContain('<b>events</b>: 1 Eklendi')
    expect(report).toContain('<b>event-registrations</b>: 1 Eklendi, 0 Güncellendi, 1 Hata')
    expect(report).toContain('Atlanan: users, globals')
  })

  it('var olan kayıtları günceller', async () => {
    mocks.downloadTelegramFile.mockResolvedValue(Buffer.from(JSON.stringify({ events: [{ id: 7 }] })))
    mocks.find.mockResolvedValue({ docs: [{ id: 7 }] })
    await POST(restoreRequest())
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ collection: 'events', id: 7, context: { restore: true } })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each(['[1,2]', 'null'])('düz nesne olmayan yedeği reddeder (%s)', async (data) => {
    mocks.downloadTelegramFile.mockResolvedValue(Buffer.from(data))
    const response = await POST(restoreRequest())
    expect(response.status).toBe(200)
    expect(mocks.getPayload).not.toHaveBeenCalled()
    expect(mocks.sendTelegramMessage.mock.calls.at(-1)?.[0]).toContain('geçerli bir JSON')
  })

  it('geri yükleme ve acil kilit yalnız grup yöneticisine açıktır', async () => {
    mocks.isTelegramAdmin.mockResolvedValue(false)
    for (const req of [restoreRequest(), request({ message: { chat: { id: '-1000000000001' }, from: { id: 5 }, text: '/panik' } })]) {
      const response = await POST(req)
      expect(response.status).toBe(200)
      expect(mocks.sendTelegramMessage.mock.calls.at(-1)?.[0]).toContain('yalnız grup yöneticileri')
    }
    expect(mocks.downloadTelegramFile).not.toHaveBeenCalled()
    expect(mocks.getPayload).not.toHaveBeenCalled()
  })

  it('yönetici /panik ile acil kilidi açar, /panik kapat ile kapatır; yanıt konuya gider', async () => {
    const { getPanic } = await import('../../src/lib/obs/security')
    const panic = (text: string) => POST(request({ message: { chat: { id: '-1000000000001' }, from: { id: 42, username: 'yonetici' }, message_thread_id: 9, text } }))
    expect((await panic('/panik şüpheli giriş')).status).toBe(200)
    expect((await getPanic(null, true)).active).toBe(true)
    expect(mocks.telegramSend.mock.calls.at(-1)?.[0]).toContain('ACİL KİLİT AÇILDI')
    await panic('/panik kapat')
    expect((await getPanic(null, true)).active).toBe(false)
    await POST(request({ message: { chat: { id: '-1000000000001' }, from: { id: 42 }, message_thread_id: 9, text: '/durum' } }))
    expect(mocks.sendTelegramMessage.mock.calls.at(-1)).toEqual([expect.stringContaining('Acil kilit: kapalı'), { threadId: 9 }])
  })

  it('bozuk istek gövdesini 400 ile reddeder', async () => {
    const response = await POST(request('{'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Bad request' })
  })

  it('iç hata ayrıntısını yanıta sızdırmaz', async () => {
    mocks.getPayload.mockRejectedValue(new Error('gizli ayrıntı'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await POST(restoreRequest())
    expect(response.status).toBe(500)
    const body = await response.text()
    expect(body).not.toContain('gizli ayrıntı')
    expect(JSON.parse(body)).toEqual({ error: 'Webhook failed' })
  })
})

describe('otomatik cevap', () => {
  it('geri yüklemede sorgu ve mail yapmaz, normal kayıtta mail gönderir', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    const req = {
      context: { restore: true },
      payload: { find: mocks.find, logger: { error: vi.fn() } },
    }
    await sendAutoReply(req as never, autoReplyPurposes.member,
      { email: 'test@example.invalid', fullName: 'Deneme Kişi' })
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.sendResendEmail).not.toHaveBeenCalled()

    mocks.find.mockResolvedValue({ docs: [{
      subject: 'Merhaba {{ad}}', html: '<p>{{adSoyad}}</p>', relatedEvent: null,
    }] })
    await sendAutoReply({ ...req, context: {} } as never, autoReplyPurposes.member,
      { email: 'test@example.invalid', fullName: 'Deneme Kişi' })
    expect(mocks.sendResendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendResendEmail.mock.calls[0][0]).toMatchObject({ to: 'test@example.invalid' })
  })
})
