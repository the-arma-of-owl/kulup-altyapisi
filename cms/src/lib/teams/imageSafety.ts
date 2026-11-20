/**
 * Takım sayfalarına kullanıcıların yüklediği görseller için güvenli işleme.
 *
 * Akış (sıra önemli — ucuz ve güvenli kontroller önce):
 *   1) Bayt boyutu   → decode'dan ÖNCE (too_large)
 *   2) Magic-byte    → yalnız PNG/JPEG/WebP/GIF; uzantıya/Content-Type'a güvenilmez
 *   3) Başlık okuma  → piksel/kare sınırı decode'dan önce (bomba koruması)
 *   4) Tam decode    → limitInputPixels + failOn + zaman aşımı
 *   5) Yeniden kodla → her zaman WebP; EXIF/ICC/XMP/IPTC dahil tüm metadata atılır
 *
 * Saf fonksiyon: ağ ve disk erişimi yok. Çıktı baytları tamamen yeniden
 * üretildiği için girdiye eklenmiş (polyglot) yükler çıktıya taşınmaz.
 */
import { randomBytes } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import sharp, { type Metadata, type OutputInfo, type SharpOptions } from 'sharp'

export type ImageKind = 'logo' | 'cover' | 'gif'

export type ImageRejectCode =
  | 'too_large'
  | 'bad_signature'
  | 'bad_type'
  | 'too_many_pixels'
  | 'too_many_frames'
  | 'decode_failed'

export class ImageRejected extends Error {
  code: ImageRejectCode
  constructor(code: ImageRejectCode, message: string) {
    super(message)
    this.name = 'ImageRejected'
    this.code = code
  }
}

/** Çıktı sınırları (sözleşme). Vercel gövde sınırı ~4.5 MB'ın altında kalır. */
export const IMAGE_LIMITS: Record<
  ImageKind,
  { maxBytes: number; maxWidth: number; maxHeight: number; maxFrames: number }
> = {
  logo: { maxBytes: 2 * 1024 * 1024, maxWidth: 1024, maxHeight: 1024, maxFrames: 1 },
  cover: { maxBytes: 3 * 1024 * 1024, maxWidth: 2400, maxHeight: 1200, maxFrames: 1 },
  gif: { maxBytes: 4 * 1024 * 1024, maxWidth: 800, maxHeight: 800, maxFrames: 120 },
}

/**
 * Girdi (decode) sınırları. Büyük ama makul görseller küçültülür; bunları
 * aşanlar piksel bombası sayılıp reddedilir.
 * - framePixels: tek karenin en fazla piksel sayısı
 * - totalPixels: kare × piksel toplamı (animasyon bombası)
 * - maxSide:     tek kenar sınırı (1×10⁹ gibi uç oranlar için)
 */
export const DECODE_LIMITS: Record<
  ImageKind,
  { framePixels: number; totalPixels: number; maxSide: number }
> = {
  logo: { framePixels: 40_000_000, totalPixels: 40_000_000, maxSide: 12_000 },
  cover: { framePixels: 50_000_000, totalPixels: 50_000_000, maxSide: 16_383 },
  gif: { framePixels: 2048 * 2048, totalPixels: 80_000_000, maxSide: 4096 },
}

/** Kodlama kalitesi: [ilk deneme, düşük kaliteli ikinci deneme]. */
const QUALITY: Record<ImageKind, [number, number]> = {
  logo: [90, 70],
  cover: [82, 62],
  gif: [75, 50],
}

/** Tek bir görselin işlenmesi için üst süre (saniye) — CPU tüketme saldırılarına karşı. */
const TIMEOUT_SECONDS = 15

type DetectedFormat = 'png' | 'jpeg' | 'webp' | 'gif'

const MIME_TO_FORMAT: Record<string, DetectedFormat> = {
  'image/png': 'png',
  'image/apng': 'png', // APNG yalnız ilk karesiyle (statik PNG gibi) okunur
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Hangi türde hangi giriş biçimleri kabul edilir. */
const ALLOWED_FORMATS: Record<ImageKind, DetectedFormat[]> = {
  logo: ['png', 'jpeg', 'webp', 'gif'],
  cover: ['png', 'jpeg', 'webp', 'gif'],
  gif: ['gif', 'webp'],
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(n % (1024 * 1024) === 0 ? 0 : 1)} MB`

export type SanitizedImage = {
  buffer: Buffer
  mime: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  ext: string
  width: number
  height: number
  frames: number
}

export async function sanitizeImage(input: Buffer, kind: ImageKind): Promise<SanitizedImage> {
  const limits = IMAGE_LIMITS[kind]
  const decode = DECODE_LIMITS[kind]
  if (!limits) throw new ImageRejected('bad_type', 'Bilinmeyen görsel türü.')

  // 1) Boyut — hiçbir ayrıştırma yapmadan önce.
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new ImageRejected('bad_signature', 'Dosya boş ya da okunamadı.')
  }
  if (input.length > limits.maxBytes) {
    throw new ImageRejected(
      'too_large',
      `Dosya çok büyük. En fazla ${mb(limits.maxBytes)} yükleyebilirsiniz.`,
    )
  }

  // 2) Magic-byte imzası. Görsel olmayan her şey (HTML, SVG, PDF, ZIP, EXE…) burada düşer.
  let detectedMime: string | undefined
  try {
    detectedMime = (await fileTypeFromBuffer(input))?.mime
  } catch {
    detectedMime = undefined
  }
  // file-type gövdesi bozuk dosyalarda (ör. imzadan sonra çöp) sonuç vermeyebilir.
  // Ham imza yine de izinli bir biçimse sharp'a bırakılır; orada decode_failed olur.
  detectedMime ??= sniffMagic(input)
  if (!detectedMime || !detectedMime.startsWith('image/')) {
    throw new ImageRejected(
      'bad_signature',
      'Dosya geçerli bir görsel değil. Yalnızca PNG, JPEG, WebP veya GIF yükleyebilirsiniz.',
    )
  }
  const format = MIME_TO_FORMAT[detectedMime]
  if (!format || !ALLOWED_FORMATS[kind].includes(format)) {
    throw new ImageRejected(
      'bad_type',
      kind === 'gif'
        ? 'Hareketli görsel için yalnızca GIF veya WebP yükleyebilirsiniz.'
        : 'Bu görsel biçimi desteklenmiyor. Yalnızca PNG, JPEG, WebP veya GIF yükleyebilirsiniz.',
    )
  }

  const animated = kind === 'gif'
  const baseOptions: SharpOptions = {
    failOn: 'error', // bozuk/kesik dosyalar reddedilir; yalnız uyarılar tolere edilir
    limitInputPixels: animated ? decode.totalPixels : decode.framePixels,
    sequentialRead: true,
  }

  // 3) Yalnız başlığı oku: boyut ve kare sayısını decode etmeden denetle.
  let meta: Metadata
  try {
    meta = await sharp(input, { ...baseOptions, limitInputPixels: false }).metadata()
  } catch {
    throw decodeFailed()
  }
  // file-type ile libvips aynı biçimi görmeli; aksi hâlde polyglot/karışık dosyadır.
  const vipsFormat = meta.format === ('jpg' as string) ? 'jpeg' : meta.format
  if (vipsFormat !== format) {
    throw new ImageRejected('bad_signature', 'Dosya içeriği görsel biçimiyle uyuşmuyor.')
  }
  const fw = meta.width ?? 0
  const fh = meta.height ?? 0 // animated:false iken tek karenin yüksekliği
  const pages = Math.max(1, meta.pages ?? 1)
  if (fw <= 0 || fh <= 0) throw decodeFailed()
  if (fw > decode.maxSide || fh > decode.maxSide || fw * fh > decode.framePixels) {
    throw tooManyPixels()
  }
  if (animated) {
    if (pages > limits.maxFrames) {
      throw new ImageRejected(
        'too_many_frames',
        `Hareketli görselde en fazla ${limits.maxFrames} kare olabilir (bu dosyada ${pages} var).`,
      )
    }
    if (fw * fh * pages > decode.totalPixels) throw tooManyPixels()
  }

  // 4–5) Decode + yeniden kodla. Sınırı aşan boyutlar küçültülür (büyütülmez).
  const encode = async (quality: number) => {
    let img = sharp(input, { ...baseOptions, animated, pages: animated ? -1 : 1 }).timeout({
      seconds: TIMEOUT_SECONDS,
    })
    // EXIF yönünü piksellere uygula; ardından metadata zaten yazılmıyor.
    // (Animasyonlu çok sayfalı görüntülerde döndürme desteklenmez; GIF/WebP'de yön etiketi pratikte yok.)
    if (!animated) img = img.rotate()
    img = img.resize({
      width: limits.maxWidth,
      height: limits.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    // sharp varsayılanı: withMetadata/keepExif/keepIccProfile çağrılmadıkça
    // EXIF, ICC, XMP, IPTC yazılmaz; renkler sRGB'ye dönüştürülür.
    return img
      .webp({ quality, alphaQuality: 100, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })
  }

  const [q1, q2] = QUALITY[kind]
  let out: { data: Buffer; info: OutputInfo }
  try {
    out = await encode(q1)
    // 6) Çıktı hâlâ büyükse kaliteyi düşürüp bir kez daha dene.
    if (out.data.length > limits.maxBytes) out = await encode(q2)
  } catch (err) {
    if (err instanceof ImageRejected) throw err
    const msg = err instanceof Error ? err.message : ''
    if (/pixel limit/i.test(msg)) throw tooManyPixels()
    throw decodeFailed()
  }
  if (out.data.length > limits.maxBytes) {
    throw new ImageRejected(
      'too_large',
      `Görsel sıkıştırıldıktan sonra bile ${mb(limits.maxBytes)} sınırını aşıyor. Daha küçük ya da daha kısa bir görsel deneyin.`,
    )
  }

  const outPages = Math.max(1, out.info.pages ?? 1)
  const outHeight = animated && out.info.pageHeight ? out.info.pageHeight : out.info.height
  return {
    buffer: out.data,
    mime: 'image/webp',
    ext: 'webp',
    width: out.info.width,
    height: outHeight,
    frames: animated ? outPages : 1,
  }
}

/** Yalnız izinli dört biçimin ham sihirli baytları (file-type'ın yedeği). */
function sniffMagic(b: Buffer): string | undefined {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  const head = b.subarray(0, 12).toString('latin1')
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

function tooManyPixels() {
  return new ImageRejected(
    'too_many_pixels',
    'Görselin çözünürlüğü çok yüksek. Lütfen daha küçük boyutlu bir görsel yükleyin.',
  )
}

function decodeFailed() {
  return new ImageRejected('decode_failed', 'Görsel okunamadı; dosya bozuk ya da eksik olabilir.')
}

/**
 * Depolama için tahmin edilemez nesne adı: `team-<32 hex>.<ext>`.
 * Kullanıcının verdiği dosya adı hiçbir zaman kullanılmaz.
 */
export function randomObjectName(ext: string): string {
  const clean = String(ext ?? '')
    .replace(/^\./, '')
    .toLowerCase()
  if (!/^[a-z0-9]{1,5}$/.test(clean)) throw new Error('Geçersiz dosya uzantısı')
  return `team-${randomBytes(16).toString('hex')}.${clean}`
}
