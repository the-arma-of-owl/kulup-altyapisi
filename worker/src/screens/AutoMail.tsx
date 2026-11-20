import { useRef, useState } from 'react'
import type { EmailTemplate, WorkerEvent } from '../../shared/types'
import { fillTemplate } from '../../shared/templateVars'
import { api } from '../api'
import { KULUP, hostOf } from '../../shared/kulup'
import { EmailHtmlEditor, VariableButtons, insertAtCursor } from '../ui/EmailHtmlEditor'

// Form gönderilince CMS'in başvurana kendiliğinden attığı "başvurunuz alındı" mailleri.
// Her tür için tek genel (etkinliksiz) şablon düzenlenir; CMS aktif olanı kullanır.
const kinds = [
  { purpose: 'member-application-received', title: 'Üyelik başvurusu alındı', what: 'Üyelik başvurun', event: false },
  { purpose: 'event-registration-received', title: 'Etkinlik kaydı alındı', what: '{{etkinlik}} kaydın', event: true },
  { purpose: 'coreteam-application-received', title: 'Core Team başvurusu alındı', what: 'Core Team başvurun', event: false },
] as const
type Kind = typeof kinds[number]
const vars = (kind: Kind) => kind.event ? ['adSoyad', 'ad', 'etkinlik', 'tarih', 'saat', 'konum', 'konumLinki'] as const : ['adSoyad', 'ad'] as const

const defaultHtml = (kind: Kind) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:14px;color:#111827">
  <h2 style="margin:0 0 16px;color:${KULUP.tema.anaRenk}">${KULUP.tamAd}</h2>
  <p>Merhaba {{ad}},</p>
  <p>${kind.what} bize ulaştı, teşekkür ederiz! Başvurunu inceleyip en kısa sürede sana dönüş yapacağız.</p>${kind.event ? `
  <p style="color:#4b5563;font-size:14px">📅 {{tarih}} {{saat}} · 📍 {{konum}}</p>` : ''}
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Bu otomatik bir bilgilendirme mailidir, lütfen yanıtlamayın.<br>${KULUP.kisaAd} · ${hostOf(KULUP.adresler.site)}</p>
</div>`
const defaultSubject = (kind: Kind) => kind.event ? '{{etkinlik}} kaydın alındı ✅' : `${kind.title} ✅`

export function AutoMailPanel({ templates, events, refresh, run }: {
  templates: EmailTemplate[]; events: WorkerEvent[]; refresh: () => Promise<void>
  run: (action: () => Promise<void>) => Promise<void>
}) {
  const [open, setOpen] = useState<Kind | null>(null)
  const [form, setForm] = useState({ subject: '', html: '', isActive: true })
  const [notice, setNotice] = useState('')
  const subjectRef = useRef<HTMLInputElement>(null)
  const [recipient, setRecipient] = useState(() => { try { return localStorage.getItem('kulup-test-recipient') || '' } catch { return '' } })
  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())
  const current = (kind: Kind) => templates.find((t) => t.purpose === kind.purpose && t.relatedEvent == null)
  const sampleEvent = events[0]
  const sample = (text: string, html: boolean) => sampleEvent
    ? fillTemplate(text, { registration: { id: 0, event: sampleEvent.id, fullName: 'Ayşe Yılmaz', email: 'ornek@example.com', status: 'pending' }, event: sampleEvent }, html)
    : { text, warnings: [] }

  const edit = (kind: Kind) => {
    const t = current(kind)
    setNotice('')
    setForm(t ? { subject: t.subject, html: t.html, isActive: Boolean(t.isActive) } : { subject: defaultSubject(kind), html: defaultHtml(kind), isActive: true })
    setOpen(kind)
  }
  const save = () => void run(async () => {
    if (!open) return
    const t = current(open)
    if (t) await api(`/templates/${t.id}`, 'PATCH', form)
    else await api('/templates', 'POST', { ...form, name: `Otomatik — ${open.title}`, purpose: open.purpose, whatsappText: '', relatedEvent: null })
    await refresh()
    setNotice('Kaydedildi.')
  })
  const testMail = () => void run(async () => {
    const result = await api<{ to: string }>('/templates/test-mail', 'POST', { recipient: recipient.trim(), subject: form.subject, html: form.html })
    try { localStorage.setItem('kulup-test-recipient', recipient.trim()) } catch { /* yalnızca kolaylık */ }
    setNotice(`Örnek verilerle test maili ${result.to} adresine gönderildi.`)
  })

  return <div className="auto-mails">
    <p className="help">Site formundan başvuru gelince başvurana kendiliğinden giden mailler. Pasif veya boşsa mail gitmez.</p>
    <div className="auto-cards">{kinds.map((kind) => {
      const t = current(kind)
      const state = !t ? 'Yok' : t.isActive ? 'Aktif' : 'Pasif'
      return <div className="card" key={kind.purpose}>
        <h2>{kind.title}</h2>
        <p><span className={`status ${state === 'Aktif' ? 'accepted' : state === 'Pasif' ? 'waitlist' : 'rejected'}`}>{state}</span></p>
        <small>{t?.updatedAt ? `Son güncelleme: ${new Date(t.updatedAt).toLocaleString('tr-TR')}` : 'Henüz şablon yok — hazır taslakla başlayabilirsiniz.'}</small>
        <div className="actions"><button className="primary" onClick={() => edit(kind)}>Düzenle</button></div>
      </div>
    })}</div>
    {open && <div className="automatic-mail-editor">
      <div className="card form-grid">
      <h2>{open.title}</h2>
      {notice && <div className="notice success" role="status">{notice}</div>}
      <label>Konu<input ref={subjectRef} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></label>
      <VariableButtons variables={vars(open)} onInsert={(key) => insertAtCursor(subjectRef, form.subject, (subject) => setForm((f) => ({ ...f, subject })), key)} />
      <div className="field-block"><span>Mail içeriği</span>
        <EmailHtmlEditor key={open.purpose} html={form.html} onChange={(html) => setForm((f) => ({ ...f, html }))} variables={vars(open)} /></div>
      <label className="toggle-row automatic-mail-active"><span><strong>Aktif</strong><small>Formdan başvuru gelince kendiliğinden gönderilsin</small></span><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /></label>
      <div className="test-mail">
        <label>Test maili alıcısı<input type="email" inputMode="email" placeholder="ornek@example.com" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
        <div className="actions">
          <button className="primary" onClick={save}>Kaydet</button>
          <button onClick={testMail} disabled={!form.subject.trim() || !form.html.trim() || !validRecipient}>Test maili gönder</button>
          <button onClick={() => setOpen(null)}>Kapat</button>
        </div>
      </div>
      </div>
      <div className="mail-preview-card automatic-mail-preview"><div className="mail-preview-card__header"><span>Önizleme · örnek: Ayşe Yılmaz{open.event && sampleEvent ? `, ${sampleEvent.title}` : ''}</span>
        <strong>{sample(form.subject, false).text || '(konu yok)'}</strong></div>
        <iframe title="Otomatik mail önizleme" sandbox="" referrerPolicy="no-referrer" srcDoc={sample(form.html, true).text} />
      </div>
    </div>}
  </div>
}
