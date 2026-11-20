import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailTemplate, WhatsAppTemplate } from '../../shared/types.js'
import { applicationMatches, applicationStatus, type ApplicationKind, type ApplicationTab } from '../../shared/applicationVars.js'
import { api } from '../api'
import { applicationCounts, applicationPreview, buildNotifyBody, decisionForTab, notifyBlocker,
  repeatCount, selectVisible, selectedApplications, visibleApplications, type ApplicationRow } from '../ui/applicationListModel'

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'İşlem başarısız.'
type NotifyResult = { id: number; mail: string; whatsapp: string; at: string }
// Arayüzde ek "Bekleyen" sekmesi: karar verilmemiş başvurular (yalnız liste; bildirim Kabul/Red sekmesinden).
type UiTab = ApplicationTab | 'pending'
const statusText: Record<string, string> = { pending: 'Bekliyor', new: 'Yeni', reviewing: 'İnceleniyor', interview: 'Mülakat',
  approved: 'Kabul', accepted: 'Kabul', rejected: 'Red' }
const deliveryLabel = (status: string) => ({ sent: 'gönderildi', queued: 'kuyruğa alındı', failed: 'başarısız', skipped: 'atlanmış' })[status as 'sent' | 'queued' | 'failed' | 'skipped'] || status

export function ApplicationLists() {
  const [kind, setKind] = useState<ApplicationKind>('members')
  const [tab, setTab] = useState<UiTab>('pending')
  const [rows, setRows] = useState<ApplicationRow[]>([])
  const [ids, setIds] = useState<number[]>([])
  const [mails, setMails] = useState<EmailTemplate[]>([])
  const [messages, setMessages] = useState<WhatsAppTemplate[]>([])
  const [mailId, setMailId] = useState<number | ''>('')
  const [messageId, setMessageId] = useState<number | ''>('')
  const [confirm, setConfirm] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [repeatNeeded, setRepeatNeeded] = useState(false)
  const [result, setResult] = useState<NotifyResult[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const repeatRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  const load = useCallback(async (nextKind: ApplicationKind) => {
    const request = ++requestId.current
    setLoading(true); setError('')
    try {
      const data = await api<{ docs: ApplicationRow[] }>(`/applications?kind=${nextKind}&tab=all`)
      if (request === requestId.current) { setRows(data.docs); setIds([]) }
    } catch (err) { if (request === requestId.current) setError(messageOf(err)) }
    finally { if (request === requestId.current) setLoading(false) }
  }, [])
  useEffect(() => { void load(kind) }, [kind, load])
  useEffect(() => {
    void Promise.all([api<EmailTemplate[]>('/templates'), api<WhatsAppTemplate[]>('/wa-templates')])
      .then(([mail, wa]) => { setMails(mail.filter((item) => !item.purpose.endsWith('-received'))); setMessages(wa) })
      .catch((err) => setError(messageOf(err)))
  }, [])

  const modelTab: ApplicationTab = tab === 'pending' ? 'all' : tab
  const visible = useMemo(() => tab === 'pending'
    ? rows.filter((row) => !applicationMatches(row, kind, 'accepted') && !applicationMatches(row, kind, 'rejected'))
    : visibleApplications(rows, kind, tab), [rows, kind, tab])
  const selected = useMemo(() => selectedApplications(rows, ids), [rows, ids])
  const base = applicationCounts(rows, kind)
  const counts = { ...base, pending: base.all - base.accepted - base.rejected }
  const mail = mails.find((item) => item.id === mailId)
  const whatsapp = messages.find((item) => item.id === messageId)
  const blocker = tab === 'pending' ? 'Bekleyen başvurulara bildirim gönderilmez; önce CMS’te karar verin, sonra Kabul veya Red sekmesinden gönderin.' : notifyBlocker(rows, ids, kind, modelTab, mail, whatsapp)
  const decision = decisionForTab(modelTab)
  const repeated = decision ? repeatCount(selected, decision) : 0
  const preview = selected[0] ? applicationPreview(selected[0], kind, mail, whatsapp) : null
  const openConfirm = () => { if (!blocker) { setRepeat(false); setRepeatNeeded(false); setConfirm(true); setError('') } }
  const send = async () => {
    const body = buildNotifyBody(rows, ids, kind, modelTab, mail, whatsapp, repeat)
    if (!body || ((repeated > 0 || repeatNeeded) && !repeat)) return
    setBusy(true); setError('')
    try {
      const response = await api<{ results: NotifyResult[] }>('/applications/notify', 'POST', body)
      setResult(response.results); setConfirm(false); setIds([]); setRepeat(false); setRepeatNeeded(false)
      await load(kind)
    } catch (err) {
      setError(messageOf(err))
      if (messageOf(err).includes('tekrar') || messageOf(err).includes('daha önce')) {
        setRepeatNeeded(true)
        window.setTimeout(() => repeatRef.current?.focus(), 0)
      }
    } finally { setBusy(false) }
  }
  const changeKind = (next: ApplicationKind) => {
    setKind(next); setRows([]); setIds([]); setTab('pending'); setConfirm(false); setRepeat(false); setResult([])
    setMailId(''); setMessageId(''); setRepeatNeeded(false)
  }
  const changeTab = (next: UiTab) => {
    setTab(next); setIds([]); setConfirm(false); setRepeat(false); setRepeatNeeded(false); setResult([])
  }
  return <section className="screen application-lists">
    <div className="heading"><div><h1>Başvurular</h1><p>CMS kararına göre bildirim gönderin.</p></div><button disabled={loading || busy} onClick={() => void load(kind)}>Yenile</button></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="application-tabs application-kinds" role="group" aria-label="Başvuru türü">
      {([['members', 'Üyelik başvuruları'], ['core-team', 'Core Team başvuruları']] as const).map(([key, title]) =>
        <button key={key} className={kind === key ? 'active' : ''} aria-pressed={kind === key} disabled={busy} onClick={() => changeKind(key)}>{title}</button>)}
    </div>
    <div className="application-tabs" role="group" aria-label="Karar sekmeleri">
      {([['pending', 'Bekleyen'], ['accepted', 'Kabul'], ['rejected', 'Red'], ['all', 'Tümü']] as const).map(([key, title]) =>
        <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} disabled={busy} onClick={() => changeTab(key)}>{title} ({counts[key]})</button>)}
    </div>
    {tab !== 'pending' && <>
    <div className="card application-send"><h2>{tab === 'accepted' ? 'Kabul' : tab === 'rejected' ? 'Red' : 'Bildirim'} bildirimi</h2><div className="template-pickers">
      <label>Mail şablonu<select value={mailId} onChange={(event) => setMailId(event.target.value ? Number(event.target.value) : '')}><option value="">Mail gönderme</option>{mails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>WhatsApp şablonu<select value={messageId} onChange={(event) => setMessageId(event.target.value ? Number(event.target.value) : '')}><option value="">WhatsApp gönderme</option>{messages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div><p className="help">Değişkenler: {'{{adSoyad}} · {{ad}} · {{bolum}} · {{sinif}} · {{alan}}'}</p>
      {preview && <div className="preview"><strong>İlk seçili kişi: {selected[0].fullName}</strong>{preview.subject && <p>{preview.subject}</p>}{preview.html && <iframe title="Mail önizleme" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} />}{preview.message && <pre>{preview.message}</pre>}{preview.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</div>}
      {blocker && <p className="help">{blocker}</p>}
      <div className="actions"><button className="primary" disabled={Boolean(blocker) || loading || busy} onClick={openConfirm}>Gönderimi gözden geçir ({selected.length})</button></div>
    </div>
    </>}
    <p>{loading ? 'Başvurular yükleniyor…' : `${visible.length} kayıt gösteriliyor · ${selected.length} seçili`}</p>
    <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Görünenlerin tümünü seç" checked={visible.length > 0 && visible.every((row) => ids.includes(row.id))} onChange={(event) => setIds((current) => selectVisible(current, visible, event.target.checked))} /></th><th>Ad Soyad</th><th>Bölüm</th><th>Sınıf</th>{kind === 'core-team' && <th>Alan</th>}<th>E-posta</th><th>Telefon</th><th>Durum</th><th>Bildirim</th></tr></thead><tbody>
      {visible.map((row) => <tr key={row.id}><td><input type="checkbox" aria-label={`${row.fullName} seç`} checked={ids.includes(row.id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></td><td>{row.fullName}</td><td>{row.department || '—'}</td><td>{kind === 'members' ? row.year ?? '—' : row.grade ?? '—'}</td>{kind === 'core-team' && <td>{row.area || '—'}</td>}<td>{row.email || '—'}</td><td>{row.phone || '—'}</td><td><span className={`status ${row.status === applicationStatus(kind, 'accepted') ? 'accepted' : row.status === 'rejected' ? 'rejected' : 'pending'}`}>{statusText[row.status] ?? row.status}</span></td><td>{Object.entries(row.notified || {}).map(([key, date]) => <span className="application-notified" key={key}>{key === 'accepted' ? 'Kabul' : 'Red'} bildirildi · {new Date(date).toLocaleString('tr-TR')}</span>)}</td></tr>)}
    </tbody></table></div>
    {!loading && !visible.length && <p>Bu sekmede başvuru yok.</p>}
    {result.length > 0 && <div className="card" role="status"><h2>Gönderim sonucu</h2><div className="table-wrap"><table><thead><tr><th>Başvuru</th><th>Mail</th><th>WhatsApp</th><th>Tarih</th></tr></thead><tbody>{result.map((item) => <tr key={item.id}><td>#{item.id}</td><td>{deliveryLabel(item.mail)}</td><td>{deliveryLabel(item.whatsapp)}</td><td>{new Date(item.at).toLocaleString('tr-TR')}</td></tr>)}</tbody></table></div></div>}
    {confirm && decision && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="application-confirm"><h2 id="application-confirm">Bildirimleri onayla</h2>{error && <div className="notice error" role="alert">{error}</div>}<p>{selected.length} kişiye <strong>{decision === 'accepted' ? 'Kabul' : 'Red'}</strong> bildirimi gönderilecek. {mail && 'Mail'} {mail && whatsapp && 've'} {whatsapp && 'WhatsApp'} şablonu seçili.</p>
      {(repeated > 0 || repeatNeeded) && <><p className="warning">{repeated > 0 ? `${repeated} kişiye daha önce bildirildi.` : 'Sunucuda daha önce bildirilmiş kişi bulundu.'} Tekrar göndermek için ayrı onay verin.</p><label className="inline"><input ref={repeatRef} type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> Daha önce bildirilenlere tekrar gönder</label></>}
      <div className="actions"><button disabled={busy} onClick={() => setConfirm(false)}>Vazgeç</button><button className="primary" disabled={busy || Boolean(blocker) || ((repeated > 0 || repeatNeeded) && !repeat)} onClick={() => void send()}>Onayla ve gönder</button></div>
    </section></div>}
  </section>
}
