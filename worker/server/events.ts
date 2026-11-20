import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page, Registration, WorkerEvent } from '../shared/types.js'
import { fillTemplate } from '../shared/templateVars.js'
import { PayloadClient, PayloadError } from './payload.js'
import { TemplatesService } from './templates.js'
import { MailService } from './mail.js'
import { ticketQrMail } from './tickets.js'

type Decision = 'accepted' | 'rejected' | 'waitlist'
type HistoryEntry = { registrationId: number; decision: Decision; at: string; email: string; mail: string; whatsapp: string }

export class EventsService {
  private readonly historyPath: string
  constructor(private readonly payload: PayloadClient, private readonly templates: TemplatesService,
    private readonly mail: MailService, userData: string) {
    this.historyPath = path.join(userData, 'history.json')
  }

  async events(): Promise<WorkerEvent[]> {
    return (await this.payload.request<Page<WorkerEvent>>('/events?sort=-date&limit=100&depth=0')).data.docs
  }

  async registrations(eventId: number): Promise<Registration[]> {
    const docs: Registration[] = []
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ 'where[event][equals]': String(eventId), limit: '500', depth: '0', page: String(page) })
      const { data } = await this.payload.request<Page<Registration>>(`/event-registrations?${query}`)
      docs.push(...data.docs)
      if (!data.hasNextPage) return docs
    }
    throw new PayloadError('Başvuru listesi beklenenden uzun; işlem durduruldu.', 500)
  }

  async decide(event: WorkerEvent, ids: number[], decision: Decision,
    templateIds: { mail: number | null; whatsapp: number | null },
    allowTest = false, repeatConfirmed = false): Promise<{ results: HistoryEntry[] }> {
    if (!ids.length || ids.length > 500) throw new PayloadError('1–500 kayıt seçin.', 400)
    const registrations = await this.registrations(event.id)
    const selected = ids.map((id) => registrations.find((item) => item.id === id))
    if (selected.some((item) => !item)) throw new PayloadError('Seçili kayıt etkinlikte bulunamadı.', 404)
    if (!allowTest && selected.some((item) => item!.isTest)) throw new PayloadError('Test kayıtları varsayılan olarak hariçtir.', 400)
    const history = await this.history()
    if (!repeatConfirmed && selected.some((item) => history.some((entry) => entry.registrationId === item!.id && entry.decision === decision))) {
      throw new PayloadError('Bu karar daha önce gönderilmiş; tekrar için ayrıca onay verin.', 409)
    }
    // Şablonlar gönderim anında seçilir; ikisi de isteğe bağlı ama en az biri gerekli.
    const mailTemplate = templateIds.mail ? await this.templates.mail(templateIds.mail) : null
    const waTemplate = templateIds.whatsapp ? await this.templates.whatsApp(templateIds.whatsapp) : null
    if (!mailTemplate && !waTemplate) throw new PayloadError('En az bir mail veya WhatsApp şablonu seçin.', 400)
    const results: HistoryEntry[] = []
    const total = selected.length
    for (const [position, registration] of (selected as Registration[]).entries()) {
      await this.payload.request(`/event-registrations/${registration.id}`, { method: 'PATCH', body: { status: decision } })
      const context = { registration, event }
      let mailResult = 'atlandı'
      let waResult = 'atlandı'
      if (mailTemplate && registration.email) {
        const subject = fillTemplate(mailTemplate.subject, context).text
        const html = fillTemplate(mailTemplate.html, context, true).text
        try {
          // Kabul mailinde bilet linki varsa QR görseli de eklenir
          const attachments = decision === 'accepted' ? await ticketQrMail(html) : undefined
          await this.mail.sendPaced(registration.email, subject, html, attachments, { purpose: 'decision', recipientName: registration.fullName,
            eventTitle: event.title || undefined, batchIndex: position + 1, batchTotal: total, batchLabel: `Karar: ${decision}` })
          mailResult = 'gönderildi'
        }
        catch (error) { mailResult = error instanceof Error ? error.message : 'hata' }
      }
      if (waTemplate && registration.phone) {
        try {
          await this.payload.request('/wa-queue', { method: 'POST', body: {
            to: registration.phone, message: fillTemplate(waTemplate.message, context).text,
            source: 'decision', status: 'pending', relatedEvent: event.id, relatedRegistration: registration.id,
          } })
          waResult = 'kuyruğa alındı'
        } catch (error) { waResult = error instanceof Error ? error.message : 'hata' }
      }
      const entry = { registrationId: registration.id, decision, at: new Date().toISOString(),
        email: registration.email || '', mail: mailResult, whatsapp: waResult }
      history.push(entry)
      results.push(entry)
      await this.saveHistory(history)
    }
    return { results }
  }

  async history(): Promise<HistoryEntry[]> {
    try { const data: unknown = JSON.parse(await readFile(this.historyPath, 'utf8')); return Array.isArray(data) ? data : [] }
    catch { return [] }
  }

  private async saveHistory(history: HistoryEntry[]): Promise<void> {
    await mkdir(path.dirname(this.historyPath), { recursive: true, mode: 0o700 })
    const temp = `${this.historyPath}.tmp`
    await writeFile(temp, JSON.stringify(history), { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, this.historyPath)
  }
}
