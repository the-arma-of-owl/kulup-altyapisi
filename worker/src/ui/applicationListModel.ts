import { applicationMatches, applicationStatus, applicationValues,
  type Application, type ApplicationDecision, type ApplicationKind, type ApplicationTab } from '../../shared/applicationVars.js'
import { fillValues } from '../../shared/templateVars.js'
import type { EmailTemplate, WhatsAppTemplate } from '../../shared/types.js'

export type ApplicationRow = Application & { notified: Partial<Record<ApplicationDecision, string>> }
export type NotifyBody = { kind: ApplicationKind; ids: number[]; decision: ApplicationDecision;
  mailTemplateId?: number; whatsappTemplateId?: number; confirmed: true; confirmCount: number; repeatConfirmed?: true }

export function applicationCounts(rows: ApplicationRow[], kind: ApplicationKind) {
  return { all: rows.length, accepted: rows.filter((row) => applicationMatches(row, kind, 'accepted')).length,
    rejected: rows.filter((row) => applicationMatches(row, kind, 'rejected')).length }
}
export function visibleApplications(rows: ApplicationRow[], kind: ApplicationKind, tab: ApplicationTab): ApplicationRow[] {
  return rows.filter((row) => applicationMatches(row, kind, tab))
}
export function selectVisible(ids: number[], visible: ApplicationRow[], checked: boolean): number[] {
  const visibleIds = new Set(visible.map((row) => row.id))
  return checked ? [...new Set([...ids, ...visibleIds])] : ids.filter((id) => !visibleIds.has(id))
}
export function selectedApplications(rows: ApplicationRow[], ids: number[]): ApplicationRow[] {
  const selected = new Set(ids)
  return rows.filter((row) => selected.has(row.id))
}
export function decisionForTab(tab: ApplicationTab): ApplicationDecision | null {
  return tab === 'all' ? null : tab
}
export function repeatCount(rows: ApplicationRow[], decision: ApplicationDecision): number {
  return rows.filter((row) => Boolean(row.notified?.[decision])).length
}
export function applicationPreview(row: ApplicationRow, kind: ApplicationKind,
  mail?: EmailTemplate, whatsapp?: WhatsAppTemplate) {
  const values = applicationValues(row, kind)
  const subject = mail ? fillValues(mail.subject, values) : null
  const html = mail ? fillValues(mail.html, values, true) : null
  const message = whatsapp ? fillValues(whatsapp.message, values) : null
  const warnings = [...(subject?.warnings || []), ...(html?.warnings || []), ...(message?.warnings || [])]
  return { subject: subject?.text, html: html?.text, message: message?.text, warnings,
    hasUnknown: warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')) }
}
export function notifyBlocker(rows: ApplicationRow[], ids: number[], kind: ApplicationKind, tab: ApplicationTab,
  mail?: EmailTemplate, whatsapp?: WhatsAppTemplate): string | null {
  const decision = decisionForTab(tab)
  if (!decision) return 'Gönderim için Kabul veya Red sekmesini seçin.'
  const selected = selectedApplications(rows, ids)
  if (!selected.length || selected.length !== new Set(ids).size) return 'En az bir geçerli başvuru seçin.'
  if (selected.length > 500) return 'Bir seferde en fazla 500 başvuru seçin.'
  if (selected.some((row) => row.status !== applicationStatus(kind, decision))) return 'Seçili başvuruların durumu karara uymuyor.'
  if (!mail && !whatsapp) return 'En az bir şablon seçin.'
  if (selected.some((row) => applicationPreview(row, kind, mail, whatsapp).hasUnknown)) return 'Bilinmeyen değişkenleri düzeltin.'
  return null
}
export function buildNotifyBody(rows: ApplicationRow[], ids: number[], kind: ApplicationKind, tab: ApplicationTab,
  mail: EmailTemplate | undefined, whatsapp: WhatsAppTemplate | undefined, repeatConfirmed: boolean): NotifyBody | null {
  if (notifyBlocker(rows, ids, kind, tab, mail, whatsapp)) return null
  const decision = decisionForTab(tab)!
  const selected = selectedApplications(rows, ids)
  return { kind, ids: selected.map((row) => row.id), decision, confirmed: true, confirmCount: selected.length,
    ...(mail ? { mailTemplateId: mail.id } : {}), ...(whatsapp ? { whatsappTemplateId: whatsapp.id } : {}),
    ...(repeatConfirmed ? { repeatConfirmed: true as const } : {}) }
}
