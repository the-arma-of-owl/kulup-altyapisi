import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page, QueueItem, QueueListItem } from '../shared/types.js'
import { PayloadClient, PayloadError } from './payload.js'
import { WhatsAppManager, UnregisteredNumberError, type WhatsAppMedia } from './whatsapp.js'
import { safeError } from './log.js'
import { ticketQrMedia, ticketTokenFromMessage } from './tickets.js'
import { noopReporter, type Reporter } from './telemetry.js'

const GATE_BACKLOG_MS = 20 * 60_000
type Result = { sent: number; failed: number; cancelled: number; uncertain: number }
/** Bağlantı kopunca yarıda kalan gönderim; yeniden bağlanınca "Devam et" ile kalanlar gönderilir. */
export type InterruptedJob = { interruptedAt: string; reason: string; total: number; sent: number; remaining: number[] }
type Clock = { now: () => number; wait: (ms: number) => Promise<void>; gap: () => number }
const defaultClock: Clock = {
  now: Date.now, wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  gap: () => 2000 + Math.floor(Math.random() * 3001),
}

export class QueueService {
  /** Yutulan kuyruk hataları ve yarıda kalan işler CMS'e bildirilir (index.ts telemetry bağlar). */
  reporter: Reporter = noopReporter
  private activeRun: Promise<Result> | null = null
  private timer: NodeJS.Timeout | null = null
  private lastSendAt = 0
  private connectedAt: number | null = null
  private connectionGeneration = 0
  private approvedWindows: Array<{ from: number; until: number }> = []
  private readonly uncertainPath: string
  private readonly jobPath: string

  constructor(private readonly payload: PayloadClient, private readonly whatsapp: WhatsAppManager,
    userData: string, private readonly clock: Clock = defaultClock) {
    this.uncertainPath = path.join(userData, 'queue-uncertain.json')
    this.jobPath = path.join(userData, 'queue-job.json')
  }

  /** Yarıda kalan iş; kalanlardan hâlâ bekleyen olmayanlar düşülür. */
  async interruptedJob(): Promise<(InterruptedJob & { pendingRemaining: number }) | null> {
    const job = await this.readJob()
    if (!job) return null
    const pending = new Set((await this.pending()).map((item) => item.id))
    const remaining = job.remaining.filter((id) => pending.has(id))
    if (!remaining.length) { await this.clearJob(); return null }
    return { ...job, remaining, pendingRemaining: remaining.length }
  }

  async resumeJob(): Promise<Result> {
    const job = await this.interruptedJob()
    if (!job) throw new PayloadError('Devam edilecek yarım gönderim yok.', 404)
    if (!this.whatsapp.connected()) throw new PayloadError('WhatsApp bağlı değil.', 409)
    await this.clearJob()
    return this.send(job.remaining)
  }

  async discardJob(): Promise<{ ok: true }> { await this.clearJob(); return { ok: true } }

  markConnected(): void { this.connectedAt = this.clock.now() }
  markDisconnected(): void { this.connectedAt = null; this.approvedWindows = []; this.connectionGeneration++ }

  // Karar isteği tamamlandığında yalnız bu isteğin süresinde oluşan kayıtlar onaylanır.
  approveCreatedAfter(startedAt: number): void {
    if (!Number.isFinite(startedAt) || startedAt > this.clock.now()) throw new PayloadError('Onay zamanı geçersiz.', 400)
    this.approvedWindows = this.approvedWindows.filter(({ until }) => until >= this.clock.now() - 24 * 3600_000)
    this.approvedWindows.push({ from: startedAt, until: this.clock.now() })
    if (this.whatsapp.connected()) void this.runAutomatic().catch((error) => this.automaticFailed(error))
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.whatsapp.connected()) void this.runAutomatic().catch((error) => this.automaticFailed(error))
    }, 5000)
  }

  /** Otomatik tur 5 sn'de bir döner; hata eskiden sessizce yutuluyordu. Aynı hata 15 dk'da bir bildirilir. */
  private automaticFailed(error: unknown): void {
    const message = safeError(error)
    console.warn('[queue] otomatik gönderim turu başarısız:', message)
    this.reporter('queue_error', { message, automatic: true }, { dedupeKey: `queue-${message.slice(0, 80)}`, dedupeMs: 900_000 })
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.activeRun?.catch(() => undefined)
  }

  private eligible(item: QueueItem): boolean {
    const created = Date.parse(item.createdAt)
    if (!Number.isFinite(created)) return false
    if (this.approvedWindows.some(({ from, until }) => until >= this.clock.now() - 24 * 3600_000 && created >= from && created <= until)) return true
    // Kapı hoş geldin mesajı: bağlıyken oluşanlar, ve bağlantı kopup geri gelince son 20 dakikada birikenler
    // (girişte kopan WhatsApp mesajları kendiliğinden gider; daha eskisi bayat sayılır, elle gönderilir)
    return item.source === 'gate' && this.connectedAt !== null
      && (created >= this.connectedAt - 15_000 || created >= this.clock.now() - GATE_BACKLOG_MS)
  }

  private async pending(): Promise<QueueItem[]> {
    const docs: QueueItem[] = []
    let page = 1
    while (true) {
      const params = new URLSearchParams({ 'where[status][equals]': 'pending', sort: 'createdAt',
        limit: '100', page: String(page), depth: '0' })
      const { data } = await this.payload.request<Page<QueueItem>>(`/wa-queue?${params}`)
      docs.push(...data.docs)
      if (!data.hasNextPage) break
      page = data.nextPage ?? page + 1
    }
    return docs
  }

  async list(): Promise<QueueListItem[]> {
    const [docs, uncertainIds] = await Promise.all([this.pending(), this.readUncertain()])
    const uncertain = new Set(uncertainIds)
    return docs.map((item) => ({ id: item.id, to: item.to, source: item.source,
      createdAt: item.createdAt, preview: String(item.message || '').slice(0, 120),
      hasMedia: Boolean(item.mediaUrl), autoSend: !uncertain.has(item.id) && this.eligible(item),
      uncertain: uncertain.has(item.id) }))
  }

  private validateIds(ids: unknown): number[] {
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new PayloadError('Pozitif tam sayı kimlikleri içeren boş olmayan bir liste gerekli.', 400)
    }
    return [...new Set(ids as number[])]
  }

  send(ids: unknown): Promise<Result> {
    const selected = this.validateIds(ids)
    return this.run(async () => {
      const wanted = new Set(selected)
      return (await this.pending()).filter((item) => wanted.has(item.id))
    })
  }

  async cancel(ids: unknown): Promise<{ cancelled: number }> {
    const wanted = new Set(this.validateIds(ids))
    await this.activeRun?.catch(() => undefined)
    const pending = await this.pending()
    let cancelled = 0
    for (const item of pending) {
      if (!wanted.has(item.id)) continue
      await this.payload.request(`/wa-queue/${item.id}`, { method: 'PATCH',
        body: { status: 'cancelled', error: 'Operatör iptal etti.' } })
      cancelled++
    }
    return { cancelled }
  }

  runAutomatic(): Promise<Result> {
    if (this.activeRun) return this.activeRun
    return this.run(async () => (await this.pending()).filter((item) => this.eligible(item)), true)
  }

  private run(select: () => Promise<QueueItem[]>, automatic = false): Promise<Result> {
    if (this.activeRun) return this.activeRun.then(() => this.run(select, automatic))
    const current = this.process(select, automatic)
    this.activeRun = current
    void current.finally(() => { if (this.activeRun === current) this.activeRun = null }).catch(() => undefined)
    return current
  }

  private async process(select: () => Promise<QueueItem[]>, automatic: boolean): Promise<Result> {
    if (!this.whatsapp.connected()) throw new PayloadError('WhatsApp bağlı değil.', 409)
    const generation = this.connectionGeneration
    const result: Result = { sent: 0, failed: 0, cancelled: 0, uncertain: 0 }
    const uncertain = await this.readUncertain()
    const selected = await select()
    const dropped = () => !this.whatsapp.connected() || generation !== this.connectionGeneration
    let index = -1
    for (const item of selected) {
      index++
      if (dropped()) { await this.saveInterrupted(selected.slice(index), result, selected.length); break }
      if (uncertain.includes(item.id)) { result.uncertain++; continue }
      if (this.clock.now() - Date.parse(item.createdAt) > 24 * 3600_000) {
        await this.payload.request(`/wa-queue/${item.id}`, { method: 'PATCH',
          body: { status: 'cancelled', error: '24 saat geçti; gönderilmedi.' } })
        result.cancelled++
        continue
      }
      if (this.lastSendAt) {
        const wait = this.lastSendAt + this.clock.gap() - this.clock.now()
        if (wait > 0) await this.clock.wait(wait)
      }
      if (dropped()) { await this.saveInterrupted(selected.slice(index), result, selected.length); break }
      const { data: current } = await this.payload.request<QueueItem>(`/wa-queue/${item.id}`)
      if (current.status !== 'pending') continue
      if (dropped()) { await this.saveInterrupted(selected.slice(index), result, selected.length); break }
      if (automatic && !this.eligible(current)) continue
      uncertain.push(item.id)
      await this.saveUncertain(uncertain)
      let sentToWhatsApp = false
      this.lastSendAt = this.clock.now()
      try {
        let media: string | WhatsAppMedia | undefined = item.mediaUrl
        if (!media && item.source === 'decision' && item.message.length <= 1000) {
          const token = ticketTokenFromMessage(item.message)
          if (token) {
            try { media = await ticketQrMedia(token) }
            catch { console.warn('[queue] bilet QR üretilemedi; yalnız metin gönderiliyor') }
          }
        }
        await this.whatsapp.send(item.to, item.message, media)
        sentToWhatsApp = true
        await this.payload.request(`/wa-queue/${item.id}`, { method: 'PATCH', body: {
          status: 'sent', sentAt: new Date(this.clock.now()).toISOString(), attempts: (item.attempts || 0) + 1,
        } })
        uncertain.splice(uncertain.indexOf(item.id), 1)
        await this.saveUncertain(uncertain)
        result.sent++
      } catch (error) {
        if (sentToWhatsApp) result.uncertain++
        else {
          uncertain.splice(uncertain.indexOf(item.id), 1)
          await this.saveUncertain(uncertain)
          const attempts = (item.attempts || 0) + 1
          await this.payload.request(`/wa-queue/${item.id}`, { method: 'PATCH', body: {
            status: error instanceof UnregisteredNumberError || attempts >= 3 ? 'failed' : 'pending',
            attempts, error: safeError(error).slice(0, 250),
          } })
          result.failed++
        }
      }
    }
    return result
  }

  async uncertainIds(): Promise<number[]> { return this.readUncertain() }

  private async saveInterrupted(rest: QueueItem[], result: Result, total: number): Promise<void> {
    const reason = this.whatsapp.status().unexpectedDisconnect?.reason ?? 'WhatsApp bağlantısı koptu.'
    const previous = await this.readJob()
    const remaining = [...new Set([...(previous?.remaining ?? []), ...rest.map((item) => item.id)])]
    const job: InterruptedJob = { interruptedAt: new Date(this.clock.now()).toISOString(), reason,
      total: (previous?.total ?? 0) + total, sent: (previous?.sent ?? 0) + result.sent, remaining }
    console.warn(`[queue] gönderim yarıda kaldı: ${job.sent}/${job.total} gitti, ${remaining.length} kaldı`)
    this.reporter('queue_interrupted', { sent: job.sent, total: job.total, remaining: remaining.length, reason })
    await this.atomicJson(this.jobPath, job)
  }

  private async readJob(): Promise<InterruptedJob | null> {
    try {
      const value = JSON.parse(await readFile(this.jobPath, 'utf8')) as Partial<InterruptedJob>
      if (!Array.isArray(value.remaining) || typeof value.interruptedAt !== 'string') return null
      return { interruptedAt: value.interruptedAt, reason: String(value.reason ?? ''), total: Number(value.total) || 0,
        sent: Number(value.sent) || 0, remaining: value.remaining.filter((id): id is number => Number.isSafeInteger(id) && id > 0) }
    } catch { return null }
  }

  private async clearJob(): Promise<void> { await rm(this.jobPath, { force: true }) }

  private async atomicJson(file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const temp = `${file}.tmp`
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, file)
  }

  private async readUncertain(): Promise<number[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.uncertainPath, 'utf8'))
      return Array.isArray(value) ? value.filter((item): item is number => Number.isSafeInteger(item) && item > 0) : []
    } catch { return [] }
  }

  private async saveUncertain(ids: number[]): Promise<void> {
    await mkdir(path.dirname(this.uncertainPath), { recursive: true, mode: 0o700 })
    const temp = `${this.uncertainPath}.tmp`
    await writeFile(temp, JSON.stringify(ids), { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, this.uncertainPath)
  }
}
