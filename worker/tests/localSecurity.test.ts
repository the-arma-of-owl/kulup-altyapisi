import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextFunction, Request, Response } from 'express'
import { LOCAL_SESSION_COOKIE } from '../server/config.js'
import {
  allowedHosts, allowedOrigins, checkLocalRequest, localRequestGuard, readCookie, tokensMatch,
} from '../server/localSecurity.js'

const port = 4100
const token = 's'.repeat(43)
const cookie = `${LOCAL_SESSION_COOKIE}=${token}`
const api = { port, token, requireToken: true }
const page = { port, token, requireToken: false }

test('yalnız yerel Host ve Origin değerleri kabul edilir', () => {
  assert.deepEqual([...allowedHosts(port)], ['127.0.0.1:4100', 'localhost:4100'])
  assert.deepEqual([...allowedOrigins(port)], ['http://127.0.0.1:4100', 'http://localhost:4100'])
  for (const host of allowedHosts(port)) {
    assert.deepEqual(checkLocalRequest({ host, origin: `http://${host}`, cookie }, api), { ok: true })
  }
  assert.deepEqual(checkLocalRequest({ host: 'foreign.invalid:4100', cookie }, api),
    { ok: false, status: 421, error: 'Bu adres yerel sunucuya ait değil.' })
  assert.equal(checkLocalRequest({ host: 'localhost:4100', origin: 'https://foreign.invalid', cookie }, api).ok, false)
  const foreignOrigin = checkLocalRequest({ host: 'localhost:4100', origin: 'https://foreign.invalid', cookie }, api)
  assert.equal(foreignOrigin.ok ? 0 : foreignOrigin.status, 403)
})

test('Origin yoksa geçerli çerez kabul edilir; eksik veya yanlış token reddedilir', () => {
  assert.deepEqual(checkLocalRequest({ host: 'localhost:4100', cookie }, api), { ok: true })
  for (const badCookie of [undefined, `${LOCAL_SESSION_COOKIE}=wrong`, `${LOCAL_SESSION_COOKIE}=`]) {
    const result = checkLocalRequest({ host: 'localhost:4100', cookie: badCookie }, api)
    assert.equal(result.ok ? 0 : result.status, 401)
  }
  const emptyExpected = checkLocalRequest({ host: 'localhost:4100', cookie }, { ...api, token: '' })
  assert.equal(emptyExpected.ok ? 0 : emptyExpected.status, 401)
  assert.equal(tokensMatch(null, token), false)
  assert.equal(tokensMatch(token, ''), false)
  assert.equal(tokensMatch(token, token), true)
})

test('API dışındaki yol token istemez, Host denetlenir', () => {
  assert.deepEqual(checkLocalRequest({ host: 'localhost:4100', origin: 'https://foreign.invalid' }, page), { ok: true })
  const result = checkLocalRequest({ host: 'foreign.invalid:4100' }, page)
  assert.equal(result.ok ? 0 : result.status, 421)
})

test('birden çok çerez arasında doğru çerez okunur', () => {
  assert.equal(readCookie(`other=one; ${cookie}; next=two`, LOCAL_SESSION_COOKIE), token)
  assert.equal(readCookie('other=one; next=two', LOCAL_SESSION_COOKIE), null)
  assert.equal(readCookie(undefined, LOCAL_SESSION_COOKIE), null)
})

test('ara katman /api yollarında token ister ve ret bilgisini günlüğe işaretler', () => {
  const guard = localRequestGuard(port, token)
  const check = (path: string, host: string, sentCookie?: string): { status?: number; next: boolean; rejected: boolean } => {
    const result: { status?: number; next: boolean; rejected: boolean } = { next: false, rejected: false }
    const request = { path, headers: { host, cookie: sentCookie } } as Request
    const locals: { localSecurityRejected?: boolean } = {}
    const response = {
      locals,
      status(code: number) { result.status = code; return this },
      json() { result.rejected = Boolean(locals.localSecurityRejected); return this },
    } as unknown as Response
    guard(request, response, (() => { result.next = true }) as NextFunction)
    return result
  }
  assert.deepEqual(check('/', 'localhost:4100'), { next: true, rejected: false })
  assert.deepEqual(check('/', 'foreign.invalid:4100'), { status: 421, next: false, rejected: true })
  assert.deepEqual(check('/api', 'localhost:4100'), { status: 401, next: false, rejected: true })
  assert.deepEqual(check('/api/health', 'localhost:4100', cookie), { next: true, rejected: false })
  assert.deepEqual(check('/apiary', 'localhost:4100'), { next: true, rejected: false })
  assert.deepEqual(check('/API/health', 'localhost:4100'), { status: 401, next: false, rejected: true })
  assert.deepEqual(check('/Api', 'localhost:4100'), { status: 401, next: false, rejected: true })
})
