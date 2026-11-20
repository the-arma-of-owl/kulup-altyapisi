import test from 'node:test'
import assert from 'node:assert/strict'
import { pickTags, secretMatches } from '../src/lib/revalidate'

test('sır yalnız birebir eşleşirse kabul edilir', () => {
  assert.equal(secretMatches('abc123', 'abc123'), true)
  assert.equal(secretMatches('abc123', 'abc124'), false)
  assert.equal(secretMatches('abc123', null), false)
  assert.equal(secretMatches(undefined, 'abc123'), false)
  assert.equal(secretMatches('', ''), false)
})

test('yalnız izinli etiketler seçilir, tekrarlar atılır', () => {
  assert.deepEqual(pickTags({ tags: ['events', 'events', 'site-settings'] }), ['events', 'site-settings'])
  assert.deepEqual(pickTags({ tags: ['events', 'users', 'members', 42] }), ['events'])
})

test('geçersiz gövde veya izinli etiket yoksa null', () => {
  assert.equal(pickTags(null), null)
  assert.equal(pickTags({}), null)
  assert.equal(pickTags({ tags: 'events' }), null)
  assert.equal(pickTags({ tags: ['users', 'event-registrations'] }), null)
})
