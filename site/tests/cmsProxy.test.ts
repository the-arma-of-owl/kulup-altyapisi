import test from 'node:test'
import assert from 'node:assert/strict'
import { FORM_COLLECTIONS, buildGetQuery, handleCmsGet, handleFormPost, resolveFormCollection, resolveGetTarget, sanitizeFormBody } from '../src/lib/cmsProxy'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const person = { fullName: 'Test Kişi', email: 'test@example.invalid', phone: '+900000000001' }
const eventBody = { event: 12, ...person, department: 'Bilgisayar', kvkkApproved: true, privacyPolicyApproved: true,
  dynamicAnswers: [{ question: 'S', answer: 'C' }], status: 'pending', applicationStage: 'late' }

function harness(options: { cmsResponse?: Response; secret?: string; key?: string; rate?: boolean; failCms?: boolean; failTurnstile?: boolean } = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('siteverify')) return Response.json({ success: !options.failTurnstile })
    if (options.failCms) throw new Error('offline')
    return options.cmsResponse ?? Response.json({ doc: { ticketToken: 'secret' } }, { status: 201 })
  }
  const deps = { fetcher, cmsUrl: 'http://cms.invalid', internalKey: options.key === undefined ? 'internal-test-key' : options.key,
    turnstileSecret: options.secret, checkRateLimit: () => options.rate !== false }
  const post = (pathParts: unknown, body: unknown, overrides: Partial<{ contentLength: string; readJson: () => Promise<unknown>; turnstileToken: string | null }> = {}) =>
    handleFormPost({ pathParts, ip: '192.0.2.1', turnstileToken: overrides.turnstileToken ?? null,
      contentLength: overrides.contentLength ?? null, readJson: overrides.readJson ?? (async () => body) }, deps)
  const cmsCalls = () => calls.filter(call => call.url.startsWith('http://cms.invalid'))
  return { post, calls, cmsCalls }
}

test('yalnız dört tek segmentli form yolu kabul edilir', () => {
  for (const collection of FORM_COLLECTIONS) assert.equal(resolveFormCollection([collection]), collection)
  for (const path of [[], ['events'], ['globals', 'site-settings'], ['event-registrations', '5'],
    ['event-registrations', 'gate'], ['event-registrations/gate'], ['Event-Registrations'], ['..']]) {
    assert.equal(resolveFormCollection(path), null)
  }
})

test('yasak POST yolları Turnstile ve CMS isteği oluşturmaz', async () => {
  for (const path of [['events'], ['globals', 'site-settings'], ['event-registrations', '5'],
    ['event-registrations', 'gate'], ['blog-posts'], ['media'], ['members']]) {
    const h = harness({ secret: 'test-secret' })
    assert.equal((await h.post(path, eventBody)).status, 400)
    assert.equal(h.calls.length, 0)
  }
})

test('yönetici alanları ve prototip anahtarı CMS gövdesinden atılır', async () => {
  const h = harness()
  const body = { ...eventBody, status: 'accepted', attended: true, ticketToken: 'x', certificateType: 'achievement',
    isTest: true, notes: 'x', checkedInAt: 'today', gateFields: { x: 1 }, id: 3 }
  assert.equal((await h.post(['event-registrations'], body)).status, 201)
  const sent = JSON.parse(h.cmsCalls()[0].init?.body as string)
  assert.deepEqual(sent, { event: 12, ...person, department: 'Bilgisayar', kvkkApproved: true,
    privacyPolicyApproved: true, dynamicAnswers: [{ question: 'S', answer: 'C' }], applicationStage: 'late' })
  const parsed = JSON.parse('{"__proto__":{"status":"accepted"},"fullName":"Test Kişi","email":"test@example.invalid"}')
  const clean = sanitizeFormBody('contact-messages', parsed)
  assert.equal(clean.ok, true)
  if (clean.ok) assert.deepEqual(clean.body, { fullName: 'Test Kişi', email: 'test@example.invalid' })
  const second = harness()
  await second.post(['contact-messages'], parsed)
  assert.deepEqual(JSON.parse(second.cmsCalls()[0].init?.body as string),
    { fullName: 'Test Kişi', email: 'test@example.invalid' })
})

test('dört canlı form gövdesi ve sayısal/metinsel etkinlik kimliği geçer', async () => {
  const forms = [
    ['event-registrations', eventBody, { event: 12, ...person, department: 'Bilgisayar', kvkkApproved: true,
      privacyPolicyApproved: true, dynamicAnswers: [{ question: 'S', answer: 'C' }], applicationStage: 'late' }],
    ['event-registrations', { ...eventBody, event: '12' }, { event: '12', ...person, department: 'Bilgisayar',
      kvkkApproved: true, privacyPolicyApproved: true, dynamicAnswers: [{ question: 'S', answer: 'C' }], applicationStage: 'late' }],
    ['member-applications', { ...person, department: 'Bilgisayar', year: '2', kvkkApproved: true, privacyPolicyApproved: true },
      { ...person, department: 'Bilgisayar', year: '2', kvkkApproved: true, privacyPolicyApproved: true }],
    ['core-team-applications', { ...person, department: 'Bilgisayar', grade: '2', hometown: 'Ankara', area: 'Tasarım',
      portfolioUrl: 'https://example.invalid', githubUrl: 'https://example.invalid', motivationLetter: 'Merhaba',
      kvkkApproved: true, privacyPolicyApproved: true },
      { ...person, department: 'Bilgisayar', grade: '2', hometown: 'Ankara', area: 'Tasarım',
        portfolioUrl: 'https://example.invalid', githubUrl: 'https://example.invalid', motivationLetter: 'Merhaba',
        kvkkApproved: true, privacyPolicyApproved: true }],
    ['contact-messages', { fullName: person.fullName, email: person.email, subject: 'Konu', message: 'Merhaba' },
      { fullName: person.fullName, email: person.email, subject: 'Konu', message: 'Merhaba' }],
  ] as const
  for (const [collection, body, expected] of forms) {
    const h = harness()
    assert.deepEqual(await h.post([collection], body), { status: 201, body: { ok: true } })
    assert.equal(h.cmsCalls().length, 1)
    assert.equal(h.cmsCalls()[0].url, `http://cms.invalid/api/${collection}`)
    assert.equal(h.cmsCalls()[0].init?.method, 'POST')
    assert.equal((h.cmsCalls()[0].init?.headers as Record<string, string>)['x-internal-api-key'], 'internal-test-key')
    assert.deepEqual(JSON.parse(h.cmsCalls()[0].init?.body as string), expected)
  }
})

test('bozuk gövde ve alanlar reddedilir; dinamik yanıt temizlenir', async () => {
  for (const body of [[], null, 'x', { fullName: { $ne: 1 } }, { dynamicAnswers: 'x' },
    { dynamicAnswers: [{ question: {}, answer: 'C' }] }, { dynamicAnswers: Array(201).fill({}) },
    { event: -1 }, { event: 1.5 }]) {
    const h = harness()
    assert.equal((await h.post(['event-registrations'], body)).status, 400)
    assert.equal(h.cmsCalls().length, 0)
  }
  const h = harness()
  await h.post(['event-registrations'], { event: 12, dynamicAnswers: [{ question: 'S', answer: 'C', id: 'z', extra: 1 }], applicationStage: 'vip' })
  assert.deepEqual(JSON.parse(h.cmsCalls()[0].init?.body as string), { event: 12, dynamicAnswers: [{ question: 'S', answer: 'C' }] })
})

test('hız, Turnstile, boyut, JSON, anahtar ve CMS hata yolları korunur', async () => {
  let h = harness({ rate: false })
  assert.equal((await h.post(['event-registrations'], eventBody)).status, 429)
  assert.equal(h.calls.length, 0)
  h = harness({ secret: 'test-secret' })
  assert.equal((await h.post(['event-registrations'], eventBody)).status, 400)
  assert.equal(h.calls.length, 0)
  h = harness({ secret: 'test-secret', failTurnstile: true })
  assert.equal((await h.post(['event-registrations'], eventBody, { turnstileToken: 'token' })).status, 403)
  assert.equal(h.cmsCalls().length, 0)
  h = harness({ secret: 'test-secret' })
  assert.equal((await h.post(['event-registrations'], eventBody, { turnstileToken: 'token' })).status, 201)
  assert.equal(h.calls.length, 2)
  h = harness()
  assert.equal((await h.post(['event-registrations'], eventBody)).status, 201)
  assert.equal(h.cmsCalls().length, 1)
  h = harness()
  assert.equal((await h.post(['event-registrations'], eventBody, { contentLength: '2000000' })).status, 413)
  h = harness()
  assert.equal((await h.post(['event-registrations'], eventBody, { readJson: async () => { throw new Error('bad json') } })).status, 400)
  h = harness({ key: '' })
  assert.equal((await h.post(['event-registrations'], eventBody)).status, 500)
  assert.equal(h.cmsCalls().length, 0)
  h = harness({ failCms: true })
  assert.equal((await h.post(['event-registrations'], eventBody)).status, 503)
  h = harness({ cmsResponse: new Response('not json', { status: 502 }) })
  assert.deepEqual(await h.post(['event-registrations'], eventBody),
    { status: 503, body: { error: 'CMS bağlantısı kurulamadı' } })
})

test('CMS yanıtında belge ve hata ayrıntıları sızmaz', async () => {
  let h = harness({ cmsResponse: Response.json({ errors: [{ message: 'm', data: { x: 1 }, name: 'ValidationError' }] }, { status: 400 }) })
  assert.deepEqual(await h.post(['contact-messages'], person), { status: 400, body: { errors: [{ message: 'm' }] } })
  h = harness({ cmsResponse: Response.json({ doc: { ticketToken: 't' } }, { status: 201 }) })
  assert.deepEqual(await h.post(['contact-messages'], person), { status: 201, body: { ok: true } })
  h = harness({ cmsResponse: Response.json({ errors: Array(7).fill({ message: 'x'.repeat(301), stack: 'secret' }) }, { status: 400 }) })
  assert.deepEqual(await h.post(['contact-messages'], person),
    { status: 400, body: { errors: Array(5).fill({ message: 'x'.repeat(300) }) } })
})

test('GET canlı istekleri ve izinli yollar geçer', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const body = { docs: [{ scannerActive: true, status: 'active' }] }
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json(body)
  }
  const deps = { fetcher, cmsUrl: 'http://cms.invalid', internalKey: 'internal-test-key' }
  const get = (pathParts: unknown, query = '') => handleCmsGet({ pathParts, searchParams: new URLSearchParams(query) }, deps)
  assert.deepEqual(await get(['globals', 'legal-docs'], 'depth=1'), { status: 200, body, cacheable: true })
  assert.equal((calls[0].init?.headers as Record<string, string>)['x-internal-api-key'], undefined)
  assert.equal(calls[0].url, 'http://cms.invalid/api/globals/legal-docs?depth=1')
  await get(['globals', 'site-settings'])
  assert.equal(calls[1].url, 'http://cms.invalid/api/globals/site-settings')
  assert.equal(calls[1].url.includes('?'), false)
  assert.deepEqual(await get(['events'], 'where[slug][equals]=deneme-etkinlik'), { status: 200, body, cacheable: true })
  assert.equal(new URL(calls[2].url).searchParams.get('where[slug][equals]'), 'deneme-etkinlik')
  for (const path of [['events', '12'], ['blog-posts'], ['globals', 'university-guide-settings']]) {
    assert.equal((await get(path)).status, 200)
  }
  assert.equal(calls.length, 6)
})

test('GET yasak yollar CMS isteği oluşturmaz', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}) }
  for (const path of [['members'], ['member-applications'], ['core-team-applications'], ['event-registrations'],
    ['contact-messages'], ['users'], ['media'], ['site-settings'], ['globals'], ['globals', 'robot-settings'], ['globals', 'mascot-outfits'], ['globals', 'site-settings', 'x'],
    ['globals', 'payload-preferences'], ['events', '1', 'versions'], ['events', '../users'], ['events', 'a/b'],
    ['events', ''], ['event-registrations', 'verify-certificate', 'x'], [], 'events', [5]]) {
    assert.equal(resolveGetTarget(path), null)
    assert.deepEqual(await handleCmsGet({ pathParts: path, searchParams: new URLSearchParams() },
      { fetcher, cmsUrl: 'http://cms.invalid', internalKey: 'test-key' }),
    { status: 400, body: { error: 'Geçersiz endpoint' }, cacheable: false })
  }
  assert.equal(calls, 0)
})

test('GET sorgusu yalnız sınırlı izinli parametreleri taşır', () => {
  const query = new URLSearchParams()
  for (const key of ['draft', 'select[apiKey]', 'populate[x]', 'joins[x]', 'trash', 'where', 'where[a b][equals]']) query.append(key, 'x')
  query.append('where[slug][equals]', 'x'.repeat(201))
  for (const value of ['10', 'abc', '-1']) query.append('depth', value)
  for (const value of ['100000', '0']) query.append('limit', value)
  query.append('page', '0')
  query.append('locale', 'tr')
  query.append('locale', 'xx')
  query.append('sort', '-date,title')
  assert.deepEqual([...new URLSearchParams(buildGetQuery(query).slice(1))],
    [['depth', '2'], ['limit', '100'], ['limit', '1'], ['locale', 'tr'], ['sort', '-date,title']])
  assert.equal(buildGetQuery(new URLSearchParams()), '')
  const many = new URLSearchParams()
  for (let i = 0; i < 25; i++) many.append(`where[field${i}][equals]`, String(i))
  assert.equal([...new URLSearchParams(buildGetQuery(many).slice(1))].length, 20)
})

test('GET hata gövdesi sızmaz; ağ ve JSON hataları 503 olur', async () => {
  const get = (fetcher: typeof fetch, pathParts: string[] = ['events']) =>
    handleCmsGet({ pathParts, searchParams: new URLSearchParams() },
      { fetcher, cmsUrl: 'http://cms.invalid', internalKey: 'test-key' })
  for (const [path, status] of [[['events'], 404], [['globals', 'site-settings'], 403]] as const) {
    assert.deepEqual(await get(async () => Response.json({ errors: [{ message: 'ayrinti' }] }, { status }), [...path]),
      { status, body: { error: 'İstek başarısız' }, cacheable: false })
  }
  const unavailable = { status: 503, body: { error: 'CMS bağlantısı kurulamadı' }, cacheable: false }
  assert.deepEqual(await get(async () => { throw new Error('offline') }), unavailable)
  assert.deepEqual(await get(async () => new Response('not json')), unavailable)
})

test('üretimde Turnstile sırrı yoksa form reddedilir; geçerli istek sürer', async () => {
  for (const secret of [undefined, '', 'XXXX']) {
    let calls = 0
    const result = await handleFormPost({ pathParts: ['contact-messages'], ip: '192.0.2.1', turnstileToken: null,
      contentLength: null, readJson: async () => person }, { fetcher: async () => { calls++; return Response.json({}) },
      cmsUrl: 'http://cms.invalid', internalKey: 'test-key', turnstileSecret: secret,
      nodeEnv: 'production', checkRateLimit: () => true })
    assert.deepEqual(result, { status: 503, body: { error: 'Güvenlik doğrulaması şu an yapılamıyor.' } })
    assert.equal(calls, 0)
  }
  for (const [nodeEnv, secret, expectedCalls] of [['production', 'test-secret', 2],
    [undefined, undefined, 1], ['development', undefined, 1]] as const) {
    let calls = 0
    const result = await handleFormPost({ pathParts: ['contact-messages'], ip: '192.0.2.1', turnstileToken: 'jeton',
      contentLength: null, readJson: async () => person }, { fetcher: async (url) => {
        calls++
        return String(url).includes('siteverify') ? Response.json({ success: true }) : Response.json({}, { status: 201 })
      }, cmsUrl: 'http://cms.invalid', internalKey: 'test-key', turnstileSecret: secret,
      nodeEnv, checkRateLimit: () => true })
    assert.deepEqual(result, { status: 201, body: { ok: true } })
    assert.equal(calls, expectedCalls)
  }
})

test('Turnstile: tekrar kullanılan jeton, yabancı alan adı ve form sınırı reddedilir', async () => {
  const cmsCalls: string[] = []
  const deps = (over: Record<string, unknown>) => ({
    fetcher: (async (input: string) => {
      if (String(input).includes('siteverify')) return Response.json({ success: true, hostname: (over.hostname as string) ?? `${SITE_HOST}` })
      cmsCalls.push(String(input)); return Response.json({}, { status: 201 })
    }) as typeof fetch,
    cmsUrl: 'http://cms.invalid', internalKey: 'k', turnstileSecret: 's', nodeEnv: 'production', checkRateLimit: () => true, ...over,
  })
  const post = (d: ReturnType<typeof deps>, token = 'jeton-1') => handleFormPost({ pathParts: ['contact-messages'], ip: '192.0.2.9', turnstileToken: token,
    contentLength: null, readJson: async () => ({ fullName: 'A', email: 'a@example.invalid', subject: 'S', message: 'M' }) }, d as never)

  const seen = new Set<string>()
  const tokenSeen = (t: string) => { if (seen.has(t)) return true; seen.add(t); return false }
  assert.equal((await post(deps({ tokenSeen }))).status, 201)
  const replay = await post(deps({ tokenSeen }))
  assert.equal(replay.status, 403)
  assert.match(String((replay.body as { error: string }).error), /zaten kullanıldı/)
  assert.equal(cmsCalls.length, 1)

  assert.equal((await post(deps({ hostname: 'kotu-site.example' }), 'jeton-2')).status, 403)
  assert.equal(cmsCalls.length, 1)

  const limited = await post(deps({ checkFormLimit: (_ip: string, collection: string) => collection !== 'contact-messages' }), 'jeton-3')
  assert.equal(limited.status, 429)
  assert.equal(cmsCalls.length, 1)
})
