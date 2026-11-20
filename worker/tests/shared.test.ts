import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhoneNumber } from '../shared/phone.js'
import { fillTemplate, gateFieldValues, templateKeys } from '../shared/templateVars.js'

test('telefon numarası WhatsApp formatına çevrilir', () => {
  assert.equal(normalizePhoneNumber('+90 (533) 000 00 07'), '905330000007')
  assert.equal(normalizePhoneNumber('0533 000 00 07'), '905330000007')
  assert.equal(normalizePhoneNumber('90 0533 000 00 07'), '905330000007')
})

test('şablon değerleri HTML kaçışını, boş ve bilinmeyen değişkenleri işler', () => {
  const context = {
    registration: { id: 1, event: 2, fullName: 'Ada <A>', status: 'accepted' as const, ticketToken: 'abcdef0000000789' },
    event: { id: 2, title: 'Kulüp & Yazılım', date: '2026-09-23T18:00:00+03:00' },
  }
  const result = fillTemplate('{{adSoyad}} {{etkinlik}} {{masa}} {{bilinmeyen}}', context, true)
  assert.match(result.text, /Ada &lt;A&gt; Kulüp &amp; Yazılım/)
  assert.match(result.text, /{{bilinmeyen}}/)
  assert.equal(result.warnings.length, 2)
  const date = fillTemplate('{{tarih}} {{saat}}', context)
  assert.match(date.text, /23 Eylül 2026/)
  assert.match(date.text, /18:00/)
  assert.match(fillTemplate('{{ad<span>}}', context, true).warnings.join(' '), /bölmüş/)
})

test('kapı alanları şablonda kullanılır ve yerleşik düğmeler sabit kalır', () => {
  const context = {
    registration: { id: 1, event: 2, fullName: 'Örnek Kişi', status: 'accepted' as const,
      ticketToken: 'abcdef0000000789', gateFields: { masa: 'A12', grup: 'B' } },
    event: { id: 2, title: 'Örnek Etkinlik' },
  }
  assert.deepEqual(fillTemplate('{{masa}} {{grup}}', context), { text: 'A12 B', warnings: [] })
  assert.ok(templateKeys.includes('masa'))
  assert.equal((templateKeys as readonly string[]).includes('grup'), false)
})

test('kapı alanları yerleşik değişkenleri ezmez', () => {
  const context = {
    registration: { id: 1, event: 2, fullName: 'Örnek Kişi', status: 'accepted' as const,
      ticketToken: 'abcdef0000000789', gateFields: { adSoyad: 'Sahte', biletLinki: 'javascript:x' } },
    event: { id: 2, title: 'Örnek Etkinlik' },
  }
  const result = fillTemplate('{{adSoyad}} {{biletLinki}}', context)
  assert.match(result.text, /^Örnek Kişi /)
  assert.ok(!result.text.includes('Sahte') && !result.text.includes('javascript:x'))
  assert.deepEqual(result.warnings, [])
})

test('kapı alanları HTML modunda kaçışlıdır', () => {
  const context = {
    registration: { id: 1, event: 2, fullName: 'Örnek Kişi', status: 'accepted' as const,
      gateFields: { masa: '<b>1</b>' } },
    event: { id: 2, title: 'Örnek Etkinlik' },
  }
  assert.deepEqual(fillTemplate('{{masa}}', context, true), { text: '&lt;b&gt;1&lt;/b&gt;', warnings: [] })
})

test('geçersiz kapı alanları ve prototip değişkenleri bilinmeyen kalır', () => {
  const gateFields = { grup: ' B ', sayi: 12, nesne: { x: 1 }, dizi: ['A'],
    bayrak: true, bos: null, sonsuz: Infinity, 'geçersiz': 'X', '1alan': 'X',
    constructor: 'X', prototype: 'X', ['__proto__']: 'X' }
  assert.deepEqual({ ...gateFieldValues(gateFields) }, { grup: 'B', sayi: '12' })
  assert.deepEqual({ ...gateFieldValues([gateFields]) }, {})
  assert.deepEqual({ ...gateFieldValues(new Date()) }, {})
  const context = {
    registration: { id: 1, event: 2, fullName: 'Örnek Kişi', status: 'accepted' as const,
      gateFields: gateFields as unknown as Record<string, string> },
    event: { id: 2, title: 'Örnek Etkinlik' },
  }
  const result = fillTemplate('{{grup}} {{sayi}} {{nesne}} {{toString}} {{__proto__}}', context)
  assert.match(result.text, /^B 12 /)
  assert.deepEqual(result.warnings, [
    'Bilinmeyen değişken: nesne', 'Bilinmeyen değişken: toString', 'Bilinmeyen değişken: __proto__',
  ])
})

test('kapı alanı yoksa masa boş kalır; alan sayısı ve değer uzunluğu sınırlıdır', () => {
  const registration = { id: 1, event: 2, fullName: 'Örnek Kişi', status: 'accepted' as const }
  const event = { id: 2, title: 'Örnek Etkinlik' }
  assert.deepEqual(fillTemplate('{{masa}}', { registration, event }),
    { text: '', warnings: ['Boş değişken: masa'] })
  assert.deepEqual(fillTemplate('{{masa}}', { registration: { ...registration, gateFields: null }, event }),
    { text: '', warnings: ['Boş değişken: masa'] })
  const values = gateFieldValues(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`alan${i}`, ` ${'a'.repeat(201)} `])))
  assert.equal(Object.keys(values).length, 20)
  assert.equal(values.alan0.length, 200)
  assert.equal(Object.hasOwn(values, 'alan20'), false)
})

test('safeError çerez, anahtar ve telefon değerlerini gizler', async () => {
  const { safeError } = await import('../server/log.js')
  const out = safeError(new Error('Cookie: payload-token=abc.def.ghi; payload-totp=xyz Bearer tok123 re_Secret99 +905320000007'))
  assert.ok(!out.includes('abc.def.ghi') && !out.includes('xyz') && !out.includes('tok123') && !out.includes('Secret99') && !out.includes('5320000007'), out)
  assert.ok(out.includes('payload-token=[gizli]') && out.includes('***0007'), out)
})

test('bağlantı adresi düzeltilir', async () => {
  const { normalizeLink } = await import('../src/ui/EmailHtmlEditor.js')
  assert.equal(normalizeLink('https://https://www.example.com'), 'https://www.example.com/')
  assert.equal(normalizeLink('www.example.com'), 'https://www.example.com/')
  assert.equal(normalizeLink('{{biletLinki}}'), '{{biletLinki}}')
  assert.equal(normalizeLink('mailto:kulup@example.invalid'), 'mailto:kulup@example.invalid')
  assert.equal(normalizeLink('merhaba'), null)
  assert.equal(normalizeLink('javascript:alert(1)'), null)
})

test('telefon numarası WhatsApp formatına çevrilir', () => {
  assert.equal(normalizePhoneNumber('+90 (533) 000 00 07'), '905330000007')
  assert.equal(normalizePhoneNumber('0533 000 00 07'), '905330000007')
  assert.equal(normalizePhoneNumber('90 0533 000 00 07'), '905330000007')
})

test('mesajdaki ad: link ve WhatsApp biçimi ayıklanır', async () => {
  const { plainName } = await import('../shared/templateVars.js')
  assert.equal(plainName('Ayşe https://www.example.com/ticket/abcdef0000000789 *Test*'), 'Ayşe Test')
  assert.equal(plainName('www.kotu.site Mehmet'), 'Mehmet')
})
