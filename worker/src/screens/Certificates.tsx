import { AlertTriangle, Award, Check, ChevronLeft, ChevronRight, Download, FileDown, GripVertical, ImagePlus, Search, Send, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SAMPLE_AWARD, SAMPLE_CERTIFICATE_CODE, certificateLink, certificateFontStack, certificateFonts, certificateTypes, defaultLayout, fitTextToBox, googleFontsHref, isSafeFontName, normalizeLayout,
  type CertificateBox, type CertificateLayout, type CertificateType } from '../../shared/certificateLayout.js'
import type { EmailTemplate, WhatsAppTemplate, WorkerEvent } from '../../shared/types.js'
import { fillValues } from '../../shared/templateVars.js'
import { api, apiBlob } from '../api'
import { KULUP } from '../../shared/kulup'
import { CERTIFICATE_VARIABLES, canSelectRecipient, invertIds, moveCertificateBox, resizeCertificateBox, selectIds, toggleId, unknownCertificateVariables,
  type CertificateRecipient, type CertificateTemplate } from '../ui/certificateStudioModel'

// ABT Sertifika Stüdyosu ile aynı akış: tür sekmeleri, tuvalde sürükle/boyutlandır (yazı da ölçeklenir), otomatik kayıt,
// Google Fonts'tan yazı tipi, gerçek katılımcılarla önizleme; "Otomasyon" penceresinde kişi başına tür seçimi,
// Gönderilecek/Gönderilmeyecek listeleri (sürükle-bırak), kişi kişi gönderim ve ilerleme. kulübe özgü olanlar korunur:
// etkinlik seçici, hizalama, X/Y/genişlik/yükseklik, sunucu (Puppeteer) PNG/PDF test çıktısı, test kayıtları, sonuç tablosu.
const titles: Record<CertificateType, string> = { participation: 'Katılım', achievement: 'Başarı', appreciation: 'Teşekkür' }
const fieldTitles = { name: 'İsim', id: 'Kimlik', award: 'Ödül satırı' } as const
type Field = keyof typeof fieldTitles
type Choice = CertificateType | 'skip'
type ItemState = 'sent' | 'failed'
type Progress = { completed: number; failed: number; total: number }
type SendResult = { id: number; mail: string; whatsapp: string; code?: string; error?: string }
type Drag = { mode: 'move' | 'resize'; field: Field; x: number; y: number; layout: CertificateLayout }
type Pending = { type: CertificateType; layout: CertificateLayout; imageBase64: string | null }
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'İşlem başarısız.'
const deliveryLabel = (status: string) => ({ sent: 'Gönderildi', queued: 'Kuyruğa alındı', failed: 'Başarısız', skipped: 'Atlandı' })[status as 'sent' | 'queued' | 'failed' | 'skipped'] || status
const maxImageBytes = 5 * 1024 * 1024
const sampleName = 'Ad Soyad Önizlemesi'
const sampleLink = certificateLink(KULUP.adresler.site, SAMPLE_CERTIFICATE_CODE)
const weights: Record<number, string> = { 300: 'İnce', 400: 'Normal', 500: 'Orta', 600: 'Yarı kalın', 700: 'Kalın', 800: 'Çok kalın', 900: 'Siyah' }
const isCertificateTemplate = (name: string) => name.toLocaleLowerCase('tr-TR').includes('sertifika')

export function Certificates() {
  const [events, setEvents] = useState<WorkerEvent[]>([])
  const [eventId, setEventId] = useState<number | null>(null)
  const [type, setType] = useState<CertificateType>('participation')
  const [templates, setTemplates] = useState<CertificateTemplate[]>([])
  const [templatesReady, setTemplatesReady] = useState(false)
  const [layout, setLayout] = useState<CertificateLayout>(defaultLayout)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [activeField, setActiveField] = useState<Field>('name')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalWidth, setNaturalWidth] = useState(0)
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [rows, setRows] = useState<CertificateRecipient[]>([])
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [states, setStates] = useState<Record<number, ItemState>>({})
  const [search, setSearch] = useState('')
  const [includeTest, setIncludeTest] = useState(false)
  const [mails, setMails] = useState<EmailTemplate[]>([])
  const [messages, setMessages] = useState<WhatsAppTemplate[]>([])
  const [mailId, setMailId] = useState<number | ''>('')
  const [messageId, setMessageId] = useState<number | ''>('')
  const [sendOpen, setSendOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [sendPreviewIndex, setSendPreviewIndex] = useState(0)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [results, setResults] = useState<SendResult[]>([])
  const [customFont, setCustomFont] = useState('')
  const [fittedSizes, setFittedSizes] = useState<Partial<Record<Field, number>>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropping, setDropping] = useState(false)
  const requestId = useRef(0)
  const imageRequest = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const drag = useRef<Drag | null>(null)
  const templatesRef = useRef<CertificateTemplate[]>([])
  const pending = useRef<Pending | null>(null)
  const version = useRef(0)

  const loadTemplates = useCallback(async () => {
    const docs = (await api<{ docs: CertificateTemplate[] }>('/certificates/templates')).docs
    templatesRef.current = docs; setTemplates(docs); setTemplatesReady(true)
  }, [])
  const loadRows = useCallback(async (id: number, tests: boolean) => {
    const request = ++requestId.current
    setLoading(true)
    try {
      const data = await api<{ docs: CertificateRecipient[] }>(`/certificates/recipients?eventId=${id}&includeTest=${tests ? '1' : '0'}`)
      if (request !== requestId.current) return
      setRows(data.docs); setSelected(new Set()); setPreviewIndex(0); setSendPreviewIndex(0); setProgress(null); setResults([])
      setChoices(Object.fromEntries(data.docs.map(row => [row.id, row.certificateType])))
      setStates(Object.fromEntries(data.docs.filter(row => row.sentAt).map(row => [row.id, 'sent' as const])))
    } catch (err) { if (request === requestId.current) setError(messageOf(err)) }
    finally { if (request === requestId.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void Promise.all([api<WorkerEvent[]>('/events'), loadTemplates(), api<EmailTemplate[]>('/templates'), api<WhatsAppTemplate[]>('/wa-templates')])
      .then(([eventList, , mailList, waList]) => {
        setEvents(eventList); setEventId(eventList[0]?.id ?? null); setMails(mailList); setMessages(waList)
        // ABT gibi: adında "sertifika" geçen şablonlar önceden seçilir
        setMailId(mailList.find(item => !item.purpose.endsWith('-received') && isCertificateTemplate(item.name))?.id ?? '')
        setMessageId(waList.find(item => isCertificateTemplate(item.name))?.id ?? '')
      })
      .catch(err => setError(messageOf(err)))
  }, [loadTemplates])
  useEffect(() => { if (eventId) void loadRows(eventId, includeTest); else { setRows([]); setSelected(new Set()) } }, [eventId, includeTest, loadRows])

  // Tür değişince (veya ilk yüklemede) o türün kayıtlı yerleşimi ve görseli açılır
  useEffect(() => {
    if (!templatesReady) return
    const request = ++imageRequest.current
    const template = templatesRef.current.find(item => item.type === type)
    setLayout(template?.layout ?? defaultLayout()); setImageBase64(null); setTestUrl(null); setDirty(false); setSaveState('idle'); setNaturalWidth(0)
    if (!template?.hasImage) { setImageUrl(null); return }
    void apiBlob(`/certificates/templates/${type}/image`).then(blob => {
      if (request === imageRequest.current) setImageUrl(URL.createObjectURL(blob))
    }).catch(err => { if (request === imageRequest.current) setError(messageOf(err)) })
  }, [type, templatesReady])
  useEffect(() => () => { if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl) }, [imageUrl])
  useEffect(() => () => { if (testUrl) URL.revokeObjectURL(testUrl) }, [testUrl])

  // Otomatik kayıt (ABT gibi): değişiklikten yarım saniye sonra yerel şablon deposuna yazılır
  const persist = useCallback(async (job: Pending) => {
    setSaveState('saving')
    await api(`/certificates/templates/${job.type}`, 'PUT', { layout: normalizeLayout(job.layout), ...(job.imageBase64 ? { imageBase64: job.imageBase64 } : {}) })
    const next = templatesRef.current.map(item => item.type === job.type ? { ...item, layout: normalizeLayout(job.layout), hasImage: item.hasImage || Boolean(job.imageBase64) } : item)
    templatesRef.current = next; setTemplates(next)
    setSaveState('saved')
  }, [])
  const flush = useCallback(async () => {
    const job = pending.current
    if (!job) return
    pending.current = null
    const saved = version.current
    try { await persist(job); if (job.imageBase64) setImageBase64(current => current === job.imageBase64 ? null : current) }
    catch (err) { setSaveState('idle'); setError(`Şablon kaydedilemedi: ${messageOf(err)}`); throw err }
    if (saved === version.current) setDirty(false)
  }, [persist])
  useEffect(() => {
    if (!dirty) return
    pending.current = { type, layout, imageBase64 }
    version.current++
    const timer = window.setTimeout(() => { void flush().catch(() => undefined) }, 500)
    return () => window.clearTimeout(timer)
  }, [dirty, layout, imageBase64, type, flush])
  useEffect(() => () => { const job = pending.current; if (job) void persist(job).catch(() => undefined) }, [persist])
  const switchType = (next: CertificateType) => { if (next === type) return; void flush().catch(() => undefined); setType(next) }

  // Eklenen Google Fonts ailelerini önizlemede de yükle
  useEffect(() => {
    const href = googleFontsHref(layout.customFonts)
    if (!href || document.querySelector(`link[data-certificate-fonts="${CSS.escape(href)}"]`)) return
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.dataset.certificateFonts = href
    document.head.appendChild(link)
  }, [layout.customFonts])

  const template = templates.find(item => item.type === type)
  const hasSavedImage = Boolean(template?.hasImage)
  const event = events.find(item => item.id === eventId)
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    return term ? rows.filter(row => `${row.fullName} ${row.email} ${row.phone}`.toLocaleLowerCase('tr-TR').includes(term)) : rows
  }, [rows, search])
  const stageRows = filtered.length ? filtered : rows
  const safePreviewIndex = Math.min(previewIndex, Math.max(0, stageRows.length - 1))
  const previewName = stageRows[safePreviewIndex]?.fullName ?? sampleName
  const previewAward = stageRows[safePreviewIndex]?.award || SAMPLE_AWARD
  const fontList = [...certificateFonts, ...layout.customFonts]

  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (err) { setError(messageOf(err)) } finally { setBusy(false) }
  }
  const change = (next: (current: CertificateLayout) => CertificateLayout) => { setLayout(current => normalizeLayout(next(current))); setDirty(true) }
  const updateBox = (field: Field, key: keyof CertificateBox, value: string | number) => change(current => ({ ...current, [field]: { ...current[field], [key]: value } }))
  const upload = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setError('Şablon okunamadı. PNG veya JPEG biçiminde bir dosya seçin.'); return }
    if (file.size > maxImageBytes || !file.size) { setError('Görsel en fazla 5 MB olabilir.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setImageBase64(reader.result); setImageUrl(reader.result); setError('')
      change(current => ({ ...current, imageName: file.name }))
    }
    reader.onerror = () => setError('Şablon okunamadı. PNG veya JPEG biçiminde başka bir dosya seçin.')
    reader.readAsDataURL(file)
  }
  const addCustomFont = () => {
    const name = customFont.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (!isSafeFontName(name)) { setError('Yazı tipi adı yalnız harf, rakam ve boşluk içerebilir (ör. Great Vibes).'); return }
    change(current => ({ ...current, customFonts: current.customFonts.includes(name) || (certificateFonts as readonly string[]).includes(name) ? current.customFonts : [...current.customFonts, name],
      [activeField]: { ...current[activeField], fontFamily: name } }))
    setCustomFont('')
  }
  const test = (format: 'png' | 'pdf') => void act(async () => {
    await flush()
    const blob = await apiBlob('/certificates/test', 'POST', { type, name: previewName, format })
    const url = URL.createObjectURL(blob)
    if (format === 'png') setTestUrl(url)
    else { const link = document.createElement('a'); link.href = url; link.download = `sertifika-test-${type}.pdf`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60000) }
  })
  const startDrag = (pointer: React.PointerEvent<HTMLElement>, field: Field, mode: Drag['mode']) => {
    pointer.stopPropagation(); pointer.preventDefault()
    setActiveField(field)
    drag.current = { mode, field, x: pointer.clientX, y: pointer.clientY, layout }
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
  }
  const moveDrag = (pointer: React.PointerEvent<HTMLElement>) => {
    if (!drag.current || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const fn = drag.current.mode === 'move' ? moveCertificateBox : resizeCertificateBox
    setLayout(fn(drag.current.layout, drag.current.field, pointer.clientX - drag.current.x, pointer.clientY - drag.current.y, rect.width, rect.height))
    setDirty(true)
  }
  const endDrag = () => { drag.current = null }
  const box = layout[activeField]

  // --- Otomasyon (gönderim) ---
  const mailChoices = mails.filter(item => !item.purpose.endsWith('-received'))
  const chosenMail = mailChoices.find(item => item.id === mailId)
  const chosenWa = messages.find(item => item.id === messageId)
  const templateIssues = [chosenMail && { name: chosenMail.name, variables: unknownCertificateVariables(`${chosenMail.subject}${chosenMail.html}`) },
    chosenWa && { name: chosenWa.name, variables: unknownCertificateVariables(chosenWa.message) }]
    .filter((entry): entry is { name: string; variables: string[] } => Boolean(entry && entry.variables.length))
  const mailLacksLink = Boolean(chosenMail && !/\{\{\s*sertifikaLinki\s*\}\}/.test(chosenMail.html))
  const choiceOf = (row: CertificateRecipient): Choice => choices[row.id] ?? row.certificateType
  const groups = [{ id: 'ready', label: 'Gönderilecek' }, { id: 'held', label: 'Gönderilmeyecek' }] as const
  const groupOf = (row: CertificateRecipient) => choiceOf(row) === 'skip' ? 'held' : 'ready'
  const selectedRows = rows.filter(row => selected.has(row.id))
  const blocker = !chosenMail && !chosenWa ? 'Sertifika maili veya WhatsApp şablonu seçin. Sertifika PDF’i mailde ek, görseli WhatsApp’ta gider.'
    : templateIssues.length ? 'Şablonda sertifika gönderiminde dolmayan değişken var.' : null
  const issuesOf = (row: CertificateRecipient): string[] => {
    const choice = choiceOf(row)
    if (choice === 'skip') return ['sertifika türü (Gönderme seçili)']
    const issues: string[] = []
    if (!templates.some(item => item.type === choice && item.hasImage)) issues.push(`${titles[choice]} sertifika görseli`)
    if (!(chosenMail && row.hasEmail) && !(chosenWa && row.hasPhone)) issues.push(row.hasEmail || row.hasPhone ? 'seçili kanala uygun iletişim bilgisi' : 'e-posta veya telefon')
    return issues
  }
  const issuesByRow = blocker ? [] : selectedRows.map(row => ({ row, issues: issuesOf(row) })).filter(entry => entry.issues.length)
  const repeated = selectedRows.filter(row => states[row.id] === 'sent').length
  const safeSendPreview = selectedRows.length ? sendPreviewIndex % selectedRows.length : 0
  const previewRow = selectedRows[safeSendPreview]
  const setChoice = (id: number, choice: Choice) => setChoices(current => ({ ...current, [id]: choice }))
  const moveToGroup = (id: number, group: 'ready' | 'held') => {
    const row = rows.find(item => item.id === id)
    if (!row) return
    if (group === 'held') setChoice(id, 'skip')
    else if (choiceOf(row) === 'skip') setChoice(id, row.certificateType)
  }
  const closeSend = () => { if (!sending) { setSendOpen(false); setConfirm(false) } }

  const send = async () => {
    if (!eventId || !selectedRows.length || blocker || issuesByRow.length || (repeated > 0 && !repeat)) return
    await flush().catch(() => undefined)
    const queue = selectedRows.map(row => ({ row, choice: choiceOf(row) as CertificateType }))
    setSending(true); setConfirm(false); setError(''); setNotice(''); setResults([])
    setProgress({ completed: 0, failed: 0, total: queue.length })
    let failed = 0
    for (const [index, { row, choice }] of queue.entries()) {
      let outcome: SendResult
      try {
        const response = await api<{ results: SendResult[] }>('/certificates/send', 'POST', {
          eventId, ids: [row.id], confirmed: true, confirmCount: 1, types: { [row.id]: choice },
          ...(mailId ? { mailTemplateId: mailId } : {}), ...(messageId ? { whatsappTemplateId: messageId } : {}),
          ...(states[row.id] === 'sent' ? { repeatConfirmed: true } : {}), ...(includeTest ? { includeTest: true } : {}) })
        outcome = response.results[0] ?? { id: row.id, mail: 'skipped', whatsapp: 'skipped', error: 'Sonuç alınamadı' }
      } catch (err) { outcome = { id: row.id, mail: 'failed', whatsapp: 'failed', error: messageOf(err) } }
      const ok = outcome.mail === 'sent' || outcome.whatsapp === 'queued'
      if (!ok) failed++
      setStates(current => ({ ...current, [row.id]: ok ? 'sent' : 'failed' }))
      if (ok) setRows(current => current.map(item => item.id === row.id ? { ...item, sentAt: new Date().toISOString() } : item))
      setResults(current => [...current, outcome])
      setProgress({ completed: index + 1, failed, total: queue.length })
    }
    setSending(false); setRepeat(false); setSelected(new Set())
    setNotice(`${queue.length - failed} kişiye sertifika gönderildi${failed ? `, ${failed} kişide hata var` : ''}.`)
  }
  const previewValues = (row?: CertificateRecipient) => ({ adSoyad: row?.fullName ?? sampleName, etkinlik: event?.title ?? '', sertifikaNo: SAMPLE_CERTIFICATE_CODE, sertifikaLinki: sampleLink, takim: row?.team ?? '', odul: row?.award ?? '' })
  const deliveryPreview = (row: CertificateRecipient) => {
    const values = previewValues(row)
    const subject = chosenMail ? fillValues(chosenMail.subject, values).text : ''
    const html = chosenMail ? fillValues(chosenMail.html, values, true).text : ''
    const message = chosenWa ? fillValues(chosenWa.message, values).text : ''
    const choice = choiceOf(row)
    return <div className="delivery-preview">
      <small>{choice === 'skip' ? 'Bu kişiye sertifika gönderilmeyecek.' : `${titles[choice]} sertifikası · kod gönderimde CMS'te üretilir`}</small>
      {chosenMail ? <div className="mail-preview-card"><div className="mail-preview-card__header"><span>Kime</span><strong>{row.email || 'E-posta yok'}</strong><span>Konu</span><strong>{subject}</strong><span>Ek: sertifika-KOD.pdf</span></div>
        <iframe title={`${row.fullName} sertifika maili`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} /></div> : <p className="help">Mail şablonu seçilmedi.</p>}
      {chosenWa ? <div className="wa-preview"><header><strong>{row.fullName}</strong><small>{row.phone || 'Telefon yok'}</small></header><div className="wa-bubble">🖼️ Sertifika görseli{'\n'}{message}</div></div> : <p className="help">WhatsApp şablonu seçilmedi.</p>}
    </div>
  }

  return <section className="screen certificate-studio">
    <div className="certificate-studio__heading">
      <div><small>{event?.title ?? 'Etkinlik seçin'}</small><h1>Sertifika Stüdyosu</h1><p>Şablonu yerleştirin, gelen katılımcılarla kontrol edin ve onaylayarak gönderin.</p></div>
      <div className="certificate-studio__controls">
        <select aria-label="Etkinlik" value={eventId ?? ''} disabled={sending} onChange={select => { setEventId(Number(select.target.value) || null); setRows([]); setSelected(new Set()); setConfirm(false); setResults([]) }}>
          <option value="">Etkinlik seçin</option>{events.map(item => <option key={item.id} value={item.id}>{item.title}{item.mode === 'test' ? ' · Test' : ''}</option>)}
        </select>
        <div className="segmented" role="group" aria-label="Sertifika türü">
          {certificateTypes.map(item => <button key={item} className={type === item ? 'active' : ''} aria-pressed={type === item} onClick={() => switchType(item)}>
            {titles[item]}{templates.find(entry => entry.type === item)?.hasImage ? ' ✓' : ''}</button>)}
        </div>
      </div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}

    <div className="certificate-editor-layout">
      <section className="certificate-canvas-panel">
        <div className="panel-heading">
          <div><h2>Şablon yerleşimi</h2><p>Kutuları sürükleyin, sağ alt köşeden boyutlandırın; değişiklikler otomatik kaydedilir.</p></div>
          <div className="certificate-toolbar">
            <button onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden="true" size={16} />Şablon yükle</button>
            <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg" onChange={input => { upload(input.target.files?.[0]); input.target.value = '' }} />
            <button disabled={busy || sending || !imageUrl} onClick={() => test('png')}><Download aria-hidden="true" size={16} />Test çıktısı</button>
            <button disabled={busy || sending || !imageUrl} onClick={() => test('pdf')}><FileDown aria-hidden="true" size={16} />Test PDF</button>
            <button className="primary" disabled={!eventId || !imageUrl} onClick={() => { setSendOpen(true); setConfirm(false) }}><Award aria-hidden="true" size={16} />Otomasyon</button>
          </div>
        </div>
        <div className={`certificate-canvas-shell${dropping ? ' certificate-canvas-shell--drop' : ''}`}
          onDragOver={over => { over.preventDefault(); setDropping(true) }} onDragLeave={() => setDropping(false)}
          onDrop={drop => { drop.preventDefault(); setDropping(false); upload(drop.dataTransfer.files?.[0]) }}>
          {imageUrl ? <div ref={stageRef} className="certificate-stage" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <img src={imageUrl} alt="Sertifika şablonu" draggable={false} onLoad={load => setNaturalWidth(load.currentTarget.naturalWidth)} />
            {(['name', 'id', 'award'] as const).filter(field => field === 'name' || (field === 'id' ? layout.showId : layout.showAward)).map(field =>
              <CertificateTextBox key={field} label={fieldTitles[field]} box={layout[field]} value={field === 'name' ? previewName : field === 'id' ? SAMPLE_CERTIFICATE_CODE : previewAward}
                active={activeField === field} naturalWidth={naturalWidth} onFitted={size => setFittedSizes(current => current[field] === size ? current : { ...current, [field]: size })} onMove={pointer => startDrag(pointer, field, 'move')} onResize={pointer => startDrag(pointer, field, 'resize')} />)}
          </div> : <button className="certificate-empty-canvas" onClick={() => fileRef.current?.click()}>
            <ImagePlus aria-hidden="true" size={38} /><strong>PNG veya JPEG şablon yükleyin</strong>
            <span>İsim ve sertifika kimliği doğrudan kendi tasarımınızın üzerine yerleşir. Dosyayı buraya sürükleyin · en fazla 5 MB · {titles[type]} türü için</span>
            <span className="button-like">Dosya seç</span>
          </button>}
        </div>
        <div className="certificate-preview-nav">
          <button aria-label="Önceki katılımcı" disabled={stageRows.length < 2} onClick={() => setPreviewIndex((safePreviewIndex - 1 + stageRows.length) % stageRows.length)}><ChevronLeft aria-hidden="true" size={16} /></button>
          <div><strong>{previewName}</strong><small>{stageRows.length ? `${safePreviewIndex + 1} / ${stageRows.length} gerçek katılımcı` : 'Önizlenecek katılımcı yok (örnek ad)'}</small></div>
          <button aria-label="Sonraki katılımcı" disabled={stageRows.length < 2} onClick={() => setPreviewIndex((safePreviewIndex + 1) % stageRows.length)}><ChevronRight aria-hidden="true" size={16} /></button>
        </div>
        {testUrl && <div className="certificate-test-output"><div className="panel-heading"><h2>Test çıktısı (sunucu)</h2><button onClick={() => setTestUrl(null)}>Kapat</button></div><img src={testUrl} alt="Test çıktısı" /></div>}
      </section>

      <aside className="certificate-settings-panel">
        <div className="certificate-settings-title"><SlidersHorizontal aria-hidden="true" size={18} /><div><h2>Metin ayarları</h2><small>Düzenlemek için kutuyu seçin.</small></div></div>
        <div className="segmented segmented--full" role="group" aria-label="Düzenlenen kutu">
          {(['name', 'id', 'award'] as const).map(field => <button key={field} className={activeField === field ? 'active' : ''} aria-pressed={activeField === field}
            disabled={(field === 'id' && !layout.showId) || (field === 'award' && !layout.showAward)} onClick={() => setActiveField(field)}>{fieldTitles[field]}</button>)}
        </div>
        <label>Yazı tipi<select value={box.fontFamily} onChange={select => updateBox(activeField, 'fontFamily', select.target.value)}>{fontList.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
        <div className="certificate-custom-font">
          <label>Google Fonts’tan ekle<input value={customFont} placeholder="Örn. Great Vibes" onChange={input => setCustomFont(input.target.value)}
            onKeyDown={key => { if (key.key === 'Enter') { key.preventDefault(); addCustomFont() } }} /></label>
          <button disabled={!customFont.trim()} onClick={addCustomFont}>Ekle</button>
        </div>
        <small>Google Fonts’taki aile adını aynen yazın. İnternet bağlantısı gerekir; sertifika çıktısında da aynı yazı tipi kullanılır.</small>
        <div className="certificate-setting-pair">
          <label>Boyut<input type="number" min={8} key={`${activeField}-${fittedSizes[activeField]}`} defaultValue={fittedSizes[activeField] ?? ''}
            onKeyDown={key => { if (key.key === 'Enter') key.currentTarget.blur() }} onBlur={input => {
            // Yazı kutuyu doldurur; boyutu değiştirmek kutuyu aynı oranda büyütür/küçültür (sol üst köşe sabit)
            const next = Number(input.currentTarget.value), current = fittedSizes[activeField]
            if (!current || !(next >= 8)) return
            const ratio = next / current
            change(layoutNow => ({ ...layoutNow, [activeField]: { ...layoutNow[activeField], w: Math.min(100 - layoutNow[activeField].x, layoutNow[activeField].w * ratio), h: Math.min(100 - layoutNow[activeField].y, layoutNow[activeField].h * ratio) } }))
          }} /></label>
          <label>Kalınlık<select value={box.fontWeight} onChange={select => updateBox(activeField, 'fontWeight', Number(select.target.value))}>
            {Object.entries(weights).map(([weight, title]) => <option key={weight} value={weight}>{title}</option>)}
          </select></label>
        </div>
        <label>Renk<div className="certificate-color-field"><input type="color" aria-label="Metin rengi" value={box.color} onChange={input => updateBox(activeField, 'color', input.target.value)} />
          <input className="mono" key={`${activeField}-${box.color}`} defaultValue={box.color} maxLength={7} onChange={input => /^#[0-9a-fA-F]{6}$/.test(input.target.value) && updateBox(activeField, 'color', input.target.value)} /></div></label>
        <div className="segmented segmented--full" role="group" aria-label="Hizalama">
          {(['left', 'center', 'right'] as const).map(align => <button key={align} className={box.align === align ? 'active' : ''} onClick={() => updateBox(activeField, 'align', align)}>{({ left: 'Sol', center: 'Orta', right: 'Sağ' })[align]}</button>)}
        </div>
        <div className="certificate-setting-pair">
          <label>X (%)<input type="number" min={0} max={100} step={0.5} value={Math.round(box.x * 10) / 10} onChange={input => updateBox(activeField, 'x', Number(input.target.value))} /></label>
          <label>Y (%)<input type="number" min={0} max={100} step={0.5} value={Math.round(box.y * 10) / 10} onChange={input => updateBox(activeField, 'y', Number(input.target.value))} /></label>
        </div>
        <div className="certificate-setting-pair">
          <label>Genişlik (%)<input type="number" min={2} max={100} step={0.5} value={Math.round(box.w * 10) / 10} onChange={input => updateBox(activeField, 'w', Number(input.target.value))} /></label>
          <label>Yükseklik (%)<input type="number" min={2} max={100} step={0.5} value={Math.round(box.h * 10) / 10} onChange={input => updateBox(activeField, 'h', Number(input.target.value))} /></label>
        </div>
        <label className="toggle-row"><input type="checkbox" checked={layout.showId} onChange={input => { const checked = input.target.checked; change(current => ({ ...current, showId: checked })); if (!checked) setActiveField('name') }} />
          <span><strong>Sertifika kimliğini göster</strong><small>CMS’in ürettiği gerçek kimlik yazılır.</small></span></label>
        <label className="toggle-row"><input type="checkbox" checked={layout.showAward} onChange={input => { const checked = input.target.checked; change(current => ({ ...current, showAward: checked })); setActiveField(checked ? 'award' : 'name') }} />
          <span><strong>Ödül satırını göster</strong><small>Takım etkinliğinde kazananlara takım · derece · ödül yazılır (Başarı türünde).</small></span></label>
        <p className="certificate-image-name">
          {layout.imageName || (hasSavedImage ? 'Şablon kayıtlı.' : 'Bu tür için henüz şablon seçilmedi.')}
          <small>{saveState === 'saving' ? 'Kaydediliyor…' : dirty ? 'Kaydedilmemiş değişiklik var.' : saveState === 'saved' ? 'Kaydedildi ✓' : ''}</small>
        </p>
      </aside>
    </div>

    {sendOpen && <div className="modal-backdrop" role="presentation" onMouseDown={closeSend}>
      <section className="modal certificate-send-modal" role="dialog" aria-modal="true" aria-labelledby="certificate-send-title" onMouseDown={inside => inside.stopPropagation()}>
        <div className="panel-heading"><div><h2 id="certificate-send-title">Sertifika gönderimi</h2><p>{event?.title} · Yalnızca kapıdan giriş yapan kabul edilmiş kişiler listelenir. Türü kişi başına seçin.</p></div>
          <button aria-label="Pencereyi kapat" disabled={sending} onClick={closeSend}>Kapat</button></div>
        <div className="toolbar">
          <label className="search-input"><Search aria-hidden="true" size={15} /><input aria-label="Katılımcı ara" placeholder="Ad, e-posta veya telefon ara" value={search} onChange={input => setSearch(input.target.value)} /></label>
          <label className="inline"><input type="checkbox" checked={includeTest} disabled={sending} onChange={input => { setIncludeTest(input.target.checked); setConfirm(false) }} /> Test kayıtları</label>
          <button disabled={!eventId || loading || sending} onClick={() => eventId && void loadRows(eventId, includeTest)}>Yenile</button>
        </div>
        <div className="delivery-template-bar">
          <label>Sertifika maili<select value={mailId} disabled={sending} onChange={select => setMailId(select.target.value ? Number(select.target.value) : '')}><option value="">Mail gönderme</option>{mailChoices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Sertifika WhatsApp mesajı<select value={messageId} disabled={sending} onChange={select => setMessageId(select.target.value ? Number(select.target.value) : '')}><option value="">WhatsApp gönderme</option>{messages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <p className="help">Değişkenler: {CERTIFICATE_VARIABLES.map(key => `{{${key}}}`).join(' ')} · Mailde PDF eki, WhatsApp'ta sertifika görseli gider.</p>
        </div>
        {loading ? <div className="empty-state">Gelen katılımcılar alınıyor…</div> : <>
          {templateIssues.map(({ name, variables }) => <div key={name} className="notice error">{`“${name}” şablonu ${variables.map(key => `{{${key}}}`).join(', ')} içeriyor; bu değişken sertifika gönderiminde dolmaz. Şablonlar ekranında {{sertifikaLinki}} içeren bir sertifika şablonu oluşturup onu seçin.`}</div>)}
          {mailLacksLink && <div className="notice">{'Seçilen mail şablonunda {{sertifikaLinki}} yok. PDF yine ek olarak gider, ancak mailde doğrulama bağlantısı olmaz.'}</div>}

          <section className="send-list" aria-label="Gönderim listesi">
            <div className="send-list__toolbar">
              <div><h2>Gönderim listesi</h2><small>{selected.size} / {rows.length} alıcı seçili</small></div>
              {rows.some(row => row.award) && <button disabled={sending} title="Ödül alan takımların üyelerini Başarı sertifikasına alır"
                onClick={() => setChoices(current => ({ ...current, ...Object.fromEntries(rows.filter(row => row.award).map(row => [row.id, 'achievement' as Choice])) }))}>
                <Award aria-hidden="true" size={15} />Kazananlara Başarı ata</button>}
              {confirm ? null : <button className="primary" disabled={!selectedRows.length || sending || Boolean(blocker) || issuesByRow.length > 0} onClick={() => { setRepeat(false); setConfirm(true) }}>
                <Send aria-hidden="true" size={15} />{sending ? `Gönderiliyor… ${progress?.completed ?? 0}/${progress?.total ?? selectedRows.length}` : `${selectedRows.length} kişiye sertifika gönder`}</button>}
            </div>
            <div className="send-list__groups">
              {groups.map(group => {
                const groupRows = filtered.filter(row => groupOf(row) === group.id)
                const visibleIds = groupRows.filter(canSelectRecipient).map(row => row.id)
                return <section key={group.id} className={`send-group${draggedId !== null ? ' send-group--droppable' : ''}`} onDragOver={over => over.preventDefault()}
                  onDrop={() => { if (draggedId !== null) moveToGroup(draggedId, group.id); setDraggedId(null) }}>
                  <header className="send-group__header"><div><h3>{group.label}</h3><small>{groupRows.length} kişi</small></div>
                    <div><button disabled={!visibleIds.length || sending} onClick={() => setSelected(current => selectIds(current, visibleIds))}>Görünenleri seç</button>
                      <button disabled={!visibleIds.length || sending} onClick={() => setSelected(current => invertIds(current, visibleIds))}>Ters seçim</button></div></header>
                  {groupRows.length ? <div className={`send-group__rows${groupRows.length > 5 ? ' send-group__rows--zebra' : ''}`}>
                    {groupRows.map(row => <label key={row.id} className="send-row" draggable={!sending} onDragEnd={() => setDraggedId(null)}
                      onDragStart={start => { setDraggedId(row.id); start.dataTransfer.effectAllowed = 'move'; start.dataTransfer.setData('text/plain', String(row.id)) }}>
                      <GripVertical aria-hidden="true" className="send-row__grip" size={15} />
                      <input type="checkbox" disabled={!canSelectRecipient(row) || sending} checked={selected.has(row.id)} onChange={() => setSelected(current => toggleId(current, row.id))} aria-label={`${row.fullName} seç`} />
                      <span className="send-row__identity"><span>{row.fullName}</span><small>{[row.email || 'e-posta yok', row.phone || 'telefon yok'].join(' · ')}</small>{(row.award || row.team) && <small className="send-row__award">{row.award ? `🏆 ${row.award}` : row.team}</small>}</span>
                      <select aria-label={`${row.fullName} sertifika türü`} className="certificate-row-type" disabled={sending} value={choiceOf(row)}
                        onClick={click => click.stopPropagation()} onChange={select => setChoice(row.id, select.target.value as Choice)}>
                        {certificateTypes.map(item => <option key={item} value={item}>{titles[item]}</option>)}<option value="skip">Gönderme</option>
                      </select>
                      {states[row.id] === 'sent' ? <span className="send-state send-state--success"><Check aria-hidden="true" size={13} /> Gönderildi</span>
                        : states[row.id] === 'failed' ? <span className="send-state send-state--error"><X aria-hidden="true" size={13} /> Hata</span>
                        : <span className="send-state send-state--waiting">○ Bekliyor</span>}
                    </label>)}
                  </div> : <div className="send-group__empty">Bu listede kişi yok. Diğer listeden sürükleyin.</div>}
                </section>
              })}
            </div>

            <section className="send-preview" aria-labelledby="send-preview-title">
              <div className="panel-heading"><div><h2 id="send-preview-title">Önizleme</h2><small>Seçili kişiye gidecek tam içeriği kontrol edin.</small></div>
                {previewRow && <div className="send-preview__nav"><button aria-label="Önceki önizleme" disabled={selectedRows.length < 2} onClick={() => setSendPreviewIndex((safeSendPreview - 1 + selectedRows.length) % selectedRows.length)}><ChevronLeft size={16} /></button>
                  <small>{previewRow.fullName} · {safeSendPreview + 1} / {selectedRows.length}</small>
                  <button aria-label="Sonraki önizleme" disabled={selectedRows.length < 2} onClick={() => setSendPreviewIndex((safeSendPreview + 1) % selectedRows.length)}><ChevronRight size={16} /></button></div>}
              </div>
              {previewRow ? deliveryPreview(previewRow) : <div className="empty-state">Bir veya daha fazla alıcı seçin; gönderilecek içerik burada görünecek.</div>}
            </section>

            {progress && <div className="send-progress" aria-live="polite"><strong>{progress.completed} / {progress.total} tamamlandı · {progress.failed} başarısız</strong><progress max={progress.total} value={progress.completed} /></div>}
            {blocker && selectedRows.length > 0 && <section className="send-failures" role="alert"><h3>Gönderim başlamadı</h3><p><AlertTriangle aria-hidden="true" size={13} /> {blocker}</p></section>}
            {issuesByRow.length > 0 && <section className="send-failures" role="alert"><h3>Gönderim başlamadı</h3>{issuesByRow.map(({ row, issues }) => <p key={row.id}><AlertTriangle aria-hidden="true" size={13} /> {row.fullName}: {issues.join(', ')} eksik.</p>)}</section>}
            {repeated > 0 && !confirm && <p className="send-warning"><AlertTriangle aria-hidden="true" size={15} /> {repeated} seçili alıcıya daha önce gönderildi; yeniden gönderirken onay istenecek.</p>}
            {confirm && <div className="inline-confirm">
              <p><strong>{selectedRows.length} kişiye</strong> {[chosenMail && 'mail', chosenWa && 'WhatsApp'].filter(Boolean).join(' ve ')} ile sertifika gönderilecek
                ({certificateTypes.map(item => [item, selectedRows.filter(row => choiceOf(row) === item).length] as const).filter(([, count]) => count).map(([item, count]) => `${count} ${titles[item]}`).join(', ')}).
                {repeated > 0 ? ` ${repeated} kişiye daha önce gönderilmiş.` : ''} Emin misiniz?</p>
              {repeated > 0 && <label className="inline"><input type="checkbox" checked={repeat} onChange={input => setRepeat(input.target.checked)} /> Daha önce gönderilenlere tekrar gönder</label>}
              <div className="actions"><button onClick={() => { setConfirm(false); setRepeat(false) }}>Vazgeç</button>
                <button className="primary" disabled={(repeated > 0 && !repeat) || sending} onClick={() => void send()}>Evet, gönder</button></div>
            </div>}
            {results.length > 0 && <div className="table-wrap" role="status"><table><thead><tr><th>Alıcı</th><th>Kod</th><th>Mail</th><th>WhatsApp</th><th>Hata</th></tr></thead><tbody>
              {results.map(item => <tr key={item.id}><td>{rows.find(row => row.id === item.id)?.fullName || `#${item.id}`}</td><td>{item.code ?? '—'}</td><td>{deliveryLabel(item.mail)}</td><td>{deliveryLabel(item.whatsapp)}</td><td>{item.error || '—'}</td></tr>)}
            </tbody></table></div>}
          </section>
        </>}
      </section>
    </div>}
  </section>
}

/**
 * Tuvaldeki yazı kutusu. Yazı boyutu tahminle değil gerçek ölçümle bulunur: ayarlanan boyuttan başlar, yazı kutunun
 * genişliğine VE yüksekliğine sığana kadar küçülür (kutu küçülünce yazı da küçülür, kesilip bölünmez). Sertifika
 * çıktısı (Puppeteer) aynı fitTextToBox ile aynı oranda hesaplanır; ekranda görülen çıktıyla aynıdır.
 */
function CertificateTextBox({ active, box, label, naturalWidth, onFitted, onMove, onResize, value }: { active: boolean; box: CertificateBox; label: string; naturalWidth: number; value: string
  onFitted: (naturalPx: number) => void
  onMove: (pointer: React.PointerEvent<HTMLElement>) => void; onResize: (pointer: React.PointerEvent<HTMLElement>) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [fontsTick, setFontsTick] = useState(0)
  const [stageWidth, setStageWidth] = useState(0)
  const reportFitted = useRef(onFitted)
  reportFitted.current = onFitted
  useEffect(() => {
    const loaded = () => setFontsTick(tick => tick + 1)
    document.fonts.addEventListener('loadingdone', loaded)
    const stage = boxRef.current?.parentElement
    const observer = stage ? new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width)) : null
    if (stage && observer) observer.observe(stage)
    return () => { document.fonts.removeEventListener('loadingdone', loaded); observer?.disconnect() }
  }, [])
  useLayoutEffect(() => {
    const element = boxRef.current, text = textRef.current
    if (!element || !text || !naturalWidth || !stageWidth) return
    const scale = stageWidth / naturalWidth
    // Sunucudaki gibi doğal piksel biriminde sığdır, sonra sahne genişliğine göre (cqw) göster
    const fitted = fitTextToBox(text, element, 8 * scale)
    text.style.fontSize = `${fitted / stageWidth * 100}cqw`
    reportFitted.current(Math.round(fitted / scale))
  }, [box, value, naturalWidth, stageWidth, fontsTick])
  return <div ref={boxRef} className={`certificate-text-box${active ? ' certificate-text-box--active' : ''}`} onPointerDown={onMove}
    style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, justifyContent: box.align === 'left' ? 'flex-start' : box.align === 'right' ? 'flex-end' : 'center' }}>
    <span className="certificate-text-box__label">{label}</span>
    <span ref={textRef} className="certificate-text-box__content" style={{ color: box.color, fontFamily: certificateFontStack(box.fontFamily), fontWeight: box.fontWeight }}>{value}</span>
    <span className="certificate-text-box__handle" aria-label={`${label} kutusunu boyutlandır`} onPointerDown={onResize} />
  </div>
}
