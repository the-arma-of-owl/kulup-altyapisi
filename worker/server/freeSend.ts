import { randomUUID } from 'node:crypto'
import type { FreeSendRequest, FreeSendSource, FreeSendStatus, HistoryRecipient, Page, Recipient, Registration } from '../shared/types.js'
import { fillValues, gateFieldValues } from '../shared/templateVars.js'
import { normalizePhoneNumber } from '../shared/phone.js'
import { PayloadClient, PayloadError } from './payload.js'
import { MailService } from './mail.js'
import { SendHistoryStore } from './sendHistory.js'
import { safeError } from './log.js'
import { cleanEmailHtml } from './mailHtml.js'
import { noopReporter, type Reporter } from './telemetry.js'

type CmsPerson = { id: number; fullName: string; email?: string; phone?: string; isTest?: boolean;
  department?: string; year?: string; grade?: string; hometown?: string; area?: string; status?: string }
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype'])
const emailValue = (value: string | undefined) => value?.replace(/\s+/g, '').toLowerCase() || undefined
const plain = (value: unknown): value is string | number => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))

export class FreeSendService {
  private current: FreeSendStatus = { running: false }
  reporter: Reporter = noopReporter
  constructor(private readonly payload: PayloadClient, private readonly mail: MailService,
    private readonly history: SendHistoryStore,
    /** Gönderim bitince: WhatsApp kanalı seçiliyse bu sürede kuyruğa giren mesajlar otomatik gönderime onaylanır. */
    private readonly onFinished?: (startedAt: number, whatsapp: boolean) => void) {}

  status(): FreeSendStatus { return { ...this.current } }

  async send(input: FreeSendRequest): Promise<{ runId: string; total: number }> {
    if (this.current.running) throw new PayloadError('Bir gönderim sürüyor.', 409)
    this.current = { running: true }
    try {
      if (!input || input.confirmed !== true || !Number.isInteger(input.confirmCount) ||
        !input.channels || (input.channels.mail !== true && input.channels.whatsapp !== true) ||
        (input.channels.mail !== undefined && typeof input.channels.mail !== 'boolean') ||
        (input.channels.whatsapp !== undefined && typeof input.channels.whatsapp !== 'boolean')) {
        throw new PayloadError('Gönderim onayı, alıcı sayısı ve kanal gerekli.', 400)
      }
      if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 120) {
        throw new PayloadError('Etiket gerekli; en fazla 120 karakter olabilir.', 400)
      }
      if (input.channels.mail && (!input.mail || typeof input.mail.subject !== 'string' ||
        !input.mail.subject.trim() || input.mail.subject.length > 200 || typeof input.mail.html !== 'string' ||
        !input.mail.html.trim() || Buffer.byteLength(input.mail.html, 'utf8') > 200 * 1024)) {
        throw new PayloadError('Mail konusu veya içeriği geçersiz.', 400)
      }
      if (input.channels.whatsapp && (!input.whatsapp || typeof input.whatsapp.message !== 'string' ||
        !input.whatsapp.message.trim() || input.whatsapp.message.length > 4000)) {
        throw new PayloadError('WhatsApp metni geçersiz.', 400)
      }
      if (!input.target || typeof input.target !== 'object') throw new PayloadError('Alıcı kaynağı gerekli.', 400)
      let recipients: Recipient[]
      let label = input.label.trim()
      if ('source' in input.target) {
        const { source, ids } = input.target
        if (!source || typeof source !== 'object' || !Array.isArray(ids) || !ids.length || ids.length > 2000 ||
          ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
          throw new PayloadError('Seçilen alıcılar geçersiz.', 400)
        }
        const available = new Map((await this.recipients({ ...source, includeTest: true })).map((item) => [item.id, item]))
        recipients = ids.map((id) => {
          const recipient = available.get(id)
          if (!recipient) throw new PayloadError('Seçili alıcı kaynakta bulunamadı.', 400)
          return recipient
        })
      } else if ('file' in input.target) {
        const { file, rows } = input.target
        if (!file || typeof file.text !== 'string' || !['json', 'csv'].includes(file.format) ||
          (rows !== undefined && (!Array.isArray(rows) || rows.some((row) => !Number.isInteger(row)) || new Set(rows).size !== rows.length))) {
          throw new PayloadError('Dosya seçimi geçersiz.', 400)
        }
        let parsed: ReturnType<typeof parseRecipientFile>
        try { parsed = parseRecipientFile(file.text, file.format) }
        catch (error) { throw new PayloadError(safeError(error), 400) }
        const available = new Map(parsed.recipients.map((item) => [Number(item.id.slice(5)), item]))
        recipients = rows === undefined ? parsed.recipients : rows.map((row) => {
          const recipient = available.get(row)
          if (!recipient) throw new PayloadError('Seçili satır dosyada bulunamadı.', 400)
          return recipient
        })
      } else if ('retryRunId' in input.target) {
        const retryRunId = input.target.retryRunId
        if (typeof retryRunId !== 'string') throw new PayloadError('Geçmiş kimliği geçersiz.', 400)
        const run = (await this.history.read()).find((item) => item.id === retryRunId)
        if (!run) throw new PayloadError('Gönderim geçmişi bulunamadı.', 400)
        recipients = await this.history.failedRecipients(run.id)
        label = `${run.label} (yeniden)`
      } else if ('list' in input.target) {
        recipients = validateRecipientList(input.target.list)
      } else throw new PayloadError('Alıcı kaynağı geçersiz.', 400)
      if (!recipients.length || recipients.length > 2000 || input.confirmCount !== recipients.length) {
        throw new PayloadError('Onaylanan alıcı sayısı eşleşmiyor veya alıcı yok.', 400)
      }
      if (input.allowTest !== true && recipients.some((item) => item.isTest)) {
        throw new PayloadError('Test kayıtları için açık izin gerekli.', 400)
      }
      const cleanHtml = input.channels.mail ? cleanEmailHtml(input.mail!.html) : ''
      const prepared = recipients.map((recipient) => {
        const values: Record<string, string> = Object.create(null)
        for (const [key, value] of Object.entries(recipient.variables || {})) values[key] = String(value ?? '')
        values.adSoyad = recipient.name
        values.ad = recipient.name.trim().split(/\s+/)[0] || ''
        const subject = input.channels.mail ? fillValues(input.mail!.subject, values) : null
        const html = input.channels.mail ? fillValues(cleanHtml, values, true) : null
        const message = input.channels.whatsapp ? fillValues(input.whatsapp!.message, values) : null
        if ([subject, html, message].some((part) => part?.warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')))) {
          throw new PayloadError('Bilinmeyen değişken var.', 400)
        }
        return { recipient, subject: subject?.text, html: html?.text, message: message?.text }
      })
      const runId = randomUUID()
      const startedAt = Date.now()
      this.current = { running: true, runId, total: prepared.length, done: 0 }
      void this.deliver(runId, label, prepared, input.channels).catch((error) => {
        console.error('[free-send]', safeError(error))
      }).finally(() => {
        this.current = { running: false }
        try { this.onFinished?.(startedAt, Boolean(input.channels.whatsapp)) } catch (error) { console.warn('[free-send] kuyruk onayı:', safeError(error)) }
      })
      return { runId, total: prepared.length }
    } catch (error) {
      this.current = { running: false }
      throw error
    }
  }

  private async deliver(runId: string, label: string, prepared: Array<{
    recipient: Recipient; subject?: string; html?: string; message?: string
  }>, channels: FreeSendRequest['channels']): Promise<void> {
    const total = prepared.length
    const summary = { sent: 0, failed: 0, waQueued: 0 }
    for (const [position, { recipient, subject, html, message }] of prepared.entries()) {
      // Yeniden gönderimde önceki çalıştırmada başarılı olan kanal tekrarlanmaz.
      const prior = recipient as Partial<HistoryRecipient>
      let mail: HistoryRecipient['mail'] = prior.mail === 'sent' ? 'sent' : 'skipped'
      let whatsapp: HistoryRecipient['whatsapp'] = prior.whatsapp === 'queued' ? 'queued' : 'skipped'
      const errors: string[] = []
      if (channels.mail && recipient.email && mail !== 'sent') {
        try {
          await this.mail.sendPaced(recipient.email, subject!, html!, undefined,
            { purpose: 'free-send', recipientName: recipient.name, batchIndex: position + 1, batchTotal: total, batchLabel: label })
          mail = 'sent'
        }
        catch (error) { mail = 'failed'; errors.push(safeError(error)) }
      }
      if (channels.whatsapp && recipient.phone && whatsapp !== 'queued') {
        try {
          const normalized = normalizePhoneNumber(recipient.phone)
          const originalDigits = recipient.phone.replace(/\D/g, '')
          const to = /^90\d{10}$/.test(normalized) ? normalized : originalDigits
          if (!/^90\d{10}$/.test(to)) throw new Error('Telefon geçersiz.')
          const relatedRegistration = /^event-registrations:(\d+)$/.exec(recipient.id)
          await this.payload.request('/wa-queue', { method: 'POST', body: {
            to, message, source: 'bulk', status: 'pending',
            ...(relatedRegistration ? { relatedEvent: recipient.relatedEvent,
              relatedRegistration: Number(relatedRegistration[1]) } : {}),
          } })
          whatsapp = 'queued'
        } catch (error) { whatsapp = 'failed'; errors.push(safeError(error)) }
      }
      const status = mail === 'failed' || whatsapp === 'failed' ? 'failed' : 'sent'
      if (status === 'failed') summary.failed++
      else summary.sent++
      if (whatsapp === 'queued') summary.waQueued++
      await this.history.append(runId, label, { ...recipient, status, mail, whatsapp,
        error: errors.length ? errors.join('; ') : undefined })
      this.current.done = (this.current.done ?? 0) + 1
    }
    this.reporter('send_batch', { label: `Toplu gönderim: ${label}`, total, ...summary })
  }

  async recipients(source: FreeSendSource): Promise<Recipient[]> {
    if (source.kind === 'event' && (!Number.isInteger(source.eventId) || source.eventId <= 0 ||
      !['all', 'accepted', 'checkedIn', 'notCheckedIn'].includes(source.filter))) {
      throw new PayloadError('Etkinlik veya filtre geçersiz.', 400)
    }
    if (!['event', 'members', 'core-team'].includes(source.kind)) throw new PayloadError('Kaynak geçersiz.', 400)
    const collection = source.kind === 'event' ? 'event-registrations' : source.kind === 'core-team' ? 'core-team-applications' : 'members'
    const docs: Recipient[] = []
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ limit: '500', depth: '0', page: String(page) })
      if (source.kind === 'event') query.set('where[event][equals]', String(source.eventId))
      if (source.kind === 'core-team' && source.status) query.set('where[status][equals]', source.status)
      const { data } = await this.payload.request<Page<CmsPerson & Partial<Registration>>>(`/${collection}?${query}`)
      for (const person of data.docs) {
        if (!source.includeTest && person.isTest) continue
        if (source.kind === 'event') {
          if (source.filter !== 'all' && person.status !== 'accepted') continue
          if (source.filter === 'checkedIn' && !person.checkedInAt) continue
          if (source.filter === 'notCheckedIn' && person.checkedInAt) continue
        }
        const variables: Record<string, string | number> = Object.create(null)
        for (const key of ['department', 'year', 'grade', 'hometown', 'area', 'status'] as const) {
          if (plain(person[key])) variables[key] = person[key]
        }
        if (source.kind === 'event') Object.assign(variables, gateFieldValues(person.gateFields))
        docs.push({ id: `${collection}:${person.id}`, name: person.fullName || '', email: emailValue(person.email),
          phone: person.phone || undefined, isTest: Boolean(person.isTest), variables,
          ...(source.kind === 'event' ? { relatedEvent: source.eventId } : {}) })
      }
      if (!data.hasNextPage) return docs
    }
    throw new PayloadError('Alıcı listesi beklenenden uzun; işlem durduruldu.', 500)
  }
}

function csvRows(text: string): string[][] {
  const delimiter = (text.split(/\r?\n/, 1)[0].match(/;/g)?.length ?? 0) > (text.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (quoted) throw new Error('CSV tırnakları kapanmamış.')
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function parseRecipientFile(text: string, format: 'json' | 'csv'):
  { recipients: Recipient[]; rejected: Array<{ row: number; reason: string }> } {
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Dosya 1 MB sınırını aşıyor.')
  const input = text.replace(/^\uFEFF/, '')
  let entries: Array<Record<string, unknown>>
  if (format === 'json') {
    const parsed: unknown = JSON.parse(input)
    if (!Array.isArray(parsed)) throw new Error('JSON bir dizi olmalı.')
    entries = parsed as Array<Record<string, unknown>>
  } else if (format === 'csv') {
    const rows = csvRows(input)
    const headers = rows.shift()?.map((header) => header.trim()) ?? []
    entries = rows.filter((row) => row.some((value) => value.trim())).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  } else throw new Error('Dosya biçimi geçersiz.')
  if (entries.length > 2000) throw new Error('Dosyada en fazla 2000 alıcı satırı olabilir.')
  const recipients: Recipient[] = [], rejected: Array<{ row: number; reason: string }> = []
  entries.forEach((entry, index) => {
    const row = format === 'csv' ? index + 2 : index + 1
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { rejected.push({ row, reason: 'Satır nesne değil.' }); return }
    const name = String(entry.name ?? '').trim()
    const email = emailValue(typeof entry.email === 'string' ? entry.email : undefined)
    const rawPhone = typeof entry.phone === 'string' ? entry.phone.trim() : ''
    const normalizedPhone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined
    const digits = rawPhone.replace(/\D/g, '')
    const phone = normalizedPhone && /^90\d{10}$/.test(normalizedPhone) ? normalizedPhone
      : /^90\d{10}$/.test(digits) ? digits : normalizedPhone
    if (!name || (!email && !phone)) { rejected.push({ row, reason: 'Ad ve e-posta veya telefon gerekli.' }); return }
    if (phone && !/^90\d{10}$/.test(phone)) { rejected.push({ row, reason: 'Telefon geçersiz.' }); return }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { rejected.push({ row, reason: 'E-posta geçersiz.' }); return }
    const variables: Record<string, string | number> = Object.create(null)
    for (const [key, value] of Object.entries(entry)) {
      if (['name', 'email', 'phone'].includes(key) || forbiddenKeys.has(key) || !/^[a-z][a-z0-9_]{0,31}$/.test(key)) continue
      if (plain(value) && String(value).length <= 200) variables[key] = value
    }
    recipients.push({ id: `file:${row}`, name, email, phone, isTest: false, variables })
  })
  return { recipients, rejected }
}

export function parseRecipientFileRequest(input: unknown):
  { docs: Recipient[]; skipped: Array<{ row: number; reason: string }> } {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (typeof body.text !== 'string' || Buffer.byteLength(body.text, 'utf8') > 1024 * 1024) {
    throw new PayloadError('Dosya metni gerekli ve en fazla 1 MB olabilir.', 400)
  }
  if (body.format !== 'json' && body.format !== 'csv') throw new PayloadError('Dosya biçimi geçersiz.', 400)
  try {
    const { recipients, rejected } = parseRecipientFile(body.text, body.format)
    return { docs: recipients, skipped: rejected }
  } catch {
    throw new PayloadError('Dosya ayrıştırılamadı; JSON veya CSV içeriğini kontrol edin.', 400)
  }
}

/**
 * Arayüzde birleştirilen alıcı listesi (Mail Stüdyosu / WhatsApp mesajı). Dosya satırlarıyla aynı kurallar:
 * ad zorunlu, e-posta veya Türkiye cep telefonu, değişkenler düz metin/sayı. Önceki gönderim durumları atılır.
 */
export function validateRecipientList(input: unknown): Recipient[] {
  if (!Array.isArray(input) || !input.length || input.length > 2000) throw new PayloadError('Alıcı listesi geçersiz (1–2000 kişi).', 400)
  const seen = new Set<string>()
  return input.map((raw, index) => {
    const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
    const fail = (reason: string): never => { throw new PayloadError(`${index + 1}. alıcı: ${reason}`, 400) }
    if (!entry) return fail('kayıt geçersiz.')
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (!/^[a-z-]+:[A-Za-z0-9:._-]{1,120}$/.test(id) || seen.has(id)) return fail('kimlik geçersiz veya tekrarlı.')
    seen.add(id)
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name || name.length > 120) return fail('ad gerekli (en fazla 120 karakter).')
    const email = emailValue(typeof entry.email === 'string' ? entry.email : undefined)
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('e-posta geçersiz.')
    const rawPhone = typeof entry.phone === 'string' ? entry.phone.trim() : ''
    let phone: string | undefined
    if (rawPhone) {
      const normalized = normalizePhoneNumber(rawPhone)
      const digits = rawPhone.replace(/\D/g, '')
      phone = /^90\d{10}$/.test(normalized) ? normalized : /^90\d{10}$/.test(digits) ? digits : undefined
      if (!phone) return fail('telefon geçersiz.')
    }
    if (!email && !phone) return fail('e-posta veya telefon gerekli.')
    const variables: Record<string, string | number> = Object.create(null)
    const source = entry.variables && typeof entry.variables === 'object' && !Array.isArray(entry.variables) ? entry.variables as Record<string, unknown> : {}
    for (const [key, value] of Object.entries(source).slice(0, 60)) {
      if (forbiddenKeys.has(key) || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue
      if (plain(value) && String(value).length <= 500) variables[key] = value
    }
    const relatedEvent = id.startsWith('event-registrations:') && Number.isSafeInteger(entry.relatedEvent) && (entry.relatedEvent as number) > 0 ? entry.relatedEvent as number : undefined
    return { id, name, email, phone, isTest: entry.isTest === true, variables, ...(relatedEvent ? { relatedEvent } : {}) }
  })
}
