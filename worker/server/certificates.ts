import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import puppeteer from 'puppeteer'
import type { Request, Response } from 'express'
import { CERTIFICATE_LINE_HEIGHT, SAMPLE_AWARD, SAMPLE_CERTIFICATE_CODE, awardText, certificateFontStack, fitTextToBox, googleFontsHref, fittedFontSize, certificateId, certificateLink, certificateTypes, defaultLayout, isCertificateType, normalizeLayout, type CertificateLayout, type CertificateType } from '../shared/certificateLayout.js'
import type { Page, Registration, WorkerEvent } from '../shared/types.js'
import { PayloadClient, PayloadError } from './payload.js'
import { BROWSER_LAUNCH_TIMEOUT_MS, chromePath } from './chrome.js'
import { CONFIG } from './config.js'
import { fillValues } from '../shared/templateVars.js'
import { normalizePhoneNumber } from '../shared/phone.js'
import { cleanEmailHtml } from './mailHtml.js'
import { safeError } from './log.js'
import { MailService } from './mail.js'
import { TemplatesService } from './templates.js'
import { noopReporter, type Reporter } from './telemetry.js'

type CmsCertificate = { id: number; code: string; fullName?: string; imageFile?: number | { url?: string } | null; pdfFile?: number | { url?: string } | null }
type StoredCertificate = { code: string; imageUrl: string | null; pdf: Buffer }
export type CertificateSize = { width: number; height: number }
export type CertificateRenderer = (html: string, size: CertificateSize) => Promise<{ png: Buffer; pdf: Buffer }>
const maxImageBytes = 5 * 1024 * 1024
const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const jpegMagic = Buffer.from([255, 216, 255])

function imageFormat(bytes: Buffer): 'png' | 'jpg' {
  if (bytes.subarray(0, 8).equals(pngMagic) && bytes.length >= 24 && bytes.toString('ascii', 12, 16) === 'IHDR') return 'png'
  if (bytes.subarray(0, 3).equals(jpegMagic) && bytes.length > 4 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return 'jpg'
  throw new PayloadError('Geçersiz PNG veya JPEG görseli.', 400)
}

export function imageSize(bytes: Buffer): CertificateSize {
  const format = imageFormat(bytes)
  if (format === 'png') {
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
    if (width > 0 && height > 0 && width <= 10000 && height <= 10000) return { width, height }
  } else {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 255) break
      const marker = bytes[i + 1], length = bytes.readUInt16BE(i + 2)
      if (length < 2 || i + 2 + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
        const height = bytes.readUInt16BE(i + 5), width = bytes.readUInt16BE(i + 7)
        if (width > 0 && height > 0 && width <= 10000 && height <= 10000) return { width, height }
      }
      i += 2 + length
    }
  }
  throw new PayloadError('Görsel boyutları okunamadı.', 400)
}

export function decodeImage(value: unknown): { bytes: Buffer; format: 'png' | 'jpg'; size: CertificateSize } {
  if (typeof value !== 'string') throw new PayloadError('Görsel gerekli.', 400)
  const match = /^(?:data:image\/(png|jpeg);base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length > Math.ceil(maxImageBytes / 3) * 4 + 4) throw new PayloadError('Görsel biçimi veya boyutu geçersiz.', 400)
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > maxImageBytes || bytes.toString('base64') !== match[2]) throw new PayloadError('Görsel biçimi veya boyutu geçersiz.', 400)
  const format = imageFormat(bytes)
  if (match[1] && match[1] !== (format === 'jpg' ? 'jpeg' : 'png')) throw new PayloadError('Görsel türü içeriğiyle uyuşmuyor.', 400)
  return { bytes, format, size: imageSize(bytes) }
}

async function atomicWrite(file: string, contents: Buffer | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, file)
    await chmod(file, 0o600)
  } catch (error) { await rm(temporary, { force: true }); throw error }
}

export class CertificateStore {
  private readonly dir: string
  private pending: Promise<void> = Promise.resolve()
  constructor(userDataPath: string) { this.dir = path.join(userDataPath, 'certificates') }
  private async layouts(): Promise<Record<string, CertificateLayout>> {
    try {
      const raw: unknown = JSON.parse(await readFile(path.join(this.dir, 'layout.json'), 'utf8'))
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, CertificateLayout> : {}
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }
  async list() {
    const layouts = await this.layouts()
    return Promise.all(certificateTypes.map(async (type) => {
      const found = await this.image(type)
      return { type, hasImage: Boolean(found), layout: normalizeLayout(layouts[type]), updatedAt: found ? (await stat(found.file)).mtime.toISOString() : null }
    }))
  }
  async saveTemplate(type: CertificateType, input: { imageBase64?: string; layout: unknown }): Promise<void> {
    if (!isCertificateType(type)) throw new PayloadError('Sertifika türü geçersiz.', 400)
    if (!input || !input.layout || typeof input.layout !== 'object' || Array.isArray(input.layout)) throw new PayloadError('Yerleşim geçersiz.', 400)
    const decoded = input.imageBase64 === undefined ? null : decodeImage(input.imageBase64)
    const update = async () => {
      const layouts = await this.layouts()
      layouts[type] = normalizeLayout(input.layout)
      if (decoded) await atomicWrite(path.join(this.dir, `${type}.${decoded.format}`), decoded.bytes)
      await atomicWrite(path.join(this.dir, 'layout.json'), JSON.stringify(layouts))
      if (decoded) await rm(path.join(this.dir, `${type}.${decoded.format === 'png' ? 'jpg' : 'png'}`), { force: true })
    }
    const result = this.pending.then(update)
    this.pending = result.catch(() => undefined)
    await result
  }
  async image(type: CertificateType): Promise<{ bytes: Buffer; format: 'png' | 'jpg'; size: CertificateSize; file: string } | null> {
    if (!isCertificateType(type)) throw new PayloadError('Sertifika türü geçersiz.', 400)
    for (const format of ['png', 'jpg'] as const) {
      const file = path.join(this.dir, `${type}.${format}`)
      let bytes: Buffer
      try { bytes = await readFile(file) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
      if (bytes.length > maxImageBytes || imageFormat(bytes) !== format) throw new PayloadError('Şablon görseli bozuk.', 400)
      return { bytes, format, size: imageSize(bytes), file }
    }
    return null
  }
  async layout(type: CertificateType): Promise<CertificateLayout> { return normalizeLayout((await this.layouts())[type]) }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
export function buildCertificateHtml(imageDataUrl: string, size: CertificateSize, layout: CertificateLayout, values: { name: string; id: string; award?: string }): string {
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)) throw new PayloadError('Görsel adresi geçersiz.', 400)
  const field = (box: CertificateLayout['name'], value: string) => {
    const fontSize = fittedFontSize(box, value, size.width)
    // İlk boyut tahmindir; tarayıcıda fitTextToBox yazıyı ölçerek kutuyu dolduracak boyuta getirir
    return `<div data-fit style="position:absolute;left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;display:flex;align-items:center;justify-content:${box.align === 'left' ? 'flex-start' : box.align === 'right' ? 'flex-end' : 'center'}"><span style="display:inline-block;white-space:nowrap;line-height:${CERTIFICATE_LINE_HEIGHT};font-family:${certificateFontStack(box.fontFamily)};font-size:${fontSize}px;font-weight:${box.fontWeight};color:${box.color}">${escapeHtml(value)}</span></div>`
  }
  const award = layout.showAward && values.award ? values.award : ''
  const fonts = googleFontsHref([layout.name.fontFamily, ...(layout.showId ? [layout.id.fontFamily] : []), ...(award ? [layout.award.fontFamily] : [])])
  return `<!doctype html><html><head><meta charset="utf-8">${fonts ? `<link rel="stylesheet" href="${escapeHtml(fonts)}">` : ''}<style>*{box-sizing:border-box}html,body{margin:0;width:${size.width}px;height:${size.height}px}body{position:relative}img{position:absolute;width:100%;height:100%}</style></head><body><img src="${imageDataUrl}">${field(layout.name, values.name)}${layout.showId ? field(layout.id, values.id) : ''}${award ? field(layout.award, award) : ''}</body></html>`
}

/** Google Fonts kullanılıyorsa yazı tipi dosyalarını bekler; bağlantı yoksa en geç 8 sn sonra yedek yığınla devam eder. */
async function waitForFonts(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<void> {
  await Promise.race([page.evaluate('document.fonts.ready.then(() => undefined)'), new Promise((resolve) => setTimeout(resolve, 8000))]).catch(() => undefined)
  // Yazılar ölçülerek kutulara sığdırılır (stüdyo önizlemesiyle aynı fonksiyon)
  await page.evaluate(`(() => { const fit = ${fitTextToBox.toString()}; for (const box of document.querySelectorAll('[data-fit]')) fit(box.firstElementChild, box, 8) })()`)
}

export const chromeCertificateRenderer: CertificateRenderer = async (html, size) => {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath(), timeout: BROWSER_LAUNCH_TIMEOUT_MS, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 })
    await waitForFonts(page)
    const png = Buffer.from(await page.screenshot({ type: 'png' }))
    const pdf = Buffer.from(await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, pageRanges: '1', preferCSSPageSize: false }))
    return { png, pdf }
  } finally { await browser.close() }
}

export async function createChromeRenderer(): Promise<{ render: CertificateRenderer; close: () => Promise<void> }> {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath(), timeout: BROWSER_LAUNCH_TIMEOUT_MS, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'] })
  return {
    render: async (html, size) => {
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 })
        await page.setContent(html, { waitUntil: 'load', timeout: 20000 })
        await waitForFonts(page)
        return { png: Buffer.from(await page.screenshot({ type: 'png' })), pdf: Buffer.from(await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, pageRanges: '1', preferCSSPageSize: false })) }
      } finally { await page.close() }
    },
    close: () => browser.close(),
  }
}

export async function renderCertificate(store: CertificateStore, type: CertificateType, values: { name: string; id: string; award?: string }, renderer: CertificateRenderer = chromeCertificateRenderer) {
  const image = await store.image(type)
  if (!image) throw new PayloadError('Bu tür için şablon yüklenmemiş.', 400)
  const html = buildCertificateHtml(`data:image/${image.format === 'jpg' ? 'jpeg' : 'png'};base64,${image.bytes.toString('base64')}`, image.size, await store.layout(type), values)
  return renderer(html, image.size)
}

export async function certificateTestFile(store: CertificateStore, input: { type: unknown; name?: unknown; format: unknown }, renderer: CertificateRenderer = chromeCertificateRenderer) {
  if (!isCertificateType(input?.type) || (input.format !== 'png' && input.format !== 'pdf')) throw new PayloadError('Test çıktısı seçimi geçersiz.', 400)
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 200)) throw new PayloadError('İsim geçersiz.', 400)
  const rendered = await renderCertificate(store, input.type, { name: (input.name as string)?.trim() || 'Örnek Katılımcı', id: SAMPLE_CERTIFICATE_CODE, award: SAMPLE_AWARD }, renderer)
  return { bytes: rendered[input.format], contentType: input.format === 'png' ? 'image/png' : 'application/pdf', filename: `sertifika-test.${input.format}` }
}

export const certificateTestHandler = (store: CertificateStore, renderer: CertificateRenderer = chromeCertificateRenderer) =>
  async (req: Request, res: Response): Promise<void> => {
    const output = await certificateTestFile(store, req.body, renderer)
    res.setHeader('Content-Disposition', `attachment; filename="${output.filename}"`)
    res.type(output.contentType).send(output.bytes)
  }

type TeamAward = { team: string; rank: number | null; award: string }

/**
 * Takım modunda kişinin takımı ve (yayınlanmış/yazılmış) sonuç sırası: etkinlik sonuçları (results: sıra + takım) +
 * ödüller (prizes: sıra → ad) + takımın kabul edilmiş üyeleri → hesap e-postası. Anahtar: küçük harf e-posta.
 */
export async function teamAwards(payload: Pick<PayloadClient, 'request'>, eventId: number): Promise<Map<string, TeamAward>> {
  const out = new Map<string, TeamAward>()
  const { data: event } = await payload.request<{ teamMode?: boolean; results?: Array<{ rank?: number; team?: number | { id: number } | null }>; prizes?: Array<{ rank?: number; title?: string }> }>(`/events/${eventId}?depth=0`)
  if (!event?.teamMode) return out
  const idOf = (value: unknown) => Number(value && typeof value === 'object' ? (value as { id?: unknown }).id : value)
  const all = async <T>(collection: string, where: Record<string, string>): Promise<T[]> => {
    const docs: T[] = []
    for (let page = 1; page <= 50; page++) {
      const { data } = await payload.request<Page<T>>(`/${collection}?${new URLSearchParams({ ...where, limit: '500', depth: '0', page: String(page) })}`)
      docs.push(...data.docs)
      if (data.hasNextPage !== true) break
    }
    return docs
  }
  const teams = await all<{ id: number; name?: string; status?: string }>('teams', { 'where[event][equals]': String(eventId), 'where[status][equals]': 'accepted' })
  if (!teams.length) return out
  const memberships = await all<{ team?: unknown; participant?: unknown }>('team-memberships', { 'where[team][in]': teams.map((t) => t.id).join(','), 'where[status][equals]': 'accepted' })
  const ids = [...new Set(memberships.map((m) => idOf(m.participant)).filter((id) => id > 0))]
  const people = ids.length ? await all<{ id: number; email?: string }>('participants', { 'where[id][in]': ids.join(',') }) : []
  const rankOf = new Map<number, number>()
  for (const row of event.results ?? []) if (row.team && Number(row.rank) > 0) rankOf.set(idOf(row.team), Number(row.rank))
  for (const m of memberships) {
    const team = teams.find((t) => t.id === idOf(m.team))
    const email = (people.find((p) => p.id === idOf(m.participant))?.email || '').trim().toLowerCase()
    if (!team || !email) continue
    const rank = rankOf.get(team.id) ?? null
    const prize = rank ? (event.prizes ?? []).find((p) => Number(p.rank) === rank)?.title : undefined
    out.set(email, { team: team.name || '', rank, award: rank ? awardText(team.name || '', rank, prize) : '' })
  }
  return out
}

export async function certificateRecipients(payload: Pick<PayloadClient, 'request'>, eventId: number, options: { includeTest?: boolean; history?: CertificateSendHistory } = {}) {
  if (!Number.isInteger(eventId) || eventId <= 0) throw new PayloadError('Etkinlik geçersiz.', 400)
  const recipients: Array<{ id: number; fullName: string; email: string; phone: string; certificateType: CertificateType; certificateId: string; hasEmail: boolean; hasPhone: boolean; hasToken: boolean; sentAt: string | null; team: string; award: string }> = []
  const sent = options.history ? await options.history.read() : []
  const awards = await teamAwards(payload, eventId).catch((): Map<string, TeamAward> => new Map())
  let page = 1
  while (true) {
    const query = new URLSearchParams({ 'where[event][equals]': String(eventId), 'where[attended][equals]': 'true', 'where[status][equals]': 'accepted', depth: '0', limit: '100', page: String(page) })
    const { data } = await payload.request<Page<Registration & { certificateType?: string }>>(`/event-registrations?${query}`)
    for (const reg of data.docs) {
      if (reg.attended !== true || (!options.includeTest && reg.isTest)) continue
      recipients.push({ id: reg.id, fullName: reg.fullName, email: reg.email || '', phone: reg.phone || '', certificateType: isCertificateType(reg.certificateType) ? reg.certificateType : 'participation', certificateId: certificateId(reg.id), hasEmail: Boolean(reg.email), hasPhone: Boolean(reg.phone), hasToken: Boolean(reg.ticketToken), sentAt: sent.filter(entry => entry.eventId === eventId && entry.registrationId === reg.id).at(-1)?.at ?? null,
        team: awards.get((reg.email || '').trim().toLowerCase())?.team ?? '', award: awards.get((reg.email || '').trim().toLowerCase())?.award ?? '' })
    }
    if (data.hasNextPage === false || (data.hasNextPage === undefined && (data.docs.length < 100 || page * 100 >= data.totalDocs))) break
    page++
  }
  return recipients
}

type CertificateSendEntry = { eventId: number; registrationId: number; type: CertificateType; at: string; mail: 'sent' | 'failed' | 'skipped'; whatsapp: 'queued' | 'failed' | 'skipped' }
/** types: kişi başına stüdyoda seçilen tür (ABT gibi); verilmezse kaydın CMS'teki türü, o da yoksa katılım. */
export type CertificateSendRequest = { eventId: number; ids: number[]; mailTemplateId?: number | null; whatsappTemplateId?: number | null; confirmed: true; confirmCount: number; repeatConfirmed?: boolean; includeTest?: boolean; types?: Record<string, CertificateType> }
export type CertificateSendResult = { id: number; mail: CertificateSendEntry['mail']; whatsapp: CertificateSendEntry['whatsapp']; code?: string; error?: string }

export class CertificateSendHistory {
  private readonly file: string
  constructor(userData: string) { this.file = path.join(userData, 'certificate-sends.json') }
  async read(): Promise<CertificateSendEntry[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      return Array.isArray(value) ? value.filter((entry): entry is CertificateSendEntry => entry &&
        Number.isSafeInteger(entry.eventId) && Number.isSafeInteger(entry.registrationId) && isCertificateType(entry.type) &&
        typeof entry.at === 'string' && ['sent', 'failed', 'skipped'].includes(entry.mail) && ['queued', 'failed', 'skipped'].includes(entry.whatsapp))
        .map(({ eventId, registrationId, type, at, mail, whatsapp }) => ({ eventId, registrationId, type, at, mail, whatsapp })) : []
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  async write(entries: CertificateSendEntry[]): Promise<void> { await atomicWrite(this.file, JSON.stringify(entries)) }
}

type SendRegistration = Registration & { certificateType?: string }
type RendererSession = { render: CertificateRenderer; close: () => Promise<void> }
export class CertificateSendService {
  private running = false
  readonly history: CertificateSendHistory
  /** CMS'e kişi bazında sonuç bildirimi (index.ts telemetry bağlar). */
  reporter: Reporter = noopReporter
  uploadRetryDelayMs = 1500
  constructor(private readonly payload: PayloadClient, private readonly templates: TemplatesService,
    private readonly mail: MailService, private readonly store: CertificateStore, userData: string,
    private readonly rendererFactory: () => Promise<RendererSession> = createChromeRenderer) {
    this.history = new CertificateSendHistory(userData)
  }

  /**
   * CMS'te bu kayıt+tür için sertifikayı bulur ya da oluşturur (kodu CMS üretir); dosyaları yoksa
   * görsel (PNG) ve PDF'i üretip media'ya (R2) rastgele adla yükler ve kayda bağlar.
   */
  private async ensureCertificate(reg: SendRegistration, eventId: number, type: CertificateType, session: RendererSession, award = ''): Promise<StoredCertificate> {
    const query = new URLSearchParams({ 'where[registration][equals]': String(reg.id), 'where[type][equals]': type, limit: '1', depth: '1' })
    const { data: found } = await this.payload.request<Page<CmsCertificate>>(`/certificates?${query}`)
    let cert = found.docs[0]
    if (!cert) {
      cert = (await this.payload.request<{ doc: CmsCertificate }>('/certificates', { method: 'POST',
        body: { event: eventId, registration: reg.id, fullName: reg.fullName, type } })).data.doc
    }
    if (!cert?.code) throw new Error('CMS sertifika kodu üretmedi.')
    const rendered = await renderCertificate(this.store, type, { name: cert.fullName || reg.fullName, id: cert.code, award }, session.render)
    const existingImage = typeof cert.imageFile === 'object' && cert.imageFile ? cert.imageFile.url ?? null : null
    if (existingImage && cert.pdfFile) return { code: cert.code, imageUrl: existingImage, pdf: rendered.pdf }
    const upload = async (bytes: Buffer, ext: 'png' | 'pdf', mime: string) => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), `certificate-${randomBytes(24).toString('hex')}.${ext}`)
      form.append('_payload', JSON.stringify({ alt: `Sertifika ${cert!.code}` }))
      const post = async () => (await this.payload.request<{ doc: { id: number; url?: string } }>('/media', { method: 'POST', body: form })).data.doc
      // Tek güvenli yeniden deneme: yalnız bağlantı/sunucu hatasında (503/5xx). Dosya adı rastgele olduğundan
      // ilk deneme aslında başardıysa en kötü ihtimalle bağlanmamış bir yetim medya kalır; kayıt bozulmaz.
      try { return await post() } catch (error) {
        if (!(error instanceof PayloadError) || error.status < 500) throw error
        console.warn(`[certificates] medya yüklemesi yeniden deneniyor (${error.status})`)
        await new Promise((resolve) => setTimeout(resolve, this.uploadRetryDelayMs))
        return post()
      }
    }
    const image = await upload(rendered.png, 'png', 'image/png')
    const pdf = await upload(rendered.pdf, 'pdf', 'application/pdf')
    await this.payload.request(`/certificates/${cert.id}`, { method: 'PATCH', body: { imageFile: image.id, pdfFile: pdf.id } })
    return { code: cert.code, imageUrl: image.url ?? null, pdf: rendered.pdf }
  }

  async send(input: CertificateSendRequest): Promise<{ results: CertificateSendResult[] }> {
    if (this.running) throw new PayloadError('Bir sertifika gönderimi sürüyor.', 409)
    this.running = true
    try { return await this.sendSelected(input) }
    finally { this.running = false }
  }

  private async sendSelected(input: CertificateSendRequest): Promise<{ results: CertificateSendResult[] }> {
    const validId = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0
    if (!input || !validId(input.eventId) || !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 500 ||
      input.ids.some(id => !validId(id)) || new Set(input.ids).size !== input.ids.length || input.confirmed !== true ||
      input.confirmCount !== input.ids.length || (input.repeatConfirmed !== undefined && typeof input.repeatConfirmed !== 'boolean') ||
      (input.includeTest !== undefined && typeof input.includeTest !== 'boolean') ||
      (input.mailTemplateId != null && !validId(input.mailTemplateId)) ||
      (input.whatsappTemplateId != null && !validId(input.whatsappTemplateId)) ||
      (!input.mailTemplateId && !input.whatsappTemplateId) ||
      (input.types !== undefined && (!input.types || typeof input.types !== 'object' || Array.isArray(input.types) ||
        Object.entries(input.types).some(([key, value]) => !input.ids.includes(Number(key)) || String(Number(key)) !== key || !isCertificateType(value)))))
      throw new PayloadError('Sertifika gönderimi onayı veya seçimi geçersiz.', 400)

    const selected: SendRegistration[] = []
    for (const id of input.ids) {
      let reg: SendRegistration
      try { reg = (await this.payload.request<SendRegistration>(`/event-registrations/${id}?depth=0`)).data }
      catch (error) { if (error instanceof PayloadError && error.status === 404) throw new PayloadError('Seçili kayıt değişti veya bulunamadı.', 409); throw error }
      const eventId = typeof reg?.event === 'number' ? reg.event : reg?.event?.id
      if (!reg || reg.id !== id || eventId !== input.eventId || reg.attended !== true || reg.status !== 'accepted' || (reg.isTest && input.includeTest !== true))
        throw new PayloadError('Seçili kayıt artık gönderime uygun değil.', 409)
      selected.push(reg)
    }
    const history = await this.history.read()
    if (input.repeatConfirmed !== true && selected.some(reg => history.some(entry => entry.eventId === input.eventId && entry.registrationId === reg.id)))
      throw new PayloadError('Sertifika daha önce gönderildi; tekrar için onay verin.', 409)

    const event = (await this.payload.request<WorkerEvent>(`/events/${input.eventId}?depth=0`)).data
    if (!event || event.id !== input.eventId) throw new PayloadError('Etkinlik bulunamadı.', 409)
    const mailTemplate = input.mailTemplateId ? await this.templates.mail(input.mailTemplateId) : null
    const waTemplate = input.whatsappTemplateId ? await this.templates.whatsApp(input.whatsappTemplateId) : null
    const cleanHtml = mailTemplate ? cleanEmailHtml(mailTemplate.html) : ''
    // Şablonları önce örnek değerlerle denetle (bilinmeyen değişken varsa hiçbir şey üretilmez/gönderilmez)
    const fill = (values: Record<string, string>) => {
      const subject = mailTemplate ? fillValues(mailTemplate.subject, values) : null
      const html = mailTemplate ? fillValues(cleanHtml, values, true) : null
      const message = waTemplate ? fillValues(waTemplate.message, values) : null
      if ([subject, html, message].some(part => part?.warnings.some(warning => warning.startsWith('Bilinmeyen değişken'))))
        throw new PayloadError('Bilinmeyen değişken var.', 400)
      return { subject: subject?.text, html: html?.text, message: message?.text }
    }
    fill({ sertifikaLinki: certificateLink(CONFIG.siteUrl, SAMPLE_CERTIFICATE_CODE), sertifikaNo: SAMPLE_CERTIFICATE_CODE, adSoyad: 'Örnek', etkinlik: event.title || '', takim: 'Örnek Takım', odul: SAMPLE_AWARD })
    // Takım modunda ödül satırı (takım · sıra · ödül) ve {{takim}} / {{odul}} değişkenleri
    const awards = await teamAwards(this.payload, input.eventId).catch((): Map<string, TeamAward> => new Map())

    const results: CertificateSendResult[] = []
    const total = selected.length
    const eventTitle = event.title || ''
    let session: RendererSession | undefined
    try {
      for (const [position, reg] of selected.entries()) {
        const index = position + 1
        const result: CertificateSendResult = { id: reg.id, mail: 'skipped', whatsapp: 'skipped' }
        const chosen = input.types?.[String(reg.id)]
        const type: CertificateType = chosen ?? (isCertificateType(reg.certificateType) ? reg.certificateType : 'participation')
        if (!(await this.store.image(type))) {
          result.error = 'Şablon yok'; results.push(result)
          this.reporter('certificate_failed', { name: reg.fullName, eventTitle, index, total, reason: `Bu tür (${type}) için şablon görseli yüklenmemiş` })
          continue
        }
        let record: StoredCertificate
        try {
          session ??= await this.rendererFactory()
          // Ödül satırı yalnız Başarı sertifikasına basılır (şablonda "Ödül satırı" açıksa)
          record = await this.ensureCertificate(reg, input.eventId, type, session, type === 'achievement' ? awards.get((reg.email || '').trim().toLowerCase())?.award ?? '' : '')
        } catch (error) {
          result.error = 'Sertifika üretilemedi veya yüklenemedi'
          console.warn('[certificates] üretim/yükleme:', safeError(error).slice(0, 300))
          this.reporter('certificate_failed', { name: reg.fullName, eventTitle, index, total, reason: safeError(error).slice(0, 300) })
          results.push(result); continue
        }
        result.code = record.code
        const mine = awards.get((reg.email || '').trim().toLowerCase())
        const filled = fill({ sertifikaLinki: certificateLink(CONFIG.siteUrl, record.code), sertifikaNo: record.code,
          adSoyad: reg.fullName || '', etkinlik: event.title || '', takim: mine?.team ?? '', odul: mine?.award ?? '' })
        if (mailTemplate && reg.email) {
          try {
            const contentBase64 = record.pdf.toString('base64')
            if (Buffer.byteLength(contentBase64) > 3 * 1024 * 1024) { result.mail = 'failed'; result.error = 'Ek çok büyük' }
            else { await this.mail.sendPaced(reg.email, filled.subject!, filled.html!, [{ filename: `sertifika-${record.code}.pdf`, contentBase64, contentType: 'application/pdf' }],
              { purpose: 'certificate', recipientName: reg.fullName, eventTitle, batchIndex: index, batchTotal: total }); result.mail = 'sent' }
          } catch (error) { result.mail = 'failed'; result.error ??= `Mail gönderilemedi: ${safeError(error).slice(0, 200)}`; console.warn('[certificates] mail:', safeError(error)) }
        }
        if (waTemplate && reg.phone) {
          try {
            const normalized = normalizePhoneNumber(reg.phone)
            const originalDigits = reg.phone.replace(/\D/g, '')
            const to = /^90\d{10}$/.test(normalized) ? normalized : originalDigits
            if (!/^90\d{10}$/.test(to)) throw new Error('Telefon geçersiz.')
            // ABT gibi: sertifika görseli WhatsApp mesajına eklenir (CDN adresi; mediaHosts izin listesinde)
            await this.payload.request('/wa-queue', { method: 'POST', body: { to, message: filled.message, source: 'bulk', status: 'pending',
              ...(record.imageUrl ? { mediaUrl: record.imageUrl } : {}), relatedEvent: input.eventId, relatedRegistration: reg.id } })
            result.whatsapp = 'queued'
          } catch (error) { result.whatsapp = 'failed'; result.error ??= `WhatsApp kuyruğu oluşturulamadı: ${safeError(error).slice(0, 200)}`; console.warn('[certificates] WhatsApp kuyruğu:', safeError(error)) }
        }
        this.reporter('certificate_result', { name: reg.fullName, code: record.code, eventTitle, mail: result.mail,
          whatsapp: result.whatsapp, error: result.error, index, total })
        if (result.mail === 'sent' || result.whatsapp === 'queued') {
          history.push({ eventId: input.eventId, registrationId: reg.id, type,
            at: new Date().toISOString(), mail: result.mail, whatsapp: result.whatsapp })
          await this.history.write(history)
        }
        results.push(result)
      }
    } finally {
      await session?.close()
      this.reporter('certificate_batch', { eventTitle, total,
        mailSent: results.filter((item) => item.mail === 'sent').length, mailFailed: results.filter((item) => item.mail === 'failed').length,
        waQueued: results.filter((item) => item.whatsapp === 'queued').length, waFailed: results.filter((item) => item.whatsapp === 'failed').length,
        failed: total - results.filter((item) => item.code).length })
    }
    return { results }
  }
}
