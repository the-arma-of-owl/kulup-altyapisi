import { useRef, useState, type ReactNode } from 'react'
import type { EmailTemplate, WhatsAppTemplate, WorkerEvent } from '../../shared/types'
import { fillTemplate, templateKeys } from '../../shared/templateVars'
import { api } from '../api'
import { EmailHtmlEditor, VariableButtons, insertAtCursor } from '../ui/EmailHtmlEditor'

// Kanal başına isimli şablonlar. Hangi kararda / kapıda
// kullanılacakları gönderim anında seçilir; burada etkinlik veya amaç seçilmez.
type Channel = 'whatsapp' | 'mail' | 'auto'
type Draft = { id: number | null; name: string; subject: string; body: string }
const EMPTY: Draft = { id: null, name: '', subject: '', body: '' }
const AUTO = ['member-application-received', 'event-registration-received', 'coreteam-application-received']
const RECIPIENT_KEY = 'kulup-test-recipient'
const formatDate = (value?: string) => value ? new Date(value).toLocaleString('tr-TR') : ''

export function Templates({ mailTemplates, waTemplates, events, refresh, autoMails }: {
  mailTemplates: EmailTemplate[]; waTemplates: WhatsAppTemplate[]; events: WorkerEvent[]; refresh: () => Promise<void>
  /** Otomatik mailler sekmesinin içeriği (App'teki AutoMailPanel) */
  autoMails: ReactNode
}) {
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [recipient, setRecipient] = useState(() => { try { return localStorage.getItem(RECIPIENT_KEY) || '' } catch { return '' } })
  const subjectRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const mails = mailTemplates.filter((t) => !AUTO.includes(t.purpose))
  const list = channel === 'mail'
    ? mails.map((t) => ({ id: t.id, name: t.name, detail: t.subject, updatedAt: t.updatedAt, open: () => open({ id: t.id, name: t.name, subject: t.subject, body: t.html }) }))
    : waTemplates.map((t) => ({ id: t.id, name: t.name, detail: t.message.replace(/\s+/g, ' ').slice(0, 90), updatedAt: t.updatedAt, open: () => open({ id: t.id, name: t.name, subject: '', body: t.message }) }))

  const reset = () => { setError(''); setResult('') }
  const open = (next: Draft) => { setDraft(next); reset() }
  const switchChannel = (next: Channel) => { setChannel(next); setDraft(null); reset() }
  const update = (patch: Partial<Draft>) => setDraft((current) => current ? { ...current, ...patch } : current)
  const task = async (action: () => Promise<void>) => {
    setBusy(true); reset()
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'İşlem başarısız.') } finally { setBusy(false) }
  }

  const canSave = Boolean(draft && draft.name.trim() && draft.body.trim() && (channel === 'whatsapp' || draft.subject.trim()))
  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())

  const save = () => void task(async () => {
    if (!draft || !canSave) return
    const name = draft.name.trim()
    const pool = channel === 'mail' ? mails : waTemplates
    if (pool.some((t) => t.name.trim() === name && t.id !== draft.id)) throw new Error(`“${name}” adında bir ${channel === 'mail' ? 'mail' : 'WhatsApp'} şablonu zaten var. Farklı bir ad verin.`)
    const saved = channel === 'mail'
      ? draft.id
        ? await api<EmailTemplate>(`/templates/${draft.id}`, 'PATCH', { name, subject: draft.subject, html: draft.body })
        : await api<EmailTemplate>('/templates', 'POST', { name, subject: draft.subject, html: draft.body })
      : draft.id
        ? await api<WhatsAppTemplate>(`/wa-templates/${draft.id}`, 'PATCH', { name, message: draft.body })
        : await api<WhatsAppTemplate>('/wa-templates', 'POST', { name, message: draft.body })
    update({ id: saved.id })
    await refresh()
    setResult('Şablon kaydedildi. Başvuru ve kapı ekranlarındaki şablon listesinde artık görünür.')
  })
  const remove = () => void task(async () => {
    if (!draft?.id || !window.confirm(`“${draft.name}” şablonu silinecek. Devam edilsin mi?`)) return
    await api(`/${channel === 'mail' ? 'templates' : 'wa-templates'}/${draft.id}`, 'DELETE', {})
    setDraft(null)
    await refresh()
    setResult('Şablon silindi.')
  })
  const testMail = () => void task(async () => {
    if (!draft) return
    const sent = await api<{ to: string }>('/templates/test-mail', 'POST', { recipient: recipient.trim(), subject: draft.subject, html: draft.body })
    try { localStorage.setItem(RECIPIENT_KEY, recipient.trim()) } catch { /* yalnızca kolaylık */ }
    setResult(`Örnek verilerle test maili ${sent.to} adresine gönderildi.`)
  })

  const sampleEvent = events[0] ?? { id: 0, title: 'Örnek Etkinlik' }
  const sample = { registration: { id: 0, event: sampleEvent.id, fullName: 'Örnek Kişi', email: 'test@example.invalid', phone: '+900000000001', status: 'accepted' as const, ticketToken: '0123456789abcdef', gateFields: { masa: 'A12' } }, event: sampleEvent }
  const preview = (text: string, html = false) => fillTemplate(text, sample, html).text

  return <section className="screen">
    <div className="heading"><div><h1>Şablonlar</h1><p>Başvuru kararlarında ve kapıda seçeceğiniz mail ve WhatsApp şablonlarını burada hazırlayın. Etkinlik seçmeniz gerekmez.</p></div></div>
    <div className="template-toolbar">
      <div className="template-tabs" role="tablist" aria-label="Şablon kanalı">
        <button role="tab" aria-selected={channel === 'whatsapp'} className={channel === 'whatsapp' ? 'active' : ''} onClick={() => switchChannel('whatsapp')}>WhatsApp ({waTemplates.length})</button>
        <button role="tab" aria-selected={channel === 'mail'} className={channel === 'mail' ? 'active' : ''} onClick={() => switchChannel('mail')}>Mail ({mails.length})</button>
        <button role="tab" aria-selected={channel === 'auto'} className={channel === 'auto' ? 'active' : ''} onClick={() => switchChannel('auto')}>Otomatik mailler</button>
      </div>
      {channel !== 'auto' && <button className="primary" onClick={() => open({ ...EMPTY })}>+ Yeni {channel === 'mail' ? 'mail' : 'WhatsApp'} şablonu</button>}
    </div>
    {channel === 'auto' ? autoMails : <>
    {error && <div className="notice error" role="alert">{error}</div>}
    {result && <div className="notice success" role="status">{result}</div>}
    <div className="template-list">
      {list.length === 0 && <div className="empty-state">Henüz {channel === 'mail' ? 'mail' : 'WhatsApp'} şablonu yok. “Yeni şablon” ile ilkini oluşturun.</div>}
      {list.map((t) => <article className={`template-card${draft?.id === t.id ? ' selected' : ''}`} key={t.id}>
        <div><strong>{t.name}</strong><small>{t.detail || '—'}</small></div>
        <small className="date">{formatDate(t.updatedAt)}</small>
        <button className={draft?.id === t.id ? 'primary' : ''} onClick={t.open}>Düzenle</button>
      </article>)}
    </div>
    {draft && <div className="template-editor">
      <div className="card form-grid">
        <small className="eyebrow">{draft.id ? 'Düzenlenen şablon' : 'Yeni şablon'}</small>
        <h2>{draft.name.trim() || (channel === 'mail' ? 'Adsız mail şablonu' : 'Adsız WhatsApp şablonu')}</h2>
        <label>Şablon adı<input maxLength={120} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder={channel === 'mail' ? 'Örn. Kabul maili' : 'Örn. Bilet mesajı'} /></label>
        {channel === 'mail' ? <>
          <label>Konu<input ref={subjectRef} maxLength={300} value={draft.subject} onChange={(e) => update({ subject: e.target.value })} placeholder="Mail konusu" /></label>
          <VariableButtons variables={templateKeys} onInsert={(key) => insertAtCursor(subjectRef, draft.subject, (subject) => update({ subject }), key)} />
          <div className="field-block"><span>Mail içeriği</span>
            <EmailHtmlEditor key={draft.id ?? 'yeni'} html={draft.body} onChange={(body) => update({ body })} variables={templateKeys} /></div>
          <label>Test maili alıcısı<input type="email" inputMode="email" placeholder="ornek@example.com" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
        </> : <>
          <VariableButtons variables={templateKeys} onInsert={(key) => insertAtCursor(messageRef, draft.body, (body) => update({ body }), key)} />
          <label>Mesaj metni<textarea ref={messageRef} rows={10} maxLength={10_000} value={draft.body} onChange={(e) => update({ body: e.target.value })} placeholder="Merhaba {{ad}}, …" /></label>
        </>}
        <div className="actions">
          <button className="primary" disabled={busy || !canSave} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          {channel === 'mail' && <button disabled={busy || !draft.subject.trim() || !draft.body.trim() || !validRecipient} onClick={testMail}>Test maili gönder</button>}
          {draft.id && <button className="danger" disabled={busy} onClick={remove}>Sil</button>}
          <button disabled={busy} onClick={() => setDraft(null)}>Kapat</button>
        </div>
      </div>
      <div className="card">
        <h2>Örnek önizleme</h2>
        <p className="help">Değişkenler örnek bir kişiyle doldurulur ({sample.registration.fullName}, {sampleEvent.title}).</p>
        {channel === 'mail'
          ? <div className="preview"><strong>{preview(draft.subject) || '—'}</strong><iframe title="Mail şablonu önizlemesi" sandbox="" referrerPolicy="no-referrer" srcDoc={preview(draft.body, true) || '<p>HTML girin.</p>'} /></div>
          : <div className="wa-preview"><header><strong>{sample.registration.fullName}</strong><small>{sample.registration.phone}</small></header>
            <div className="wa-chat">{draft.body.trim() ? <div className="wa-bubble">{preview(draft.body)}</div> : <p className="help">Mesaj metni yazdıkça burada görünür.</p>}</div></div>}
      </div>
    </div>}
    </>}
  </section>
}
