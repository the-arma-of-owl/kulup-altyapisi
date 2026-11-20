import type { Pool } from 'pg'
import { istanbulDay } from './hash'

// Panel sorguları. Tarihler İstanbul takvim günüdür; `to` dahil.
// Ziyaretçi hash'i her gün değiştiği için count(DISTINCT visitor_hash) zaten "günlük tekillerin toplamı"dır
// (aynı kişi iki farklı gün gelirse iki sayılır) — panelde de böyle açıklanır.

export type Range = { from: string; to: string } // YYYY-MM-DD

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseRange(params: { from?: unknown; to?: unknown } | undefined, defaultDays = 30): Range {
  const today = istanbulDay()
  const fallbackFrom = istanbulDay(new Date(Date.now() - (defaultDays - 1) * 86_400_000))
  let from = typeof params?.from === 'string' && DAY.test(params.from) ? params.from : fallbackFrom
  let to = typeof params?.to === 'string' && DAY.test(params.to) ? params.to : today
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

// ts sütunundaki indeks kullanılsın diye aralık zaman damgası olarak verilir.
const WHERE_RANGE = `ts >= ($1::date::timestamp AT TIME ZONE 'Europe/Istanbul') AND ts < (($2::date + 1)::timestamp AT TIME ZONE 'Europe/Istanbul')`

const num = (value: unknown) => Number(value ?? 0)

export type Totals = { pageviews: number; visitors: number; sessions: number; submits: number; robot: number; ctas: number }
export type DailyRow = { day: string; pageviews: number; visitors: number }
export type PageRow = { path: string; views: number; visitors: number }
export type FunnelRow = { entityId: number; views: number; visitors: number; opens: number; starts: number; submits: number; ctas: number }
export type RefRow = { ref: string; visitors: number; pageviews: number; submits: number; ctas: number }
export type CountRow = { key: string; visitors: number }
export type FormRow = { form: string; opens: number; starts: number; submits: number }

export async function overview(pool: Pool, range: Range) {
  const args = [range.from, range.to]
  const [totals, daily, pages, funnel, refs, devices, referrers, forms] = await Promise.all([
    pool.query(`SELECT
        count(*) FILTER (WHERE type = 'pageview') AS pageviews,
        count(DISTINCT visitor_hash) AS visitors,
        count(DISTINCT session_hash) AS sessions,
        count(*) FILTER (WHERE type = 'form_submit') AS submits,
        count(*) FILTER (WHERE type = 'robot_question') AS robot,
        count(*) FILTER (WHERE type = 'cta_click') AS ctas
      FROM analytics_events WHERE ${WHERE_RANGE}`, args),
    pool.query(`SELECT to_char(ts AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE type = 'pageview') AS pageviews,
        count(DISTINCT visitor_hash) AS visitors
      FROM analytics_events WHERE ${WHERE_RANGE} GROUP BY 1 ORDER BY 1`, args),
    pool.query(`SELECT path, count(*) AS views,
        count(DISTINCT visitor_hash) AS visitors
      FROM analytics_events WHERE ${WHERE_RANGE} AND type = 'pageview'
      GROUP BY path ORDER BY views DESC LIMIT 25`, args),
    pool.query(`SELECT entity_id,
        count(*) FILTER (WHERE type = 'event_view') AS views,
        count(DISTINCT visitor_hash) FILTER (WHERE type = 'event_view') AS visitors,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_open') AS opens,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_start') AS starts,
        count(*) FILTER (WHERE type = 'form_submit') AS submits,
        count(*) FILTER (WHERE type = 'cta_click') AS ctas
      FROM analytics_events WHERE ${WHERE_RANGE} AND entity_type = 'event'
      GROUP BY entity_id ORDER BY views DESC LIMIT 50`, args),
    refBreakdown(pool, range, null),
    pool.query(`SELECT device AS key, count(DISTINCT visitor_hash) AS visitors
      FROM analytics_events WHERE ${WHERE_RANGE} AND type = 'pageview' GROUP BY 1 ORDER BY 2 DESC`, args),
    pool.query(`SELECT referrer_host AS key, count(DISTINCT visitor_hash) AS visitors
      FROM analytics_events WHERE ${WHERE_RANGE} AND type = 'pageview' AND referrer_host IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, args),
    pool.query(`SELECT coalesce(meta->>'form', '?') AS form,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_open') AS opens,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_start') AS starts,
        count(*) FILTER (WHERE type = 'form_submit') AS submits
      FROM analytics_events WHERE ${WHERE_RANGE} AND type IN ('form_open', 'form_start', 'form_submit')
      GROUP BY 1 ORDER BY submits DESC, opens DESC`, args),
  ])
  const t = totals.rows[0] ?? {}
  return {
    totals: { pageviews: num(t.pageviews), visitors: num(t.visitors), sessions: num(t.sessions), submits: num(t.submits), robot: num(t.robot), ctas: num(t.ctas) } as Totals,
    daily: fillDays(range, daily.rows.map((r) => ({ day: r.day, pageviews: num(r.pageviews), visitors: num(r.visitors) }))),
    pages: pages.rows.map((r) => ({ path: r.path, views: num(r.views), visitors: num(r.visitors) })) as PageRow[],
    funnel: funnel.rows.map(funnelRow),
    refs,
    devices: devices.rows.map((r) => ({ key: r.key, visitors: num(r.visitors) })) as CountRow[],
    referrers: referrers.rows.map((r) => ({ key: r.key, visitors: num(r.visitors) })) as CountRow[],
    forms: forms.rows.map((r) => ({ form: r.form, opens: num(r.opens), starts: num(r.starts), submits: num(r.submits) })) as FormRow[],
  }
}

const funnelRow = (r: Record<string, unknown>): FunnelRow => ({
  entityId: num(r.entity_id), views: num(r.views), visitors: num(r.visitors), opens: num(r.opens), starts: num(r.starts), submits: num(r.submits), ctas: num(r.ctas),
})

/** Kaynak (ref) kırılımı; eventId verilirse yalnızca o etkinliğin sayfasındaki olaylar. */
export async function refBreakdown(pool: Pool, range: Range, eventId: number | null): Promise<RefRow[]> {
  const viewType = eventId ? 'event_view' : 'pageview'
  const scope = eventId ? `AND entity_type = 'event' AND entity_id = $3` : ''
  const { rows } = await pool.query(`SELECT ref,
      count(DISTINCT visitor_hash) FILTER (WHERE type = '${viewType}') AS visitors,
      count(*) FILTER (WHERE type = '${viewType}') AS pageviews,
      count(*) FILTER (WHERE type = 'form_submit') AS submits,
      count(*) FILTER (WHERE type = 'cta_click') AS ctas
    FROM analytics_events WHERE ${WHERE_RANGE} AND ref IS NOT NULL ${scope}
    GROUP BY ref ORDER BY visitors DESC LIMIT 50`, eventId ? [range.from, range.to, eventId] : [range.from, range.to])
  return rows.map((r) => ({ ref: r.ref, visitors: num(r.visitors), pageviews: num(r.pageviews), submits: num(r.submits), ctas: num(r.ctas) }))
}

export async function eventSummary(pool: Pool, range: Range, eventId: number) {
  const args = [range.from, range.to, eventId]
  const [funnel, refs, daily] = await Promise.all([
    pool.query(`SELECT $3::int AS entity_id,
        count(*) FILTER (WHERE type = 'event_view') AS views,
        count(DISTINCT visitor_hash) FILTER (WHERE type = 'event_view') AS visitors,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_open') AS opens,
        count(DISTINCT session_hash) FILTER (WHERE type = 'form_start') AS starts,
        count(*) FILTER (WHERE type = 'form_submit') AS submits,
        count(*) FILTER (WHERE type = 'cta_click') AS ctas
      FROM analytics_events WHERE ${WHERE_RANGE} AND entity_type = 'event' AND entity_id = $3`, args),
    refBreakdown(pool, range, eventId),
    pool.query(`SELECT to_char(ts AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE type = 'event_view') AS pageviews,
        count(DISTINCT visitor_hash) FILTER (WHERE type = 'event_view') AS visitors
      FROM analytics_events WHERE ${WHERE_RANGE} AND entity_type = 'event' AND entity_id = $3 GROUP BY 1 ORDER BY 1`, args),
  ])
  return {
    funnel: funnelRow(funnel.rows[0] ?? {}),
    refs,
    daily: fillDays(range, daily.rows.map((r) => ({ day: r.day, pageviews: num(r.pageviews), visitors: num(r.visitors) }))),
  }
}

/** Grafikte boş günler de görünsün (en çok 366 gün). */
export function fillDays(range: Range, rows: DailyRow[]): DailyRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const out: DailyRow[] = []
  const cursor = new Date(`${range.from}T12:00:00Z`)
  const end = new Date(`${range.to}T12:00:00Z`)
  while (cursor <= end && out.length < 366) {
    const day = cursor.toISOString().slice(0, 10)
    out.push(byDay.get(day) ?? { day, pageviews: 0, visitors: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// ─── Kaynak kullanımı (istatistik toplamanın Vercel/Supabase maliyeti) ─────
// Ölçüm: toplama mantığı istek başına ~0,015 ms CPU; Vercel'deki gerçek maliyet çerçeve +
// pg sürücüsüyle birlikte ihtiyatlı olarak istek başına 10 ms Active CPU varsayılır.
export const USAGE_ASSUMPTIONS = {
  cpuMsPerBeacon: 10,
  hobbyInvocations: 1_000_000, // Vercel Hobby: aylık fonksiyon çağrısı
  hobbyActiveCpuMs: 4 * 3600 * 1000, // Vercel Hobby: aylık 4 saat Active CPU
  supabaseDbBytes: 500 * 1024 * 1024, // Supabase Free: 500 MB veritabanı
}

export type Usage = {
  monthBeacons: number
  projectedBeacons: number
  monthEvents: number
  totalEvents: number
  tableBytes: number
  dbBytes: number
  bytesPerEvent: number
}

/** Bu ayın beacon (istek) sayısı ≈ sayfa görüntüleme + anında gönderilen form gönderimleri. */
export async function usage(pool: Pool): Promise<Usage> {
  const { rows } = await pool.query(`SELECT
      count(*) AS total,
      count(*) FILTER (WHERE ts >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS month_events,
      count(*) FILTER (WHERE type IN ('pageview', 'form_submit')
        AND ts >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS month_beacons,
      pg_total_relation_size('analytics_events') AS table_bytes,
      pg_database_size(current_database()) AS db_bytes
    FROM analytics_events`)
  const r = rows[0] ?? {}
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const elapsed = Math.max(1, now.getDate() - 1 + now.getHours() / 24)
  const monthBeacons = num(r.month_beacons)
  const total = num(r.total)
  return {
    monthBeacons,
    projectedBeacons: Math.round((monthBeacons / elapsed) * daysInMonth),
    monthEvents: num(r.month_events),
    totalEvents: total,
    tableBytes: num(r.table_bytes),
    dbBytes: num(r.db_bytes),
    bytesPerEvent: total > 0 ? Math.round(num(r.table_bytes) / total) : 0,
  }
}
