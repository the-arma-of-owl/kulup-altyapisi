import { afterEach, describe, expect, it } from 'vitest'
import { browserFromUA, createRateLimiter, deviceFromUA, isBotRequest, normalizeRef, parseBatch, sanitizePath } from '../../src/lib/analytics/collect'
import { daySalt, visitorHashes } from '../../src/lib/analytics/hash'
import { fillDays, parseRange } from '../../src/lib/analytics/queries'
import { POST } from '../../src/app/api/analytics/collect/route'
import { KULUP } from '../../src/lib/kulup'

const SITE_ORIGIN = new URL(KULUP.adresler.site).origin
const SITE_HOST = new URL(KULUP.adresler.site).host

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const SAFARI_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const FIREFOX_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

describe('analytics: normalleştirme', () => {
  it('ref: küçük harf, Türkçe sadeleşir, geçersiz karakter atılır', () => {
    expect(normalizeRef('Mekatronik')).toBe('mekatronik')
    expect(normalizeRef('Bilgisayar Müh. 1. Sınıf')).toBe('bilgisayar-muh-1-sinif')
    expect(normalizeRef('İnsta_Hikâye')).toBe('insta_hikye')
    expect(normalizeRef('<script>')).toBe('script')
    expect(normalizeRef('!!!')).toBeNull()
    expect(normalizeRef(42)).toBeNull()
    expect(normalizeRef('a'.repeat(80))).toHaveLength(40)
  })

  it('path: sorgu atılır, jeton/kod maskelenir, dış adres reddedilir', () => {
    expect(sanitizePath('/etkinlikler/hackathon?mekatronik')).toBe('/etkinlikler/hackathon')
    expect(sanitizePath('/ticket/0123456789abcdef')).toBe('/ticket/[jeton]')
    expect(sanitizePath('/sertifika/KOD-ABC-123')).toBe('/sertifika/[kod]')
    expect(sanitizePath('/tr/blog/')).toBe('/blog')
    expect(sanitizePath('/')).toBe('/')
    expect(sanitizePath('//evil.com/x')).toBeNull()
    expect(sanitizePath('https://evil.com')).toBeNull()
  })

  it('cihaz ve tarayıcı ailesi', () => {
    expect(deviceFromUA(CHROME_ANDROID)).toBe('mobile')
    expect(deviceFromUA(SAFARI_IPAD)).toBe('tablet')
    expect(deviceFromUA(FIREFOX_DESKTOP)).toBe('desktop')
    expect(browserFromUA(CHROME_ANDROID)).toBe('chrome')
    expect(browserFromUA(SAFARI_IPAD)).toBe('safari')
    expect(browserFromUA(FIREFOX_DESKTOP)).toBe('firefox')
  })

  it('botlar ve ön yüklemeler elenir', () => {
    expect(isBotRequest('Googlebot/2.1 (+http://www.google.com/bot.html)', new Headers())).toBe(true)
    expect(isBotRequest('WhatsApp/2.23.20.0 A', new Headers())).toBe(true)
    expect(isBotRequest(CHROME_ANDROID, new Headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true)
    expect(isBotRequest('', new Headers())).toBe(true)
    expect(isBotRequest(CHROME_ANDROID, new Headers())).toBe(false)
  })
})

describe('analytics: gövde ayrıştırma', () => {
  it('geçerli olayları alır, tanımsız tür ve alanları atar', () => {
    const batch = parseBatch({
      ref: 'Mekatronik', r: 'https://l.instagram.com/?u=x', sid: 'abc12345def',
      e: [
        { t: 'pageview', p: '/etkinlikler/x?ref=mekatronik' },
        { t: 'event_view', p: '/etkinlikler/x', et: 'event', ei: 7 },
        { t: 'form_submit', p: '/etkinlikler/x', et: 'event', ei: 7, m: { form: 'event', email: 'a'.repeat(200), 'bad key': 1 } },
        { t: 'hack', p: '/' },
        { t: 'pageview', p: 'javascript:alert(1)' },
        { t: 'event_view', p: '/x', et: 'user', ei: 3 },
      ],
    }, [SITE_HOST])
    expect(batch).not.toBeNull()
    expect(batch!.ref).toBe('mekatronik')
    expect(batch!.referrerHost).toBe('l.instagram.com')
    expect(batch!.sid).toBe('abc12345def')
    expect(batch!.events.map((e) => e.type)).toEqual(['pageview', 'event_view', 'form_submit', 'event_view'])
    expect(batch!.events[1]).toMatchObject({ entityType: 'event', entityId: 7 })
    expect(batch!.events[2].meta).toEqual({ form: 'event', email: 'a'.repeat(80) })
    expect(batch!.events[3]).toMatchObject({ entityType: null, entityId: null })
  })

  it('site içi yönlendiren ve geçersiz gövde', () => {
    expect(parseBatch({ r: `${SITE_ORIGIN}/blog`, e: [{ t: 'pageview', p: '/' }] }, [SITE_HOST])!.referrerHost).toBeNull()
    expect(parseBatch({ e: [] }, [])).toBeNull()
    expect(parseBatch([], [])).toBeNull()
    expect(parseBatch({ e: Array.from({ length: 100 }, () => ({ t: 'pageview', p: '/' })) }, [])!.events).toHaveLength(30)
  })
})

describe('analytics: günlük tuz ve hash', () => {
  const original = process.env.ANALYTICS_SALT_SECRET
  afterEach(() => { if (original === undefined) delete process.env.ANALYTICS_SALT_SECRET; else process.env.ANALYTICS_SALT_SECRET = original })

  it('aynı gün aynı hash, ertesi gün farklı; ham IP hash içinde yok', () => {
    process.env.ANALYTICS_SALT_SECRET = 'test-secret'
    const day1 = daySalt(new Date('2026-10-15T10:00:00Z'))!
    const a = visitorHashes(day1, '85.105.1.2', CHROME_ANDROID, 'abc12345')
    const b = visitorHashes(day1, '85.105.1.2', CHROME_ANDROID, 'zzz12345')
    expect(a.visitor).toBe(b.visitor)
    expect(a.session).not.toBe(b.session)
    const day2 = daySalt(new Date('2026-10-16T10:00:00Z'))!
    expect(visitorHashes(day2, '85.105.1.2', CHROME_ANDROID, null).visitor).not.toBe(a.visitor)
    expect(a.visitor).not.toContain('85.105')
    expect(a.visitor).toHaveLength(22)
  })
})

describe('analytics: hız sınırı ve tarih aralığı', () => {
  it('pencere içinde sınırı aşınca reddeder', () => {
    let time = 0
    const allow = createRateLimiter(2, 1000, () => time)
    expect([allow('ip'), allow('ip'), allow('ip'), allow('other')]).toEqual([true, true, false, true])
    time = 1000
    expect(allow('ip')).toBe(true)
  })

  it('aralık düzeltilir ve boş günler doldurulur', () => {
    expect(parseRange({ from: '2026-10-10', to: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-10' })
    const days = fillDays({ from: '2026-10-30', to: '2026-11-02' }, [{ day: '2026-10-31', pageviews: 5, visitors: 2 }])
    expect(days.map((d) => d.day)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(days[1].pageviews).toBe(5)
  })
})

describe('analytics: toplama uç noktası', () => {
  const post = (headers: Record<string, string>, body = '{"e":[{"t":"pageview","p":"/"}]}') =>
    POST(new Request(`${KULUP.adresler.cms}/api/analytics/collect`, { method: 'POST', headers: { 'content-type': 'text/plain', ...headers }, body }))

  it('yabancı origin 403, site origin 204 (DB yoksa sessiz)', async () => {
    expect((await post({ origin: 'https://evil.example', 'user-agent': CHROME_ANDROID })).status).toBe(403)
    expect((await post({ 'user-agent': CHROME_ANDROID })).status).toBe(403)
    const ok = await post({ origin: SITE_ORIGIN, 'user-agent': CHROME_ANDROID })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE_ORIGIN)
  })

  it('büyük gövde 413, bozuk JSON 400', async () => {
    const headers = { origin: SITE_ORIGIN, 'user-agent': CHROME_ANDROID, 'x-real-ip': '10.0.0.9' }
    expect((await post(headers, 'x'.repeat(9000))).status).toBe(413)
    expect((await post(headers, '{bozuk')).status).toBe(400)
  })
})
