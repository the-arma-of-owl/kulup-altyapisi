import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Telegram'a asla gerçek istek gitmez: gönderim taklit edilir, mesajlar burada toplanır.
const sent = vi.hoisted(() => ({ messages: [] as Array<{ text: string; topic?: string }>, result: { ok: true, status: 200 } as any }))
vi.mock('../../src/lib/telegram', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/telegram')>()
  return {
    ...original,
    telegramSend: vi.fn(async (text: string, options: { topic?: string } = {}) => {
      sent.messages.push({ text, topic: options.topic })
      return sent.result
    }),
  }
})

import { MemoryObsStore, PgObsStore, setObsStoreForTests, type SqlRunner } from '../../src/lib/obs/store'
import { flushOutbox, logEvent, packMessages } from '../../src/lib/obs/notify'
import { describeMailFailure, sendObservedEmail } from '../../src/lib/obs/mailLog'
import { MailError } from '../../src/lib/resend'
import { parseMailMeta } from '../../src/lib/sendWorkerEmail'
import { formatWorkerEvent } from '../../src/lib/obs/workerEvents'
import { describeDevice, getClientIp, requestClient } from '../../src/lib/obs/clientIp'
import { handleIngest } from '../../src/lib/obs/ingest'
import { wrapTotpEndpoint } from '../../src/lib/obs/plugin'
import { getPanic, setPanic } from '../../src/lib/obs/security'
import { parseListPage, measureR2Usage } from '../../src/lib/obs/r2Usage'
import { hashIp, maskEmail } from '../../src/lib/obs/privacy'
import { buildDailyReport, trDayBounds } from '../../src/lib/obs/dailyReport'

let store: MemoryObsStore
beforeEach(() => {
  sent.messages.length = 0
  sent.result = { ok: true, status: 200 }
  store = new MemoryObsStore()
  setObsStoreForTests(store)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Beklenmeyen fetch çağrısı') }))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  setObsStoreForTests(null)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('istemci IP ve cihaz', () => {
  it('x-forwarded-for ilk öğesine güvenmez, Cloudflare kenarından gelirse cf-connecting-ip kullanır', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '85.1.2.3' }))).toBe('85.1.2.3')
    expect(getClientIp(new Headers({ 'x-real-ip': '172.70.1.1', 'cf-connecting-ip': '85.9.9.9' }))).toBe('85.9.9.9')
    expect(getClientIp(new Headers({ 'x-real-ip': '85.1.2.3', 'cf-connecting-ip': '1.1.1.1' }))).toBe('85.1.2.3')
  })

  it('site başlığını (x-byt-client-ip) yalnız iç anahtarla kabul eder', () => {
    vi.stubEnv('INTERNAL_API_KEY', 'ic-anahtar')
    const forged = new Headers({ 'x-real-ip': '10.0.0.1', 'x-byt-client-ip': '9.9.9.9' })
    expect(requestClient(forged).ip).toBe('10.0.0.1')
    const site = new Headers({ 'x-real-ip': '10.0.0.1', 'x-byt-client-ip': '9.9.9.9', 'x-byt-client-ua': 'Mozilla/5.0 (iPhone)', 'x-internal-api-key': 'ic-anahtar' })
    expect(requestClient(site)).toMatchObject({ ip: '9.9.9.9', viaSite: true })
    const bad = new Headers({ 'x-real-ip': '10.0.0.1', 'x-byt-client-ip': 'drop table', 'x-internal-api-key': 'ic-anahtar' })
    expect(requestClient(bad).ip).toBe('10.0.0.1')
  })

  it('cihazı özetler', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36')).toBe('Mobil · Android · Chrome')
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Masaüstü · Windows · Firefox')
    expect(describeDevice('undici')).toBe('Worker / sunucu')
    expect(describeDevice('curl/8.5.0')).toContain('Otomatik araç')
  })
})

describe('bildirim kutusu', () => {
  it('veritabanı yokken olayı doğrudan, doğru konuya gönderir ve kaydeder', async () => {
    await logEvent(null, { kind: 'wa_sent', category: 'whatsapp', text: '💬 test' })
    expect(sent.messages).toEqual([{ text: '💬 test', topic: 'sends' }])
    expect(store.events[0]).toMatchObject({ kind: 'wa_sent', notify: false })
  })

  it('tekilleştirme anahtarı süresince ikinci uyarıyı göndermez ama kaydeder', async () => {
    for (let i = 0; i < 3; i++) await logEvent(null, { kind: 'resend_quota', category: 'mail', topic: 'errors', text: 'kota', dedupe: { key: 'k', seconds: 60 } })
    expect(sent.messages).toHaveLength(1)
    expect(store.events).toHaveLength(3)
  })

  it('birleştirmede 3900 karakteri aşmaz ve her olayı ayrı satır tutar', () => {
    const one = packMessages(['tek'])
    expect(one).toEqual({ text: 'tek', count: 1 })
    const many = packMessages(Array.from({ length: 50 }, (_, i) => `📧 Mail gönderildi → Kişi ${i} ${'x'.repeat(150)}`))
    expect(many.text.length).toBeLessThanOrEqual(3900)
    expect(many.count).toBeGreaterThan(1)
    expect(many.count).toBeLessThan(50)
    expect(many.text).toContain(`${many.count} bildirim birleştirildi`)
  })
})

describe('mail hata nedenleri', () => {
  it('Resend hatasını nedeniyle açıklar', () => {
    expect(describeMailFailure(new MailError('x', 502, { status: 429, code: 'daily_quota_exceeded' }))).toEqual({
      reason: 'Resend 429: günlük gönderim kotası doldu (daily_quota_exceeded)', quota: 'daily' })
    expect(describeMailFailure(new MailError('x', 502, { status: 429, code: 'rate_limit_exceeded' })).quota).toBe('rate')
    expect(describeMailFailure(new MailError('x', 502, { status: 422, code: 'validation_error', message: 'Invalid `to` field' })).reason)
      .toContain('422: alıcı adresi veya içerik geçersiz')
    expect(describeMailFailure(new MailError('x', 502, { network: true, code: 'timeout' })).reason).toContain('zaman aşımı')
    expect(describeMailFailure(new MailError('x', 503, { code: 'missing_api_key' })).reason).toContain('RESEND_API_KEY')
  })

  it('kota dolunca kişi bazında hata + son başarılı alıcı ve kalan kuyrukla tek uyarı üretir', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++
      if (call === 1) return Response.json({ id: 'ok-1' }, { headers: { 'x-resend-daily-quota': '99' } })
      return Response.json({ statusCode: 429, name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }, { status: 429 })
    }))
    const ctx = (i: number, name: string) => ({ purpose: 'free-send' as const, recipientName: name, batch: { index: i, total: 40, label: 'Ekim duyurusu' } })
    await sendObservedEmail(null, { to: 'ayse@example.invalid', subject: 'k', html: '<p>x</p>' }, ctx(12, 'Ayşe Yılmaz'))
    await expect(sendObservedEmail(null, { to: 'mehmet@example.invalid', subject: 'k', html: '<p>x</p>' }, ctx(13, 'Mehmet Demir'))).rejects.toBeInstanceOf(MailError)
    await expect(sendObservedEmail(null, { to: 'zeynep@example.invalid', subject: 'k', html: '<p>x</p>' }, ctx(14, 'Zeynep Kaya'))).rejects.toBeInstanceOf(MailError)
    const texts = sent.messages.map((m) => m.text)
    expect(texts[0]).toContain('Mail gönderildi')
    expect(texts[0]).toContain('Ayşe Yılmaz (ay***@example.invalid)')
    expect(texts[0]).toContain('Resend bugün: 1/100')
    expect(texts.filter((t) => t.includes('Mail gönderilemedi'))).toHaveLength(2)
    expect(texts[1]).toContain('Resend 429: günlük gönderim kotası doldu')
    const quota = sent.messages.filter((m) => m.text.includes('GÜNLÜK kotası doldu'))
    expect(quota).toHaveLength(1)
    expect(quota[0].topic).toBe('errors')
    expect(quota[0].text).toContain('Son başarılı gönderim: Ayşe Yılmaz (ay***@example.invalid)')
    expect(quota[0].text).toContain('Kuyrukta kalan: <b>28</b> kişi')
    expect(texts.join('\n')).not.toContain('mehmet@example.invalid')
  })

  it('worker meta bilgisini doğrular', () => {
    expect(parseMailMeta({ purpose: 'certificate', recipientName: 'Ali', batchIndex: 2, batchTotal: 5 }))
      .toMatchObject({ purpose: 'certificate', recipientName: 'Ali', batch: { index: 2, total: 5 }, silentSuccess: true })
    expect(parseMailMeta({ purpose: '__proto__', batchIndex: 9, batchTotal: 5 })).toMatchObject({ purpose: 'other', batch: undefined })
    expect(parseMailMeta('bozuk')).toMatchObject({ purpose: 'other' })
  })
})

describe('worker olayları', () => {
  it('sertifika sonucunu kişi ve nedenle yazar, bilinmeyen türü reddeder', () => {
    const event = formatWorkerEvent('certificate_result', { name: 'Ali <b>Veli</b>', code: 'KLP-2026-KTLM-X', mail: 'failed', whatsapp: 'queued', error: 'Resend 429', index: 3, total: 10 }, 'op@kulup')
    expect(event?.level).toBe('error')
    expect(event?.text).toContain('Ali &lt;b&gt;Veli&lt;/b&gt;')
    expect(event?.text).toContain('Mail: ❌ gitmedi')
    expect(event?.text).toContain('Neden:</b> Resend 429')
    expect(event?.text).toContain('Sıra: 3/10 (kalan 7)')
    expect(formatWorkerEvent('rm -rf', {}, 'x')).toBeNull()
    expect(formatWorkerEvent('wa_disconnected', { reason: 'Telefondan çıkış yapıldı.', willRetry: false }, 'op')?.text).toContain('Bağlan gerekli')
  })
})

describe('site olayları (ingest)', () => {
  it('bilinmeyen ve kaldırılmış olay türlerini reddeder', async () => {
    for (const type of ['bilinmeyen', 'robot_question', 'rate_check']) {
      expect((await handleIngest(null, { type, ip: '85.1.2.3' })).status).toBe(400)
    }
  })
})

describe('2FA (TOTP) koruması', () => {
  const endpoint = (ok: boolean) => ({ path: '/verify-totp', method: 'post' as const, handler: vi.fn(async () => Response.json({ ok })) })
  const req = (user = { id: 7, email: 'admin@byt.invalid' }) => ({ user, headers: new Headers({ 'x-real-ip': '85.1.2.3', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/129' }), payload: null }) as never

  it('başarılı doğrulamada giriş bildirimi atar', async () => {
    const wrapped = wrapTotpEndpoint(endpoint(true), 'verify')
    const res = await wrapped.handler(req())
    expect(await res.json()).toEqual({ ok: true })
    expect(sent.messages[0]).toMatchObject({ topic: 'security' })
    expect(sent.messages[0].text).toContain('Panele giriş yapıldı')
    expect(sent.messages[0].text).toContain('Masaüstü · Windows · Chrome')
  })

  it('5 hatalı koddan sonra kullanıcıyı kilitler; kilitliyken asıl uca hiç gitmez', async () => {
    const inner = endpoint(false)
    const wrapped = wrapTotpEndpoint(inner, 'verify')
    for (let i = 0; i < 5; i++) await wrapped.handler(req())
    expect(inner.handler).toHaveBeenCalledTimes(5)
    expect(sent.messages.at(-1)?.text).toContain('2FA 15 dk kilitlendi')
    const blocked = await wrapped.handler(req())
    expect(blocked.status).toBe(429)
    expect(inner.handler).toHaveBeenCalledTimes(5)
  })

  it('panik açıkken TOTP ucu 423 döner', async () => {
    await setPanic(null, true, 'test', 'deneme')
    expect((await getPanic(null, true)).active).toBe(true)
    const inner = endpoint(true)
    const res = await wrapTotpEndpoint(inner, 'verify').handler(req())
    expect(res.status).toBe(423)
    expect(inner.handler).not.toHaveBeenCalled()
    await setPanic(null, false, 'test')
  })
})

describe('R2 (salt okuma)', () => {
  it('liste sayfasını ayrıştırır', () => {
    const xml = `<ListBucketResult><Contents><Key>certificate-a.png</Key><Size>100</Size></Contents><Contents><Key>logo&amp;x.png</Key><Size>50</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>abc=</NextContinuationToken></ListBucketResult>`
    expect(parseListPage(xml)).toEqual({ items: [{ key: 'certificate-a.png', size: 100 }, { key: 'logo&x.png', size: 50 }], truncated: true, next: 'abc=' })
  })

  it('yalnız GET listeleme isteği atar ve sayfaları toplar', async () => {
    vi.stubEnv('R2_ACCESS_KEY_ID', 'AKID')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'SECRET')
    vi.stubEnv('R2_ENDPOINT', 'https://hesap-kimligi.r2.cloudflarestorage.com')
    vi.stubEnv('R2_BUCKET', 'kulup-medya')
    const pages = [
      `<r><Contents><Key>certificate-1.pdf</Key><Size>2000</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>t2</NextContinuationToken></r>`,
      `<r><Contents><Key>a.jpg</Key><Size>3000</Size></Contents><IsTruncated>false</IsTruncated></r>`,
    ]
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('GET')
      return new Response(pages.shift())
    })
    const usage = await measureR2Usage({ fetcher: fetcher as never })
    expect(usage).toMatchObject({ bytes: 5000, objects: 2, certificateObjects: 1, pages: 2 })
    expect(String(fetcher.mock.calls[1][0])).toContain('continuation-token=t2')
  })
})

describe('gün sınırları', () => {
  it('TR gününün başını UTC+3 ile hesaplar', () => {
    const { start, day } = trDayBounds(new Date('2026-10-15T20:30:00Z'))
    expect(day).toBe('2026-10-15')
    expect(start.toISOString()).toBe('2026-10-14T21:00:00.000Z')
  })
})

// ─── Gerçek Postgres (yerel geçici küme; OBS_TEST_DATABASE_URL yoksa atlanır) ────────────

const pgUrl = process.env.OBS_TEST_DATABASE_URL
describe.skipIf(!pgUrl)('Postgres deposu', () => {
  let pool: { query: SqlRunner['query']; end: () => Promise<void> }
  let pg: PgObsStore
  beforeAll(async () => {
    const { Pool } = await import('pg')
    pool = new Pool({ connectionString: pgUrl }) as never
    pg = new PgObsStore(pool)
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE obs.rate_limits, obs.blocks, obs.security_events, obs.events, obs.kv')
    setObsStoreForTests(pg)
  })
  afterAll(async () => { await pool?.end() })

  it('sayaç, engel ve anahtar-değer atomik çalışır', async () => {
    const counts = await Promise.all(Array.from({ length: 20 }, () => pg.hit('t', 'k', 600)))
    expect(Math.max(...counts)).toBe(20)
    expect(await pg.peek('t', 'k', 600)).toBe(20)
    expect(await pg.blockedUntil('login', 'k')).toBeNull()
    await pg.block('login', 'k', 60, 'deneme')
    expect(await pg.blockedUntil('login', 'k')).toBeInstanceOf(Date)
    expect(await pg.kvSetIfAbsent('d', 1, 60)).toBe(true)
    expect(await pg.kvSetIfAbsent('d', 1, 60)).toBe(false)
    expect(await Promise.all([pg.kvIncr('c', 60), pg.kvIncr('c', 60), pg.kvIncr('c', 60)])).toEqual(expect.arrayContaining([1, 2, 3]))
    await pg.kvSet('panic', { active: true })
    expect(await pg.kvGet('panic')).toEqual({ active: true })
    expect((await pg.claimSendSlot(3000)).ok).toBe(true)
    expect(await pg.claimSendSlot(3000)).toMatchObject({ ok: false })
    await pool.query(`UPDATE obs.security_events SET ts = now() - interval '8 days'`)
    expect(await pg.cleanup()).toMatchObject({ rateLimits: 0 })
  })

  it('kutu: biriken olayları konu bazında tek mesajda birleştirir, 429\'da geri bırakır', async () => {
    for (let i = 1; i <= 6; i++) await pg.recordEvent({ level: 'info', category: 'mail', kind: 'mail_sent', topic: 'sends', text: `📧 Kişi ${i}`, notify: true })
    await pg.recordEvent({ level: 'warn', category: 'security', kind: 'login_failed', topic: 'security', text: '⛔ giriş', notify: true })
    sent.result = { ok: false, status: 429, retryAfter: 1 }
    const failed = await flushOutbox(null, { store: pg, maxDurationMs: 100, sleep: async () => {} })
    expect(failed.sent).toBe(0)
    expect(await pg.pendingCount()).toBe(7)
    sent.result = { ok: true, status: 200 }
    sent.messages.length = 0
    await pool.query(`DELETE FROM obs.kv WHERE key = 'tg:slot'`)
    let clock = 0
    const result = await flushOutbox(null, { store: pg, maxDurationMs: 60_000, sleep: async () => { clock++; await pool.query(`UPDATE obs.kv SET value = '0'::jsonb WHERE key = 'tg:slot'`) } })
    expect(result.sent).toBe(7)
    expect(sent.messages).toHaveLength(2)
    expect(sent.messages[0].topic).toBe('sends')
    expect(sent.messages[0].text).toContain('6 bildirim birleştirildi')
    expect(sent.messages[0].text.indexOf('Kişi 1')).toBeLessThan(sent.messages[0].text.indexOf('Kişi 6'))
    expect(sent.messages[1]).toMatchObject({ topic: 'security', text: '⛔ giriş' })
    expect(clock).toBeGreaterThan(0)
    expect(await pg.pendingCount()).toBe(0)
  })

  it('gün sonu raporu analitik tablosu yokken o bölümü atlar, varken sayar', async () => {
    await pool.query('DROP TABLE IF EXISTS public.analytics_events')
    const payload = fakePayload(pool)
    let report = await buildDailyReport(payload as never, new Date())
    expect(report).not.toContain('Site trafiği')
    expect(report).toContain('Başvurular')
    expect(report).toContain('R2 depolama')
    await pool.query(`CREATE TABLE public.analytics_events (id bigserial, ts timestamptz default now(), type text, path text, entity_type text, entity_id text, ref text, visitor_hash text, session_hash text, device text, referrer_host text, meta jsonb)`)
    await pool.query(`INSERT INTO public.analytics_events (type, path, entity_type, entity_id, ref, visitor_hash, session_hash, device, referrer_host) VALUES
      ('pageview','/','page',null,'instagram','v1','s1','mobile','instagram.com'),
      ('pageview','/etkinlikler/x','event','5','instagram','v2','s2','desktop',null),
      ('event_view','/etkinlikler/x','event','5','instagram','v2','s2','desktop',null),
      ('form_open','/etkinlikler/x','event','5',null,'v2','s2','desktop',null),
      ('form_submit','/etkinlikler/x','event','5',null,'v2','s2','desktop',null)`)
    await pg.recordSecurity({ kind: 'login_failed', ipHash: 'h', ip: '85.1.2.3' })
    await pg.recordEvent({ level: 'info', category: 'mail', kind: 'mail_sent', topic: 'sends', text: 'x', data: { purpose: 'certificate' }, notify: false })
    // JS saati ms, Postgres µs çözünürlüklü: aralığın sonu son kaydın biraz sonrası olsun
    report = await buildDailyReport(payload as never, new Date(Date.now() + 1000))
    expect(report).toContain('2 sayfa görüntüleme')
    expect(report).toContain('instagram')
    expect(report).toContain('Deneme Etkinliği')
    expect(report).toContain('85.1.2.3')
    expect(report).toContain('Mail: <b>1</b> gönderildi')
    await pool.query('DROP TABLE public.analytics_events')
  })
})

function fakePayload(pool: unknown) {
  return {
    db: { pool },
    find: async ({ collection }: { collection: string }) => collection === 'events'
      ? { docs: [{ id: 5, title: 'Deneme Etkinliği' }] }
      : { docs: [{ event: 5, isTest: false }, { event: 5, isTest: false }] },
    count: async () => ({ totalDocs: 3 }),
  }
}

it('maskeler', () => {
  expect(maskEmail('ayse@example.invalid')).toBe('ay***@example.invalid')
})
