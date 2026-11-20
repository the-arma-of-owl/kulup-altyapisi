import { PayloadClient, PayloadError } from './payload.js'
import { CONFIG } from './config.js'
import { assertMailAllowed } from './waAllowlist.js'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
export type MailAttachment = { filename: string; contentBase64: string; contentType: string }
/** CMS'in gönderimi kişi ve bağlamla loglaması için (kimin için, hangi amaçla, toplu gönderimde kaçıncı). */
export type MailMeta = {
  purpose: 'certificate' | 'decision' | 'application' | 'free-send' | 'test' | 'other'
  recipientName?: string; eventTitle?: string; batchIndex?: number; batchTotal?: number; batchLabel?: string
}

export class MailService {
  private lastMailAt = 0
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly payload: PayloadClient, private readonly gapMs = 1100,
    private readonly retryMs = 61_000) {}
  async send(to: string, subject: string, html: string, attachments?: MailAttachment[], meta?: MailMeta): Promise<string | null> {
    assertMailAllowed(to, CONFIG.mailAllowlist)
    const { data } = await this.payload.request<{ ok: boolean; id?: string }>('/worker/send-email', {
      method: 'POST', body: { to, subject, html, ...(attachments === undefined ? {} : { attachments }), ...(meta ? { meta } : {}) },
    })
    return data.id ?? null
  }

  async sendPaced(to: string, subject: string, html: string, attachments?: MailAttachment[], meta?: MailMeta): Promise<void> {
    const run = async () => {
      const wait = this.lastMailAt + this.gapMs - Date.now()
      if (wait > 0) await delay(wait)
      this.lastMailAt = Date.now()
      try { await this.send(to, subject, html, attachments, meta) }
      catch (error) {
        if (!(error instanceof PayloadError) || error.status !== 429) throw error
        await delay(this.retryMs)
        this.lastMailAt = Date.now()
        await this.send(to, subject, html, attachments, meta)
      }
    }
    const result = this.pending.then(run)
    this.pending = result.catch(() => undefined)
    await result
  }
}
