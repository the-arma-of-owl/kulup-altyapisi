import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import whatsapp from 'whatsapp-web.js'
import { normalizePhoneNumber } from '../shared/phone.js'
import { CONFIG } from './config.js'
import { safeError } from './log.js'
import { fetchMedia } from './mediaFetch.js'
import { assertWhatsAppAllowed } from './waAllowlist.js'
import { BROWSER_LAUNCH_TIMEOUT_MS, chromePath } from './chrome.js'
import { noopReporter, type Reporter } from './telemetry.js'

const { Client, LocalAuth, MessageMedia } = whatsapp

export class UnregisteredNumberError extends Error {}
export type WhatsAppAccount = { name: string | null; phone: string | null; username: string | null }
export type WhatsAppStatus = {
  status: 'offline' | 'initializing' | 'qr' | 'connected' | 'disconnected'
  qrCodeUrl?: string
  message: string
  /** Bağlı hesap (QR okutulan telefon); yalnız bağlıyken. */
  account?: WhatsAppAccount
  /** Beklenmedik kopma (kasıtlı çıkış değil): arayüz kırmızı uyarı gösterir. */
  unexpectedDisconnect?: { at: string; reason: string }
  reconnectAttempt?: number
}

// WhatsApp Web her gün güncelleniyor; kütüphane (1.34.7) canlı sürümle uyumsuz kalınca `authenticated`
// gelip `ready` gelmiyor (ABT, 3 Ekim 2026). Bilinen çalışan sürüme sabitlenir (ABT ile aynı);
// denemek için BYT_WORKER_WA_VERSION ile değiştirilebilir.
export const WA_WEB_VERSION = '2.3000.1049155021-alpha'
export const WA_VERSION_REMOTE = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'

// ABT'deki gibi: kopunca 5, 15, 45 sn sonra yeniden bağlanmayı dener.
export const RECONNECT_DELAYS_MS = [5_000, 15_000, 45_000] as const
const READY_TIMEOUT_MS = 120_000
// Kütüphane tarayıcı çöktüğünde 'disconnected' üretmiyor; bağlıyken düzenli yoklanır.
const HEALTH_INTERVAL_MS = 30_000

/** Kopma sebebini Türkçeleştirir; LOGOUT (telefondan çıkış) için yeniden bağlanma denenmez. */
export function describeDisconnect(reason: unknown): { text: string; retry: boolean } {
  const raw = String(reason ?? '').toUpperCase()
  if (raw === 'LOGOUT' || raw === 'UNPAIRED' || raw === 'UNPAIRED_IDLE') return { text: 'Telefondan çıkış yapıldı veya cihaz bağlantısı kaldırıldı.', retry: false }
  if (raw === 'CONFLICT') return { text: 'WhatsApp başka bir yerde açıldı.', retry: true }
  if (raw === 'TIMEOUT') return { text: 'Bağlantı zaman aşımına uğradı.', retry: true }
  if (raw === 'NAVIGATION') return { text: 'WhatsApp Web sayfası yeniden yüklendi.', retry: true }
  if (raw === 'BROWSER_CLOSED') return { text: 'WhatsApp tarayıcısı beklenmedik şekilde kapandı.', retry: true }
  if (raw === 'UNRESPONSIVE') return { text: 'WhatsApp yanıt vermiyor.', retry: true }
  return { text: raw ? `Bağlantı koptu (${raw}).` : 'Bağlantı koptu.', retry: true }
}
export type WhatsAppMedia = { mimetype: string; data: string; filename: string }

export class WhatsAppManager {
  private client: InstanceType<typeof Client> | null = null
  private current: WhatsAppStatus = { status: 'offline', message: 'WhatsApp bağlı değil.' }
  private startPromise: Promise<void> | null = null
  private readonly authPath: string
  private connectionListener: ((connected: boolean) => void) | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private readyTimer: NodeJS.Timeout | null = null
  private healthTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private lastDisconnect: WhatsAppStatus['unexpectedDisconnect'] | undefined
  /** Bağlandı/koptu gibi olaylar CMS'e bildirilir (index.ts telemetry bağlar). */
  reporter: Reporter = noopReporter

  constructor(userData: string) { this.authPath = path.join(userData, 'whatsapp-auth') }
  onConnectionChange(listener: (connected: boolean) => void): void { this.connectionListener = listener }
  status(): WhatsAppStatus { return this.current }
  connected(): boolean { return this.current.status === 'connected' }

  /** Arayüzden elle Bağlan: otomatik deneme sayacını sıfırlar. */
  connect(): WhatsAppStatus {
    this.reconnectAttempt = 0
    this.clearReconnect()
    return this.start()
  }

  private start(): WhatsAppStatus {
    if (this.client || this.startPromise) return this.current
    this.current = { status: 'initializing', message: 'WhatsApp başlatılıyor.', ...this.disconnectInfo() }
    this.startPromise = this.initialize().finally(() => { this.startPromise = null })
    return this.current
  }

  private async initialize(): Promise<void> {
    await mkdir(this.authPath, { recursive: true, mode: 0o700 })
    const env = { ...process.env }
    delete env.LD_LIBRARY_PATH
    delete env.APPIMAGE
    delete env.APPDIR
    const client = new Client({
      // Windows'ta Chrome kapanırken oturum klasörü kısa süre kilitli kalıyor (EBUSY); silme daha çok denenir.
      authStrategy: new LocalAuth({ dataPath: this.authPath, rmMaxRetries: 10 }),
      webVersion: process.env.BYT_WORKER_WA_VERSION || WA_WEB_VERSION,
      webVersionCache: { type: 'remote', remotePath: WA_VERSION_REMOTE },
      puppeteer: {
        headless: true, executablePath: chromePath(), env, timeout: BROWSER_LAUNCH_TIMEOUT_MS,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
      },
    })
    this.client = client
    client.on('qr', (value: string) => {
      void QRCode.toDataURL(value, { width: 280, margin: 1 }).then((url) => {
        this.current = { status: 'qr', qrCodeUrl: url, message: 'Telefonunuzdan QR kodunu okutun.' }
      }).catch(() => { this.current = { status: 'disconnected', message: 'QR kodu oluşturulamadı.' } })
    })
    client.on('authenticated', () => {
      this.current = { status: 'initializing', message: 'WhatsApp doğrulandı, hazırlanıyor.', ...this.disconnectInfo() }
      // ABT: "doğrulandı" gelip "hazır" gelmezse takılı kalmasın.
      this.clearReadyTimer()
      this.readyTimer = setTimeout(() => {
        if (this.current.status !== 'connected' && this.client === client) this.handleDrop(client, 'TIMEOUT')
      }, READY_TIMEOUT_MS)
    })
    client.on('ready', () => {
      this.clearReadyTimer()
      this.reconnectAttempt = 0
      this.lastDisconnect = undefined
      this.current = { status: 'connected', message: 'WhatsApp bağlı.', account: this.readAccount(client) }
      this.connectionListener?.(true)
      const account = this.current.account
      this.reporter('wa_connected', { account: [account?.name, account?.phone ? `***${account.phone.slice(-4)}` : null].filter(Boolean).join(' · ') })
      this.watchHealth(client)
      void this.readUsername(client).then((username) => {
        if (username && this.client === client && this.current.account) this.current = { ...this.current, account: { ...this.current.account, username } }
      })
    })
    client.on('auth_failure', () => {
      // Kayıtlı oturum geçersiz: istemciyi ve yerel kimliği temizle ki Bağlan yeni QR üretsin.
      this.current = { status: 'disconnected', message: 'WhatsApp oturumu doğrulanamadı. Bağlan ile yeni QR okutun.' }
      this.connectionListener?.(false)
      this.reporter('wa_auth_failure')
      this.client = null
      void client.destroy().catch(() => undefined)
        .then(() => rm(this.authPath, { recursive: true, force: true }).catch(() => undefined))
    })
    client.on('disconnected', (reason: unknown) => { this.handleDrop(client, reason) })
    try { await client.initialize() }
    catch (error) {
      this.clearReadyTimer()
      const wasRetry = this.reconnectAttempt > 0
      this.current = { status: 'disconnected', message: `WhatsApp başlatılamadı: ${safeError(error)}`, ...this.disconnectInfo() }
      this.reporter('wa_start_failed', { reason: safeError(error) }, { dedupeKey: `wa-start-${safeError(error).slice(0, 60)}`, dedupeMs: 600_000 })
      this.connectionListener?.(false)
      this.client = null
      await client.destroy().catch(() => undefined)
      if (wasRetry) this.scheduleReconnect()
    }
  }

  /** Tarayıcının kapanmasını dinler ve WhatsApp'ı düzenli yoklar (sessiz kopmaları yakalar). */
  private watchHealth(client: InstanceType<typeof Client>): void {
    const browser = (client as unknown as { pupBrowser?: { once?: (event: string, fn: () => void) => void } }).pupBrowser
    browser?.once?.('disconnected', () => this.handleDrop(client, 'BROWSER_CLOSED'))
    this.clearHealthTimer()
    this.healthTimer = setInterval(() => {
      if (this.client !== client) { this.clearHealthTimer(); return }
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000))
      void Promise.race([client.getState(), timeout]).catch(() => this.handleDrop(client, 'UNRESPONSIVE'))
    }, HEALTH_INTERVAL_MS)
  }

  /** Beklenmedik kopma: durumu kaydet, kuyruğu durdur, gerekiyorsa yeniden bağlanmayı planla. */
  private handleDrop(client: InstanceType<typeof Client>, reason: unknown): void {
    if (this.client !== client) return
    this.clearReadyTimer()
    this.clearHealthTimer()
    const { text, retry } = describeDisconnect(reason)
    this.lastDisconnect = { at: new Date().toISOString(), reason: text }
    console.warn(`[whatsapp] bağlantı koptu: ${text}`)
    this.current = { status: 'disconnected', message: `WhatsApp bağlantısı koptu. ${text}`, ...this.disconnectInfo() }
    this.connectionListener?.(false)
    this.client = null
    void client.destroy().catch(() => undefined)
    this.reporter('wa_disconnected', { reason: text, willRetry: retry && this.reconnectAttempt < RECONNECT_DELAYS_MS.length, attempt: this.reconnectAttempt + 1 })
    if (retry) this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    this.clearReconnect()
    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.current = { ...this.current, message: `${this.current.message} Otomatik yeniden bağlanma denemeleri bitti; Bağlan'a basın.` }
      this.reporter('wa_reconnect_exhausted', { reason: this.lastDisconnect?.reason })
      return
    }
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt]
    this.reconnectAttempt++
    this.current = { ...this.current, reconnectAttempt: this.reconnectAttempt }
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.start() }, delay)
  }

  private disconnectInfo(): Pick<WhatsAppStatus, 'unexpectedDisconnect' | 'reconnectAttempt'> {
    return this.lastDisconnect ? { unexpectedDisconnect: this.lastDisconnect, reconnectAttempt: this.reconnectAttempt || undefined } : {}
  }

  private readAccount(client: InstanceType<typeof Client>): WhatsAppAccount {
    const info = client.info as unknown as { pushname?: string; wid?: { user?: string; server?: string } } | undefined
    const phone = info?.wid?.server === 'c.us' && info.wid.user ? `+${info.wid.user}` : null
    return { name: info?.pushname || null, phone, username: null }
  }

  /** WhatsApp'ın yeni kullanıcı adı özelliği kütüphanede yok; WhatsApp Web içinden okumayı dener, olmazsa null. */
  private async readUsername(client: InstanceType<typeof Client>): Promise<string | null> {
    try {
      const page = (client as unknown as { pupPage?: { evaluate: <T>(fn: () => T) => Promise<T> } }).pupPage
      if (!page) return null
      const value = await page.evaluate(() => {
        try {
          const req = (window as unknown as { require?: (name: string) => any }).require
          const me = req?.('WAWebUserPrefsMeUser')?.getMaybeMePnUser?.() ?? req?.('WAWebUserPrefsMeUser')?.getMaybeMeLidUser?.()
          const contact = me ? req?.('WAWebCollections')?.Contact?.get?.(me) : null
          const name = contact?.username ?? contact?.__x_username
          return typeof name === 'string' && name ? name : null
        } catch { return null }
      })
      return typeof value === 'string' && value.length <= 64 ? value : null
    } catch { return null }
  }

  private clearReconnect(): void { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null } }
  private clearHealthTimer(): void { if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null } }
  private clearReadyTimer(): void { if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null } }

  async send(to: string, message: string, media?: string | WhatsAppMedia): Promise<void> {
    if (!this.client || !this.connected()) throw new Error('WhatsApp bağlı değil.')
    const number = normalizePhoneNumber(to)
    if (!/^90\d{10}$/.test(number)) throw new UnregisteredNumberError('Telefon numarası geçersiz.')
    assertWhatsAppAllowed(number, { isLive: CONFIG.isLiveCms, allowlist: CONFIG.waAllowlist })
    const id = await this.client.getNumberId(number)
    if (!id) throw new UnregisteredNumberError('Numara WhatsApp’ta kayıtlı değil.')
    if (!media) { await this.client.sendMessage(id._serialized, message); return }
    const attachment = typeof media === 'string'
      ? await fetchMedia(media).then(({ bytes, contentType, filename }) => new MessageMedia(contentType, bytes.toString('base64'), filename))
      : new MessageMedia(media.mimetype, media.data, media.filename)
    await this.client.sendMessage(id._serialized, attachment, { caption: message })
  }

  async logout(): Promise<void> {
    await this.shutdown()
    await rm(this.authPath, { recursive: true, force: true })
  }

  async shutdown(): Promise<void> {
    this.clearReconnect()
    this.clearReadyTimer()
    this.clearHealthTimer()
    this.reconnectAttempt = 0
    this.lastDisconnect = undefined
    const client = this.client
    this.client = null
    this.current = { status: 'offline', message: 'WhatsApp bağlı değil.' }
    this.connectionListener?.(false)
    await client?.destroy().catch(() => undefined)
  }
}
