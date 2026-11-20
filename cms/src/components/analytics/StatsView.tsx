import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { hasVerifiedTotp } from '../../lib/requireTotp'
import { analyticsPool } from '../../lib/analytics/db'
import { overview, parseRange, usage, USAGE_ASSUMPTIONS, type Range, type Usage } from '../../lib/analytics/queries'
import { DailyChart, Kpi, pct, RefTable } from './parts'
import { AnyPageRefLinkBuilder } from './RefLinkBuilder'
import { primaryFrontendUrl } from '../../lib/frontendUrl'
import './stats.css'

// CMS panelinde /admin/istatistikler — yalnız yöneticiler (2FA doğrulanmış).
// Veri: analytics_events (cms/sql/000_kurulum.sql). Çerezsiz, kişisel veri yok.

const FORM_LABELS: Record<string, string> = { event: 'Etkinlik kaydı', member: 'Üyelik başvurusu', 'core-team': 'Core Team başvurusu', contact: 'İletişim formu' }
const DEVICE_LABELS: Record<string, string> = { mobile: 'Telefon', tablet: 'Tablet', desktop: 'Bilgisayar' }

const PRESETS = [7, 30, 90, 365]

export const StatsView = async ({ initPageResult, searchParams }: AdminViewServerProps) => {
  const req = initPageResult.req
  const user = req.user as { roles?: string[] | null; hasTotp?: boolean; _strategy?: string } | null
  if (!user?.roles?.includes('admin') || !hasVerifiedTotp(user)) {
    return <div className="byt-stats"><h1>Yetkiniz yok</h1><p>İstatistikleri yalnız yönetici hesapları (iki adımlı doğrulama ile) görebilir.</p></div>
  }

  const range = parseRange(searchParams as Record<string, unknown>)
  const pool = await analyticsPool()
  let data: Awaited<ReturnType<typeof overview>> | null = null
  let use: Usage | null = null
  let error = ''
  if (pool) {
    try { [data, use] = await Promise.all([overview(pool, range), usage(pool)]) } catch (e) {
      error = /analytics_events/.test((e as Error).message)
        ? 'analytics_events tablosu bulunamadı. cms/sql/000_kurulum.sql canlı veritabanına uygulanmalı.'
        : 'İstatistikler okunamadı. Birkaç dakika sonra yeniden deneyin.'
    }
  } else {
    error = 'Bu ortamda Postgres yok (yerel SQLite). İstatistikler yalnız canlı/staging veritabanında toplanır.'
  }

  const eventIds = data?.funnel.map((row) => row.entityId) ?? []
  const titles = new Map<number, string>()
  if (eventIds.length) {
    const found = await req.payload.find({
      collection: 'events', where: { id: { in: eventIds } }, limit: eventIds.length, depth: 0, pagination: false,
      select: { title: true }, overrideAccess: true, req,
    }).catch((): null => null)
    for (const doc of found?.docs ?? []) titles.set(Number(doc.id), String(doc.title ?? `#${doc.id}`))
  }

  return (
    <div className="byt-stats">
      <header>
        <p>Site ziyaretçi istatistikleri</p>
        <h1>İstatistikler</h1>
        <span>{primaryFrontendUrl().replace(/^https?:\/\//, '')} — çerezsiz, kişisel veri tutmadan. Botlar ve önizlemeler sayılmaz.</span>
      </header>

      <RangeForm range={range} />

      <AnyPageRefLinkBuilder siteUrl={primaryFrontendUrl()} />

      {error && <p className="byt-stats__notice">{error}</p>}

      {data && (
        <>
          <section className="byt-stats__kpis">
            <Kpi label="Sayfa görüntüleme" value={data.totals.pageviews} />
            <Kpi label="Tekil ziyaretçi*" value={data.totals.visitors} />
            <Kpi label="Oturum" value={data.totals.sessions} />
            <Kpi label="Form gönderimi" value={data.totals.submits} />
            <Kpi label="Harici kayıt tıklaması" value={data.totals.ctas} />
          </section>

          <section className="byt-stats__card">
            <h2>Günlük ziyaret</h2>
            <DailyChart rows={data.daily} />
          </section>

          <section className="byt-stats__card">
            <h2>Etkinlik hunisi</h2>
            <p className="byt-stats__hint">Etkinlik sayfası görüntülenme → kayıt formu ekranda görüldü → forma yazmaya başlandı → başarıyla gönderildi. Dönüşüm = gönderim ÷ tekil ziyaretçi.</p>
            {data.funnel.length === 0 ? <p className="byt-stats__empty">Bu aralıkta etkinlik sayfası görüntülenmesi yok.</p> : (
              <div className="byt-stats__scroll">
                <table>
                  <thead><tr><th>Etkinlik</th><th>Görüntülenme</th><th>Tekil</th><th>Form açıldı</th><th>Başlandı</th><th>Gönderildi</th><th>Dönüşüm</th><th>Harici tık</th></tr></thead>
                  <tbody>
                    {data.funnel.map((row) => (
                      <tr key={row.entityId}>
                        <td><Link href={`/admin/collections/events/${row.entityId}`}>{titles.get(row.entityId) ?? `Etkinlik #${row.entityId}`}</Link></td>
                        <td>{row.views}</td><td>{row.visitors}</td><td>{row.opens}</td><td>{row.starts}</td><td>{row.submits}</td>
                        <td>{pct(row.submits, row.visitors)}</td><td>{row.ctas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="byt-stats__card">
            <h2>Kaynaklar (ref)</h2>
            <p className="byt-stats__hint">Linkin sonuna <code>?mekatronik</code> veya <code>?ref=mekatronik</code> eklenerek paylaşılan bağlantılar. Kaynak oturum boyunca hatırlanır; gönderim o oturumdaki tüm formları sayar.</p>
            <RefTable rows={data.refs} viewLabel="Sayfa" />
          </section>

          <div className="byt-stats__grid">
            <section className="byt-stats__card">
              <h2>En çok görüntülenen sayfalar</h2>
              {data.pages.length === 0 ? <p className="byt-stats__empty">Veri yok.</p> : (
                <table>
                  <thead><tr><th>Sayfa</th><th>Görüntülenme</th><th>Tekil</th></tr></thead>
                  <tbody>{data.pages.map((row) => <tr key={row.path}><td className="byt-stats__path">{row.path}</td><td>{row.views}</td><td>{row.visitors}</td></tr>)}</tbody>
                </table>
              )}
            </section>

            <section className="byt-stats__card">
              <h2>Formlar</h2>
              {data.forms.length === 0 ? <p className="byt-stats__empty">Veri yok.</p> : (
                <table>
                  <thead><tr><th>Form</th><th>Açıldı</th><th>Başlandı</th><th>Gönderildi</th></tr></thead>
                  <tbody>{data.forms.map((row) => <tr key={row.form}><td>{FORM_LABELS[row.form] ?? row.form}</td><td>{row.opens}</td><td>{row.starts}</td><td>{row.submits}</td></tr>)}</tbody>
                </table>
              )}
              <h2 className="byt-stats__sub">Cihaz</h2>
              {data.devices.length === 0 ? <p className="byt-stats__empty">Veri yok.</p> : (
                <table>
                  <tbody>{data.devices.map((row) => <tr key={row.key}><td>{DEVICE_LABELS[row.key] ?? row.key}</td><td>{row.visitors}</td><td>{pct(row.visitors, data!.totals.visitors)}</td></tr>)}</tbody>
                </table>
              )}
              <h2 className="byt-stats__sub">Yönlendiren siteler</h2>
              {data.referrers.length === 0 ? <p className="byt-stats__empty">Veri yok (doğrudan giriş veya WhatsApp gibi uygulamalar yönlendiren bilgisi göndermez).</p> : (
                <table>
                  <tbody>{data.referrers.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.visitors}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          </div>

          {use && <UsageCard use={use} />}

          <p className="byt-stats__hint">* Ziyaretçi kimliği her gün sıfırlanır (IP+tarayıcıdan günlük tuzla hash; ham IP saklanmaz). Bu yüzden aynı kişi farklı günlerde gelirse ayrı sayılır; aynı Wi-Fi ve aynı model telefonu kullananlar aynı gün tek sayılabilir. Reklam engelleyicili tarayıcılar sayılmayabilir.</p>
        </>
      )}
    </div>
  )
}

const RangeForm = ({ range }: { range: Range }) => (
  <form className="byt-stats__range" method="get">
    <label><span>Başlangıç</span><input type="date" name="from" defaultValue={range.from} /></label>
    <label><span>Bitiş</span><input type="date" name="to" defaultValue={range.to} /></label>
    <button type="submit">Göster</button>
    <nav>
      {PRESETS.map((days) => (
        <Link key={days} href={`/admin/istatistikler?${new URLSearchParams(parseRange({}, days)).toString()}`}>Son {days} gün</Link>
      ))}
    </nav>
  </form>
)

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
const share = (part: number, whole: number) => `%${((part / whole) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`

/** İstatistik toplamanın ücretsiz plan limitlerine göre maliyeti (bu ay + ay sonu tahmini). */
const UsageCard = ({ use }: { use: Usage }) => {
  const a = USAGE_ASSUMPTIONS
  const cpuMs = use.projectedBeacons * a.cpuMsPerBeacon
  const yearlyBytes = use.bytesPerEvent * (use.monthEvents / Math.max(1, use.monthBeacons)) * use.projectedBeacons * 12
  return (
    <section className="byt-stats__card">
      <h2>Kaynak kullanımı (istatistik toplama)</h2>
      <table>
        <thead><tr><th>Kalem</th><th>Bu ay</th><th>Ay sonu tahmini</th><th>Ücretsiz limite oranı</th></tr></thead>
        <tbody>
          <tr><td>Vercel fonksiyon çağrısı (CMS)</td><td>{use.monthBeacons.toLocaleString('tr-TR')}</td><td>{use.projectedBeacons.toLocaleString('tr-TR')}</td><td>{share(use.projectedBeacons, a.hobbyInvocations)} / 1 milyon</td></tr>
          <tr><td>Vercel Active CPU (≈{a.cpuMsPerBeacon} ms/istek)</td><td>{Math.round((use.monthBeacons * a.cpuMsPerBeacon) / 1000)} sn</td><td>{Math.round(cpuMs / 1000)} sn</td><td>{share(cpuMs, a.hobbyActiveCpuMs)} / 4 saat</td></tr>
          <tr><td>Supabase tablo boyutu ({use.totalEvents.toLocaleString('tr-TR')} kayıt, ~{use.bytesPerEvent} B/kayıt)</td><td>{mb(use.tableBytes)}</td><td>+{mb(yearlyBytes)} / yıl</td><td>{share(use.tableBytes, a.supabaseDbBytes)} / 500 MB</td></tr>
          <tr><td>Tüm veritabanı</td><td>{mb(use.dbBytes)}</td><td>—</td><td>{share(use.dbBytes, a.supabaseDbBytes)} / 500 MB</td></tr>
        </tbody>
      </table>
      <p className="byt-stats__hint">Sayfa başına tek istek gider. Toplama mantığı ölçüldüğünde istek başına ~0,015 ms CPU harcıyor; tabloda Vercel çerçevesi ve veritabanı sürücüsü dahil ihtiyatlı 10 ms kullanıldı. Oranlar yalnız istatistik toplamanın payıdır; sitenin diğer kullanımı ayrıca Vercel panelinde görünür. Kapatmak için: Site Ayarları → “Ziyaretçi istatistikleri toplansın”.</p>
    </section>
  )
}
