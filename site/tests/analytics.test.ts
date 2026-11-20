import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRef, refFromSearch } from '../src/lib/analytics'

test('kaynak: ?ref=, utm_source ve çıplak parametre', () => {
  assert.equal(refFromSearch('?mekatronik'), 'mekatronik')
  assert.equal(refFromSearch('?ref=Mekatronik'), 'mekatronik')
  assert.equal(refFromSearch('?utm_source=Instagram&utm_medium=story'), 'instagram')
  assert.equal(refFromSearch('?fbclid=abc&Bilgisayar%20M%C3%BCh'), 'bilgisayar-muh')
  assert.equal(refFromSearch('?page=2'), null)
  assert.equal(refFromSearch('?fbclid='), null)
  assert.equal(refFromSearch(''), null)
})

test('kaynak normalleştirme CMS ile aynı', () => {
  assert.equal(normalizeRef('Bilgisayar Müh. 1. Sınıf'), 'bilgisayar-muh-1-sinif')
  assert.equal(normalizeRef('!!!'), null)
  assert.equal(normalizeRef('a'.repeat(80))?.length, 40)
})
