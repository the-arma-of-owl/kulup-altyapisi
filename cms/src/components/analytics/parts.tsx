import type { DailyRow, RefRow } from '../../lib/analytics/queries'

// İstatistik paneli ve etkinlik özetinde ortak küçük parçalar (sunucu bileşeni; JS göndermez).

export const pct = (part: number, whole: number) => (whole > 0 ? `%${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}` : '—')

export const Kpi = ({ label, value }: { label: string; value: number }) => (
  <div className="byt-stats__kpi"><span>{label}</span><strong>{value.toLocaleString('tr-TR')}</strong></div>
)

const shortDay = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Günlük çubuk grafik: açık çubuk sayfa görüntüleme, koyu çubuk tekil ziyaretçi. */
export const DailyChart = ({ rows, viewLabel = 'görüntüleme' }: { rows: DailyRow[]; viewLabel?: string }) => {
  const max = Math.max(1, ...rows.map((r) => r.pageviews))
  const step = Math.max(1, Math.ceil(rows.length / 8))
  return (
    <figure className="byt-stats__chart" aria-label="Günlük ziyaret grafiği">
      <div className="byt-stats__bars">
        {rows.map((row, index) => {
          const day = shortDay.format(new Date(`${row.day}T00:00:00Z`))
          const label = `${day}: ${row.pageviews} ${viewLabel}, ${row.visitors} tekil ziyaretçi`
          // Üzerine gelince / dokununca sayı balonu (yalnız CSS); kenardaki çubuklarda balon taşmasın diye hizalanır
          const edge = index < 3 ? 'start' : index >= rows.length - 3 ? 'end' : undefined
          return (
            <div key={row.day} className="byt-stats__bar" aria-label={label} tabIndex={0} data-edge={edge}
              data-tip={`${day}\n${row.pageviews} ${viewLabel} · ${row.visitors} tekil`}>
              <i style={{ height: `${(row.pageviews / max) * 100}%` }} />
              <b style={{ height: `${(row.visitors / max) * 100}%` }} />
            </div>
          )
        })}
      </div>
      <div className="byt-stats__axis">
        {rows.map((row, index) => <span key={row.day}>{index % step === 0 ? shortDay.format(new Date(`${row.day}T00:00:00Z`)) : ''}</span>)}
      </div>
      <figcaption><span className="byt-stats__key byt-stats__key--views" /> {viewLabel} <span className="byt-stats__key byt-stats__key--visitors" /> tekil ziyaretçi · en yüksek gün: {max}</figcaption>
    </figure>
  )
}

export const RefTable = ({ rows, viewLabel }: { rows: RefRow[]; viewLabel: string }) => (
  rows.length === 0 ? <p className="byt-stats__empty">Bu aralıkta kaynak etiketli ziyaret yok.</p> : (
    <div className="byt-stats__scroll">
      <table>
        <thead><tr><th>Kaynak</th><th>Tekil ziyaretçi</th><th>{viewLabel}</th><th>Form gönderimi</th><th>Harici tık</th><th>Dönüşüm</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ref}><td><code>{row.ref}</code></td><td>{row.visitors}</td><td>{row.pageviews}</td><td>{row.submits}</td><td>{row.ctas}</td><td>{pct(row.submits, row.visitors)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
)
