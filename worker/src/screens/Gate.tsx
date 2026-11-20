import { useCallback, useEffect, useState } from 'react'
import type { Registration, WorkerEvent } from '../../shared/types'
import { api } from '../api'
import { KULUP } from '../../shared/kulup'

// Kapı modu (ABT mantığı): biletler kapıdaki telefonda CMS okuyucusuyla (<CMS>/admin/kapi)
// okutulur. Bu ekran yalnızca canlı pano; kapıdan gelen hoş geldin mesajlarını worker'ın
// WhatsApp kuyruğu bağlıyken kendiliğinden gönderir.
const REFRESH_MS = 5_000
const CMS_GATE_URL = `${KULUP.adresler.cms.replace(/\/+$/, '')}/admin/kapi`
const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export function Gate({ event, whatsAppConnected }: { event: WorkerEvent; whatsAppConnected: boolean }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      setRegistrations(await api<Registration[]>(`/registrations?eventId=${event.id}`))
      setUpdatedAt(new Date()); setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Katılımcılar alınamadı.') }
    finally { setLoading(false) }
  }, [event.id])

  useEffect(() => {
    setLoading(true)
    const first = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [load])

  const accepted = registrations.filter((item) => item.status === 'accepted' && !item.isTest)
  const arrived = accepted.filter((item) => item.attended)
  const waiting = accepted.length - arrived.length
  const percent = accepted.length ? Math.round((arrived.length / accepted.length) * 100) : 0
  const recent = [...arrived].sort((a, b) => new Date(b.checkedInAt || 0).getTime() - new Date(a.checkedInAt || 0).getTime()).slice(0, 12)
  const extra = (item: Registration) => Object.entries(item.gateFields || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ')

  return <section className="screen gate-screen">
    <div className="heading"><div><small className="eyebrow">{event.title}</small><h1>Kapı modu</h1>
      <p>Girişler kapıdaki telefonda CMS okuyucusuyla okutulur; bu pano {REFRESH_MS / 1000} saniyede bir kendiliğinden güncellenir.</p></div>
      <a className="button-link" href={CMS_GATE_URL} target="_blank" rel="noreferrer">↗ CMS kapı okuyucusu</a></div>
    {event.scannerActive === false && <div className="notice warning">Bu etkinliğin QR okuyucusu kapalı. Okutmadan önce CMS’te etkinlik ayarlarından “QR Okuyucu Aktif” seçeneğini açın.</div>}
    {whatsAppConnected
      ? <div className="notice success">WhatsApp bağlı: kapıdan gelen hoş geldin mesajları birkaç saniye içinde otomatik gönderilir.</div>
      : <div className="notice">WhatsApp bağlı değil. Girişler kaydedilir; hoş geldin mesajları WhatsApp bağlandığında otomatik gönderilir.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="gate-stats" aria-live="polite">
      <div><small>Gelen</small><strong>{loading ? '—' : arrived.length}</strong></div>
      <div><small>Bekleniyor</small><strong>{loading ? '—' : waiting}</strong></div>
      <div><small>Kabul edilen</small><strong>{loading ? '—' : accepted.length}</strong></div>
      <div><small>Doluluk</small><strong>{loading ? '—' : `%${percent}`}</strong></div>
    </div>
    <div className="gate-progress" role="progressbar" aria-label="Gelen katılımcı oranı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
    <div className="card"><div className="heading"><div><h2>Son girişler</h2><p>{updatedAt ? `Son güncelleme ${time.format(updatedAt)}` : 'Yükleniyor…'}</p></div></div>
      {!loading && recent.length === 0 && <div className="empty-state">Henüz giriş yapan yok. Kapıdaki telefonda CMS okuyucusunu açıp biletleri okutun.</div>}
      {recent.length > 0 && <ol className="gate-recent">{recent.map((item) => <li key={item.id}>
        <span>{item.fullName}</span><small>{[item.phone, extra(item)].filter(Boolean).join(' · ')}</small>
        <span className="status accepted">{item.checkedInAt ? time.format(new Date(item.checkedInAt)) : 'Geldi'}</span></li>)}</ol>}
    </div>
  </section>
}
