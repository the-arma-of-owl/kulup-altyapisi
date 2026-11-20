import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailTemplate, Registration, WhatsAppTemplate, WorkerEvent } from '../shared/types'
import { fillTemplate } from '../shared/templateVars'
import { api } from './api'
import { Gate } from './screens/Gate'
import { AutoMailPanel } from './screens/AutoMail'
import logo from './assets/logo-512.png'
import { KULUP } from '../shared/kulup'
import { CodeInput } from './ui/CodeInput'
import { QueuePanel } from './ui/QueuePanel'
import { LogPanel } from './ui/LogPanel'
import { Templates } from './screens/Templates'
import { FreeSend } from './screens/FreeSend'
import { ChevronLeft, Mail, MessageCircle } from 'lucide-react'
import { Messages } from './screens/Messages'
import { ApplicationLists } from './screens/ApplicationLists'
import { TeamRejections } from './screens/TeamRejections'
import { Certificates } from './screens/Certificates'
import { connectionLabel, stagingBannerText } from './ui/stagingBanner'

type Auth = { authenticated: boolean; userEmail?: string; expiresAt?: number }
type WaStatus = {
  status: string; qrCodeUrl?: string; message: string
  account?: { name: string | null; phone: string | null; username: string | null }
  unexpectedDisconnect?: { at: string; reason: string }
  reconnectAttempt?: number
}
type QueueJob = { interruptedAt: string; reason: string; total: number; sent: number; pendingRemaining: number }
const waStatusLabels: Record<string, string> = { offline: 'Bağlı değil', initializing: 'Başlatılıyor', qr: 'QR bekleniyor', connected: 'Bağlı', disconnected: 'Koptu' }
const accountText = (account?: WaStatus['account']) => account
  ? [account.name, account.username ? `@${account.username}` : null, account.phone ?? 'numara gizli'].filter(Boolean).join(' · ')
  : ''
type Tab = 'application-lists' | 'applications' | 'team-rejections' | 'gate' | 'whatsapp' | 'messages' | 'free-menu' | 'templates' | 'auto' | 'free' | 'logs' | 'certificates'
type Decision = 'accepted' | 'rejected' | 'waitlist'
const labels: Record<Decision, string> = { accepted: 'Kabul', rejected: 'Ret', waitlist: 'Yedek' }
const statusLabels: Record<string, string> = { pending: 'Bekliyor', accepted: 'Kabul', rejected: 'Ret', waitlist: 'Yedek', cancelled: 'İptal', attended: 'Katıldı' }
const autoPurposes = ['member-application-received', 'event-registration-received', 'coreteam-application-received']

export function App() {
  const [stagingBanner, setStagingBanner] = useState<string | null>(null)
  const [connection, setConnection] = useState<string | null>(null)
  const [auth, setAuth] = useState<Auth>({ authenticated: false })
  const [step, setStep] = useState<'login' | 'totp'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const totpForm = useRef<HTMLFormElement>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('application-lists')
  const [events, setEvents] = useState<WorkerEvent[]>([])
  const [eventId, setEventId] = useState<number | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([])
  const [mailTemplateId, setMailTemplateId] = useState<number | ''>('')
  const [waTemplateId, setWaTemplateId] = useState<number | ''>('')
  const [wa, setWa] = useState<WaStatus>({ status: 'offline', message: 'Bağlı değil.' })
  const [selected, setSelected] = useState<number[]>([])
  const [decision, setDecision] = useState<Decision>('accepted')
  const [preview, setPreview] = useState(false)
  const [includeTest, setIncludeTest] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [alarmSeen, setAlarmSeen] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [job, setJob] = useState<QueueJob | null>(null)

  const event = events.find((item) => item.id === eventId)
  const selectedRows = registrations.filter((item) => selected.includes(item.id))
  const filtered = useMemo(() => registrations.filter((item) => {
    if (!includeTest && item.isTest) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (stageFilter !== 'all' && item.applicationStage !== stageFilter) return false
    const term = filter.toLocaleLowerCase('tr-TR')
    return !term || [item.fullName, item.email, item.phone].some((value) => value?.toLocaleLowerCase('tr-TR').includes(term))
  }), [registrations, includeTest, statusFilter, stageFilter, filter])

  const run = async (action: () => Promise<void>) => {
    setError(''); setNotice(''); setBusy(true)
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : 'İşlem başarısız.') }
    finally { setBusy(false) }
  }
  const loadBase = useCallback(async () => {
    const [eventList, templateList, waTemplateList, waStatus] = await Promise.all([
      api<WorkerEvent[]>('/events'), api<EmailTemplate[]>('/templates'), api<WhatsAppTemplate[]>('/wa-templates').catch(() => [] as WhatsAppTemplate[]), api<WaStatus>('/whatsapp/status'),
    ])
    setEvents(eventList); setTemplates(templateList); setWaTemplates(waTemplateList); setWa(waStatus)
    setEventId((previous) => previous ?? eventList[0]?.id ?? null)
  }, [])
  const loadRegistrations = useCallback(async (id: number) => {
    setRegistrations(await api<Registration[]>(`/registrations?eventId=${id}`))
  }, [])

  useEffect(() => {
    void api<unknown>('/health').then((value) => {
      setStagingBanner(stagingBannerText(value))
      setConnection(connectionLabel(value))
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    void api<Auth>('/auth/status').then((value) => {
      setAuth(value)
      if (value.authenticated) void loadBase().catch(() => undefined)
    }).catch(() => undefined)
  }, [loadBase])
  useEffect(() => {
    if (auth.authenticated && eventId) void loadRegistrations(eventId).catch((err) => setError(String(err)))
  }, [auth.authenticated, eventId, loadRegistrations])
  useEffect(() => {
    if (!auth.authenticated) return
    const timer = window.setInterval(() => {
      void api<WaStatus>('/whatsapp/status').then((value) => {
        setWa(value)
        if (value.status === 'connected') void api<{ job: QueueJob | null }>('/queue/job').then((r) => setJob(r.job)).catch(() => undefined)
      }).catch(() => undefined)
      void api<Auth>('/auth/status').then((value) => { if (!value.authenticated) setAuth(value) }).catch(() => undefined)
    }, 5000)
    return () => clearInterval(timer)
  }, [auth.authenticated])

  const login = () => void run(async () => {
    await api('/auth/login', 'POST', { email, password })
    setPassword(''); setStep('totp'); setNotice('Altı haneli doğrulama kodunu girin.')
  })
  const verify = () => void run(async () => {
    try { setAuth(await api<Auth>('/auth/totp', 'POST', { token: code })) }
    catch (err) { setCode(''); throw err }
    setCode(''); setStep('login'); await loadBase()
  })
  const logout = () => void run(async () => {
    await api('/auth/logout', 'POST', {})
    setAuth({ authenticated: false }); setSelected([])
  })

  const resumeJob = () => void run(async () => {
    const result = await api<{ sent: number; failed: number }>('/queue/job/resume', 'POST', {})
    setJob(null); setNotice(`Yarım kalan gönderime devam edildi: ${result.sent} gitti, ${result.failed} başarısız.`)
  })
  const discardJob = () => void run(async () => {
    if (!window.confirm('Yarım kalan gönderim kaydı silinsin mi? Bekleyen mesajlar kuyrukta kalır, otomatik gönderilmez.')) return
    await api('/queue/job/discard', 'POST', {}); setJob(null)
  })
  const alarm = wa.unexpectedDisconnect && wa.status !== 'connected' && alarmSeen !== wa.unexpectedDisconnect.at ? wa.unexpectedDisconnect : null

  const mailChoices = templates.filter((item) => !autoPurposes.includes(item.purpose))
  const chosenMail = mailChoices.find((item) => item.id === mailTemplateId)
  const chosenWa = waTemplates.find((item) => item.id === waTemplateId)
  const first = selectedRows[Math.min(previewIndex, Math.max(0, selectedRows.length - 1))]
  const sample = event && first ? {
    subject: chosenMail ? fillTemplate(chosenMail.subject, { registration: first, event }) : null,
    html: chosenMail ? fillTemplate(chosenMail.html, { registration: first, event }, true) : null,
    whatsapp: chosenWa ? fillTemplate(chosenWa.message, { registration: first, event }) : null,
  } : null
  const reloadTemplates = async () => {
    const [mail, wa] = await Promise.all([api<EmailTemplate[]>('/templates'), api<WhatsAppTemplate[]>('/wa-templates').catch(() => [] as WhatsAppTemplate[])])
    setTemplates(mail); setWaTemplates(wa)
  }
  const decide = () => void run(async () => {
    if (!event) return
    const result = await api<{ results: { mail: string; whatsapp: string }[] }>('/decisions', 'POST', {
      eventId: event.id, ids: selected, decision, mailTemplateId: mailTemplateId || null, whatsappTemplateId: waTemplateId || null, allowTest: includeTest,
      repeatConfirmed: repeat, confirmed: true,
    })
    setPreview(false); setSelected([])
    setNotice(`${result.results.length} kayıt işlendi. Mail: ${result.results.filter((item) => item.mail === 'gönderildi').length} gönderildi, WhatsApp: ${result.results.filter((item) => item.whatsapp === 'kuyruğa alındı').length} kuyruğa alındı.`)
    await loadRegistrations(event.id)
  })

  if (!auth.authenticated) return <div className="app-frame">{stagingBanner && <div className="staging-banner">{stagingBanner}</div>}<main className="login-screen">
    {/* Arka planda dönüşümlü kayan soluk logo sütunları */}
    <div aria-hidden="true" className="login-pattern">
      {Array.from({ length: 8 }, (_, column) => <div className="login-pattern__column" key={column}>
        <div className="login-pattern__track">
          {Array.from({ length: 2 }, (_, group) => <div className="login-pattern__group" key={group}>
            {Array.from({ length: 5 }, (_, mark) => <img alt="" key={mark} src={logo} />)}
          </div>)}
        </div>
      </div>)}
    </div>
    <section className="login-card">
    <img className="login-logo" src={logo} alt={`${KULUP.kisaAd} logosu`} />
    <div className="brand">{KULUP.kisaAd} <span>WORKER</span></div>
    <h1>Yönetici girişi</h1>
    <p>{KULUP.tamAd}</p>
    {connection && <small className="connection-label">{connection}</small>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice">{notice}</div>}
    {step === 'login' ? <form onSubmit={(e) => { e.preventDefault(); login() }}>
      <label>E-posta<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Parola<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="primary" disabled={busy}>Devam et</button>
    </form> : <form ref={totpForm} onSubmit={(e) => { e.preventDefault(); verify() }}>
      <CodeInput label="Altı haneli doğrulama kodu" value={code} onChange={setCode} disabled={busy}
        onComplete={() => totpForm.current?.requestSubmit()} />
      <button className="primary" disabled={busy || code.length !== 6}>{busy ? 'Kod doğrulanıyor…' : 'Doğrula ve aç'}</button>
      <button type="button" onClick={() => { setStep('login'); setCode(''); setError('') }}>Farklı hesapla giriş yap</button>
    </form>}
  </section>
  <footer className="login-footer">
    <span>{KULUP.tamAd} yönetim aracı.</span>
  </footer></main></div>

  return <div className="app-frame">{stagingBanner && <div className="staging-banner">{stagingBanner}</div>}
    {alarm && <div className="wa-alarm" role="alert">
      <div><strong>WhatsApp bağlantısı koptu!</strong> {alarm.reason}{' '}
        {job ? `Gönderim yarıda kaldı: ${job.sent}/${job.total} gitti.` : ''}
        {wa.reconnectAttempt ? ` Otomatik yeniden bağlanma deneniyor (${wa.reconnectAttempt}/3)…` : ''}</div>
      <div className="actions"><button onClick={() => { setTab('whatsapp'); setNotice(''); setError('') }}>WhatsApp'a git</button>
        <button onClick={() => setAlarmSeen(alarm.at)}>Gördüm</button></div>
    </div>}
    {job && wa.status === 'connected' && <div className="job-banner" role="status">
      <div><strong>Yarıda kalan gönderim:</strong> {job.sent}/{job.total} gitti, {job.pendingRemaining} mesaj bekliyor
        <small> · {new Date(job.interruptedAt).toLocaleString('tr-TR')} · {job.reason}</small></div>
      <div className="actions"><button className="primary" disabled={busy} onClick={resumeJob}>Kaldığı yerden devam et</button>
        <button disabled={busy} onClick={discardJob}>Vazgeç</button></div>
    </div>}
    <div className="shell">
    <aside className="sidebar"><div className="brand brand--logo"><img src={logo} alt={`${KULUP.kisaAd} logosu`} /><span>WORKER</span></div>
      <nav aria-label="İşlemler">
        {([['application-lists', 'Başvurular'], ['applications', 'Etkinlik başvuruları'], ['team-rejections', 'Takım kabul / ret'], ['gate', 'Kapı'], ['whatsapp', 'WhatsApp'], ['templates', 'Şablonlar'], ['free-menu', 'Özgür gönderim'], ['logs', 'Günlük'], ['certificates', 'Sertifikalar']] as [Tab, string][]).map(([key, title]) =>
          <button className={tab === key || (key === 'free-menu' && (tab === 'free' || tab === 'messages')) ? 'active' : ''} key={key} onClick={() => { setTab(key); setNotice(''); setError('') }}>{title}</button>)}
      </nav><div className="sidebar-bottom">
        <small className={`wa-mini ${wa.status}`}>WhatsApp: {waStatusLabels[wa.status] || wa.status}{wa.account ? <><br />{accountText(wa.account)}</> : null}</small>
        {connection && <small>{connection}</small>}<small>{auth.userEmail}</small><button onClick={logout}>Çıkış yap</button></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div>{(tab === 'free' || tab === 'messages') && <button className="topbar-back" onClick={() => setTab('free-menu')}><ChevronLeft size={15} /> Özgür gönderim</button>}<strong>{tab === 'application-lists' ? 'Başvurular' : tab === 'applications' ? 'Etkinlik başvuruları' : tab === 'team-rejections' ? 'Takım kabul / ret' : tab === 'gate' ? 'Kapı modu' : tab === 'whatsapp' ? 'WhatsApp' : tab === 'messages' ? 'WhatsApp gönderimi' : tab === 'free-menu' ? 'Özgür gönderim' : tab === 'auto' ? 'Otomatik mailler' : tab === 'free' ? 'Mail Stüdyosu' : tab === 'logs' ? 'Günlük' : tab === 'certificates' ? 'Sertifikalar' : 'Şablonlar'}</strong><p>{KULUP.kisaAd} yönetim aracı</p></div>
        {(tab === 'applications' || tab === 'gate' || tab === 'messages') && <label className="event-picker">Etkinlik <select value={eventId ?? ''} onChange={(e) => { setEventId(Number(e.target.value)); setSelected([]) }}>
          {events.map((item) => <option key={item.id} value={item.id}>{item.title}{item.mode === 'test' ? ' · Test' : ''}</option>)}
        </select></label>}
      </header>
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}
      {tab === 'application-lists' && <ApplicationLists />}
      {tab === 'team-rejections' && <TeamRejections events={events} templates={templates} waTemplates={waTemplates} />}
      {tab === 'applications' && <section className="screen event-applications">
        <div className="heading"><div><h1>Etkinlik başvuruları</h1><p>{filtered.length} kayıt gösteriliyor · {selected.length} seçili</p></div><button onClick={() => eventId && void run(() => loadRegistrations(eventId))}>Yenile</button></div>
        <div className="application-summary">
          {(['pending', 'accepted', 'rejected', 'waitlist'] as const).map((key) => <button key={key} className={statusFilter === key ? 'active' : ''} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}>
            <strong>{registrations.filter((item) => (includeTest || !item.isTest) && item.status === key).length}</strong><span>{statusLabels[key]}</span></button>)}
          <div><strong>{registrations.filter((item) => (includeTest || !item.isTest) && item.attended).length}</strong><span>Kapıdan girdi</span></div>
        </div>
        <div className="toolbar">
          <input placeholder="Ad, e-posta veya telefon ara" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select aria-label="Durum" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Tüm durumlar</option><option value="pending">Bekliyor</option><option value="accepted">Kabul</option><option value="rejected">Ret</option><option value="waitlist">Yedek</option></select>
          <select aria-label="Başvuru aşaması" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option value="all">Tüm aşamalar</option><option value="normal">Normal</option><option value="late">Geç</option></select>
          <label className="inline"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Test kayıtları</label>
        </div>
        <div className="delivery-template-bar delivery-template-bar--three">
          <label>Karar<select value={decision} onChange={(e) => { setDecision(e.target.value as Decision); setPreview(false) }}>{Object.entries(labels).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
          <label>Mail şablonu<select value={mailTemplateId} onChange={(e) => { setMailTemplateId(e.target.value ? Number(e.target.value) : ''); setPreview(false) }}><option value="">Mail gönderme</option>{mailChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>WhatsApp şablonu<select value={waTemplateId} onChange={(e) => { setWaTemplateId(e.target.value ? Number(e.target.value) : ''); setPreview(false) }}><option value="">WhatsApp gönderme</option>{waTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <p className="help">Durum CMS'e yazılır; seçilen şablonlar gönderilir. Kabulde WhatsApp mesajına bilet QR'ı eklenir.</p>
        </div>
        <div className="event-applications__body">
          <div className="table-wrap"><table><thead><tr><th><input aria-label="Tümünü seç" type="checkbox" checked={filtered.length > 0 && filtered.every((item) => selected.includes(item.id))} onChange={(e) => setSelected(e.target.checked ? filtered.map((item) => item.id) : [])} /></th><th>Ad Soyad</th><th>E-posta</th><th>Telefon</th><th>Durum</th><th>Aşama</th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id} onMouseEnter={() => { const index = selectedRows.findIndex((row) => row.id === item.id); if (index >= 0) setPreviewIndex(index) }}><td><input aria-label={`${item.fullName} seç`} type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td><td>{item.fullName}{item.isTest && <small className="tag">TEST</small>}</td><td>{item.email}</td><td>{item.phone}</td><td><span className={`status ${item.status}`}>{statusLabels[item.status] || item.status}</span></td><td>{item.applicationStage || '—'}</td></tr>)}
          </tbody></table></div>
          <aside className="delivery-preview">
            {sample && (chosenMail || chosenWa) ? <>
              <div className="certificate-preview-nav">
                <button aria-label="Önceki kişi" disabled={selectedRows.length < 2} onClick={() => setPreviewIndex((i) => (i - 1 + selectedRows.length) % selectedRows.length)}>‹</button>
                <div><strong>{first?.fullName}</strong><small>{Math.min(previewIndex, selectedRows.length - 1) + 1} / {selectedRows.length} seçili</small></div>
                <button aria-label="Sonraki kişi" disabled={selectedRows.length < 2} onClick={() => setPreviewIndex((i) => (i + 1) % selectedRows.length)}>›</button>
              </div>
              {sample.html && <div className="mail-preview-card"><div className="mail-preview-card__header"><span>Kime: {first?.email}</span><strong>{sample.subject?.text}</strong></div><iframe title="Mail önizleme" sandbox="" referrerPolicy="no-referrer" srcDoc={sample.html.text} /></div>}
              {sample.whatsapp && <div className="wa-preview"><header><strong>{first?.fullName}</strong><small>{first?.phone}</small></header><div className="wa-bubble">{decision === 'accepted' ? '🎫 Bilet QR görseli\n' : ''}{sample.whatsapp.text}</div></div>}
              {[...(sample.subject?.warnings || []), ...(sample.html?.warnings || []), ...(sample.whatsapp?.warnings || [])].map((warning, index) => <p className="warning" key={index}>⚠ {warning}</p>)}
            </> : <p className="help">{selected.length ? 'Önizleme için mail veya WhatsApp şablonu seçin.' : 'Önizleme için tablodan kişi seçin.'}</p>}
          </aside>
        </div>
        {preview ? <div className="inline-confirm">
          <p><strong>{selected.length} kişiye {labels[decision]}</strong> kararı uygulanacak{chosenMail ? `, "${chosenMail.name}" maili` : ''}{chosenWa ? `${chosenMail ? ' ve' : ','} "${chosenWa.name}" WhatsApp mesajı` : ''} gönderilecek. Emin misiniz?</p>
          <label className="inline"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Önceden gönderilenleri tekrar gönder</label>
          <div className="actions"><button onClick={() => setPreview(false)}>Vazgeç</button><button className="primary" disabled={(!chosenMail && !chosenWa) || busy} onClick={decide}>Evet, uygula</button></div>
        </div> : <div className="actions">
          {!chosenMail && !chosenWa && selected.length > 0 && <span className="warning">En az bir mail veya WhatsApp şablonu seçin.</span>}
          <button className="primary" disabled={!selected.length || busy || (!chosenMail && !chosenWa)} onClick={() => setPreview(true)}>Kararı uygula ({selected.length})</button></div>}
      </section>}
      {tab === 'gate' && event && <Gate event={event} whatsAppConnected={wa.status === 'connected'} />}
      {tab === 'whatsapp' && <WhatsAppPanel status={wa} setStatus={setWa} run={run} />}
      {tab === 'free-menu' && <section className="screen free-menu">
        <p className="muted">Ne göndermek istiyorsunuz?</p>
        <div className="free-menu__choices">
          <button className="free-menu__choice" onClick={() => setTab('free')}><Mail size={30} /><strong>Mail gönder</strong><span>Mail Stüdyosu: CMS listeleri, dosya, önceki liste ya da elle eklenen kişilere şablonlu e-posta veya WhatsApp.</span></button>
          <button className="free-menu__choice" onClick={() => setTab('messages')}><MessageCircle size={30} /><strong>WhatsApp mesajı gönder</strong><span>Etkinlik katılımcılarına (kabul / gelen / gelmeyen) ya da JSON ile eklenen kişilere değişkenli WhatsApp mesajı.</span></button>
        </div>
      </section>}
      {tab === 'messages' && <Messages event={event} waTemplates={waTemplates} refreshTemplates={reloadTemplates} whatsAppConnected={wa.status === 'connected'} />}
      {tab === 'free' && <FreeSend events={events} mailTemplates={templates} waTemplates={waTemplates} refreshTemplates={reloadTemplates} />}
      {tab === 'templates' && <Templates mailTemplates={templates} waTemplates={waTemplates} events={events} refresh={reloadTemplates}
        autoMails={<AutoMailPanel templates={templates} events={events} refresh={reloadTemplates} run={run} />} />}
      {tab === 'certificates' && <Certificates />}
      {tab === 'logs' && <LogPanel />}
    </main>
  </div></div>
}

function WhatsAppPanel({ status, setStatus, run }: { status: WaStatus; setStatus: (value: WaStatus) => void; run: (action: () => Promise<void>) => Promise<void> }) {
  return <section className="screen"><div className="heading"><div><h1>WhatsApp bağlantısı</h1><p>{status.message}</p></div><span className={`status ${status.status}`}>{waStatusLabels[status.status] || status.status}</span></div>
    <div className="card">
      {status.account && <div className="wa-account"><span>Bağlı hesap</span>
        <strong>{status.account.name || 'Adsız hesap'}{status.account.username ? ` (@${status.account.username})` : ''}</strong>
        <span>{status.account.phone ?? 'Numara gizli (WhatsApp yalnız LID kimliği verdi)'}</span></div>}
      {status.unexpectedDisconnect && status.status !== 'connected' && <p className="warning">Son kopma: {new Date(status.unexpectedDisconnect.at).toLocaleString('tr-TR')} · {status.unexpectedDisconnect.reason}</p>}<div className="actions"><button className="primary" onClick={() => void run(async () => setStatus(await api<WaStatus>('/whatsapp/connect', 'POST', {})))}>Bağlan</button>
      <button onClick={() => void run(async () => setStatus(await api<WaStatus>('/whatsapp/logout', 'POST', {})))}>Oturumu kapat</button>
      </div>
      {status.qrCodeUrl && <div className="qr"><img src={status.qrCodeUrl} alt="WhatsApp bağlantı QR kodu" />
        <ol className="qr-steps"><li>Telefonda <strong>WhatsApp</strong>'ı açın.</li><li><strong>Ayarlar → Bağlı cihazlar → Cihaz bağla</strong>'ya dokunun.</li><li>Telefonu bu QR koduna tutun; bağlanınca hesap adı burada görünür.</li></ol></div>}
    </div>
    <QueuePanel connected={status.status === 'connected'} run={run} />
  </section>
}
