import { Check, GripVertical, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { EmailTemplate, FreeSendRequest, FreeSendSource, FreeSendStatus, Recipient, SendHistoryRun, WhatsAppTemplate, WorkerEvent } from '../../shared/types.js'
import { api } from '../api'
import { EmailHtmlEditor } from '../ui/EmailHtmlEditor'
import { availableVariables, buildSendBody, channelCounts, failedCount, historyRecipients, manualRecipient, mergeRecipients, previewFor, retryBody } from '../ui/freeSendModel'

// Mail Stüdyosu ("Özgür gönderim" + HTML editörü): üstte Kaynak, Önceki liste ve Kanal/şablon çubukları;
// ortada alıcılar (Gönderilecek / Bekletilen, sürükle-bırak, elle kişi ekleme) | editör; altta kişiselleştirilmiş
// önizleme ve eksik değişkenli kişiler. Kaynaklar listeye EKLENİR (CMS + dosya + elle + geçmiş birlikte gönderilebilir).
type FileInput = { text: string; format: 'json' | 'csv'; name: string }
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'İşlem başarısız.'
const maskEmail = (value?: string) => value ? `${value.slice(0, 2)}***@${value.split('@')[1] || ''}` : '—'
const maskPhone = (value?: string) => value ? `***${value.slice(-2)}` : '—'

type Props = { events: WorkerEvent[]; mailTemplates: EmailTemplate[]; waTemplates: WhatsAppTemplate[]; refreshTemplates: () => Promise<void> }

export function FreeSend({ events, mailTemplates, waTemplates, refreshTemplates }: Props) {
  const [kind, setKind] = useState<FreeSendSource['kind'] | 'file'>('event')
  const [eventId, setEventId] = useState(events[0]?.id ?? 0)
  const [filter, setFilter] = useState<'all' | 'accepted' | 'checkedIn' | 'notCheckedIn'>('all')
  const [allowTest, setAllowTest] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [file, setFile] = useState<FileInput | null>(null)
  const [held, setHeld] = useState<Set<string>>(new Set())
  const [itemStates, setItemStates] = useState<Record<string, 'sent' | 'failed'>>({})
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualTarget, setManualTarget] = useState('')
  const [manualGroup, setManualGroup] = useState<'ready' | 'held'>('ready')
  const [historyId, setHistoryId] = useState('')
  const fileBatch = useRef(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const fileRequest = useRef(0)
  const [channels, setChannels] = useState<FreeSendRequest['channels']>({ mail: true, whatsapp: false })
  const [label, setLabel] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [message, setMessage] = useState('')
  const [mailTemplateId, setMailTemplateId] = useState<number | ''>('')
  const [waTemplateId, setWaTemplateId] = useState<number | ''>('')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [history, setHistory] = useState<SendHistoryRun[]>([])
  const [status, setStatus] = useState<FreeSendStatus>({ running: false })
  const [confirm, setConfirm] = useState<FreeSendRequest | null>(null)
  const [retryRun, setRetryRun] = useState<SendHistoryRun | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!eventId && events[0]) setEventId(events[0].id) }, [eventId, events])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    return term ? recipients.filter((item) => [item.name, item.email, item.phone].some((value) => value?.toLocaleLowerCase('tr-TR').includes(term))) : recipients
  }, [recipients, search])
  // Gönderilecek = Gönderilecek listesinde ve işaretli olanlar; Bekletilen listesindekiler gönderilmez
  const selected = useMemo(() => recipients.filter((item) => selectedIds.includes(item.id) && !held.has(item.id)), [recipients, selectedIds, held])
  const counts = channelCounts(selected, channels)
  const variables = availableVariables(selected.length ? selected : recipients)
  const content = (item: Recipient) => previewFor(item, channels.mail ? subject : '', channels.mail ? html : '', channels.whatsapp ? message : '')
  const previewTarget = selected.length ? selected[Math.min(previewIndex, selected.length - 1)] : null
  const preview = previewTarget ? content(previewTarget) : null
  // ABT: eksik/bilinmeyen değişkeni olan kişiler isimleriyle listelenir ve gönderimi engeller
  const missing = useMemo(() => selected.map((item) => ({ item, warnings: content(item).warnings })).filter((row) => row.warnings.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, subject, html, message, channels])
  const unknown = missing.some((row) => row.warnings.some((warning) => warning.startsWith('Bilinmeyen değişken')))
  const testSelected = selected.some((item) => item.isTest)
  const mailChoices = mailTemplates.filter((item) => !item.purpose.endsWith('-received'))
  const chosenMail = mailChoices.find((item) => item.id === mailTemplateId)
  const chosenWa = waTemplates.find((item) => item.id === waTemplateId)
  const mailChanged = Boolean(chosenMail && (chosenMail.subject !== subject || chosenMail.html !== html))
  const waChanged = Boolean(chosenWa && chosenWa.message !== message)

  const refreshHistory = async () => setHistory((await api<{ docs: SendHistoryRun[] }>('/free-send/history')).docs)
  useEffect(() => {
    void refreshHistory().catch((err) => setError(messageOf(err)))
    void api<FreeSendStatus>('/free-send/status').then(setStatus).catch((err) => setError(messageOf(err)))
  }, [])
  useEffect(() => {
    if (!status.running) return
    const timer = window.setInterval(() => {
      void api<FreeSendStatus>('/free-send/status').then((next) => {
        const finishedRun = status.runId
        setStatus(next)
        if (!next.running) void api<{ docs: SendHistoryRun[] }>('/free-send/history').then(({ docs }) => {
          setHistory(docs)
          // Satır durumları (Gönderildi / Hata) biten gönderimin geçmiş kaydından
          const run = docs.find((item) => item.id === finishedRun)
          if (run) setItemStates((current) => ({ ...current, ...Object.fromEntries(run.recipients.map((item) => [item.id, item.status === 'failed' ? 'failed' as const : 'sent' as const])) }))
        }).catch((err) => setError(messageOf(err)))
      }).catch((err) => setError(messageOf(err)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [status.running, status.runId])
  const run = async (action: () => Promise<void>) => {
    setError(''); setNotice(''); setBusy(true)
    try { await action() } catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  const loadRecipients = () => void run(async () => {
    setConfirm(null)
    const query = new URLSearchParams({ kind, includeTest: allowTest ? '1' : '0' })
    if (kind === 'event') { query.set('eventId', String(eventId)); query.set('filter', filter) }
    const docs = (await api<{ docs: Recipient[] }>(`/free-send/recipients?${query}`)).docs
    addToList(docs, `${docs.length} kişi bulundu`)
  })
  // ABT gibi: yeni gelenler listeye eklenir ve seçilir; aynı kişi ikinci kez eklenmez
  const addToList = (incoming: Recipient[], what: string, group: 'ready' | 'held' = 'ready') => {
    const { list, added } = mergeRecipients(recipients, incoming)
    setRecipients(list); setSelectedIds((ids) => [...new Set([...ids, ...added.map((item) => item.id)])]); setConfirm(null)
    if (group === 'held') setHeld((current) => new Set([...current, ...added.map((item) => item.id)]))
    setNotice(`${what}; ${added.length} kişi listeye eklendi${incoming.length - added.length ? `, ${incoming.length - added.length} kişi zaten listedeydi` : ''}.`)
  }
  const clearList = () => { setRecipients([]); setSelectedIds([]); setHeld(new Set()); setItemStates({}); setConfirm(null); setFile(null); setSkippedCount(0); setNotice('') }
  const addManual = () => {
    const made = manualRecipient(manualName, manualTarget, `manual:${crypto.randomUUID()}`)
    if ('error' in made) { setError(made.error); return }
    setError(''); addToList([made], `${made.name} eklendi`, manualGroup); setManualName(''); setManualTarget(''); setManualOpen(false)
  }
  const loadHistory = (failedOnly: boolean) => {
    const run = history.find((item) => item.id === historyId)
    if (!run) return
    addToList(historyRecipients(run, failedOnly), `"${run.label}" listesinden ${failedOnly ? 'başarısızlar' : 'herkes'}`)
    if (!label) setLabel(run.label)
  }
  const moveTo = (id: string, group: 'ready' | 'held') => setHeld((current) => { const next = new Set(current); if (group === 'held') next.add(id); else next.delete(id); return next })
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]; event.target.value = ''
    if (!chosen) return
    const request = ++fileRequest.current
    setError(''); setNotice(''); setConfirm(null); setFile(null); setSkippedCount(0); setBusy(false)
    if (chosen.size > 1024 * 1024) { setError('Dosya 1 MB sınırını aşıyor.'); return }
    const format = chosen.name.toLowerCase().endsWith('.json') ? 'json' : chosen.name.toLowerCase().endsWith('.csv') ? 'csv' : null
    if (!format) { setError('Yalnız JSON veya CSV dosyası seçin.'); return }
    setBusy(true)
    try {
      const text = await chosen.text()
      const result = await api<{ docs: Recipient[]; skipped?: Array<{ row: number; reason: string }> }>('/free-send/parse-file', 'POST', { text, format })
      if (request !== fileRequest.current) return
      setFile({ text, format, name: chosen.name })
      // Birden çok dosya eklenebilsin diye satır kimlikleri dosya sırasıyla ayrılır
      const batch = ++fileBatch.current
      addToList(result.docs.map((item) => ({ ...item, id: `file:${batch}-${item.id.slice(5)}` })), `${chosen.name}: ${result.docs.length} geçerli satır`)
      setSkippedCount(result.skipped?.length ?? 0)
    } catch (err) { if (request === fileRequest.current) setError(messageOf(err)) }
    finally { if (request === fileRequest.current) setBusy(false) }
  }
  const pickMail = (id: number | '') => {
    setMailTemplateId(id)
    const template = mailChoices.find((item) => item.id === id)
    if (template) { setSubject(template.subject); setHtml(template.html); setChannels((old) => ({ ...old, mail: true })); if (!label) setLabel(template.name) }
  }
  const pickWa = (id: number | '') => {
    setWaTemplateId(id)
    const template = waTemplates.find((item) => item.id === id)
    if (template) { setMessage(template.message); setChannels((old) => ({ ...old, whatsapp: true })); if (!label) setLabel(template.name) }
  }
  const saveMailTemplate = (asNew: boolean) => void run(async () => {
    if (!subject.trim() || !html.trim()) throw new Error('Kaydetmek için konu ve içerik gerekli.')
    if (asNew || !chosenMail) {
      // Electron window.prompt desteklemez; şablon adı Etiket alanından alınır
      const name = label.trim()
      if (!name) throw new Error('Şablon adı için Etiket alanını doldurun.')
      const created = await api<EmailTemplate>('/templates', 'POST', { name, subject, html, purpose: 'general' })
      await refreshTemplates(); setMailTemplateId(created.id); setNotice(`"${name}" mail şablonu kaydedildi.`)
    } else {
      await api(`/templates/${chosenMail.id}`, 'PATCH', { subject, html })
      await refreshTemplates(); setNotice(`"${chosenMail.name}" güncellendi.`)
    }
  })
  const saveWaTemplate = (asNew: boolean) => void run(async () => {
    if (!message.trim()) throw new Error('Kaydetmek için WhatsApp metni gerekli.')
    if (asNew || !chosenWa) {
      // Electron window.prompt desteklemez; şablon adı Etiket alanından alınır
      const name = label.trim()
      if (!name) throw new Error('Şablon adı için Etiket alanını doldurun.')
      const created = await api<WhatsAppTemplate>('/wa-templates', 'POST', { name, message })
      await refreshTemplates(); setWaTemplateId(created.id); setNotice(`"${name}" WhatsApp şablonu kaydedildi.`)
    } else {
      await api(`/wa-templates/${chosenWa.id}`, 'PATCH', { message })
      await refreshTemplates(); setNotice(`"${chosenWa.name}" güncellendi.`)
    }
  })
  const prepare = (runToRetry?: SendHistoryRun) => {
    setError(''); setNotice('')
    const body = { subject, html, message }
    const prepared = runToRetry ? retryBody(runToRetry, label, channels, body) : buildSendBody({
      recipients, selectedIds: selected.map((item) => item.id), channels, label, allowTest, ...body, target: { list: true },
    })
    if ('error' in prepared) { setError(prepared.error); return }
    if (!runToRetry && unknown) { setError('Bilinmeyen değişkenleri düzeltin (aşağıdaki listeye bakın).'); return }
    if (!runToRetry && testSelected && !allowTest) { setError('Test kayıtlarına göndermek için açık izin verin.'); return }
    setRetryRun(runToRetry || null); setConfirm({ ...prepared, allowTest })
  }
  const sendConfirmed = async () => {
    if (!confirm) return
    setBusy(true); setError('')
    try {
      const result = await api<{ runId: string; total: number }>('/free-send/send', 'POST', confirm)
      setConfirm(null); setRetryRun(null); setNotice(`${result.total} alıcılık gönderim başlatıldı.`)
      setStatus({ running: true, runId: result.runId, total: result.total, done: 0 })
    } catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }

  return <section className="screen mail-studio">
    <div className="heading"><div><h1>Mail Stüdyosu</h1><p>Kaynaktan, dosyadan, önceki listelerden ya da elle kişi ekleyin; şablondan başlayın ya da özel içerik yazın; her kişi için önizleyip gönderin.</p></div></div>
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}

    <div className="delivery-template-bar delivery-template-bar--source">
      <label>Kaynak<select value={kind} onChange={(e) => { fileRequest.current++; setKind(e.target.value as typeof kind); setConfirm(null); setBusy(false) }}><option value="event">Etkinlik</option><option value="members">Üyeler</option><option value="core-team">Core Team</option><option value="file">Dosya (JSON/CSV)</option></select></label>
      {kind === 'event' && <><label>Etkinlik<select value={eventId} onChange={(e) => setEventId(Number(e.target.value))}>{events.map((item) => <option key={item.id} value={item.id}>{item.title}{item.mode === 'test' ? ' · Test' : ''}</option>)}</select></label>
        <label>Süzgeç<select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Tümü</option><option value="accepted">Kabul</option><option value="checkedIn">Gelenler (kapıdan giriş)</option><option value="notCheckedIn">Gelmeyenler (kabul, giriş yok)</option></select></label></>}
      {kind === 'file' ? <label>Dosya<input type="file" accept=".json,.csv" onChange={(e) => void readFile(e)} /></label>
        : <button className="primary" disabled={busy || (kind === 'event' && !eventId)} onClick={loadRecipients}>Listeye ekle</button>}
      <label className="inline"><input type="checkbox" checked={allowTest} onChange={(e) => setAllowTest(e.target.checked)} /> Test kayıtları</label>
      {kind === 'file' && <p className="help">{file ? `${file.name}: ${skippedCount} atlanan satır. Başka dosya da ekleyebilirsiniz.` : busy ? 'Dosya ayrıştırılıyor…' : 'JSON veya CSV seçin (en fazla 1 MB); kişiler listeye eklenir.'}</p>}
    </div>

    <div className="delivery-template-bar delivery-template-bar--source">
      <label>Önceki liste<select value={historyId} onChange={(e) => setHistoryId(e.target.value)}><option value="">Liste seçin…</option>
        {history.map((run) => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString('tr-TR')} · {run.label} · {run.recipients.length} kişi{failedCount(run) ? ` (${failedCount(run)} başarısız)` : ''}</option>)}</select></label>
      <button disabled={!historyId} onClick={() => loadHistory(false)}>Aynen getir</button>
      <button disabled={!historyId || !failedCount(history.find((run) => run.id === historyId) ?? { id: '', createdAt: '', label: '', recipients: [] })} onClick={() => loadHistory(true)}>Yalnız başarısızları getir</button>
    </div>

    <div className="delivery-template-bar">
      <div className="channel-toggles"><span>Kanal</span>
        <label className="inline"><input type="checkbox" checked={Boolean(channels.mail)} onChange={(e) => setChannels((old) => ({ ...old, mail: e.target.checked }))} /> Mail</label>
        <label className="inline"><input type="checkbox" checked={Boolean(channels.whatsapp)} onChange={(e) => setChannels((old) => ({ ...old, whatsapp: e.target.checked }))} /> WhatsApp</label></div>
      <label>Etiket (geçmişte ve yeni şablon adında görünür)<input maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Örn. Meet Night hatırlatma" /></label>
      {channels.mail && <label>Mail şablonu<select value={mailTemplateId} onChange={(e) => pickMail(e.target.value ? Number(e.target.value) : '')}><option value="">Özel içerik (şablonsuz)</option>{mailChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {channels.whatsapp && <label>WhatsApp şablonu<select value={waTemplateId} onChange={(e) => pickWa(e.target.value ? Number(e.target.value) : '')}><option value="">Özel metin (şablonsuz)</option>{waTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </div>

    <div className="mail-studio-layout">
      <section className="card mail-studio-recipients">
        <div className="panel-heading"><div><h2>Alıcılar</h2><p>{selected.length} / {recipients.length - held.size} gönderilecek · Bekletilen {recipients.filter((item) => held.has(item.id)).length}</p></div>
          <div className="actions"><button onClick={() => setManualOpen((open) => !open)}><Plus aria-hidden="true" size={15} /> Elle kişi ekle</button>
            <button disabled={!recipients.length || status.running} onClick={clearList}>Listeyi temizle</button></div></div>
        {manualOpen && <form className="send-list__manual" onSubmit={(e) => { e.preventDefault(); addManual() }}>
          <label>Ad soyad<input required maxLength={120} value={manualName} onChange={(e) => setManualName(e.target.value)} /></label>
          <label>Telefon veya e-posta<input required value={manualTarget} onChange={(e) => setManualTarget(e.target.value)} placeholder="0532 000 00 00 ya da ad@ornek.com" /></label>
          <label>Liste<select value={manualGroup} onChange={(e) => setManualGroup(e.target.value as 'ready' | 'held')}><option value="ready">Gönderilecek</option><option value="held">Bekletilen</option></select></label>
          <button className="primary" type="submit">Listeye ekle</button>
        </form>}
        <input placeholder="Ad, e-posta veya telefon ara" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!recipients.length && <p className="help">Kaynaktan, dosyadan, önceki listeden ya da elle kişi ekleyin.</p>}
        {recipients.length > 0 && (['ready', 'held'] as const).map((group) => {
          const rows = visible.filter((item) => (group === 'held') === held.has(item.id))
          const ids = rows.map((item) => item.id)
          return <section key={group} className={`send-group${draggedId ? ' send-group--droppable' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggedId) moveTo(draggedId, group); setDraggedId(null) }}>
            <header className="send-group__header"><div><h3>{group === 'ready' ? 'Gönderilecek' : 'Bekletilen'}</h3><small>{rows.length} kişi</small></div>
              {group === 'ready' && <div><button disabled={!ids.length} onClick={() => setSelectedIds((current) => [...new Set([...current, ...ids])])}>Görünenleri seç</button>
                <button disabled={!ids.length} onClick={() => setSelectedIds((current) => [...current.filter((id) => !ids.includes(id)), ...ids.filter((id) => !current.includes(id))])}>Ters seçim</button></div>}</header>
            {rows.length ? <div className={`send-group__rows${rows.length > 5 ? ' send-group__rows--zebra' : ''}`}>{rows.map((item) => {
              const index = selected.findIndex((row) => row.id === item.id)
              const state = itemStates[item.id]
              return <label key={item.id} className="send-row send-row--compact" draggable={!status.running} onDragEnd={() => setDraggedId(null)}
                onDragStart={(e) => { setDraggedId(item.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id) }} onMouseEnter={() => index >= 0 && setPreviewIndex(index)}>
                <GripVertical aria-hidden="true" className="send-row__grip" size={15} />
                <input type="checkbox" disabled={group === 'held'} checked={group === 'ready' && selectedIds.includes(item.id)} onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`${item.name} seç`} />
                <span className="send-row__identity"><span>{item.name}{item.isTest && <small className="tag">TEST</small>}</span><small>{maskEmail(item.email)} · {maskPhone(item.phone)}</small></span>
                {state === 'sent' ? <span className="send-state send-state--success"><Check aria-hidden="true" size={13} /> Gönderildi</span>
                  : state === 'failed' ? <span className="send-state send-state--error"><X aria-hidden="true" size={13} /> Hata</span>
                  : <span className="send-state send-state--waiting">○ Bekliyor</span>}
              </label>
            })}</div> : <div className="send-group__empty">{group === 'ready' ? 'Gönderilecek kişi yok.' : 'Bekletmek istediğiniz kişileri buraya sürükleyin.'}</div>}
          </section>
        })}
      </section>
      <section className="card mail-studio-editor">
        {channels.mail && <>
          <label>Mail konusu<input maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <EmailHtmlEditor html={html} onChange={setHtml} variables={variables} />
          <div className="mail-saved-bar"><span>{chosenMail ? `Şablon: ${chosenMail.name}${mailChanged ? ' · değiştirildi' : ''}` : 'Özel içerik'}</span>
            {chosenMail && mailChanged && <button disabled={busy} onClick={() => saveMailTemplate(false)}>Şablonu güncelle</button>}
            <button disabled={busy || !subject.trim() || !html.trim()} onClick={() => saveMailTemplate(true)}>Yeni şablon olarak kaydet</button></div>
        </>}
        {channels.whatsapp && <>
          <label>WhatsApp metni<textarea maxLength={4000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <div className="mail-saved-bar"><span>{chosenWa ? `Şablon: ${chosenWa.name}${waChanged ? ' · değiştirildi' : ''}` : 'Özel metin'}</span>
            {chosenWa && waChanged && <button disabled={busy} onClick={() => saveWaTemplate(false)}>Şablonu güncelle</button>}
            <button disabled={busy || !message.trim()} onClick={() => saveWaTemplate(true)}>Yeni şablon olarak kaydet</button></div>
        </>}
        {!channels.mail && !channels.whatsapp && <p className="help">Yukarıdan en az bir kanal seçin.</p>}
        <p className="help">Değişkenler: {variables.map((key) => `{{${key}}}`).join(' · ')}</p>
      </section>
    </div>

    <section className="card mail-studio-preview">
      <div className="panel-heading"><div><h2>Önizleme</h2><p>{previewTarget ? 'Fareyi alıcı listesinde gezdirerek de önizleyebilirsiniz.' : 'Önizleme için alıcı seçin.'}</p></div>
        {selected.length > 0 && <div className="certificate-preview-nav">
          <button aria-label="Önceki alıcı" disabled={selected.length < 2} onClick={() => setPreviewIndex((i) => (i - 1 + selected.length) % selected.length)}>‹</button>
          <div><strong>{previewTarget?.name}</strong><small>{Math.min(previewIndex, selected.length - 1) + 1} / {selected.length}</small></div>
          <button aria-label="Sonraki alıcı" disabled={selected.length < 2} onClick={() => setPreviewIndex((i) => (i + 1) % selected.length)}>›</button></div>}
      </div>
      {preview && <div className="mail-studio-preview__grid">
        {channels.mail && <div className="mail-preview-card"><div className="mail-preview-card__header"><span>Kime: {maskEmail(previewTarget?.email)}</span><strong>{preview.subject || '(konu yok)'}</strong></div><iframe title="Mail önizleme" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} /></div>}
        {channels.whatsapp && <div className="wa-preview"><header><strong>{previewTarget?.name}</strong><small>{maskPhone(previewTarget?.phone)}</small></header><div className="wa-bubble">{preview.message || '(metin yok)'}</div></div>}
      </div>}
      {missing.length > 0 && <div className="send-failures"><strong>Değişkeni eksik/hatalı kişiler ({missing.length})</strong>
        <ul>{missing.slice(0, 20).map(({ item, warnings }) => <li key={item.id}>{item.name}: {warnings.join(' · ')}</li>)}</ul>{missing.length > 20 && <small>…ve {missing.length - 20} kişi daha</small>}</div>}
      {testSelected && !allowTest && <p className="warning">Test kaydı seçili. Gönderim için test iznini açın.</p>}
      <div className="actions"><span>{counts.total} kişi · mail {counts.mail} · WhatsApp {counts.whatsapp}</span>
        <button className="primary" disabled={busy || unknown || status.running || !selected.length} onClick={() => prepare()}>Gönderimi gözden geçir</button></div>
      {confirm && <div className="inline-confirm">
        <p><strong>{confirm.confirmCount} kişiye</strong> gönderilecek (mail: {retryRun ? retryRun.recipients.filter((item) => item.status === 'failed' && channels.mail && item.email && item.mail !== 'sent').length : counts.mail}, WhatsApp: {retryRun ? retryRun.recipients.filter((item) => item.status === 'failed' && channels.whatsapp && item.phone && item.whatsapp !== 'queued').length : counts.whatsapp}). Etiket: {confirm.label}. WhatsApp bağlıysa mesajlar otomatik gider. Emin misiniz?</p>
        <div className="actions"><button onClick={() => { setConfirm(null); setRetryRun(null) }}>Vazgeç</button><button className="primary" disabled={busy} onClick={() => void sendConfirmed()}>Evet, gönder</button></div>
      </div>}
      {status.running && <div role="status"><p>Gönderiliyor: {status.done ?? 0}/{status.total ?? 0}</p><progress value={status.done ?? 0} max={status.total || 1} /></div>}
    </section>

    <details className="card"><summary><strong>Geçmiş gönderimler ({history.length})</strong></summary>
      <div className="actions"><button onClick={() => void refreshHistory().catch((err) => setError(messageOf(err)))}>Yenile</button></div>
      {history.map((item) => <div className="free-history" key={item.id}><strong>{item.label}</strong> · {new Date(item.createdAt).toLocaleString('tr-TR')} · Gönderilen: {item.recipients.length - failedCount(item)} · Başarısız: {failedCount(item)}
        <details><summary>Alıcılar</summary>{item.recipients.map((row, index) => <p key={index}>{row.name} · {maskEmail(row.email)} · {maskPhone(row.phone)} · {row.status === 'failed' ? 'Başarısız' : 'Gönderildi'}</p>)}</details>
        {failedCount(item) > 0 && <button disabled={busy || status.running} onClick={() => prepare(item)}>Yalnız başarısızları yeniden gönder</button>}</div>)}
    </details>
  </section>
}
