import { ChevronLeft, ChevronRight, Save, Search, Send, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { FreeSendRequest, FreeSendStatus, Recipient, Registration, SendHistoryRun, WhatsAppTemplate, WorkerEvent } from '../../shared/types.js'
import { fillValues, templateKeys } from '../../shared/templateVars.js'
import { api } from '../api'
import { plainRecipient } from '../ui/freeSendModel'
import { jsonRowsFrom, messageRecipients, recipientPhone, type JsonRow } from '../ui/messagesModel'

// ABT "WhatsApp mesajı" ekranı: etkinlik katılımcıları (Tümü / Kabul / Gelen / Gelmeyen), JSON ile ek değişken ya da
// harici alıcı, imlece değişken ekleme, kayıtlı şablon (kaydet / güncelle / sil), rastgele 5 ya da tüm önizleme.
// Gönderim Mail Stüdyosu ile aynı sunucu yolundan (karışık liste) WhatsApp kuyruğuna gider.
type Filter = 'all' | 'accepted' | 'arrived' | 'waiting'
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'İşlem başarısız.'
const filterTitles: Record<Filter, string> = { all: 'Tümü', accepted: 'Kabul edilenler', arrived: 'Gelen', waiting: 'Gelmeyen' }
const arrived = (registration?: Registration) => Boolean(registration?.attended || registration?.checkedInAt)
const matches = (filter: Filter, registration?: Registration) => filter === 'all' ? true
  : filter === 'accepted' ? registration?.status === 'accepted'
  : filter === 'arrived' ? arrived(registration)
  // Gelmeyen: kabul edilip kapıdan girmeyenler; reddedilenler dahil değil
  : registration?.status === 'accepted' && !arrived(registration)
const pickSample = (ids: string[]) => {
  const copy = [...ids]
  for (let index = copy.length - 1; index > 0; index--) { const target = Math.floor(Math.random() * (index + 1)); [copy[index], copy[target]] = [copy[target], copy[index]] }
  return copy.slice(0, 5)
}

type Props = { event?: WorkerEvent; waTemplates: WhatsAppTemplate[]; refreshTemplates: () => Promise<void>; whatsAppConnected: boolean }

export function Messages({ event, waTemplates, refreshTemplates, whatsAppConnected }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [jsonRows, setJsonRows] = useState<JsonRow[]>([])
  const [jsonText, setJsonText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [includeTest, setIncludeTest] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('Merhaba {{ad}},\n\n{{etkinlik}} etkinliğiyle ilgili sizinle iletişime geçiyoruz.')
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [templateName, setTemplateName] = useState('')
  const [deleteAsk, setDeleteAsk] = useState(false)
  const [previewMode, setPreviewMode] = useState<'sample' | 'all'>('sample')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [status, setStatus] = useState<FreeSendStatus>({ running: false })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!event) { setRegistrations([]); return }
    let active = true
    setLoading(true); setSelected(new Set()); setConfirm(false)
    void api<Registration[]>(`/registrations?eventId=${event.id}`).then((docs) => { if (active) setRegistrations(docs) })
      .catch((err) => { if (active) setError(messageOf(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [event])
  useEffect(() => {
    if (!status.running) return
    const timer = window.setInterval(() => {
      const runId = status.runId
      void api<FreeSendStatus>('/free-send/status').then((next) => {
        setStatus(next)
        if (!next.running) void api<{ docs: SendHistoryRun[] }>('/free-send/history').then(({ docs }) => {
          const run = docs.find((item) => item.id === runId)
          const failed = run?.recipients.filter((item) => item.status === 'failed') ?? []
          setNotice(`${(run?.recipients.length ?? 0) - failed.length} mesaj kuyruğa alındı${whatsAppConnected ? '; birkaç saniye arayla tek tek gidecek' : '. WhatsApp bağlı değil; bağlandığınızda WhatsApp ekranındaki kuyruktan gönderin'}.`)
          if (failed.length) setError(`${failed.length} alıcı eklenemedi: ${failed.slice(0, 3).map((item) => `${item.name}: ${item.error ?? 'hata'}`).join(' · ')}`)
        }).catch((err) => setError(messageOf(err)))
      }).catch((err) => setError(messageOf(err)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [status.running, status.runId, whatsAppConnected])

  const recipients = useMemo(() => event ? messageRecipients(event, registrations, jsonRows, includeTest) : [], [event, registrations, jsonRows, includeTest])
  const byId = useMemo(() => new Map(recipients.map((item) => [item.recipient.id, item])), [recipients])
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR')
    return recipients.filter(({ recipient, registration }) => matches(filter, registration) &&
      (!needle || `${recipient.name} ${recipient.phone ?? ''} ${recipient.id}`.toLocaleLowerCase('tr-TR').includes(needle)))
  }, [recipients, filter, search])
  const chosen = useMemo(() => recipients.filter(({ recipient }) => selected.has(recipient.id)), [recipients, selected])
  const allVisibleSelected = visible.length > 0 && visible.every(({ recipient }) => selected.has(recipient.id))
  const customVariables = useMemo(() => [...new Set(recipients.flatMap(({ recipient }) => Object.keys(recipient.variables)))]
    .filter((key) => !(templateKeys as readonly string[]).includes(key)).sort((a, b) => a.localeCompare(b, 'tr')), [recipients])
  const rendered = (recipient: Recipient) => fillValues(message, Object.fromEntries(Object.entries(recipient.variables).map(([key, value]) => [key, String(value)])))
  const problems = useMemo(() => chosen.map(({ recipient }) => ({ recipient, issues: [...(recipientPhone(recipient.phone) ? [] : ['telefon geçersiz']), ...rendered(recipient).warnings] }))
    .filter((row) => row.issues.length), [chosen, message]) // eslint-disable-line react-hooks/exhaustive-deps
  const sampleIds = useMemo(() => pickSample(chosen.map(({ recipient }) => recipient.id)), [chosen])
  const previewList = previewMode === 'all' ? chosen.map(({ recipient }) => recipient) : sampleIds.flatMap((id) => byId.get(id)?.recipient ?? [])
  const safeIndex = previewList.length ? previewIndex % previewList.length : 0
  const previewTarget = previewList[safeIndex]
  const previewText = previewTarget ? rendered(previewTarget) : null
  const counts = (key: Filter) => recipients.filter(({ registration }) => matches(key, registration)).length

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  const openTemplate = (id: number | '') => {
    setTemplateId(id); setDeleteAsk(false)
    const template = waTemplates.find((item) => item.id === id)
    if (!template) { setTemplateName(''); return }
    setTemplateName(template.name); setMessage(template.message)
  }
  const saveTemplate = () => void run(async () => {
    if (templateId) { await api(`/wa-templates/${templateId}`, 'PATCH', { name: templateName.trim(), message }); setNotice('WhatsApp şablonu güncellendi.') }
    else { const created = await api<WhatsAppTemplate>('/wa-templates', 'POST', { name: templateName.trim(), message }); setTemplateId(created.id); setNotice('WhatsApp şablonu CMS’e kaydedildi.') }
    await refreshTemplates()
  })
  const deleteTemplate = () => void run(async () => {
    if (!templateId) return
    await api(`/wa-templates/${templateId}`, 'DELETE'); setTemplateId(''); setTemplateName(''); setDeleteAsk(false)
    await refreshTemplates(); setNotice('WhatsApp şablonu silindi.')
  })
  const insertVariable = (key: string) => {
    const area = textareaRef.current, token = `{{${key}}}`
    const start = area?.selectionStart ?? message.length, end = area?.selectionEnd ?? message.length
    setMessage(message.slice(0, start) + token + message.slice(end))
    window.requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + token.length, start + token.length) })
  }
  const applyJson = () => {
    setError('')
    try {
      const rows = jsonRowsFrom(jsonText)
      setJsonRows(rows); setNotice(`${rows.length} JSON kaydı yüklendi; alanları değişken menüsüne eklendi.`)
    } catch (err) { setError(messageOf(err)) }
  }
  const loadFile = async (change: ChangeEvent<HTMLInputElement>) => {
    const file = change.target.files?.[0]; change.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) { setError('JSON dosyası en fazla 1 MB olabilir.'); return }
    setJsonText(await file.text())
  }
  const send = async () => {
    if (!event || !chosen.length || problems.length || !message.trim()) return
    const body: FreeSendRequest = { confirmed: true, confirmCount: chosen.length, allowTest: chosen.some(({ recipient }) => recipient.isTest),
      label: `WhatsApp mesajı · ${event.title}`.slice(0, 120), channels: { whatsapp: true }, whatsapp: { message },
      target: { list: chosen.map(({ recipient }) => plainRecipient(recipient)) } }
    await run(async () => {
      const result = await api<{ runId: string; total: number }>('/free-send/send', 'POST', body)
      setConfirm(false); setStatus({ running: true, runId: result.runId, total: result.total, done: 0 })
    })
  }

  if (!event) return <section className="screen"><div className="empty-state">Üstten bir etkinlik seçin.</div></section>
  return <section className="screen messages-screen">
    <div className="heading"><div><small className="eyebrow">{event.title}</small><h1>WhatsApp mesajı</h1>
      <p>Katılımcıları durumlarına göre seçin; JSON alanlarını değişken yapıp her mesajı göndermeden önce görün.</p></div></div>
    {!whatsAppConnected && <div className="notice">WhatsApp bağlı değil. Hazırladığınız mesajlar kaybolmaz; kuyrukta bekler, bağlandığınızda WhatsApp ekranından gönderebilirsiniz.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}

    <section className="delivery-template-bar delivery-template-bar--source" aria-label="WhatsApp şablonları">
      <label>Kayıtlı şablonlar<select value={templateId} onChange={(e) => openTemplate(e.target.value ? Number(e.target.value) : '')}><option value="">Yeni şablon</option>{waTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Şablon adı<input maxLength={120} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Örn. Etkinlik hatırlatma" /></label>
      <button disabled={busy || !templateName.trim() || !message.trim()} onClick={saveTemplate}><Save aria-hidden="true" size={15} />{templateId ? 'Güncelle' : 'Kaydet'}</button>
      {deleteAsk ? <span className="actions"><button onClick={() => setDeleteAsk(false)}>Vazgeç</button><button className="danger" disabled={busy} onClick={deleteTemplate}>Evet, sil</button></span>
        : <button disabled={!templateId || busy} onClick={() => setDeleteAsk(true)}><Trash2 aria-hidden="true" size={15} />Sil</button>}
    </section>

    <section className="card json-import">
      <div className="panel-heading"><div><h2>JSON veri ekle</h2><p>Her kayıtta id olmalı. id bir katılımcıyla eşleşirse alanları onun değişkeni olur; eşleşmeyen ve telefonu olan kayıt harici alıcı olarak eklenir.</p></div>
        <label className="file-button"><Upload aria-hidden="true" size={15} /> Dosya seç<input hidden type="file" accept="application/json,.json" onChange={(e) => void loadFile(e)} /></label></div>
      <textarea className="mono" rows={4} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder={'[{"id": 42, "masa": "A7", "ozelNot": "Konuşmacı"}]'} />
      <div className="actions"><button disabled={!jsonText.trim()} onClick={applyJson}>JSON’u uygula</button>
        {jsonRows.length > 0 && <button onClick={() => { setJsonRows([]); setJsonText('') }}>JSON verisini kaldır</button>}</div>
    </section>

    <div className="message-workspace">
      <section className="card recipient-panel">
        <div className="panel-heading"><div><h2>Alıcılar</h2><p>{selected.size} / {recipients.length} seçili</p></div>
          <button disabled={!visible.length} onClick={() => setSelected((current) => { const next = new Set(current); visible.forEach(({ recipient }) => allVisibleSelected ? next.delete(recipient.id) : next.add(recipient.id)); return next })}>
            {allVisibleSelected ? 'Görünen seçimi kaldır' : 'Görünenleri seç'}</button></div>
        <label className="search-input"><Search aria-hidden="true" size={15} /><input aria-label="Alıcı ara" placeholder="Ad, telefon veya id ara" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div className="segmented segmented--wrap" role="group" aria-label="Katılım filtresi">
          {(Object.keys(filterTitles) as Filter[]).map((key) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{filterTitles[key]} ({counts(key)})</button>)}
        </div>
        <label className="inline"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Test kayıtlarını göster</label>
        {loading ? <p className="help">Katılımcılar alınıyor…</p> : !visible.length ? <div className="empty-state">Bu filtreyle eşleşen alıcı yok. Filtreyi veya arama metnini değiştirin.</div> :
          <div className={`recipient-list${visible.length > 5 ? ' recipient-list--zebra' : ''}`}>
            {visible.map(({ recipient, registration }) => <label key={recipient.id} className="message-row">
              <input type="checkbox" checked={selected.has(recipient.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(recipient.id)) next.delete(recipient.id); else next.add(recipient.id); return next })} />
              <span className="message-row__identity"><span>{recipient.name}{recipient.isTest && <small className="tag">TEST</small>}</span><small>ID {recipient.id.split(':').pop()} · {registration?.email || 'JSON alıcısı'}</small></span>
              <span className="message-row__status"><span className={`status ${registration ? (arrived(registration) ? 'accepted' : 'pending') : 'waitlist'}`}>{registration ? (arrived(registration) ? 'Geldi' : 'Gelmedi') : 'Harici'}</span><small className="mono">{recipient.phone || 'telefon yok'}</small></span>
            </label>)}
          </div>}
      </section>

      <section className="card message-editor">
        <div className="panel-heading"><div><h2>Mesaj</h2><p>Değişkeni seçtiğiniz imleç konumuna ekleyin.</p></div></div>
        <div className="variable-insert">
          {templateKeys.map((key) => <button key={key} type="button" onClick={() => insertVariable(key)}>{`{{${key}}}`}</button>)}
          {customVariables.map((key) => <button key={key} type="button" className="variable-insert__custom" onClick={() => insertVariable(key)}>{`{{${key}}}`}</button>)}
        </div>
        <label>Mesaj metni<textarea ref={textareaRef} rows={12} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        {problems.length > 0 && <div className="send-failures"><strong>Değişkeni eksik veya telefonu geçersiz {problems.length} alıcı</strong>
          <ul>{problems.slice(0, 8).map(({ recipient, issues }) => <li key={recipient.id}>{recipient.name}: {issues.join(' · ')}</li>)}</ul>{problems.length > 8 && <small>…ve {problems.length - 8} kişi daha</small>}</div>}
        {confirm ? <div className="inline-confirm"><p><strong>{chosen.length} kişiye</strong> WhatsApp mesajı gönderilecek. {whatsAppConnected ? 'Mesajlar birkaç saniye arayla tek tek gider.' : 'WhatsApp bağlı değil; mesajlar kuyrukta bekler.'} Devam edilsin mi?</p>
          <div className="actions"><button onClick={() => setConfirm(false)}>Vazgeç</button><button className="primary" disabled={busy || status.running} onClick={() => void send()}>Evet, gönder</button></div></div>
          : <button className="primary send-button" disabled={busy || status.running || !chosen.length || !message.trim() || problems.length > 0} onClick={() => setConfirm(true)}>
            <Send aria-hidden="true" size={15} />{status.running ? `Kuyruğa alınıyor… ${status.done ?? 0}/${status.total ?? 0}` : `${chosen.length} kişiye gönder`}</button>}
        {status.running && <progress value={status.done ?? 0} max={status.total || 1} />}
      </section>

      <section className="card message-preview">
        <div className="panel-heading"><div><h2>Önizleme</h2><p>{previewMode === 'sample' ? 'Seçililerden rastgele 5 kişi' : 'Tüm seçili kişiler'}</p></div>
          <div className="segmented" role="group" aria-label="Önizleme türü">
            <button className={previewMode === 'sample' ? 'active' : ''} onClick={() => { setPreviewMode('sample'); setPreviewIndex(0) }}>Rastgele 5</button>
            <button className={previewMode === 'all' ? 'active' : ''} onClick={() => { setPreviewMode('all'); setPreviewIndex(0) }}>Tümü</button></div></div>
        {previewTarget && previewText ? <>
          <div className="send-preview__nav"><button aria-label="Önceki" disabled={previewList.length < 2} onClick={() => setPreviewIndex((safeIndex - 1 + previewList.length) % previewList.length)}><ChevronLeft size={16} /></button>
            <small>{safeIndex + 1} / {previewList.length}</small>
            <button aria-label="Sonraki" disabled={previewList.length < 2} onClick={() => setPreviewIndex((safeIndex + 1) % previewList.length)}><ChevronRight size={16} /></button></div>
          <div className="wa-preview"><header><strong>{previewTarget.name}</strong><small>{previewTarget.phone || 'telefon yok'}</small></header><div className="wa-bubble">{previewText.text}</div></div>
          {previewText.warnings.map((warning) => <p key={warning} className="warning">⚠ {warning}</p>)}
        </> : <div className="empty-state">Önizleme için alıcı seçin.</div>}
      </section>
    </div>
  </section>
}
