import { describe, expect, it } from 'vitest'

// İsteğe bağlı: yerel/geçici bir Postgres'e cms/sql/000_kurulum.sql uygulanmışken
//   ANALYTICS_TEST_DATABASE_URL=postgres://... npx vitest run tests/int/analyticsPg.int.spec.ts
// Canlı veritabanında ÇALIŞTIRMA (tabloyu boşaltır).
const url = process.env.ANALYTICS_TEST_DATABASE_URL

describe.skipIf(!url)('analytics: Postgres uçtan uca', () => {
  it('beacon yazar, panel sorguları huni ve kaynakları doğru sayar', async () => {
    process.env.DATABASE_URL = url
    process.env.ANALYTICS_SALT_SECRET = 'test-secret'
    const { POST } = await import('../../src/app/api/analytics/collect/route')
    const { KULUP } = await import('../../src/lib/kulup')
    const { analyticsPool } = await import('../../src/lib/analytics/db')
    const { overview, eventSummary, parseRange } = await import('../../src/lib/analytics/queries')
    const pool = (await analyticsPool())!
    await pool.query('TRUNCATE analytics_events')

    const send = (ip: string, ua: string, body: unknown) => POST(new Request('https://cms/api/analytics/collect', {
      method: 'POST', body: JSON.stringify(body),
      headers: { origin: new URL(KULUP.adresler.site).origin, 'user-agent': ua, 'x-real-ip': ip, 'content-type': 'text/plain' },
    }))
    const phone = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
    const desktop = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

    // 1) mekatronik grubundan gelen telefon: görüntüler, formu açar, başlar, gönderir
    expect((await send('1.1.1.1', phone, { ref: 'Mekatronik', sid: 'aaaaaaaa1', e: [
      { t: 'pageview', p: '/etkinlikler/hack?mekatronik' }, { t: 'event_view', p: '/etkinlikler/hack', et: 'event', ei: 5 },
      { t: 'form_open', p: '/etkinlikler/hack', et: 'event', ei: 5, m: { form: 'event' } },
      { t: 'form_start', p: '/etkinlikler/hack', et: 'event', ei: 5, m: { form: 'event' } },
    ] })).status).toBe(204)
    await send('1.1.1.1', phone, { ref: 'mekatronik', sid: 'aaaaaaaa1', e: [{ t: 'form_submit', p: '/etkinlikler/hack', et: 'event', ei: 5, m: { form: 'event' } }] })
    // 2) instagram'dan masaüstü: yalnız görüntüler, robot'a soru sorar
    await send('2.2.2.2', desktop, { r: 'https://l.instagram.com/x', sid: 'bbbbbbbb2', e: [
      { t: 'pageview', p: '/etkinlikler/hack' }, { t: 'event_view', p: '/etkinlikler/hack', et: 'event', ei: 5 }, { t: 'robot_question', p: '/etkinlikler/hack' },
    ] })
    // 3) bot sayılmaz
    await send('3.3.3.3', 'Googlebot/2.1 (+http://www.google.com/bot.html)', { e: [{ t: 'pageview', p: '/' }] })

    const { rows } = await pool.query('SELECT visitor_hash, device, ref, referrer_host, meta FROM analytics_events ORDER BY id')
    expect(rows).toHaveLength(8)
    expect(JSON.stringify(rows)).not.toContain('1.1.1.1')
    expect(rows[0]).toMatchObject({ device: 'mobile', ref: 'mekatronik', meta: { browser: 'chrome' } })

    const range = parseRange({})
    const data = await overview(pool, range)
    expect(data.totals).toMatchObject({ pageviews: 2, visitors: 2, sessions: 2, submits: 1, robot: 1 })
    expect(data.funnel[0]).toMatchObject({ entityId: 5, views: 2, visitors: 2, opens: 1, starts: 1, submits: 1 })
    expect(data.refs).toEqual([{ ref: 'mekatronik', visitors: 1, pageviews: 1, submits: 1, ctas: 0 }])
    expect(data.referrers).toEqual([{ key: 'l.instagram.com', visitors: 1 }])
    expect(data.pages[0]).toMatchObject({ path: '/etkinlikler/hack', views: 2 })
    expect(data.forms[0]).toMatchObject({ form: 'event', opens: 1, starts: 1, submits: 1 })
    expect(data.daily.at(-1)).toMatchObject({ pageviews: 2, visitors: 2 })

    const event = await eventSummary(pool, range, 5)
    expect(event.funnel).toMatchObject({ views: 2, visitors: 2, submits: 1 })
    expect(event.refs[0]).toMatchObject({ ref: 'mekatronik', visitors: 1, submits: 1 })
    await pool.end()
  })
})
