import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Request, Response } from 'express'
import { KULUP } from '../shared/kulup.js'
import { certificateId, certificateLink, defaultLayout, normalizeLayout } from '../shared/certificateLayout.js'
import { buildCertificateHtml, certificateRecipients, certificateTestHandler, CertificateStore, decodeImage, teamAwards } from '../server/certificates.js'

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,3,232,0,0,2,88,8,2,0,0,0])
const jpeg = Buffer.from([255,216,255,192,0,11,8,2,88,3,232,3,1,17,0,255,217])

test('yerleşim, kimlik ve bağlantı', () => {
  const box = normalizeLayout({ showId: false, name: { x: -5, y: 300, w: 200, h: -2, fontFamily: 'unknown', fontSize: 500, color: 'red' } }).name
  assert.deepEqual([box.x, box.y, box.w, box.h, box.fontSize, box.fontFamily, box.color], [0, 100, 100, 0, 200, 'Arial', '#000000'])
  assert.equal(certificateId(42), `${KULUP.sertifika.onEk}-42`)
  assert.equal(certificateLink('https://example.invalid/', 'TST-2026-KTLM-ABC'), 'https://example.invalid/sertifika/TST-2026-KTLM-ABC')
})

test('HTML kaçışlı, harici kaynaksız, uzun isimde küçük yazılı', () => {
  const image = `data:image/png;base64,${png.toString('base64')}`
  const regular = buildCertificateHtml(image, { width: 1000, height: 600 }, defaultLayout(), { name: 'Ada', id: 'TST-1' })
  const long = buildCertificateHtml(image, { width: 1000, height: 600 }, defaultLayout(), { name: '<script>' + 'A'.repeat(100), id: 'TST-1' })
  assert.ok(long.includes('&lt;script&gt;'))
  assert.ok(!long.includes('<script>') && !long.includes('http'))
  assert.ok(regular.includes('font-size:48px') && !long.includes('font-size:48px'))
})

test('görsel sihirli bayt, tür ve boyut', () => {
  assert.equal(decodeImage(png.toString('base64')).format, 'png')
  assert.equal(decodeImage(jpeg.toString('base64')).format, 'jpg')
  assert.throws(() => decodeImage(`data:image/jpeg;base64,${png.toString('base64')}`), /uyuşmuyor/)
  assert.throws(() => decodeImage(Buffer.from('bad').toString('base64')), /Geçersiz PNG/)
  assert.throws(() => decodeImage(Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')), /boyutu/)
})

test('depo 0600 ve atomik; sahte üretici test dosyası döndürür', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kulup-certificate-'))
  try {
    const store = new CertificateStore(dir)
    await store.saveTemplate('participation', { imageBase64: png.toString('base64'), layout: defaultLayout() })
    const first = (await store.image('participation'))!
    if (process.platform !== 'win32') assert.equal((await stat(first.file)).mode & 0o777, 0o600)
    if (process.platform !== 'win32') assert.equal((await stat(path.join(dir, 'certificates', 'layout.json'))).mode & 0o777, 0o600)
    assert.deepEqual(await readFile(first.file), png)
    assert.equal((await store.list())[0].hasImage, true)
    const response = { headers: {} as Record<string, string>, body: null as Buffer | null, contentType: '',
      setHeader(key: string, value: string) { this.headers[key] = value; return this },
      type(value: string) { this.contentType = value; return this },
      send(value: Buffer) { this.body = value; return this },
    }
    await certificateTestHandler(store, async (html, size) => {
      assert.ok(html.includes('Örnek Katılımcı'))
      assert.deepEqual(size, { width: 1000, height: 600 })
      return { png: Buffer.from('fake-png'), pdf: Buffer.from('fake-pdf') }
    })({ body: { type: 'participation', format: 'pdf' } } as Request, response as unknown as Response)
    assert.deepEqual([response.contentType, response.headers['Content-Disposition'], response.body?.toString()], ['application/pdf', 'attachment; filename="sertifika-test.pdf"', 'fake-pdf'])
    await store.saveTemplate('participation', { imageBase64: jpeg.toString('base64'), layout: defaultLayout() })
    assert.equal((await store.image('participation'))?.format, 'jpg')
    await assert.rejects(readFile(first.file), { code: 'ENOENT' })
    assert.deepEqual((await readdir(path.join(dir, 'certificates'))).filter(file => file.endsWith('.tmp')), [])
    await rename(path.join(dir, 'certificates', 'participation.jpg'), first.file)
    await assert.rejects(store.image('participation'), { status: 400 })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('alıcılar attended, isTest ve sayfalama ile süzülür; arama için iletişim bilgisi gelir, bilet jetonu gelmez', async () => {
  const seen: string[] = []
  const payload = { request: async (url: string) => {
    seen.push(url)
    const page = Number(new URLSearchParams(url.split('?')[1]).get('page'))
    return { data: page === 1 ? { docs: [
      { id: 1, fullName: 'A', attended: true, isTest: false, email: 'test@example.invalid', phone: '+900000000001', ticketToken: 'x', certificateType: 'achievement' },
      { id: 2, fullName: 'B', attended: false }, { id: 3, fullName: 'C', attended: true, isTest: true },
    ], hasNextPage: true, totalDocs: 4 } : { docs: [{ id: 4, fullName: 'D', attended: true }], hasNextPage: false, totalDocs: 4 } }
  } }
  const docs = await certificateRecipients(payload as never, 7)
  assert.deepEqual(docs.map(x => x.id), [1, 4])
  assert.deepEqual([docs[0].certificateType, docs[0].certificateId, docs[0].hasEmail, docs[0].hasPhone, docs[0].hasToken], ['achievement', certificateId(1), true, true, true])
  assert.deepEqual([docs[0].email, docs[0].phone, docs[1].email], ['test@example.invalid', '+900000000001', ''])
  assert.ok(!('ticketToken' in docs[0]))
  const registrations = seen.filter(url => url.startsWith('/event-registrations'))
  assert.equal(registrations.length, 2)
  assert.ok(registrations[0].includes('where%5Battended%5D%5Bequals%5D=true'))
  assert.deepEqual((await certificateRecipients(payload as never, 7, { includeTest: true })).map(x => x.id), [1, 3, 4])
})

test('Google Fonts ailesi yerleşimde saklanır ve çıktıda yüklenir; güvensiz ad reddedilir', () => {
  const layout = normalizeLayout({ ...defaultLayout(), customFonts: ['Great Vibes', "x';}<b>", 'Arial'], name: { ...defaultLayout().name, fontFamily: 'Great Vibes' } })
  assert.deepEqual(layout.customFonts, ['Great Vibes'])
  assert.equal(layout.name.fontFamily, 'Great Vibes')
  const html = buildCertificateHtml(`data:image/png;base64,${png.toString('base64')}`, { width: 1000, height: 600 }, layout, { name: 'Ada', id: 'TST-1' })
  assert.ok(html.includes('https://fonts.googleapis.com/css2?family=Great+Vibes'))
  assert.ok(html.includes("'Great Vibes',Arial"))
  assert.equal(normalizeLayout({ name: { fontFamily: 'Great Vibes' } }).name.fontFamily, 'Arial')
})

test('takım ödülleri: kazanan üyeye takım · derece · ödül, diğer kabul takımlara yalnız takım adı', async () => {
  const data: Record<string, unknown> = {
    '/events/7': { teamMode: true, results: [{ rank: 1, team: 10 }], prizes: [{ rank: 1, title: '10.000 TL' }] },
    '/teams': { docs: [{ id: 10, name: 'Test Kartal' }, { id: 11, name: 'Test Şahin' }], hasNextPage: false },
    '/team-memberships': { docs: [{ team: 10, participant: 1 }, { team: 11, participant: 2 }], hasNextPage: false },
    '/participants': { docs: [{ id: 1, email: ' Test1@Example.invalid ' }, { id: 2, email: 'test2@example.invalid' }], hasNextPage: false },
  }
  const payload = { request: async (url: string) => ({ data: data[url.split('?')[0]] }) }
  const awards = await teamAwards(payload as never, 7)
  assert.equal(awards.get('test1@example.invalid')?.rank, 1)
  assert.match(awards.get('test1@example.invalid')?.award ?? '', /Test Kartal.*10\.000 TL/)
  assert.deepEqual(awards.get('test2@example.invalid'), { team: 'Test Şahin', rank: null, award: '' })
  assert.equal((await teamAwards({ request: async () => ({ data: { teamMode: false } }) } as never, 7)).size, 0)
})
