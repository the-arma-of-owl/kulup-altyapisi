import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedOrigins, originAllowed, publicBody, resolveRoute } from '../src/lib/teams/bff'
import { clearedSessionCookieOptions, openSession, sealSession, sessionCookieName, sessionCookieOptions } from '../src/lib/teams/session'
import { splitEventTeams, teamSizeLabel, type TeamPublic } from '../src/lib/teams/types'
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const SECRET = 'x'.repeat(40)
const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null })

test('BFF yalnız beyaz listedeki uçları iletir', () => {
  assert.deepEqual(resolveRoute('GET', ['me']), { cmsPath: '/api/takim/me', auth: true, kind: 'json', special: undefined })
  assert.equal(resolveRoute('POST', ['teams', '12', 'upload'])?.kind, 'upload')
  assert.equal(resolveRoute('POST', ['auth', 'login'])?.special, 'login')
  assert.equal(resolveRoute('POST', ['teams', '12', 'members', '5'])?.auth, true)
  assert.deepEqual(resolveRoute('GET', ['events', '3', 'application']), { cmsPath: '/api/takim/events/3/application', auth: true, kind: 'json', special: undefined })
  assert.equal(resolveRoute('GET', ['teams', '4', 'contact'])?.auth, true)
  assert.equal(resolveRoute('POST', ['auth', 'logout'])?.special, 'logout')
  for (const [method, parts] of [
    ['GET', ['public', 'event', '1']], // herkese açık uç tarayıcıdan değil, sunucu bileşeninden
    ['POST', ['me']], ['GET', ['auth', 'login']], ['POST', ['teams', '0', 'update']], ['POST', ['teams', 'abc', 'update']],
    ['POST', ['teams', '1', '..', 'x']], ['POST', ['teams', '1', 'update', 'x']], ['DELETE', ['teams', '1']], ['GET', []],
    ['POST', ['users', 'login']], ['GET', ['jury', '1', 'score']],
    ['GET', ['events', 'x', 'application']], ['POST', ['teams', '4', 'contact']], ['GET', ['teams', '4', 'contact', 'x']],
  ] as const) {
    assert.equal(resolveRoute(method, [...parts]), null, `${method} ${parts.join('/')}`)
  }
  assert.equal(resolveRoute('GET', 'me'), null)
})

test('CSRF: Origin zorunlu ve sitenin kendisi olmalı', () => {
  const allowed = allowedOrigins(headers({ host: `${SITE_HOST}` }), { NODE_ENV: 'production' })
  assert.deepEqual(allowed, [`https://${SITE_HOST}`])
  assert.equal(originAllowed(headers({ origin: `https://${SITE_HOST}` }), allowed), true)
  assert.equal(originAllowed(headers({ origin: `https://${SITE_HOST}`, 'sec-fetch-site': 'same-origin' }), allowed), true)
  assert.equal(originAllowed(headers({}), allowed), false)
  assert.equal(originAllowed(headers({ origin: 'https://evil.example' }), allowed), false)
  assert.equal(originAllowed(headers({ origin: `http://${SITE_HOST}` }), allowed), false)
  assert.equal(originAllowed(headers({ origin: `https://${SITE_HOST}.evil.example` }), allowed), false)
  assert.equal(originAllowed(headers({ origin: 'null' }), allowed), false)
  assert.equal(originAllowed(headers({ origin: `https://${SITE_HOST}`, 'sec-fetch-site': 'cross-site' }), allowed), false)
  assert.equal(allowedOrigins(headers({ host: 'evil"<>' }), { NODE_ENV: 'production' }).length, 0)
  assert.ok(allowedOrigins(headers({ host: 'localhost:3007' }), { NODE_ENV: 'development' }).includes('http://localhost:3007'))
})

test('oturum çerezi şifreli; kurcalama, yanlış anahtar ve süre dolumu reddedilir', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const sealed = sealSession({ token: 'jwt.token.value', exp, uid: '7' }, SECRET)
  assert.ok(!sealed.includes('jwt.token.value'))
  assert.deepEqual(openSession(sealed, SECRET), { token: 'jwt.token.value', exp, uid: '7' })
  const parts = sealed.split('.')
  const flipped = [...parts.slice(0, 3), parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'BB' : 'AA')].join('.')
  assert.equal(openSession(flipped, SECRET), null)
  assert.equal(openSession(sealed, 'y'.repeat(40)), null)
  assert.equal(openSession(sealed, SECRET, (exp + 1) * 1000), null)
  assert.equal(openSession('garbage', SECRET), null)
  assert.equal(openSession(undefined, SECRET), null)
  assert.throws(() => sealSession({ token: 't', exp, uid: '1' }, 'kisa'))
})

test('çerez ayarları: canlıda __Host-, HttpOnly, Secure, SameSite=Lax', () => {
  assert.equal(sessionCookieName('production'), '__Host-byt_katilimci')
  assert.deepEqual(sessionCookieOptions('production', 100), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 100 })
  assert.equal(sessionCookieOptions('development').secure, false)
})

test('token tarayıcıya gitmez', () => {
  assert.deepEqual(publicBody({ ok: true, token: 'secret', exp: 1, user: { id: 1 } }), { ok: true, user: { id: 1 } })
})

test('çıkış: çerez aynı ad/öznitelikle Max-Age=0 silinir (canlıda __Host- için Secure + Path=/)', () => {
  const prod = clearedSessionCookieOptions('production')
  assert.equal(prod.maxAge, 0)
  assert.equal(prod.secure, true)
  assert.equal(prod.path, '/')
  assert.equal(prod.httpOnly, true)
  assert.equal(prod.expires.getTime(), 0)
  assert.equal(clearedSessionCookieOptions('development').secure, false)
})

test('etkinlik sayfası: kabul edilenler ayrı bölümde, başvuranlarda tekrar çıkmaz; reddedilen gösterilmez', () => {
  const base: Omit<TeamPublic, 'id' | 'status'> = { slug: 's', name: 'T', logoUrl: null, coverUrl: null, memberCount: 2, maxMembers: 5, members: [], manifesto: '' }
  const teams: TeamPublic[] = [
    { ...base, id: '1', status: 'approved' },
    { ...base, id: '2', status: 'accepted' },
    { ...base, id: '3', status: 'rejected' },
    { ...base, id: '4', status: 'pending' },
  ]
  const { accepted, applied } = splitEventTeams(teams)
  assert.deepEqual(accepted.map((t) => t.id), ['2'])
  assert.deepEqual(applied.map((t) => t.id), ['1'])
})

test('BFF: ayrılma ve üye çıkarma uçları oturum ister', () => {
  assert.deepEqual(resolveRoute('POST', ['teams', '3', 'leave']), { cmsPath: '/api/takim/teams/3/leave', auth: true, kind: 'json', special: undefined })
  assert.equal(resolveRoute('POST', ['teams', '3', 'members', '9'])?.auth, true)
  assert.equal(resolveRoute('GET', ['teams', '3', 'leave']), null)
})

test('takım büyüklüğü: sınırlar aynıysa tek sayı', () => {
  assert.equal(teamSizeLabel({ min: 4, max: 4 }), '4 kişilik takımlar')
  assert.equal(teamSizeLabel({ min: 2, max: 5 }), '2–5 kişilik takımlar')
})
