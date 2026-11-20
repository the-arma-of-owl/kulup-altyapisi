import type { Payload } from 'payload'
import { splitTelegramText, telegramSend } from '../telegram'
import { resendLimits, type LastMail } from './mailLog'
import { flushOutbox } from './notify'
import { esc, formatTrTime } from './privacy'
import { R2_FREE_BYTES, formatBytes, measureR2Usage, type R2Usage } from './r2Usage'
import { getPanic } from './security'
import { getObsStore, type SqlRunner } from './store'
import { KULUP } from '../kulup'

/**
 * Gün sonu raporu (Vercel cron, TR ~23:30). Bölümler bağımsızdır: biri hata verirse "alınamadı" yazılır,
 * diğerleri yine gönderilir. Analitik tablosu (analytics_events) başka bir işte oluşturulacak; yoksa o
 * bölüm atlanır. Ham sayılar SQL ile, Payload koleksiyonları Payload API'siyle okunur.
 */

const nf = new Intl.NumberFormat('tr-TR')
const n = (value: unknown) => nf.format(Number(value) || 0)
const pct = (part: number, total: number) => total > 0 ? `%${((part / total) * 100).toFixed(1)}` : '—'

export function trDayBounds(now = new Date()): { start: Date; end: Date; label: string; day: string } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)
  const start = new Date(`${day}T00:00:00+03:00`) // Türkiye 2016'dan beri sabit UTC+3
  const label = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(now)
  return { start, end: now, label, day }
}

type Ctx = { payload: Payload; db: SqlRunner | null; start: Date; end: Date }
type Section = { title: string; lines: string[] }

async function section(title: string, build: () => Promise<string[] | null>): Promise<Section | null> {
  try {
    const lines = await build()
    return lines === null ? null : { title, lines: lines.length ? lines : ['— kayıt yok'] }
  } catch (error) {
    console.error(`[rapor] ${title} alınamadı:`, (error as Error)?.message)
    return { title, lines: [`⚠️ alınamadı: ${esc(String((error as Error)?.message ?? error).slice(0, 160))}`] }
  }
}

async function analyticsTable(db: SqlRunner | null): Promise<boolean> {
  if (!db) return false
  const { rows } = await db.query(`SELECT to_regclass('public.analytics_events') IS NOT NULL OR to_regclass('analytics_events') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

async function eventTitles(payload: Payload, ids: Array<string | number>): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const numeric = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id)).map(Number)
  if (!numeric.length) return titles
  const { docs } = await payload.find({ collection: 'events', where: { id: { in: numeric } }, limit: numeric.length, depth: 0, overrideAccess: true, select: { title: true } as never })
  for (const doc of docs as Array<{ id: number; title?: string }>) titles.set(String(doc.id), doc.title ?? `#${doc.id}`)
  return titles
}

// ─── Bölümler ───────────────────────────────────────────────────────────────────

async function trafficSection(ctx: Ctx): Promise<string[] | null> {
  if (!(await analyticsTable(ctx.db))) return null
  const db = ctx.db!
  const p = [ctx.start, ctx.end]
  const totals = (await db.query(
    `SELECT count(*) FILTER (WHERE type = 'pageview') AS pv,
            count(DISTINCT visitor_hash) FILTER (WHERE type = 'pageview') AS visitors,
            count(DISTINCT session_hash) AS sessions,
            count(*) FILTER (WHERE type = 'cta_click') AS cta
       FROM analytics_events WHERE ts >= $1 AND ts < $2`, p)).rows[0] ?? {}
  const lines = [`👀 ${n(totals.pv)} sayfa görüntüleme · 🧑 ${n(totals.visitors)} tekil ziyaretçi · ${n(totals.sessions)} oturum · 👆 ${n(totals.cta)} CTA tıklaması`]
  const top = (await db.query(
    `SELECT path, count(*) AS c FROM analytics_events WHERE type = 'pageview' AND ts >= $1 AND ts < $2
      GROUP BY path ORDER BY c DESC LIMIT 8`, p)).rows
  if (top.length) lines.push('<b>En çok bakılan sayfalar:</b>', ...top.map((row, i) => `${i + 1}. ${esc(String(row.path ?? '/').slice(0, 70))} — ${n(row.c)}`))
  const devices = (await db.query(
    `SELECT COALESCE(device, 'bilinmiyor') AS device, count(DISTINCT visitor_hash) AS c FROM analytics_events
      WHERE type = 'pageview' AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY c DESC LIMIT 4`, p)).rows
  if (devices.length) lines.push(`📱 Cihaz: ${devices.map((row) => `${esc(row.device)} ${n(row.c)}`).join(' · ')}`)
  const refs = (await db.query(
    `SELECT ref, count(*) AS c, count(DISTINCT visitor_hash) AS v FROM analytics_events
      WHERE ref IS NOT NULL AND ref <> '' AND ts >= $1 AND ts < $2 GROUP BY ref ORDER BY c DESC LIMIT 8`, p)).rows
  if (refs.length) lines.push('<b>Kaynak (ref):</b>', ...refs.map((row) => `• ${esc(String(row.ref).slice(0, 40))} — ${n(row.c)} olay, ${n(row.v)} kişi`))
  const hosts = (await db.query(
    `SELECT referrer_host, count(DISTINCT visitor_hash) AS v FROM analytics_events
      WHERE type = 'pageview' AND referrer_host IS NOT NULL AND referrer_host <> '' AND ts >= $1 AND ts < $2
      GROUP BY referrer_host ORDER BY v DESC LIMIT 5`, p)).rows
  if (hosts.length) lines.push(`🔗 Yönlendiren siteler: ${hosts.map((row) => `${esc(String(row.referrer_host).slice(0, 30))} ${n(row.v)}`).join(' · ')}`)
  return lines
}

async function eventsSection(ctx: Ctx): Promise<string[]> {
  const { payload, start, end } = ctx
  const regs = await payload.find({
    collection: 'event-registrations', where: { createdAt: { greater_than_equal: start.toISOString(), less_than: end.toISOString() } },
    limit: 5000, depth: 0, overrideAccess: true, pagination: false, select: { event: true, isTest: true } as never,
  })
  const regByEvent = new Map<string, number>()
  for (const doc of regs.docs as Array<{ event?: unknown; isTest?: boolean }>) {
    if (doc.isTest) continue
    const id = String(typeof doc.event === 'object' && doc.event ? (doc.event as { id: unknown }).id : doc.event)
    regByEvent.set(id, (regByEvent.get(id) ?? 0) + 1)
  }
  const views = new Map<string, { views: number; visitors: number; open: number; start: number; submit: number }>()
  if (await analyticsTable(ctx.db)) {
    const rows = (await ctx.db!.query(
      `SELECT entity_id,
              count(*) FILTER (WHERE type = 'event_view') AS views,
              count(DISTINCT visitor_hash) FILTER (WHERE type = 'event_view') AS visitors,
              count(*) FILTER (WHERE type = 'form_open') AS open,
              count(*) FILTER (WHERE type = 'form_start') AS start,
              count(*) FILTER (WHERE type = 'form_submit') AS submit
         FROM analytics_events
        WHERE entity_type = 'event' AND entity_id IS NOT NULL AND ts >= $1 AND ts < $2
        GROUP BY entity_id ORDER BY views DESC LIMIT 10`, [start, end])).rows
    for (const row of rows) views.set(String(row.entity_id), { views: Number(row.views), visitors: Number(row.visitors), open: Number(row.open), start: Number(row.start), submit: Number(row.submit) })
  }
  const ids = [...new Set([...regByEvent.keys(), ...views.keys()])]
  if (!ids.length) return []
  const titles = await eventTitles(payload, ids)
  const totals = new Map<string, number>()
  for (const id of ids) {
    if (!/^\d+$/.test(id)) continue
    totals.set(id, (await payload.count({ collection: 'event-registrations', where: { event: { equals: Number(id) } }, overrideAccess: true })).totalDocs)
  }
  return ids.sort((a, b) => (regByEvent.get(b) ?? 0) - (regByEvent.get(a) ?? 0) || (views.get(b)?.views ?? 0) - (views.get(a)?.views ?? 0))
    .map((id) => {
      const v = views.get(id)
      const r = regByEvent.get(id) ?? 0
      const funnel = v ? ` · 👀 ${n(v.views)} görüntüleme (${n(v.visitors)} kişi) · 📝 form ${n(v.open)}→${n(v.start)}→${n(v.submit)} · kayıt/ziyaretçi ${pct(r, v.visitors)}` : ''
      return `🎪 <b>${esc(titles.get(id) ?? `#${id}`)}</b>: bugün ${n(r)} kayıt (toplam ${n(totals.get(id) ?? 0)})${funnel}`
    })
}

async function applicationsSection(ctx: Ctx): Promise<string[]> {
  const range = { createdAt: { greater_than_equal: ctx.start.toISOString(), less_than: ctx.end.toISOString() } }
  const line = async (collection: 'member-applications' | 'core-team-applications' | 'contact-messages' | 'event-registrations', label: string) => {
    const today = (await ctx.payload.count({ collection, where: range, overrideAccess: true })).totalDocs
    const total = (await ctx.payload.count({ collection, overrideAccess: true })).totalDocs
    return `${label}: <b>${n(today)}</b> bugün (toplam ${n(total)})`
  }
  return [
    await line('event-registrations', '🎟️ Etkinlik kaydı'),
    await line('member-applications', '🆕 Üyelik başvurusu'),
    await line('core-team-applications', '⭐ Core team başvurusu'),
    await line('contact-messages', '✉️ İletişim mesajı'),
  ]
}

async function sendsSection(ctx: Ctx): Promise<string[]> {
  const lines: string[] = []
  if (ctx.db) {
    const p = [ctx.start, ctx.end]
    const counts = new Map<string, number>()
    for (const row of (await ctx.db.query(`SELECT kind, count(*) AS c FROM obs.events WHERE ts >= $1 AND ts < $2 GROUP BY kind`, p)).rows) counts.set(String(row.kind), Number(row.c))
    const c = (kind: string) => counts.get(kind) ?? 0
    const byPurpose = (await ctx.db.query(
      `SELECT data->>'purpose' AS purpose, count(*) FILTER (WHERE kind = 'mail_sent') AS ok, count(*) FILTER (WHERE kind = 'mail_failed') AS bad
         FROM obs.events WHERE kind IN ('mail_sent', 'mail_failed') AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY ok DESC`, p)).rows
    lines.push(`📧 Mail: <b>${n(c('mail_sent'))}</b> gönderildi · ❌ ${n(c('mail_failed'))} başarısız`)
    if (byPurpose.length) lines.push(`   ${byPurpose.map((row) => `${esc(row.purpose ?? 'diğer')} ${n(row.ok)}${Number(row.bad) ? `/❌${n(row.bad)}` : ''}`).join(' · ')}`)
    const certs = (await ctx.db.query(
      `SELECT count(*) FILTER (WHERE level = 'info') AS ok, count(*) FILTER (WHERE level <> 'info') AS bad FROM obs.events
        WHERE kind = 'certificate_result' AND ts >= $1 AND ts < $2`, p)).rows[0] ?? {}
    lines.push(`🎓 Sertifika: <b>${n(certs.ok)}</b> sorunsuz · ⚠️ ${n(Number(certs.bad) + c('certificate_failed'))} sorunlu`)
    lines.push(`💬 WhatsApp: <b>${n(c('wa_sent'))}</b> gönderildi · ❌ ${n(c('wa_failed'))} başarısız · 🔁 ${n(c('wa_retry'))} yeniden deneme · 🚫 ${n(c('wa_cancelled'))} iptal`)
    const reasons = (await ctx.db.query(
      `SELECT kind, COALESCE(data->>'reason', '') AS reason, count(*) AS c FROM obs.events
        WHERE kind IN ('mail_failed') AND ts >= $1 AND ts < $2 GROUP BY 1, 2 ORDER BY c DESC LIMIT 4`, p)).rows
    if (reasons.length) lines.push('<b>Mail hata nedenleri:</b>', ...reasons.map((row) => `• ${esc(String(row.reason).slice(0, 120) || '-')} — ${n(row.c)}`))
    const wa = (await ctx.db.query(
      `SELECT count(*) FILTER (WHERE kind = 'wa_disconnected') AS d, count(*) FILTER (WHERE kind IN ('queue_error','queue_interrupted')) AS q
         FROM obs.events WHERE ts >= $1 AND ts < $2`, p)).rows[0] ?? {}
    if (Number(wa.d) || Number(wa.q)) lines.push(`🔴 WhatsApp kopma ${n(wa.d)} · kuyruk hatası/yarıda kalma ${n(wa.q)}`)
  }
  const pending = (await ctx.payload.count({ collection: 'wa-queue', where: { status: { equals: 'pending' } }, overrideAccess: true })).totalDocs
  lines.push(`📦 WhatsApp kuyruğunda bekleyen: <b>${n(pending)}</b>`)
  return lines
}

async function resendSection(ctx: Ctx, day: string): Promise<string[]> {
  const store = getObsStore(ctx.payload)
  const limits = resendLimits()
  const today = Number(await store.kvGet(`resend:day:${day}`)) || 0
  const month = Number(await store.kvGet(`resend:month:${day.slice(0, 7)}`)) || 0
  const last = await store.kvGet<LastMail>('resend:last')
  const quota = await store.kvGet<{ dailyUsed?: number; monthlyUsed?: number; at?: string }>('resend:quota')
  const lines = [
    `📮 Bugün ${n(today)}/${n(limits.daily)} (kalan <b>${n(Math.max(0, limits.daily - today))}</b>) · Bu ay ${n(month)}/${n(limits.monthly)} (kalan <b>${n(Math.max(0, limits.monthly - month))}</b>)`,
  ]
  if (quota && (quota.dailyUsed !== undefined || quota.monthlyUsed !== undefined)) {
    lines.push(`   Resend'in bildirdiği kullanım: gün ${quota.dailyUsed ?? '?'} · ay ${quota.monthlyUsed ?? '?'}${quota.at ? ` (${formatTrTime(quota.at)})` : ''}`)
  }
  if (last) lines.push(`   Son gönderim: ${esc(last.name || 'isimsiz')} (${esc(last.email)}) — ${formatTrTime(last.at)}, ${esc(last.purpose)}`)
  lines.push('   <i>Sayım CMS üzerinden giden maillerdir; limitler RESEND_DAILY_LIMIT / RESEND_MONTHLY_LIMIT.</i>')
  return lines
}

async function r2Section(): Promise<string[]> {
  const usage = await measureR2Usage()
  if ('error' in usage) return [`⚠️ ${esc(usage.error)}`]
  const u = usage as R2Usage
  const ratio = u.bytes / R2_FREE_BYTES
  const bar = '▓'.repeat(Math.min(10, Math.round(ratio * 10))) + '░'.repeat(Math.max(0, 10 - Math.round(ratio * 10)))
  return [
    `🗄️ ${formatBytes(u.bytes)} / 10 GB ${bar} <b>${pct(u.bytes, R2_FREE_BYTES)}</b> · ${n(u.objects)} dosya${u.truncated ? ' (liste kısaltıldı)' : ''}`,
    `   Sertifika dosyaları: ${n(u.certificateObjects)} (${formatBytes(u.certificateBytes)})${ratio >= 0.8 ? '\n⚠️ <b>Ücretsiz kotanın %80\'i aşıldı.</b>' : ''}`,
  ]
}

async function securitySection(ctx: Ctx): Promise<string[]> {
  if (!ctx.db) return ['— veritabanı yok (yerel)']
  const p = [ctx.start, ctx.end]
  const kinds = new Map<string, number>()
  for (const row of (await ctx.db.query(`SELECT kind, count(*) AS c FROM obs.security_events WHERE ts >= $1 AND ts < $2 GROUP BY kind`, p)).rows) kinds.set(String(row.kind), Number(row.c))
  const k = (kind: string) => kinds.get(kind) ?? 0
  const lines = [
    `🔑 Panel girişi: ✅ ${n(k('totp_verify_ok'))} başarılı · ⛔ ${n(k('login_failed'))} hatalı parola · 🔒 ${n(k('login_locked'))} kilitli hesap · ⛔ ${n(k('totp_verify_failed'))} hatalı 2FA`,
    `🚫 Engellenen: giriş ${n(k('login_blocked') + k('login_rate_limited') + k('totp_blocked') + k('totp_rate_limited'))} · form hız sınırı ${n(k('form_rate_limited'))} · reddedilen form ${n(k('form_rejected'))}`,
    `📝 Form gönderimi (CMS'e ulaşan): ${n(k('form_submit'))}`,
  ]
  const top = (await ctx.db.query(
    `SELECT COALESCE(max(ip), left(ip_hash, 8) || '…') AS ip, count(*) AS c FROM obs.security_events
      WHERE kind IN ('login_failed', 'login_locked', 'totp_verify_failed', 'login_blocked') AND ts >= $1 AND ts < $2
      GROUP BY ip_hash ORDER BY c DESC LIMIT 3`, p)).rows
  if (top.length) lines.push(`🎯 En çok hatalı giriş: ${top.map((row) => `<code>${esc(row.ip)}</code> ×${n(row.c)}`).join(' · ')}`)
  const panic = await getPanic(ctx.payload, true)
  if (panic.active) lines.push(`🚨 <b>ACİL KİLİT AÇIK</b> (${esc(panic.by ?? '-')}, ${panic.at ? formatTrTime(panic.at) : '-'})`)
  return lines
}

async function systemSection(ctx: Ctx): Promise<string[]> {
  if (!ctx.db) return []
  const p = [ctx.start, ctx.end]
  const rows = (await ctx.db.query(
    `SELECT kind, count(*) AS c FROM obs.events WHERE level = 'error' AND kind NOT IN ('mail_failed', 'wa_failed') AND ts >= $1 AND ts < $2
      GROUP BY kind ORDER BY c DESC LIMIT 8`, p)).rows
  const lines = rows.length ? [`💥 Hatalar: ${rows.map((row) => `${esc(row.kind)} ×${n(row.c)}`).join(' · ')}`] : ['✅ Kayda geçen sistem hatası yok']
  const pending = await getObsStore(ctx.payload).pendingCount()
  if (pending) lines.push(`📬 Gönderilmeyi bekleyen bildirim: ${n(pending)}`)
  return lines
}

export async function buildDailyReport(payload: Payload, now = new Date()): Promise<string> {
  const { start, end, label, day } = trDayBounds(now)
  const pool = (payload.db as unknown as { pool?: SqlRunner }).pool
  const store = getObsStore(payload)
  const ctx: Ctx = { payload, db: store.durable && pool ? pool : null, start, end }
  const sections = (await Promise.all([
    section('🌐 Site trafiği', () => trafficSection(ctx)),
    section('🎪 Etkinlikler (görüntüleme → kayıt)', () => eventsSection(ctx)),
    section('📥 Başvurular', () => applicationsSection(ctx)),
    section('📤 Gönderimler', () => sendsSection(ctx)),
    section('📮 Resend kotası', () => resendSection(ctx, day)),
    section('🗄️ R2 depolama', () => r2Section()),
    section('🛡️ Güvenlik', () => securitySection(ctx)),
    section('⚙️ Sistem', () => systemSection(ctx)),
  ])).filter((item): item is Section => item !== null)
  const header = `📊 <b>${esc(KULUP.kisaAd)} Gün Sonu Raporu</b> — ${esc(label)}\n<i>00:00–${formatTrTime(end)} (TR)</i>`
  return [header, ...sections.map((s) => `<b>${s.title}</b>\n${s.lines.join('\n')}`)].join('\n\n')
}

export async function runDailyReport(payload: Payload, options: { dryRun?: boolean; now?: Date } = {}): Promise<{ text: string; sent: number; cleanup: Record<string, number> | null; flushed: number }> {
  const text = await buildDailyReport(payload, options.now)
  let sent = 0
  if (!options.dryRun) {
    for (const part of splitTelegramText(text)) {
      const result = await telegramSend(part, { topic: 'reports', silent: true })
      if (result.ok) sent++
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }
  let cleanup: Record<string, number> | null = null
  let flushed = 0
  if (!options.dryRun) {
    try { cleanup = await getObsStore(payload).cleanup() } catch (error) { console.error('[rapor] temizlik:', (error as Error)?.message) }
    try { flushed = (await flushOutbox(payload, { maxDurationMs: 20_000 })).sent } catch (error) { console.error('[rapor] kutu:', (error as Error)?.message) }
  }
  return { text, sent, cleanup, flushed }
}
