import { fillValues, plainName } from './templateVars.js'
import { CONFIG } from '../server/config.js'

/**
 * Takım kabul / ret maili (takım modu). Kabul ("Kabul edildi") için de aynı akış; işaret teams.acceptanceMailSentAt.
 * Takım ret maili (takım modu). CMS'te "Reddedildi" yapılan takıma mail OTOMATİK gitmez; yönetici worker'dan
 * etkinlik seçip reddedilen takımları listeler ve takımın kabul edilmiş üyelerine elle gönderir.
 * Aynı takıma tekrar gönderim CMS'teki teams.rejectionMailSentAt işaretiyle engellenir (ayrı onayla tekrar edilebilir).
 */
export type TeamDecision = 'rejected' | 'accepted'
export const teamDecisionLabels: Record<TeamDecision, { noun: string; plural: string }> = {
  rejected: { noun: 'Ret', plural: 'reddedilen' }, accepted: { noun: 'Kabul', plural: 'kabul edilen' },
}
export const teamMailField = (decision: TeamDecision) => decision === 'accepted' ? 'acceptanceMailSentAt' : 'rejectionMailSentAt'
/**
 * Kabul edilen takımda üyenin bileti = etkinlik kaydı (hesap e-postasıyla eşleşir; CMS takım kabulünde kaydı kendiliğinden
 * kabul eder). Telefon da bu kayıttan gelir (katılımcı hesabında telefon yok).
 */
export type TeamRecipient = {
  participantId: number; name: string; email: string; role: 'captain' | 'member'
  phone?: string; ticketToken?: string; registrationStatus?: string
}
/** Şablonda tarih/saat/konum için etkinlik bilgisi (eski çağrılar yalnız başlık verir). */
export type TeamEventInfo = { title: string; date?: string; location?: string; locationLink?: string }
export type RejectedTeam = {
  id: number; name: string; adminNote: string; mailSentAt: string | null; recipients: TeamRecipient[]
}
export type TeamRejectionList = { event: { id: number } & TeamEventInfo; decision: TeamDecision; teams: RejectedTeam[] }
export type TeamRejectionRequest = {
  eventId: number; decision?: TeamDecision; teamIds: number[]; mailTemplateId: number; confirmed: true; confirmCount: number; repeatConfirmed?: boolean
  /** İsteğe bağlı WhatsApp şablonu (telefonu olan üyelere; bilet linki varsa QR görseli eklenir) */
  whatsappTemplateId?: number
}
export type TeamRejectionResult = {
  teamId: number; teamName: string; sent: number; failed: number; skipped: number; markedAt: string | null; whatsapp?: number
}

export const teamRejectionKeys = ['adSoyad', 'ad', 'takim', 'etkinlik', 'yoneticiNotu', 'biletLinki', 'tarih', 'saat', 'konum', 'konumLinki'] as const

const eventInfo = (event: TeamEventInfo | string): TeamEventInfo => (typeof event === 'string' ? { title: event } : event)

/** Bilet yalnız kabul edilmiş etkinlik kaydında geçerli (bilet sayfası ve kapı başka durumu reddeder). */
export const hasTicket = (recipient: Pick<TeamRecipient, 'ticketToken' | 'registrationStatus'>): boolean =>
  Boolean(recipient.ticketToken) && recipient.registrationStatus === 'accepted'

export function teamRejectionValues(team: Pick<RejectedTeam, 'name' | 'adminNote'>, recipient: Pick<TeamRecipient, 'name'> & Partial<TeamRecipient>,
  event: TeamEventInfo | string): Record<string, string> {
  const info = eventInfo(event)
  const name = plainName(recipient.name)
  const date = info.date ? new Date(info.date) : null
  const valid = date && !Number.isNaN(date.getTime()) ? date : null
  return {
    adSoyad: name, ad: name.split(' ')[0] || '', takim: plainName(team.name), etkinlik: info.title || '',
    yoneticiNotu: team.adminNote || '',
    biletLinki: hasTicket(recipient) ? CONFIG.ticketUrl(recipient.ticketToken!) : '',
    tarih: valid ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(valid) : '',
    saat: valid ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(valid) : '',
    konum: info.location || '', konumLinki: info.locationLink || '',
  }
}

/** Şablon bilet linki kullanıyor ama bileti olmayan (kabul edilmiş etkinlik kaydı bulunmayan) üyeler. */
export function missingTickets(teams: RejectedTeam[], templates: Array<string | undefined>): string[] {
  if (!templates.some((t) => t?.includes('biletLinki'))) return []
  return teams.flatMap((team) => team.recipients.filter((r) => !hasTicket(r)).map((r) => `${r.name || 'Adsız'} (${team.name})`))
}

/** Seçili takımlardaki e-postalı alıcı sayısı (onay penceresi ve sunucudaki sayı denetimi aynı hesabı kullanır). */
export const recipientCount = (teams: RejectedTeam[]): number =>
  teams.reduce((sum, team) => sum + team.recipients.filter((r) => r.email).length, 0)

export function teamRejectionPreview(team: RejectedTeam, recipient: TeamRecipient, eventTitle: TeamEventInfo | string,
  template: { subject: string; html: string }) {
  const values = teamRejectionValues(team, recipient, eventTitle)
  const subject = fillValues(template.subject, values)
  const html = fillValues(template.html, values, true)
  const warnings = [...subject.warnings, ...html.warnings]
  return { subject: subject.text, html: html.text, warnings,
    hasUnknown: warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')) }
}

/** Gönderimi engelleyen durum (arayüz ve sunucu aynı kuralları uygular); yoksa null. */
export function teamRejectionBlocker(selected: RejectedTeam[], eventTitle: TeamEventInfo | string,
  template: { subject: string; html: string } | undefined, decision: TeamDecision = 'rejected', waTemplate?: { message: string }): string | null {
  if (!selected.length) return `En az bir ${teamDecisionLabels[decision].plural} takım seçin.`
  if (selected.length > 200) return 'Bir seferde en fazla 200 takım seçin.'
  if (!template) return 'Mail şablonu seçin.'
  if (recipientCount(selected) < 1) return 'Seçili takımlarda e-postası olan üye yok.'
  for (const team of selected) {
    for (const recipient of team.recipients) {
      if (teamRejectionPreview(team, recipient, eventTitle, template).hasUnknown) return 'Bilinmeyen değişkenleri düzeltin.'
      if (waTemplate && fillValues(waTemplate.message, teamRejectionValues(team, recipient, eventTitle)).warnings.some((w) => w.startsWith('Bilinmeyen değişken'))) {
        return 'WhatsApp şablonunda bilinmeyen değişken var.'
      }
    }
  }
  const missing = missingTickets(selected, [template.subject, template.html, waTemplate?.message])
  if (missing.length) return `Bileti olmayan üye var (kabul edilmiş etkinlik kaydı yok): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}. Takımı CMS'te "Kabul edildi"ye alınca kayıtlar kendiliğinden kabul olur; üyenin etkinlik kaydı yoksa önce kayıt açılmalı.`
  return null
}
