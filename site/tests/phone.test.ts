import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phoneSchema } from '../src/lib/phone'

const phone = phoneSchema('kısa')

test('telefon: 10–20 karakter, rakam ve + ( ) - boşluk', () => {
  assert.equal(phone.safeParse('0555 555 55 55').success, true)
  assert.equal(phone.safeParse('+90 (555) 555-55-55').success, true)
  assert.equal(phone.safeParse(' 05555555555 ').data, '05555555555')
  assert.equal(phone.safeParse('0555').success, false)
  assert.equal(phone.safeParse('0'.repeat(21)).success, false)
  assert.equal(phone.safeParse('0555 555 55 5a').success, false)
})
