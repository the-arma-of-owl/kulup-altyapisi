import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '../shared/types.js'
import { applicationCollection, applicationMatches, applicationStatus, applicationValues,
  type Application, type ApplicationDecision, type ApplicationKind, type ApplicationTab } from '../shared/applicationVars.js'
import { fillValues } from '../shared/templateVars.js'
import { normalizePhoneNumber } from '../shared/phone.js'
import { PayloadClient, PayloadError } from './payload.js'
import { TemplatesService } from './templates.js'
import { MailService } from './mail.js'
import { cleanEmailHtml } from './mailHtml.js'
import { safeError } from './log.js'

type Notice = { kind: ApplicationKind; id: number; decision: ApplicationDecision; at: string;
  mail: 'sent' | 'failed' | 'skipped'; whatsapp: 'queued' | 'failed' | 'skipped' }
export type NotifyRequest = { kind: ApplicationKind; ids: number[]; decision: ApplicationDecision;
  mailTemplateId?: number | null; whatsappTemplateId?: number | null; confirmed: boolean;
  confirmCount: number; repeatConfirmed?: boolean }

export class ApplicationsService {
  private readonly historyPath: string
  private running = false

  constructor(private readonly payload: PayloadClient, private readonly templates: TemplatesService,
    private readonly mail: MailService, userData: string) {
    this.historyPath = path.join(userData, 'application-notices.json')
  }

  async list(kind: ApplicationKind, tab: ApplicationTab): Promise<Array<Application & { notified: Partial<Record<ApplicationDecision, string>> }>> {
    if (!['members', 'core-team'].includes(kind) || !['all', 'accepted', 'rejected'].includes(tab)) {
      throw new PayloadError('Başvuru türü veya sekme geçersiz.', 400)
    }
    const docs: Application[] = []
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ limit: '500', depth: '0', page: String(page) })
      const { data } = await this.payload.request<Page<Application>>(`/${applicationCollection(kind)}?${query}`)
      docs.push(...data.docs)
      if (!data.hasNextPage) {
        const history = await this.history()
        return docs.filter((item) => applicationMatches(item, kind, tab)).map((item) => {
          const notified: Partial<Record<ApplicationDecision, string>> = {}
          for (const entry of history) if (entry.kind === kind && entry.id === item.id) notified[entry.decision] = entry.at
          return { ...item, notified }
        })
      }
    }
    throw new PayloadError('Başvuru listesi beklenenden uzun; işlem durduruldu.', 500)
  }

  async notify(input: NotifyRequest): Promise<{ results: Notice[] }> {
    if (this.running) throw new PayloadError('Bir bildirim gönderimi sürüyor.', 409)
    this.running = true
    try { return await this.send(input) }
    finally { this.running = false }
  }

  private async send(input: NotifyRequest): Promise<{ results: Notice[] }> {
    if (!input || !['members', 'core-team'].includes(input.kind) ||
      !['accepted', 'rejected'].includes(input.decision) || !Array.isArray(input.ids) ||
      input.ids.length < 1 || input.ids.length > 500 ||
      input.ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(input.ids).size !== input.ids.length ||
      input.confirmed !== true || !Number.isSafeInteger(input.confirmCount) || input.confirmCount !== input.ids.length ||
      (input.repeatConfirmed !== undefined && typeof input.repeatConfirmed !== 'boolean')) {
      throw new PayloadError('Karar, seçili kayıtlar ve alıcı sayısı onayı geçersiz.', 400)
    }
    const validTemplateId = (id: unknown): boolean => id == null || (Number.isSafeInteger(id) && (id as number) > 0)
    if (!validTemplateId(input.mailTemplateId) || !validTemplateId(input.whatsappTemplateId) ||
      (!input.mailTemplateId && !input.whatsappTemplateId)) {
      throw new PayloadError('En az bir geçerli şablon seçin.', 400)
    }

    // Bütün kayıtlar ve değişkenler gönderim başlamadan önce yeniden doğrulanır.
    const selected: Application[] = []
    for (const id of input.ids) {
      let application: Application
      try { application = (await this.payload.request<Application>(`/${applicationCollection(input.kind)}/${id}?depth=0`)).data }
      catch (error) {
        if (error instanceof PayloadError && error.status === 404) throw new PayloadError('Seçili başvuru bulunamadı.', 404)
        throw error
      }
      if (!application || application.id !== id) throw new PayloadError('Seçili başvuru bulunamadı.', 404)
      if (application.status !== applicationStatus(input.kind, input.decision)) {
        throw new PayloadError('Başvuru durumu seçilen karara uymuyor.', 400)
      }
      selected.push(application)
    }
    const history = await this.history()
    if (input.repeatConfirmed !== true && selected.some((item) => history.some((entry) =>
      entry.kind === input.kind && entry.id === item.id && entry.decision === input.decision))) {
      throw new PayloadError('Bu karar daha önce bildirildi; tekrar için ayrıca onay verin.', 409)
    }
    const mailTemplate = input.mailTemplateId ? await this.templates.mail(input.mailTemplateId) : null
    const waTemplate = input.whatsappTemplateId ? await this.templates.whatsApp(input.whatsappTemplateId) : null
    const cleanHtml = mailTemplate ? cleanEmailHtml(mailTemplate.html) : ''
    const prepared = selected.map((item) => {
      const values = applicationValues(item, input.kind)
      const subject = mailTemplate ? fillValues(mailTemplate.subject, values) : null
      const html = mailTemplate ? fillValues(cleanHtml, values, true) : null
      const message = waTemplate ? fillValues(waTemplate.message, values) : null
      if ([subject, html, message].some((part) => part?.warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')))) {
        throw new PayloadError('Bilinmeyen değişken var.', 400)
      }
      return { item, subject: subject?.text, html: html?.text, message: message?.text }
    })

    const results: Notice[] = []
    const total = prepared.length
    for (const [position, { item, subject, html, message }] of prepared.entries()) {
      const entry: Notice = { kind: input.kind, id: item.id, decision: input.decision,
        at: new Date().toISOString(), mail: 'skipped', whatsapp: 'skipped' }
      if (mailTemplate && item.email) {
        try {
          await this.mail.sendPaced(item.email, subject!, html!, undefined, { purpose: 'application', recipientName: item.fullName,
            batchIndex: position + 1, batchTotal: total, batchLabel: `${input.kind === 'core-team' ? 'Core team' : 'Üyelik'}: ${input.decision === 'accepted' ? 'kabul' : 'ret'}` })
          entry.mail = 'sent'
        }
        catch (error) { entry.mail = 'failed'; console.warn('[applications] mail:', safeError(error)) }
      }
      if (waTemplate && item.phone) {
        try {
          const normalized = normalizePhoneNumber(item.phone)
          const originalDigits = item.phone.replace(/\D/g, '')
          const to = /^90\d{10}$/.test(normalized) ? normalized : originalDigits
          if (!/^90\d{10}$/.test(to)) throw new Error('Telefon geçersiz.')
          await this.payload.request('/wa-queue', { method: 'POST', body: {
            to, message, source: 'decision', status: 'pending',
          } })
          entry.whatsapp = 'queued'
        } catch (error) { entry.whatsapp = 'failed'; console.warn('[applications] WhatsApp kuyruğu:', safeError(error)) }
      }
      history.push(entry)
      await this.saveHistory(history)
      results.push(entry)
    }
    return { results }
  }

  private async history(): Promise<Notice[]> {
    try {
      const data: unknown = JSON.parse(await readFile(this.historyPath, 'utf8'))
      return Array.isArray(data) ? data.filter((item): item is Notice => item &&
        ['members', 'core-team'].includes(item.kind) && Number.isSafeInteger(item.id) &&
        ['accepted', 'rejected'].includes(item.decision) && typeof item.at === 'string' &&
        ['sent', 'failed', 'skipped'].includes(item.mail) && ['queued', 'failed', 'skipped'].includes(item.whatsapp))
        .map(({ kind, id, decision, at, mail, whatsapp }) => ({ kind, id, decision, at, mail, whatsapp })) : []
    } catch { return [] }
  }

  private async saveHistory(history: Notice[]): Promise<void> {
    await mkdir(path.dirname(this.historyPath), { recursive: true, mode: 0o700 })
    const temp = `${this.historyPath}.tmp`
    await writeFile(temp, JSON.stringify(history), { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, this.historyPath)
  }
}
