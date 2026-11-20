import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkCronAuth, safeEqual } from '../../src/lib/cronAuth'

const { performBackupAndSend } = vi.hoisted(() => ({
  performBackupAndSend: vi.fn<() => Promise<boolean>>(),
}))
vi.mock('@/lib/backup', () => ({ performBackupAndSend }))

import { GET } from '../../src/app/api/cron/backup/route'

const originalSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  vi.restoreAllMocks()
  performBackupAndSend.mockReset()
})

describe('cron kimlik doğrulaması', () => {
  it('yalnız boş olmayan eşit stringleri sabit zamanlı özetlerle karşılaştırır', () => {
    expect(safeEqual('aynı', 'aynı')).toBe(true)
    for (const [a, b] of [
      ['aynı', 'farklı'], ['secret', 'secre'], ['secret', 'secretx'],
      ['', ''], [undefined, 'secret'], [null, 'secret'], [42, 'secret'],
    ] as [unknown, unknown][]) expect(safeEqual(a, b)).toBe(false)
  })

  it('sır yoksa doğru görünen başlıklara da 503 döner', () => {
    for (const secret of [undefined, '', '   ']) {
      for (const header of ['Bearer ', 'Bearer undefined']) {
        expect(checkCronAuth(header, secret)).toBe(503)
      }
    }
  })

  it('eksik veya farklı başlıkları reddeder', () => {
    for (const header of [
      null, '', 'test-cron-secret', 'bearer test-cron-secret',
      'Bearer test-cron-secre', 'Bearer test-cron-secretx',
      'Bearer  test-cron-secret',
    ]) expect(checkCronAuth(header, 'test-cron-secret')).toBe(401)
  })

  it('tam Vercel cron başlığını kabul eder', () => {
    expect(checkCronAuth('Bearer test-cron-secret', 'test-cron-secret')).toBe(200)
  })
})

describe('cron yedekleme rotası', () => {
  const request = (authorization?: string) => new Request('http://localhost/api/cron/backup', {
    headers: authorization === undefined ? {} : { authorization },
  })

  it('sır yoksa yedeği başlatmaz', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(request('Bearer test-cron-secret'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Yapılandırma eksik' })
    expect(performBackupAndSend).not.toHaveBeenCalled()
  })

  it('yanlış başlıkla yedeği başlatmaz', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const response = await GET(request('Bearer wrong'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(performBackupAndSend).not.toHaveBeenCalled()
  })

  it('doğru başlıkla yedeği başlatır ve başarı yanıtını korur', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    performBackupAndSend.mockResolvedValueOnce(true)
    const response = await GET(request('Bearer test-cron-secret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, message: 'Backup sent to Telegram' })
    expect(performBackupAndSend).toHaveBeenCalledTimes(1)
  })

  it('başarısız yedeği iç ayrıntı olmadan bildirir', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    performBackupAndSend.mockResolvedValueOnce(false)
    const response = await GET(request('Bearer test-cron-secret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Backup failed' })
  })

  it('fırlatılan hatayı yanıta sızdırmaz', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    performBackupAndSend.mockRejectedValueOnce(new Error('gizli hata ayrıntısı'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET(request('Bearer test-cron-secret'))
    expect(response.status).toBe(500)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ error: 'Backup failed' })
    expect(body).not.toContain('gizli hata ayrıntısı')
  })
})

it('tek seferlik rotalar kaldırılmış, cron rotası korunmuştur', () => {
  const appPath = resolve(process.cwd(), 'src/app')
  for (const route of [
    'api/force-migrate/route.ts', 'api/init-settings/route.ts',
    'api/migrate/route.ts', 'my-route/route.ts',
  ]) expect(existsSync(resolve(appPath, route))).toBe(false)
  expect(existsSync(resolve(appPath, 'api/cron/backup/route.ts'))).toBe(true)
})
