import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLine, mergeLines, type LogLine } from '../src/ui/logFormat.js'

const line = (id: number): LogLine => ({ id, time: '2026-09-29T12:34:56.000Z', level: 'warn', text: `satır ${id}` })

test('mergeLines aynı kimliği bir kez tutar ve yeni satırı sıraya koyar', () => {
  assert.deepEqual(mergeLines([line(2), line(1)], [line(2), line(3)], 1000).map((item) => item.id), [1, 2, 3])
})

test('mergeLines en yeni 1000 satırı tutar', () => {
  const merged = mergeLines(Array.from({ length: 1000 }, (_, index) => line(index + 1)), [line(1001), line(1002)], 1000)
  assert.equal(merged.length, 1000)
  assert.equal(merged[0]?.id, 3)
  assert.equal(merged.at(-1)?.id, 1002)
})

test('formatLine saat, seviye ve metni içerir', () => {
  const formatted = formatLine(line(1))
  assert.match(formatted, /^\d{2}:\d{2}:\d{2} \[UYARI\] satır 1$/)
})
