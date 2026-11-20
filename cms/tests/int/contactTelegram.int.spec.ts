import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '@/payload.config'

// İletişim formu siteden gelir (req.user yok); genel log yalnız panel işlemlerini bildirdiği için mesajlar Telegram'a düşmüyordu
describe('iletişim mesajı Telegram bildirimi', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  const hooksOf = async () => {
    const collection = (await config).collections.find((c) => c.slug === 'contact-messages')!
    return collection.hooks!.afterChange!
  }

  it('siteden gelen yeni mesaj gruba gönderilir; panel işlemi ve güncelleme gönderilmez', async () => {
    vi.stubEnv('TELEGRAM_DRY_RUN', '1')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const doc = { id: 7, fullName: 'Ada <Test>', email: 'ada@example.invalid', subject: 'Soru', message: 'Merhaba' }
    const req = { headers: new Headers(), context: {} }
    for (const hook of await hooksOf()) await (hook as any)({ doc, operation: 'create', req, collection: {}, context: {} })
    const sent = log.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('[Telegram DRY-RUN]'))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('[applications')
    expect(sent[0]).toContain('Yeni İletişim Mesajı')
    expect(sent[0]).toContain('Ada &lt;Test&gt;')
    expect(sent[0]).toContain('Merhaba')

    log.mockClear()
    for (const hook of await hooksOf()) await (hook as any)({ doc, operation: 'update', req: { ...req, user: { email: 'a@b.invalid' } }, collection: {}, context: {} })
    for (const hook of await hooksOf()) await (hook as any)({ doc, operation: 'create', req: { ...req, user: { email: 'a@b.invalid' } }, collection: {}, context: {} })
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[Telegram DRY-RUN]'))).toHaveLength(0)
  })
})
