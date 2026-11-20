import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTicketUrl, fetchTicketView, isValidTicketToken, pickTicketView } from '../src/lib/ticket'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const token = '0123456789abcdef'
const cmsUrl = 'http://cms.invalid'
const internalKey = 'internal-test-key'
const doc = {
  id: 5, fullName: 'Deneme Kişi', department: 'Bilgisayar', email: 'test@example.invalid',
  phone: '+900000000001', status: 'accepted', attended: false, ticketToken: token,
  notes: 'gizli not', gateFields: { x: 1 },
  event: { id: 3, title: 'Deneme Etkinliği', date: '2026-10-01T10:00:00.000Z',
    location: 'Salon', locationLink: 'https://maps.example.invalid/x', scannerPin: '987654', slug: 'deneme' },
}

function harness(body: unknown = { docs: [doc] }, status = 200, throws = false) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    if (throws) throw new Error('offline')
    return Response.json(body, { status })
  }
  const fetchView = (candidate: unknown = token, options: { key?: string } = { key: internalKey }) =>
    fetchTicketView(candidate, { fetcher, cmsUrl, internalKey: options.key })
  return { calls, fetchView }
}

test('bilet jetonu yalnız izinli biçimde kabul edilir', () => {
  for (const value of [token, `${ONEK}-DEMO_1453`, 'a'.repeat(8), 'a'.repeat(128)]) {
    assert.equal(isValidTicketToken(value), true)
  }
  for (const value of ['a'.repeat(7), 'a'.repeat(129), '', 'abc&where[status][not_equals]=x',
    'abcdefgh%26depth=5', 'abcdefgh/../x', 'abcdefgh?x', 'abcd efgh', null, 42, [token]]) {
    assert.equal(isValidTicketToken(value), false)
  }
})

test('CMS sorgusunda yalnız kodlanmış jeton, depth ve limit bulunur', () => {
  for (const base of [cmsUrl, `${cmsUrl}/`]) {
    const url = new URL(buildTicketUrl(base, token))
    assert.equal(url.origin, cmsUrl)
    assert.equal(url.pathname, '/api/event-registrations')
    assert.deepEqual([...url.searchParams.keys()].sort(), ['depth', 'limit', 'where[ticketToken][equals]'])
    assert.equal(url.searchParams.get('where[ticketToken][equals]'), token)
    assert.equal(url.searchParams.get('depth'), '1')
    assert.equal(url.searchParams.get('limit'), '1')
    assert.equal(url.searchParams.size, 3)
  }
})

test('onaylı bilet aynen gereken alanlarla gelir; gizli alanlar istemciye geçmez', async () => {
  const h = harness()
  const view = await h.fetchView()
  assert.deepEqual(view, {
    ticket: { fullName: 'Deneme Kişi', department: 'Bilgisayar', ticketToken: token, attended: false },
    event: { title: 'Deneme Etkinliği', date: '2026-10-01T10:00:00.000Z',
      location: 'Salon', locationLink: 'https://maps.example.invalid/x' },
  })
  const serialized = JSON.stringify(view)
  for (const secret of ['987654', 'scannerPin', 'gizli not', 'gateFields', 'test@', '+900000000001']) {
    assert.equal(serialized.includes(secret), false)
  }
  assert.equal(h.calls.length, 1)
  assert.ok(h.calls[0].url.startsWith('http://cms.invalid/api/event-registrations?'))
  assert.equal((h.calls[0].init?.headers as Record<string, string>)['x-internal-api-key'], internalKey)
  assert.deepEqual((h.calls[0].init as RequestInit & { next?: { revalidate?: number } }).next, { revalidate: 0 })
})

test('geçersiz jeton veya eksik anahtar CMS isteği oluşturmaz', async () => {
  for (const [candidate, key] of [['abc&where[x]=1', internalKey], [token, undefined], [token, '']] as const) {
    const h = harness()
    assert.equal(await h.fetchView(candidate, { key }), null)
    assert.equal(h.calls.length, 0)
  }
})

test('onaysız, uyumsuz veya eksik belge ve CMS hataları null döner', async () => {
  for (const candidate of [
    { ...doc, status: 'pending' }, { ...doc, ticketToken: 'ffffffffffffffff' },
    { ...doc, event: 3 }, { ...doc, event: null },
    { ...doc, fullName: 3 }, { ...doc, event: { ...doc.event, title: 3 } },
    { ...doc, event: { ...doc.event, date: null } },
  ]) assert.equal(pickTicketView(candidate, token), null)
  for (const body of [{ docs: [] }, {}, { docs: null }, { docs: [null] }]) {
    assert.equal(await harness(body).fetchView(), null)
  }
  assert.equal(await harness({}, 403).fetchView(), null)
  const badJsonFetcher: typeof fetch = async () => new Response('not json')
  assert.equal(await fetchTicketView(token, { fetcher: badJsonFetcher, cmsUrl, internalKey }), null)
  assert.equal(await harness({}, 200, true).fetchView(), null)
})

test('bağlantı protokolü ve isteğe bağlı alanların türü denetlenir', () => {
  for (const locationLink of ['javascript:alert(1)', '//x']) {
    const view = pickTicketView({ ...doc, department: 42, attended: 'true',
      event: { ...doc.event, locationLink, location: 42 } }, token)
    assert.ok(view)
    assert.equal(view.ticket.attended, false)
    assert.equal('department' in view.ticket, false)
    assert.equal('location' in view.event, false)
    assert.equal('locationLink' in view.event, false)
  }
})
