import type { Page } from '../shared/types.js'
import { missingTickets, recipientCount, teamMailField, teamRejectionValues, type TeamDecision, type RejectedTeam, type TeamRecipient, type TeamRejectionList,
  type TeamRejectionRequest, type TeamRejectionResult } from '../shared/teamRejections.js'
import { fillValues } from '../shared/templateVars.js'
import { PayloadClient, PayloadError } from './payload.js'
import { TemplatesService } from './templates.js'
import { MailService } from './mail.js'
import { cleanEmailHtml } from './mailHtml.js'
import { safeError } from './log.js'
import { ticketQrMail } from './tickets.js'

type TeamDoc = { id: number; name?: string; status?: string; event?: number | { id: number } | null; adminNote?: string | null;
  rejectionMailSentAt?: string | null; acceptanceMailSentAt?: string | null }
type MembershipDoc = { id: number; team?: number | { id: number }; participant?: number | { id: number }; role?: string; status?: string }
type ParticipantDoc = { id: number; fullName?: string; email?: string }
type RegistrationDoc = { id: number; email?: string; phone?: string; ticketToken?: string; status?: string }
type EventDoc = { id: number; title?: string; date?: string; location?: string; locationLink?: string }

const idOf = (value: unknown): number => Number(value && typeof value === 'object' ? (value as { id?: unknown }).id : value)

/**
 * Takım ret maili: CMS'e operatörün yönetici oturumuyla (diğer ekranlarla aynı REST yolu) gider.
 * Okuma: teams (status=rejected) → team-memberships (accepted) → participants (ad, e-posta).
 * Gönderim: MailService (test kilidi BYT_WORKER_MAIL_ALLOWLIST burada da geçerli), ardından teams.rejectionMailSentAt.
 */
export class TeamRejectionsService {
  private running = false

  constructor(private readonly payload: PayloadClient, private readonly templates: TemplatesService,
    private readonly mail: MailService) {}

  private async all<T>(collection: string, where: Record<string, string>): Promise<T[]> {
    const docs: T[] = []
    for (let page = 1; page <= 50; page++) {
      const query = new URLSearchParams({ ...where, limit: '500', depth: '0', page: String(page) })
      const { data } = await this.payload.request<Page<T>>(`/${collection}?${query}`)
      docs.push(...data.docs)
      if (!data.hasNextPage) return docs
    }
    throw new PayloadError('Liste beklenenden uzun; işlem durduruldu.', 500)
  }

  async list(eventId: number, decision: TeamDecision = 'rejected'): Promise<TeamRejectionList> {
    if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new PayloadError('Etkinlik geçersiz.', 400)
    if (decision !== 'rejected' && decision !== 'accepted') throw new PayloadError('Karar türü geçersiz.', 400)
    const event = (await this.payload.request<EventDoc>(`/events/${eventId}?depth=0`)).data
    const teams = (await this.all<TeamDoc>('teams', { 'where[event][equals]': String(eventId), 'where[status][equals]': decision, sort: 'name' }))
      .filter((team) => team.status === decision && idOf(team.event) === eventId)
    const memberships = teams.length
      ? await this.all<MembershipDoc>('team-memberships', { 'where[team][in]': teams.map((t) => t.id).join(','), 'where[status][equals]': 'accepted' })
      : []
    const accepted = memberships.filter((m) => m.status === 'accepted')
    const participantIds = [...new Set(accepted.map((m) => idOf(m.participant)).filter((id) => Number.isSafeInteger(id) && id > 0))]
    const people = new Map<number, ParticipantDoc>()
    for (let i = 0; i < participantIds.length; i += 200) {
      const chunk = participantIds.slice(i, i + 200)
      for (const person of await this.all<ParticipantDoc>('participants', { 'where[id][in]': chunk.join(',') })) people.set(person.id, person)
    }
    // Kabulde bilet ve telefon üyenin etkinlik kaydından (hesap e-postasıyla eşleşir)
    const registrations = new Map<string, RegistrationDoc>()
    if (decision === 'accepted' && teams.length) {
      for (const reg of await this.all<RegistrationDoc>('event-registrations', { 'where[event][equals]': String(eventId) })) {
        const key = (reg.email || '').trim().toLowerCase()
        // Aynı e-postayla birden çok kayıt varsa kabul edilmiş olan öne geçer
        if (key && (!registrations.has(key) || reg.status === 'accepted')) registrations.set(key, reg)
      }
    }
    return {
      event: { id: event.id, title: event.title || '', date: event.date, location: event.location, locationLink: event.locationLink }, decision,
      teams: teams.map((team): RejectedTeam => ({
        id: team.id, name: team.name || `#${team.id}`, adminNote: team.adminNote || '',
        mailSentAt: team[teamMailField(decision)] || null,
        recipients: accepted.filter((m) => idOf(m.team) === team.id)
          .sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : 0))
          .map((m): TeamRecipient => {
            const person = people.get(idOf(m.participant))
            const email = (person?.email || '').trim()
            const reg = registrations.get(email.toLowerCase())
            return { participantId: idOf(m.participant), name: person?.fullName || '', email,
              role: m.role === 'captain' ? 'captain' : 'member',
              ...(reg ? { phone: reg.phone || undefined, ticketToken: reg.ticketToken || undefined, registrationStatus: reg.status } : {}) }
          }),
      })),
    }
  }

  async send(input: TeamRejectionRequest): Promise<{ results: TeamRejectionResult[] }> {
    if (this.running) throw new PayloadError('Bir takım maili gönderimi sürüyor.', 409)
    this.running = true
    try { return await this.run(input) }
    finally { this.running = false }
  }

  private async run(input: TeamRejectionRequest): Promise<{ results: TeamRejectionResult[] }> {
    const ids = input?.teamIds
    if (!input || input.confirmed !== true || !Number.isSafeInteger(input.eventId) || input.eventId <= 0 ||
      !Array.isArray(ids) || ids.length < 1 || ids.length > 200 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(ids).size !== ids.length || !Number.isSafeInteger(input.mailTemplateId) || input.mailTemplateId <= 0 ||
      !Number.isSafeInteger(input.confirmCount) || (input.decision !== undefined && input.decision !== 'rejected' && input.decision !== 'accepted') || (input.repeatConfirmed !== undefined && typeof input.repeatConfirmed !== 'boolean') ||
      (input.whatsappTemplateId !== undefined && (!Number.isSafeInteger(input.whatsappTemplateId) || input.whatsappTemplateId <= 0))) {
      throw new PayloadError('Takımlar, şablon ve alıcı sayısı onayı geçersiz.', 400)
    }
    // Liste ve durumlar gönderimden hemen önce CMS'ten yeniden okunur (bu arada kabul edilen takıma ret gitmesin)
    const decision: TeamDecision = input.decision ?? 'rejected'
    const noun = decision === 'accepted' ? 'Kabul' : 'Ret'
    const { event, teams } = await this.list(input.eventId, decision)
    const selected = ids.map((id) => teams.find((team) => team.id === id))
    if (selected.some((team) => !team)) throw new PayloadError(`Seçili takımlardan biri artık ${decision === 'accepted' ? 'kabul edilmiş' : 'reddedilmiş'} durumda değil ya da bu etkinliğe ait değil.`, 409)
    const chosen = selected as RejectedTeam[]
    if (recipientCount(chosen) !== input.confirmCount) throw new PayloadError('Alıcı sayısı değişti; listeyi yenileyip yeniden onaylayın.', 409)
    if (input.repeatConfirmed !== true && chosen.some((team) => team.mailSentAt)) {
      throw new PayloadError(`Seçili takımlardan birine ${noun.toLowerCase()} maili daha önce gönderildi; tekrar için ayrıca onay verin.`, 409)
    }
    const template = await this.templates.mail(input.mailTemplateId)
    const waTemplate = input.whatsappTemplateId ? await this.templates.whatsApp(input.whatsappTemplateId) : null
    const missing = missingTickets(chosen, [template.subject, template.html, waTemplate?.message])
    if (missing.length) throw new PayloadError(`Bileti olmayan üye var: ${missing.slice(0, 5).join(', ')}. Listeyi yenileyin.`, 409)
    const cleanHtml = cleanEmailHtml(template.html)
    const unknown = (part: { warnings: string[] }) => part.warnings.some((w) => w.startsWith('Bilinmeyen değişken'))
    const prepared = chosen.map((team) => ({
      team,
      messages: team.recipients.filter((r) => r.email).map((recipient) => {
        const values = teamRejectionValues(team, recipient, event)
        const subject = fillValues(template.subject, values)
        const html = fillValues(cleanHtml, values, true)
        if ([subject, html].some(unknown)) throw new PayloadError('Bilinmeyen değişken var.', 400)
        return { recipient, subject: subject.text, html: html.text }
      }),
      whatsapp: waTemplate ? team.recipients.filter((r) => r.phone).map((recipient) => {
        const text = fillValues(waTemplate.message, teamRejectionValues(team, recipient, event))
        if (unknown(text)) throw new PayloadError('WhatsApp şablonunda bilinmeyen değişken var.', 400)
        return { recipient, message: text.text }
      }) : [],
    }))

    const results: TeamRejectionResult[] = []
    const total = recipientCount(chosen)
    let position = 0
    for (const { team, messages, whatsapp } of prepared) {
      const result: TeamRejectionResult = { teamId: team.id, teamName: team.name, sent: 0, failed: 0,
        skipped: team.recipients.length - messages.length, markedAt: null }
      for (const { recipient, subject, html } of messages) {
        position++
        try {
          // Bilet linki olan maile QR görseli eklenir (kapıda telefondan okutulur)
          const attachments = await ticketQrMail(html)
          await this.mail.sendPaced(recipient.email, subject, html, attachments, { purpose: 'decision', recipientName: recipient.name,
            eventTitle: event.title || undefined, batchIndex: position, batchTotal: total, batchLabel: `Takım ${decision === 'accepted' ? 'kabulü' : 'reddi'}: ${team.name}` })
          result.sent++
        } catch (error) {
          result.failed++
          console.warn('[team-rejections] mail:', safeError(error))
        }
      }
      // WhatsApp: kuyruğa "karar" olarak girer; worker bilet linkinden QR görselini kendisi ekler ve gönderir
      for (const { recipient, message } of whatsapp) {
        try {
          await this.payload.request('/wa-queue', { method: 'POST', body: { to: recipient.phone, message, source: 'decision', status: 'pending', relatedEvent: event.id } })
          result.whatsapp = (result.whatsapp ?? 0) + 1
        } catch (error) { console.warn('[team-rejections] WhatsApp kuyruğa alınamadı:', safeError(error)) }
      }
      // En az bir üyeye ulaştıysa takım işaretlenir (tekrar gönderim ayrı onay ister)
      if (result.sent > 0 || (result.whatsapp ?? 0) > 0) {
        const at = new Date().toISOString()
        try {
          await this.payload.request(`/teams/${team.id}`, { method: 'PATCH', body: { [teamMailField(decision)]: at } })
          result.markedAt = at
        } catch (error) { console.warn('[team-rejections] işaret yazılamadı:', safeError(error)) }
      }
      results.push(result)
    }
    return { results }
  }
}
