import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailTemplate, WhatsAppTemplate, WorkerEvent } from '../../shared/types.js'
import { hasTicket, recipientCount, teamDecisionLabels, teamRejectionBlocker, teamRejectionKeys, teamRejectionPreview,
  type RejectedTeam, type TeamDecision, type TeamRejectionList, type TeamRejectionResult } from '../../shared/teamRejections.js'
import { api } from '../api'

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'İşlem başarısız.'
const autoPurposes = ['member-application-received', 'event-registration-received', 'coreteam-application-received']

/**
 * Takım kabul / ret: üstteki seçimle kabul edilen ya da reddedilen takımlar listelenir; akış aynı.
 * Takım retleri: etkinlik seç → CMS'te "Reddedildi" olan takımlar → takımın kabul edilmiş üyelerine ret maili.
 * Mail otomatik gitmez; önizleme ve onay penceresinden sonra gönderilir. Gönderilen takım CMS'te işaretlenir.
 */
export function TeamRejections({ events, templates, waTemplates = [] }: { events: WorkerEvent[]; templates: EmailTemplate[]; waTemplates?: WhatsAppTemplate[] }) {
  const teamEvents = useMemo(() => {
    const flagged = events.filter((event) => event.teamMode)
    return flagged.length ? flagged : events
  }, [events])
  const [eventId, setEventId] = useState<number | null>(null)
  const [decision, setDecision] = useState<TeamDecision>('accepted')
  const [data, setData] = useState<TeamRejectionList | null>(null)
  const [ids, setIds] = useState<number[]>([])
  const [mailId, setMailId] = useState<number | ''>('')
  const [waId, setWaId] = useState<number | ''>('')
  const [confirm, setConfirm] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [results, setResults] = useState<TeamRejectionResult[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const requestId = useRef(0)

  const activeEvent = eventId ?? teamEvents[0]?.id ?? null
  const load = useCallback(async (id: number, kind: TeamDecision) => {
    const request = ++requestId.current
    setLoading(true); setError('')
    try {
      const list = await api<TeamRejectionList>(`/team-rejections?eventId=${id}&decision=${kind}`)
      if (request === requestId.current) { setData(list); setIds([]) }
    } catch (err) { if (request === requestId.current) setError(messageOf(err)) }
    finally { if (request === requestId.current) setLoading(false) }
  }, [])
  useEffect(() => { if (activeEvent) void load(activeEvent, decision) }, [activeEvent, decision, load])

  const mails = templates.filter((item) => !autoPurposes.includes(item.purpose))
  const mail = mails.find((item) => item.id === mailId)
  const teams = data?.teams ?? []
  const selected = teams.filter((team) => ids.includes(team.id))
  const eventTitle = data?.event ?? ''
  const wa = waTemplates.find((item) => item.id === waId)
  const blocker = teamRejectionBlocker(selected, eventTitle, mail, decision, wa)
  const waCount = wa ? selected.reduce((sum, team) => sum + team.recipients.filter((r) => r.phone).length, 0) : 0
  const label = teamDecisionLabels[decision]
  const count = recipientCount(selected)
  const repeated = selected.filter((team) => team.mailSentAt).length
  // Önizleme: seçili takımların e-postalı alıcıları arasında gezinilir
  const previewRows = selected.flatMap((team) => team.recipients.filter((r) => r.email).map((recipient) => ({ team, recipient })))
  const current = previewRows[Math.min(previewIndex, Math.max(0, previewRows.length - 1))]
  const preview = current && mail ? teamRejectionPreview(current.team, current.recipient, eventTitle, mail) : null

  const toggle = (team: RejectedTeam, checked: boolean) =>
    setIds((list) => checked ? [...new Set([...list, team.id])] : list.filter((id) => id !== team.id))
  const send = async () => {
    if (blocker || !activeEvent || !mail || (repeated > 0 && !repeat)) return
    setBusy(true); setError('')
    try {
      const response = await api<{ results: TeamRejectionResult[] }>('/team-rejections/send', 'POST', {
        eventId: activeEvent, decision, teamIds: selected.map((team) => team.id), mailTemplateId: mail.id, ...(wa ? { whatsappTemplateId: wa.id } : {}),
        confirmed: true, confirmCount: count, ...(repeat ? { repeatConfirmed: true } : {}),
      })
      setResults(response.results); setConfirm(false); setRepeat(false)
      await load(activeEvent, decision)
    } catch (err) { setError(messageOf(err)) }
    finally { setBusy(false) }
  }

  return <section className="screen team-rejections">
    <div className="heading"><div><h1>Takım kabul / ret</h1><p>Kabul edilen ve reddedilen takımlara mail otomatik gitmez; buradan önizleyip elle gönderin.</p></div>
      <button disabled={loading || busy || !activeEvent} onClick={() => activeEvent && void load(activeEvent, decision)}>Yenile</button></div>
    {error && !confirm && <div className="notice error" role="alert">{error}</div>}
    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Karar">
        {(['accepted', 'rejected'] as TeamDecision[]).map((kind) => <button key={kind} role="tab" aria-selected={decision === kind} className={decision === kind ? 'active' : ''} disabled={busy}
          onClick={() => { setDecision(kind); setData(null); setIds([]); setResults([]); setConfirm(false); setPreviewIndex(0) }}>{kind === 'accepted' ? 'Kabul edilenler' : 'Reddedilenler'}</button>)}
      </div>
      <label className="event-picker">Etkinlik <select value={activeEvent ?? ''} disabled={busy} onChange={(e) => { setEventId(Number(e.target.value)); setResults([]); setConfirm(false) }}>
        {teamEvents.map((item) => <option key={item.id} value={item.id}>{item.title}{item.mode === 'test' ? ' · Test' : ''}</option>)}
      </select></label>
    </div>
    <div className="card application-send"><h2>{label.noun} maili</h2>
      <div className="template-pickers">
        <label>Mail şablonu<select value={mailId} onChange={(e) => { setMailId(e.target.value ? Number(e.target.value) : ''); setConfirm(false) }}>
          <option value="">Şablon seçin</option>{mails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>WhatsApp şablonu<select value={waId} onChange={(e) => { setWaId(e.target.value ? Number(e.target.value) : ''); setConfirm(false) }}>
          <option value="">WhatsApp gönderme</option>{waTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <p className="help">Değişkenler: {teamRejectionKeys.map((key) => `{{${key}}}`).join(' · ')} — mail takımın kabul edilmiş tüm üyelerine (kaptan dahil) gider.
        {decision === 'accepted' && <> Bilet: <code>{'{{biletLinki}}'}</code> kullanılırsa mailde QR görseli ek olarak, WhatsApp'ta görsel olarak gider. Masa numarası kapıda seçilir.</>}</p>
      {preview && current && <div className="preview">
        <div className="certificate-preview-nav">
          <button aria-label="Önceki kişi" disabled={previewRows.length < 2} onClick={() => setPreviewIndex((i) => (i - 1 + previewRows.length) % previewRows.length)}>‹</button>
          <div><strong>{current.recipient.name || 'Adsız'} · {current.team.name}</strong><small>{Math.min(previewIndex, previewRows.length - 1) + 1} / {previewRows.length} alıcı · {current.recipient.email}</small></div>
          <button aria-label="Sonraki kişi" disabled={previewRows.length < 2} onClick={() => setPreviewIndex((i) => (i + 1) % previewRows.length)}>›</button>
        </div>
        <p><strong>{preview.subject}</strong></p>
        <iframe title="Mail önizleme" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} />
        {preview.warnings.map((warning, index) => <p className="warning" key={index}>⚠ {warning}</p>)}
      </div>}
      {blocker && <p className="help">{blocker}</p>}
      <div className="actions"><button className="primary" disabled={Boolean(blocker) || loading || busy} onClick={() => { setRepeat(false); setError(''); setConfirm(true) }}>
        Gönderimi gözden geçir ({selected.length} takım · {count} kişi)</button></div>
    </div>
    <p>{loading ? 'Takımlar yükleniyor…' : `${teams.length} ${label.plural} takım · ${selected.length} seçili`}</p>
    <div className="table-wrap"><table><thead><tr>
      <th><input type="checkbox" aria-label="Tümünü seç" checked={teams.length > 0 && teams.every((team) => ids.includes(team.id))} onChange={(e) => setIds(e.target.checked ? teams.map((team) => team.id) : [])} /></th>
      <th>Takım</th><th>Üyeler (kabul edilmiş)</th><th>Yönetici notu</th><th>{label.noun} maili</th></tr></thead><tbody>
      {teams.map((team) => <tr key={team.id}>
        <td><input type="checkbox" aria-label={`${team.name} seç`} checked={ids.includes(team.id)} onChange={(e) => toggle(team, e.target.checked)} /></td>
        <td>{team.name}</td>
        <td>{team.recipients.length ? team.recipients.map((r) => <span className="team-recipient" key={r.participantId}>{r.name || 'Adsız'}{r.role === 'captain' ? ' (kaptan)' : ''} · {r.email || 'e-posta yok'}
          {decision === 'accepted' && <> · {hasTicket(r) ? '🎟️ bilet' : '⚠ bilet yok'} · {r.phone ? '📱' : 'telefon yok'}</>}</span>) : '—'}</td>
        <td>{team.adminNote || '—'}</td>
        <td>{team.mailSentAt ? <span className="application-notified">Gönderildi · {new Date(team.mailSentAt).toLocaleString('tr-TR')}</span> : <span className="status pending">Gönderilmedi</span>}</td>
      </tr>)}
    </tbody></table></div>
    {!loading && !teams.length && <p>Bu etkinlikte {label.plural} takım yok.</p>}
    {results.length > 0 && <div className="card" role="status"><h2>Gönderim sonucu</h2><div className="table-wrap"><table>
      <thead><tr><th>Takım</th><th>Mail</th><th>Başarısız</th><th>E-postasız</th><th>WhatsApp kuyruğu</th><th>İşaret</th></tr></thead>
      <tbody>{results.map((item) => <tr key={item.teamId}><td>{item.teamName}</td><td>{item.sent}</td><td>{item.failed}</td><td>{item.skipped}</td><td>{item.whatsapp ?? 0}</td>
        <td>{item.markedAt ? new Date(item.markedAt).toLocaleString('tr-TR') : '—'}</td></tr>)}</tbody></table></div></div>}
    {confirm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="team-rejection-confirm">
      <h2 id="team-rejection-confirm">{label.noun} maillerini onayla</h2>
      {error && <div className="notice error" role="alert">{error}</div>}
      <p><strong>{selected.length} takımın {count} üyesine</strong> &quot;{mail?.name}&quot; {label.noun.toLowerCase()} maili gönderilecek{wa ? <>; <strong>{waCount} üyeye</strong> &quot;{wa.name}&quot; WhatsApp mesajı kuyruğa alınacak</> : ''}. Bu işlem geri alınamaz.</p>
      <ul className="team-rejection-list">{selected.map((team) => <li key={team.id}>{team.name} — {team.recipients.filter((r) => r.email).length} kişi</li>)}</ul>
      {repeated > 0 && <><p className="warning">{repeated} takıma {label.noun.toLowerCase()} maili daha önce gönderildi. Tekrar göndermek için ayrı onay verin.</p>
        <label className="inline"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Daha önce gönderilenlere tekrar gönder</label></>}
      <div className="actions"><button disabled={busy} onClick={() => setConfirm(false)}>Vazgeç</button>
        <button className="primary" disabled={busy || Boolean(blocker) || (repeated > 0 && !repeat)} onClick={() => void send()}>{busy ? 'Gönderiliyor…' : 'Onayla ve gönder'}</button></div>
    </section></div>}
  </section>
}
