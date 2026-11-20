import type { UIFieldServerComponent } from 'payload'
import Link from 'next/link'
import { hasVerifiedTotp } from '../../lib/requireTotp'
import { primaryFrontendUrl } from '../../lib/frontendUrl'
import { analyticsPool } from '../../lib/analytics/db'
import { istanbulDay } from '../../lib/analytics/hash'
import { eventSummary, type Range } from '../../lib/analytics/queries'
import { DailyChart, Kpi, pct, RefTable } from './parts'
import { RefLinkBuilder } from './RefLinkBuilder'
import './stats.css'

// Etkinlik düzenleme ekranındaki "İstatistikler" sekmesi: bu etkinliğin hunisi, kaynakları ve kaynak linki oluşturucu.
// Sunucuda bir kez çizilir (sayfa açılışında); DB sütunu yoktur (ui alanı).

export const EventStatsField: UIFieldServerComponent = async ({ id, data, req }) => {
  const user = req.user as { roles?: string[] | null; hasTotp?: boolean; _strategy?: string } | null
  if (!user?.roles?.includes('admin') || !hasVerifiedTotp(user)) return null
  if (!id) return <p className="byt-stats__hint">İstatistikler etkinlik kaydedildikten sonra görünür.</p>

  const slug = typeof data?.slug === 'string' ? data.slug : ''
  const pageUrl = slug ? `${primaryFrontendUrl()}/etkinlikler/${slug}` : ''

  const created = data?.createdAt ? new Date(String(data.createdAt)) : null
  const yearAgo = new Date(Date.now() - 365 * 86_400_000)
  const range: Range = { from: istanbulDay(created && created > yearAgo ? created : yearAgo), to: istanbulDay() }

  const pool = await analyticsPool()
  let summary: Awaited<ReturnType<typeof eventSummary>> | null = null
  let error = ''
  if (!pool) error = 'Bu ortamda istatistik veritabanı yok (yerel SQLite).'
  else {
    try { summary = await eventSummary(pool, range, Number(id)) } catch { error = 'İstatistikler okunamadı (analytics_events tablosu uygulanmış mı?).' }
  }

  return (
    <div className="byt-stats byt-stats--field">
      {pageUrl ? <RefLinkBuilder pageUrl={pageUrl} /> : <p className="byt-stats__hint">Kaynak linki için önce etkinliğin URL uzantısı (slug) oluşmalı.</p>}
      {error && <p className="byt-stats__notice">{error}</p>}
      {summary && (
        <>
          <p className="byt-stats__hint">{range.from} – {range.to} arası. Ayrıntılar: <Link href="/admin/istatistikler">İstatistikler paneli</Link></p>
          <section className="byt-stats__kpis">
            <Kpi label="Görüntülenme" value={summary.funnel.views} />
            <Kpi label="Tekil ziyaretçi" value={summary.funnel.visitors} />
            <Kpi label="Form açıldı" value={summary.funnel.opens} />
            <Kpi label="Forma başlandı" value={summary.funnel.starts} />
            <Kpi label="Gönderildi" value={summary.funnel.submits} />
            <Kpi label="Harici kayıt tıklaması" value={summary.funnel.ctas} />
          </section>
          <p className="byt-stats__hint">Dönüşüm (gönderim ÷ tekil ziyaretçi): <strong>{pct(summary.funnel.submits, summary.funnel.visitors)}</strong></p>
          <section className="byt-stats__card">
            <h2>Günlük görüntülenme</h2>
            <DailyChart rows={summary.daily} />
          </section>
          <section className="byt-stats__card">
            <h2>Kaynaklar</h2>
            <RefTable rows={summary.refs} viewLabel="Görüntülenme" />
          </section>
        </>
      )}
    </div>
  )
}
