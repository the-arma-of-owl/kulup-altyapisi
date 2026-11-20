import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { AuthManager } from '../server/auth.js'
import type { PayloadClient } from '../server/payload.js'

const createPayload = (calls: string[] = []): PayloadClient => ({
    configure: () => undefined,
    request: async (route: string) => {
      calls.push(route)
      if (route === '/users/login') return {
        data: { user: { email: 'admin@example.invalid', hasTotp: true } },
        response: new Response('{}', { headers: { 'Set-Cookie': 'payload-token=first; HttpOnly; Path=/' } }),
      }
      if (route === '/verify-totp') return {
        data: { ok: true }, response: new Response('{}', { headers: { 'Set-Cookie': 'payload-totp=second; HttpOnly; Path=/' } }),
      }
      if (route === '/users/me') return { data: { user: { _strategy: 'totp', roles: ['admin'] } } }
      return { data: { ok: true } }
    },
  } as unknown as PayloadClient)

test('TOTP oturumu 0600 izinle, parolasız saklanır ve çıkışta silinir', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kulup-auth-test-'))
  const calls: string[] = []
  const payload = createPayload(calls)
  const auth = new AuthManager(folder, payload)
  try {
    await auth.initialize()
    await auth.login('admin@example.invalid', 'never-store-this-password')
    await assert.rejects(auth.verifyTotp('123'), /Altı haneli/)
    await auth.verifyTotp('123456')
    assert.equal(auth.status().authenticated, true)
    const file = path.join(folder, 'session.json')
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600)
    const content = await readFile(file, 'utf8')
    assert.doesNotMatch(content, /never-store-this-password/)
    assert.match(content, /payload-totp/)
    await auth.logout()
    assert.equal(auth.status().authenticated, false)
    await assert.rejects(stat(file), /ENOENT/)
    assert.deepEqual(calls, ['/users/login', '/verify-totp', '/users/me', '/users/logout'])
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('anahtarlı oturum şifreli saklanır ve yeniden okunur', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kulup-auth-encrypted-'))
  const file = path.join(folder, 'session.json')
  const key = randomBytes(32)
  try {
    const auth = new AuthManager(folder, createPayload(), key)
    await auth.initialize()
    await auth.login('admin@example.invalid', 'fake-password')
    await auth.verifyTotp('123456')
    const content = await readFile(file, 'utf8')
    assert.doesNotMatch(content, /admin@example\.invalid|payload-token|payload-totp|first|second/)
    assert.equal(JSON.parse(content).alg, 'aes-256-gcm')
    const restored = new AuthManager(folder, createPayload(), key)
    await restored.initialize()
    assert.equal(restored.status().userEmail, 'admin@example.invalid')
    assert.equal(restored.cookies()?.['payload-token'], 'first')
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('anahtarsız veya yanlış anahtarlı yönetici şifreli dosyayı düşürür', async () => {
  for (const missingKey of [true, false]) {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'kulup-auth-keyless-'))
    const file = path.join(folder, 'session.json')
    try {
      const auth = new AuthManager(folder, createPayload(), randomBytes(32))
      await auth.initialize()
      await auth.login('admin@example.invalid', 'fake-password')
      await auth.verifyTotp('123456')
      const restored = new AuthManager(folder, createPayload(), missingKey ? null : randomBytes(32))
      await restored.initialize()
      assert.equal(restored.status().authenticated, false)
      await assert.rejects(stat(file), /ENOENT/)
    } finally { await rm(folder, { recursive: true, force: true }) }
  }
})

test('eski düz JSON oturumu anahtarla okunur', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kulup-auth-legacy-'))
  const file = path.join(folder, 'session.json')
  try {
    await writeFile(file, JSON.stringify({
      cookies: { 'payload-token': 'fake-cookie' },
      userEmail: 'admin@example.invalid', expiresAt: Date.now() + 60_000,
    }))
    const auth = new AuthManager(folder, createPayload(), randomBytes(32))
    await auth.initialize()
    assert.equal(auth.status().userEmail, 'admin@example.invalid')
    assert.equal(auth.cookies()?.['payload-token'], 'fake-cookie')
    const content = await readFile(file, 'utf8')
    assert.doesNotMatch(content, /admin@example\.invalid|fake-cookie/)
    assert.equal(JSON.parse(content).alg, 'aes-256-gcm')
  } finally { await rm(folder, { recursive: true, force: true }) }
})
