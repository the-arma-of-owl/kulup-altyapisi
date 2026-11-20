import test from 'node:test'
import assert from 'node:assert/strict'
import { createAttemptLimiter } from '../src/lib/rateLimit'

test('sabit pencere, bağımsız anahtarlar ve salt okunur kontrol', () => {
  let time = 0
  const limiter = createAttemptLimiter({ max: 2, windowMs: 100, now: () => time })
  assert.equal(limiter.isBlocked('a'), false)
  assert.equal(limiter.isBlocked('a'), false)
  limiter.recordFailure('a')
  assert.equal(limiter.isBlocked('a'), false)
  limiter.recordFailure('a')
  assert.equal(limiter.isBlocked('a'), true)
  assert.equal(limiter.isBlocked('b'), false)
  time = 100
  assert.equal(limiter.isBlocked('a'), false)
  limiter.recordFailure('a')
  assert.equal(limiter.isBlocked('a'), false)
})

test('kapasite dolunca önce süresi dolan, sonra en eski anahtar silinir', () => {
  let time = 0
  const limiter = createAttemptLimiter({ max: 1, windowMs: 100, maxKeys: 3, now: () => time })
  limiter.recordFailure('a')
  time = 1
  limiter.recordFailure('b')
  limiter.recordFailure('c')
  limiter.recordFailure('d')
  assert.equal(limiter.isBlocked('a'), false)
  assert.equal(limiter.isBlocked('b'), true)
  assert.equal(limiter.isBlocked('c'), true)
  assert.equal(limiter.isBlocked('d'), true)
  const expiring = createAttemptLimiter({ max: 1, windowMs: 100, maxKeys: 3, now: () => time })
  time = 0
  expiring.recordFailure('old')
  time = 1
  expiring.recordFailure('b')
  expiring.recordFailure('c')
  time = 100
  expiring.recordFailure('e')
  assert.equal(expiring.isBlocked('old'), false)
  assert.equal(expiring.isBlocked('b'), true)
  assert.equal(expiring.isBlocked('c'), true)
  assert.equal(expiring.isBlocked('e'), true)
})
