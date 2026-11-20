import test from 'node:test'
import assert from 'node:assert/strict'
import { createLogBuffer, installConsoleCapture, LOG_MAX_LINES } from '../server/logBuffer.js'

test('tampon son 1000 satırı tutar ve kimlikleri ilerletir', () => {
  const buffer = createLogBuffer()
  for (let i = 0; i < 1005; i++) buffer.push('info', [i])
  const lines = buffer.list()
  assert.equal(lines.length, LOG_MAX_LINES)
  assert.equal(lines[0]?.id, 6)
  assert.equal(lines.at(-1)?.id, 1005)
  assert.match(lines[0]!.time, /^\d{4}-\d{2}-\d{2}T/)
})

test('hassas değerleri maskeler ve kullanım dışı uyarıları atlar', () => {
  const buffer = createLogBuffer()
  buffer.push('error', [new Error('ornek@example.test +905000000076 Bearer abc.def payload-token=xyz ' + 'a'.repeat(40))])
  buffer.push('warn', ['DeprecationWarning: eski API'])
  assert.equal(buffer.list().length, 1)
  const text = buffer.list()[0]!.text
  assert.match(text, /or\*\*\*@example\.test/)
  assert.match(text, /\*\*\*0076/)
  assert.match(text, /Bearer \[gizli\]/)
  assert.match(text, /payload-token=\[gizli\]/)
  assert.match(text, /\[gizli\]$/)
  assert.doesNotMatch(text, /abc\.def|ornek@|\+905000000076/)
})

test('sorunları ve yeni kayıtları süzer, temizleme kimliği sıfırlamaz', () => {
  const buffer = createLogBuffer()
  buffer.push('info', ['bilgi'])
  buffer.push('warn', ['uyarı'])
  buffer.push('error', ['hata'])
  assert.deepEqual(buffer.list({ onlyProblems: true }).map((line) => line.level), ['warn', 'error'])
  assert.deepEqual(buffer.list({ after: 2 }).map((line) => line.id), [3])
  buffer.clear()
  assert.deepEqual(buffer.list(), [])
  buffer.push('info', ['yeni'])
  assert.equal(buffer.list()[0]?.id, 4)
})

test('konsol yalnız bir kez sarılır ve özgün çıktı korunur', () => {
  const buffer = createLogBuffer()
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error }
  const output: unknown[][] = []
  try {
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      console[method] = (...args: unknown[]) => { output.push(args) }
    }
    installConsoleCapture(buffer)
    installConsoleCapture(buffer)
    console.log('tek satır')
    console.info('bilgi')
    console.warn('uyarı')
    console.error('hata')
    assert.equal(buffer.list().length, 4)
    assert.deepEqual(buffer.list().map((line) => line.level), ['info', 'info', 'warn', 'error'])
    assert.equal(output.length, 4)
  } finally {
    Object.assign(console, original)
  }
})

test('döngüsel nesne kaydı çökmeye yol açmaz', () => {
  const buffer = createLogBuffer()
  const object: { self?: unknown } = {}
  object.self = object
  assert.doesNotThrow(() => buffer.push('info', [object]))
  assert.match(buffer.list()[0]!.text, /\[döngü\]/)
})
