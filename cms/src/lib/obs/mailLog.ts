import { MailError, sendResendEmail, type MailAttachment, type ResendQuota } from '../resend'
import { logEvent } from './notify'
import { cleanReason, esc, formatTrTime, maskEmail } from './privacy'
import { getObsStore } from './store'

type PayloadLike = Parameters<typeof getObsStore>[0]

export const MAIL_PURPOSES = ['certificate', 'decision', 'application', 'free-send', 'test', 'auto-reply', 'account', 'other'] as const
export type MailPurpose = (typeof MAIL_PURPOSES)[number]
const PURPOSE_LABEL: Record<MailPurpose, string> = {
  certificate: 'Sertifika', decision: 'Etkinlik başvuru kararı', application: 'Başvuru sonucu',
  'free-send': 'Toplu gönderim', test: 'Test maili', 'auto-reply': 'Otomatik "başvurunuz alındı"', account: 'Katılımcı hesabı (kod)', other: 'Mail',
}

export type MailContext = {
  purpose: MailPurpose
  recipientName?: string
  eventTitle?: string
  /** Toplu gönderimde bu alıcının sırası (1'den) ve toplam; kalan kuyruk buradan hesaplanır. */
  batch?: { index: number; total: number; label?: string }
  actor?: string
  /** Başarı bildirimi başka yerde (ör. sertifika özeti) yapılıyorsa yalnız kaydet. */
  silentSuccess?: boolean
}

const trDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(date)
const trMonth = (date = new Date()) => trDay(date).slice(0, 7)
export const resendLimits = () => ({
  daily: Number(process.env.RESEND_DAILY_LIMIT) > 0 ? Number(process.env.RESEND_DAILY_LIMIT) : 100,
  monthly: Number(process.env.RESEND_MONTHLY_LIMIT) > 0 ? Number(process.env.RESEND_MONTHLY_LIMIT) : 3000,
})

export type LastMail = { name: string; email: string; at: string; purpose: string }

/** Hata nedenini insan diliyle ve kodla birlikte açıklar. */
export function describeMailFailure(error: unknown): { reason: string; quota: 'daily' | 'monthly' | 'rate' | null } {
  if (!(error instanceof MailError)) return { reason: `Beklenmeyen hata: ${cleanReason(error, 200)}`, quota: null }
  const p = error.provider ?? {}
  const code = p.code ?? ''
  const status = p.status
  const detail = p.message ? ` — ${cleanReason(p.message, 160)}` : ''
  if (code === 'staging_blocked') return { reason: 'Staging: alıcı STAGING_MAIL_ALLOWLIST içinde değil', quota: null }
  if (code === 'missing_api_key') return { reason: 'RESEND_API_KEY tanımlı değil (Vercel ortam değişkeni)', quota: null }
  if (p.network) return { reason: `Resend'e ulaşılamadı (${code === 'timeout' ? '20 sn zaman aşımı' : 'bağlantı hatası'})${detail}`, quota: null }
  if (status === 429 || /quota|rate_limit/.test(code)) {
    if (code === 'daily_quota_exceeded') return { reason: `Resend 429: günlük gönderim kotası doldu (${code})`, quota: 'daily' }
    if (code === 'monthly_quota_exceeded') return { reason: `Resend 429: aylık gönderim kotası doldu (${code})`, quota: 'monthly' }
    return { reason: `Resend 429: hız sınırı aşıldı${code ? ` (${code})` : ''}${detail}`, quota: 'rate' }
  }
  if (status === 401) return { reason: `Resend 401: API anahtarı geçersiz veya iptal edilmiş${detail}`, quota: null }
  if (status === 403) return { reason: `Resend 403: gönderen alan adı doğrulanmamış ya da izin yok${detail}`, quota: null }
  if (status === 422) return { reason: `Resend 422: alıcı adresi veya içerik geçersiz${code ? ` (${code})` : ''}${detail}`, quota: null }
  if (status && status >= 500) return { reason: `Resend ${status}: servis tarafında hata${detail}`, quota: null }
  return { reason: `Resend ${status ?? error.status}${code ? ` (${code})` : ''}${detail || `: ${cleanReason(error.message, 160)}`}`, quota: null }
}

function contextLines(ctx: MailContext): string {
  const lines = [`🏷️ ${esc(PURPOSE_LABEL[ctx.purpose])}${ctx.eventTitle ? ` · ${esc(ctx.eventTitle)}` : ''}${ctx.batch?.label ? ` · ${esc(ctx.batch.label)}` : ''}`]
  if (ctx.batch) lines.push(`📦 Sıra: ${ctx.batch.index}/${ctx.batch.total} (kalan ${Math.max(0, ctx.batch.total - ctx.batch.index)})`)
  if (ctx.actor) lines.push(`👤 Gönderen: ${esc(ctx.actor)}`)
  return lines.join('\n')
}

/** Resend ile gönderir; başarı ve hatayı nedeniyle birlikte günlüğe/Telegram'a yazar. Hata yine fırlatılır. */
export async function sendObservedEmail(payload: PayloadLike, input: {
  to: string; subject: string; html: string; attachments?: MailAttachment[]
}, ctx: MailContext): Promise<{ id: string | null }> {
  const who = `${esc(ctx.recipientName || 'İsimsiz')} (${esc(maskEmail(input.to))})`
  const store = getObsStore(payload)
  try {
    const result = await sendResendEmail(input)
    let today = 0
    let month = 0
    try {
      today = await store.kvIncr(`resend:day:${trDay()}`, 3 * 86400)
      month = await store.kvIncr(`resend:month:${trMonth()}`, 40 * 86400)
      await store.kvSet('resend:last', { name: ctx.recipientName || '', email: maskEmail(input.to), at: new Date().toISOString(), purpose: PURPOSE_LABEL[ctx.purpose] } satisfies LastMail, 40 * 86400)
      if (result.quota) await store.kvSet('resend:quota', { ...result.quota, at: new Date().toISOString() }, 3 * 86400)
    } catch (error) { console.error('[obs] mail sayacı yazılamadı:', (error as Error)?.message) }
    const limits = resendLimits()
    await logEvent(payload, {
      kind: 'mail_sent', category: ctx.purpose === 'certificate' ? 'certificate' : 'mail',
      notify: !ctx.silentSuccess,
      text: `📧 <b>Mail gönderildi</b> → ${who}\n${contextLines(ctx)}${today ? `\n📊 Resend bugün: ${today}/${limits.daily}${quotaHint(result.quota)}` : ''}`,
      data: { purpose: ctx.purpose, batch: ctx.batch, today, month, resendId: result.id },
    })
    return result
  } catch (error) {
    const { reason, quota } = describeMailFailure(error)
    await logEvent(payload, {
      kind: 'mail_failed', category: ctx.purpose === 'certificate' ? 'certificate' : 'mail', level: 'error',
      text: `❌ <b>Mail gönderilemedi</b> → ${who}\n⚠️ <b>Neden:</b> ${esc(reason)}\n${contextLines(ctx)}`,
      data: { purpose: ctx.purpose, batch: ctx.batch, reason, quota },
    })
    if (quota === 'daily' || quota === 'monthly') await alertQuota(payload, quota, ctx, error)
    throw error
  }
}

function quotaHint(quota: ResendQuota | undefined): string {
  if (!quota) return ''
  const parts = [quota.dailyUsed !== undefined ? `Resend başlığı: gün ${quota.dailyUsed}` : '',
    quota.monthlyUsed !== undefined ? `ay ${quota.monthlyUsed}` : ''].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

async function alertQuota(payload: PayloadLike, kind: 'daily' | 'monthly', ctx: MailContext, error: unknown): Promise<void> {
  const store = getObsStore(payload)
  const limits = resendLimits()
  let today = 0, month = 0
  let last: LastMail | null = null
  try {
    today = Number(await store.kvGet(`resend:day:${trDay()}`)) || 0
    month = Number(await store.kvGet(`resend:month:${trMonth()}`)) || 0
    last = await store.kvGet<LastMail>('resend:last')
  } catch { /* uyarı yine gider */ }
  const headerQuota = error instanceof MailError ? error.provider?.quota : undefined
  const remaining = ctx.batch ? Math.max(0, ctx.batch.total - ctx.batch.index + 1) : null
  await logEvent(payload, {
    kind: 'resend_quota', category: 'mail', topic: 'errors', level: 'error',
    dedupe: { key: `resend-quota-${kind}-${trDay()}`, seconds: 3600 },
    text: [
      `⛔ <b>Resend ${kind === 'daily' ? 'GÜNLÜK' : 'AYLIK'} kotası doldu — mailler gitmiyor</b>`,
      `📊 Bugün: ${today}/${limits.daily} · Bu ay: ${month}/${limits.monthly}${quotaHint(headerQuota)}`,
      last ? `✅ Son başarılı gönderim: ${esc(last.name || 'isimsiz')} (${esc(last.email)}) — ${formatTrTime(last.at)}, ${esc(last.purpose)}` : '✅ Son başarılı gönderim: kayıt yok',
      remaining !== null
        ? `📦 Kuyrukta kalan: <b>${remaining}</b> kişi (${esc(PURPOSE_LABEL[ctx.purpose])}${ctx.eventTitle ? ` – ${esc(ctx.eventTitle)}` : ''}${ctx.batch?.label ? ` – ${esc(ctx.batch.label)}` : ''}), ilk bekleyen: ${esc(ctx.recipientName || '-')}`
        : `📦 Gönderilemeyen: ${esc(ctx.recipientName || '-')} (${esc(PURPOSE_LABEL[ctx.purpose])})`,
      'ℹ️ Kota yenilenince Worker\'da "başarısızları yeniden gönder" ile kalanlar gönderilebilir.',
    ].join('\n'),
    data: { kind, today, month, remaining },
  })
}
