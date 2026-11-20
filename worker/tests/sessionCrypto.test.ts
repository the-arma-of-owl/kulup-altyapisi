import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptSession, encryptSession, isEncryptedEnvelope, parseSessionKey } from '../server/sessionCrypto.js'

test('oturum şifrelenip çözülür; her yazım yeni IV ve veri üretir', () => {
  const key = randomBytes(32)
  const json = JSON.stringify({ userEmail: 'admin@example.invalid', cookies: { token: 'fake-cookie' } })
  const first = encryptSession(json, key)
  const second = encryptSession(json, key)
  assert.equal(isEncryptedEnvelope(first), true)
  assert.equal(decryptSession(first, key), json)
  assert.notEqual(first.iv, second.iv)
  assert.notEqual(first.data, second.data)
})

test('yanlış anahtar ve değiştirilen tag/veri çözülmez', () => {
  const key = randomBytes(32)
  const envelope = encryptSession('fake-session', key)
  assert.throws(() => decryptSession(envelope, randomBytes(32)))
  const tag = Buffer.from(envelope.tag, 'base64')
  tag[0] ^= 1
  assert.throws(() => decryptSession({ ...envelope, tag: tag.toString('base64') }, key))
  const data = Buffer.from(envelope.data, 'base64')
  data[0] ^= 1
  assert.throws(() => decryptSession({ ...envelope, data: data.toString('base64') }, key))
})

test('anahtar yalnız tam 32 baytlık geçerli base64 ise kabul edilir', () => {
  const key = randomBytes(32)
  assert.deepEqual(parseSessionKey(key.toString('base64')), key)
  assert.equal(parseSessionKey(randomBytes(31).toString('base64')), null)
  assert.equal(parseSessionKey(randomBytes(33).toString('base64')), null)
  assert.equal(parseSessionKey('not-base64'), null)
  assert.equal(parseSessionKey(undefined), null)
})
