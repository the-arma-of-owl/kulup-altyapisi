import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Registration, WorkerEvent } from '../shared/types.js'
import { jsonRowsFrom, jsonVariables, messageRecipients, recipientPhone } from '../src/ui/messagesModel.js'

const event = { id: 7, title: 'Deneme', slug: 'deneme' } as WorkerEvent
const regs = [
  { id: 1, event: 7, fullName: 'Ada Yıl', phone: '0532 000 00 03', status: 'accepted', attended: true },
  { id: 2, event: 7, fullName: 'Test Kişi', phone: '05320000000', status: 'pending', isTest: true },
] as Registration[]

test('JSON kuralları: dizi veya kayitlar, her kayıtta id', () => {
  assert.equal(jsonRowsFrom('{"kayitlar":[{"id":1}]}').length, 1)
  assert.throws(() => jsonRowsFrom('{"a":1}'), /dizi/)
  assert.throws(() => jsonRowsFrom('[{"masa":"A"}]'), /id/)
  assert.throws(() => jsonRowsFrom('[1]'), /nesne/)
  assert.throws(() => jsonRowsFrom('{'), /okunamadı/)
})

test('JSON alanları eşleşen kişiye değişken olur; eşleşmeyen telefonlu kayıt harici alıcıdır', () => {
  const rows = jsonRowsFrom('[{"id":1,"masa":"A7","oda":{"kat":2},"kötü ad":"x"},{"id":"dış 9","telefon":"05550000003","ad":"Bora"},{"id":5}]')
  assert.deepEqual(jsonVariables(rows[0]), { masa: 'A7', oda_kat: '2' })
  const list = messageRecipients(event, regs, rows, false)
  assert.deepEqual(list.map((item) => item.recipient.id), ['event-registrations:1', 'json:d9-1'])
  assert.equal(list[0].recipient.variables.masa, 'A7')
  assert.equal(list[0].recipient.variables.etkinlik, 'Deneme')
  assert.equal(list[0].recipient.relatedEvent, 7)
  assert.equal(list[1].recipient.name, 'Bora')
  assert.equal(list[1].registration, undefined)
  assert.equal(messageRecipients(event, regs, [], true).length, 2)
})

test('telefon WhatsApp biçimine getirilir', () => {
  assert.equal(recipientPhone('0532 000 00 03'), '905320000003')
  assert.equal(recipientPhone('+90 532 000 00 03'), '905320000003')
  assert.equal(recipientPhone('123'), '')
})
