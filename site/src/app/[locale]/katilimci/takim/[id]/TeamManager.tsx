'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Crown, ExternalLink, Loader2, LogOut, Send, Trash2, UserMinus, X } from 'lucide-react'
import { Link, useRouter } from '@/i18n/routing'
import { takim, uploadTeamImage } from '@/lib/teams/client'
import type { TeamPublic } from '@/lib/teams/types'
import { validateDesign, type TeamPageDesign } from '@/lib/teams/design'
import TeamPageEditor from '@/components/teams/TeamPageEditor'
import ParticipantAuth from '@/components/teams/ParticipantAuth'
import { AutoSessionBar } from '@/components/teams/SessionBar'
import { CONTACT_LABELS, CONTACT_TYPES, PHONE_MESSAGE, looksLikePhone, type ContactType, type TeamContact } from '@/lib/teams/contact'
import { Button, Card, ConfirmDialog, Field, Notice, VitrinNoticeDialog, inputClass, statusLabel } from '@/components/teams/ui'
import { Desen } from '@/components/kit'

type Detail = {
  team: TeamPublic
  status: 'draft' | 'pending' | 'approved' | 'accepted' | 'rejected'
  adminNote: string | null
  /** Proje teslim edildi: kadro kilitli (ayrılma/çıkarma/yeni üye yok) */
  rosterLocked?: boolean
  design: unknown
  isCaptain: boolean
  inviteCode: string | null
  /** Kaptana: takım sayfasında kalan düzenleme hakkı (0 → yönetim açana kadar kilitli) */
  editsLeft?: number | null
  limits: { min: number; max: number }
  event: { id: string; title: string; slug: string; submission: { open: boolean; reason?: string | null; deadline: string | null } }
  submission: { projectName: string; summary: string; githubUrl: string; demoUrl: string; videoUrl: string; submittedAt: string | null }
  applications: Array<{ id: string; name: string; message: string; createdAt: string }>
  members: Array<{ id: string; name: string; role: 'captain' | 'member'; isMe: boolean }>
  contact: TeamContact | null
}

const statusStyle: Record<string, string> = {
  draft: 'bg-yuzey text-murekkep',
  pending: 'bg-limon text-murekkep',
  approved: 'bg-gok text-murekkep',
  accepted: 'bg-nane text-murekkep',
  rejected: 'bg-pembe text-murekkep',
}

export default function TeamManager({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'error'>('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [name, setName] = useState('')
  const [submission, setSubmission] = useState<Detail['submission'] | null>(null)
  const [copied, setCopied] = useState(false)
  const [contactType, setContactType] = useState<ContactType>('telegram')
  const [contactValue, setContactValue] = useState('')
  // Uygulama içi onay: üye çıkarma, takımdan ayrılma ya da kaptanlık devri (devirde takım adı yazılır)
  const [confirming, setConfirming] = useState<{ kind: 'remove' | 'captain'; id: string; name: string } | { kind: 'leave' | 'disband' } | null>(null)
  const [transferName, setTransferName] = useState('')
  const [transferError, setTransferError] = useState('')
  const router = useRouter()
  const closeConfirm = useCallback(() => { setConfirming(null); setTransferName(''); setTransferError('') }, [])

  const apply = useCallback((r: Awaited<ReturnType<typeof takim<Detail>>>) => {
    if (r.ok) {
      setDetail(r); setName(r.team.name); setSubmission(r.submission); setState('ready')
      setContactType(r.contact?.type ?? 'telegram'); setContactValue(r.contact?.value ?? '')
    } else if (r.status === 401) setState('login')
    else { setError(r.error); setState('error') }
  }, [])
  const load = useCallback(async () => apply(await takim<Detail>(`teams/${id}`)), [apply, id])
  useEffect(() => {
    let alive = true
    takim<Detail>(`teams/${id}`).then((r) => { if (alive) apply(r) })
    return () => { alive = false }
  }, [apply, id])

  async function act(key: string, path: string, body: unknown, success: string) {
    setBusy(key); setError(''); setNotice('')
    const r = await takim(path, body)
    setBusy('')
    if (r.ok) { setNotice(success); await load() } else setError(r.error)
  }

  if (state === 'loading') return <div className="flex items-center gap-2 font-display font-bold text-soluk"><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…</div>
  if (state === 'login') return <Card><ParticipantAuth onDone={() => { setState('loading'); void load() }} /></Card>
  // Yanlış hesapla girildiyse (ör. "Bu takımın üyesi değilsiniz") buradan çıkılıp doğru hesapla girilebilir
  const bar = <AutoSessionBar refreshKey={state} onLoggedOut={() => { setDetail(null); setState('login') }} />
  if (state === 'error' || !detail) return <div className="space-y-4">{bar}<Notice kind="error">{error || 'Takım açılamadı.'}</Notice></div>

  const { team, isCaptain, limits } = detail
  const editableName = isCaptain && (detail.status === 'draft' || detail.status === 'rejected')
  const canSubmitForApproval = isCaptain && (detail.status === 'draft' || detail.status === 'rejected')
  // Erken onay: takım dolmadan (en az kaptanla) onaya gönderilebilir; alt sınır proje tesliminde aranır
  const enoughMembers = team.memberCount >= 1 && team.memberCount <= limits.max
  const visible = detail.status === 'approved' || detail.status === 'accepted'
  const locked = detail.rosterLocked === true
  const full = team.memberCount >= limits.max
  const seeking = visible && !full && !locked

  async function confirmAction() {
    if (!confirming) return
    if (confirming.kind === 'remove') {
      const { id: membershipId, name: memberName } = confirming
      await act(`rm-${membershipId}`, `teams/${id}/members/${membershipId}`, { action: 'remove' }, `${memberName} takımdan çıkarıldı.`)
      setConfirming(null)
      return
    }
    if (confirming.kind === 'captain') {
      const sameName = transferName.trim().toLocaleLowerCase('tr') === detail!.team.name.trim().toLocaleLowerCase('tr')
      if (!sameName) return setTransferError('Onay için takım adını aynen yaz.')
      setBusy('captain'); setError(''); setNotice(''); setTransferError('')
      const r = await takim(`teams/${id}/captain`, { membershipId: confirming.id, confirmName: transferName })
      setBusy('')
      if (!r.ok) return setTransferError(r.error)
      closeConfirm()
      setNotice(`Kaptanlık ${confirming.name} kişisine devredildi. Takımda üye olarak devam ediyorsun.`)
      void load()
      return
    }
    if (confirming.kind === 'disband') {
      if (transferName.trim().toLocaleLowerCase('tr') !== detail!.team.name.trim().toLocaleLowerCase('tr')) return setTransferError('Onay için takım adını aynen yaz.')
      setBusy('disband'); setError(''); setNotice(''); setTransferError('')
      const r = await takim(`teams/${id}/disband`, { confirmName: transferName })
      setBusy('')
      if (!r.ok) return setTransferError(r.error)
      closeConfirm()
      router.push(`/etkinlikler/${detail!.event.slug}#takim-kayit`)
      return
    }
    setBusy('leave'); setError(''); setNotice('')
    const r = await takim(`teams/${id}/leave`, {})
    setBusy(''); setConfirming(null)
    // Ayrılan üye bu sayfayı artık göremez; etkinlik sayfasında yeniden istek gönderebilir ya da başka takıma katılabilir
    if (r.ok) router.push(`/etkinlikler/${detail!.event.slug}#takim-kayit`)
    else setError(r.error)
  }
  const contactPhone = contactValue.trim() !== '' && looksLikePhone(contactValue)

  return (
    <div className="space-y-8">
      {bar}
      <VitrinNoticeDialog show={detail.status === 'pending' || detail.status === 'approved'} />
      <header className="relative space-y-3 overflow-hidden rounded-[2rem] border border-kenar bg-ana px-6 py-8 text-white shadow-sert-lg sm:px-9 sm:py-10">
        <Desen />
        <Link href={`/etkinlikler/${detail.event.slug}`} className="relative inline-flex max-w-full items-center rounded-full border border-white/70 px-3 py-1 font-display text-xs font-bold transition-colors hover:bg-white hover:text-murekkep"><span className="truncate">← {detail.event.title}</span></Link>
        <div className="relative flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">{team.name}</h1>
          <span style={{ rotate: '-3deg' }} className={`inline-block rounded-xl border border-kenar px-3 py-1 font-display text-sm font-extrabold shadow-sert-sm ${statusStyle[detail.status]}`}>{statusLabel[detail.status]}</span>
        </div>
        <p className="relative text-sm leading-relaxed opacity-85">{team.memberCount}/{limits.max} kişi · takım dolmadan da onaya gönderilebilir; proje teslimi için en az {limits.min} kişi gerekir</p>
        {visible && (
          <Link href={`/etkinlikler/${detail.event.slug}/takimlar/${team.slug}`} className="dugme dugme-limon relative"><ExternalLink className="w-4 h-4" /> Herkese açık takım sayfası</Link>
        )}
      </header>

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {detail.status === 'rejected' && <Notice kind="error">Takım yönetim tarafından reddedildi.{detail.adminNote ? ` Not: ${detail.adminNote}` : ''} Düzeltip yeniden onaya gönderebilirsin.</Notice>}
      {detail.status === 'pending' && <Notice>Takımın yönetim onayını bekliyor. Onaylanınca etkinlik sayfasında yayımlanır.</Notice>}
      {detail.status === 'approved' && <Notice>Başvurun alındı; takımın etkinlik sayfasında &quot;Başvuran takımlar&quot; arasında listeleniyor. Kabul edilecek takımları yönetim seçecek; proje teslimi yalnız kabul edilen takımlar içindir.</Notice>}
      {(detail.status === 'pending' || detail.status === 'approved') && (
        <Notice kind="alert">
          <span className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <strong>{isCaptain ? 'Kaptan' : 'Takım üyesi'} olarak dikkat: onay, etkinliğe katılım hakkı değildir.</strong> Onaylanan takım yalnızca üye
              toplayabilir ve bir sonraki aşama olan seçim sürecine girer. Etkinliğe katılacak takımlar yönetim tarafından seçilir ve
              &quot;Kabul edilen takımlar&quot; bölümünde duyurulur; kabul edilene kadar katılımın kesinleşmiş sayılmaz.
            </span>
          </span>
        </Notice>
      )}
      {detail.status === 'accepted' && <Notice kind="success">Takımın kabul edildi ve etkinlik sayfasında &quot;Kabul edilen takımlar&quot; arasında listeleniyor.</Notice>}
      {seeking && <Notice>Takımın etkinlik sayfasında &quot;üye arıyor&quot; olarak listeleniyor. Takımı olmayan katılımcıların isteklerini aşağıdan kabul edebilirsin.</Notice>}
      {visible && full && !locked && <Notice>Takım dolu; yeni katılma isteği alınmıyor. Bir üye ayrılırsa takım yeniden isteklere açılır.</Notice>}
      {locked && <Notice>Takım kabul edildiği ya da proje teslim edildiği için kadro kilitli. Üye değişikliği için yönetimle iletişime geç.</Notice>}

      {isCaptain && detail.inviteCode && (
        <Card className="space-y-3 !bg-limon !text-murekkep">
          <p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] opacity-75">Davet kodu</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-2xl border border-kenar bg-white px-4 py-2 font-mono text-2xl font-black tracking-[0.3em] text-murekkep">{detail.inviteCode}</code>
            <Button variant="ghost" onClick={async () => { await navigator.clipboard?.writeText(detail.inviteCode ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <p className="text-sm leading-relaxed opacity-80">Takım arkadaşların bu kodu etkinlik sayfasındaki &quot;Takıma katıl&quot; bölümüne girer; başvuruları aşağıda onaylarsın.</p>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">Üyeler</h2>
        <Card className="divide-y-2 divide-dashed divide-kenar/20 !py-2">
          {detail.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0 break-words font-display font-bold text-murekkep">{m.name}{m.isMe ? ' (sen)' : ''} <span className={`rozet ml-2 align-middle ${m.role === 'captain' ? 'bg-limon' : 'bg-zemin-2 !text-murekkep'}`}>{m.role === 'captain' ? 'Kaptan' : 'Üye'}</span></span>
              {isCaptain && m.role !== 'captain' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={!!busy} onClick={() => setConfirming({ kind: 'captain', id: m.id, name: m.name })}><Crown className="w-4 h-4" /> Kaptan yap</Button>
                  {!locked && <Button variant="danger" disabled={!!busy} onClick={() => setConfirming({ kind: 'remove', id: m.id, name: m.name })}><UserMinus className="w-4 h-4" /> Çıkar</Button>}
                </div>
              )}
            </div>
          ))}
        </Card>
      </section>

      {isCaptain && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">Katılma başvuruları</h2>
          {detail.applications.length === 0 && <p className="text-sm text-soluk">Bekleyen başvuru yok.</p>}
          {detail.applications.map((a) => (
            <Card key={a.id} className="!p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 break-words font-display font-bold text-murekkep">{a.name}</span>
                <div className="flex gap-2">
                  <Button disabled={!!busy} onClick={() => act(`a-${a.id}`, `teams/${id}/members/${a.id}`, { action: 'accept' }, `${a.name} takıma alındı.`)}><Check className="w-4 h-4" /> Kabul</Button>
                  <Button variant="danger" disabled={!!busy} onClick={() => act(`r-${a.id}`, `teams/${id}/members/${a.id}`, { action: 'reject' }, 'Başvuru reddedildi.')}><X className="w-4 h-4" /> Ret</Button>
                </div>
              </div>
              {a.message && <p className="whitespace-pre-wrap break-words rounded-2xl border border-kenar bg-zemin-2 p-3 text-sm text-murekkep">{a.message}</p>}
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">İletişim adresi</h2>
        <Card className="space-y-4">
          {isCaptain ? (
            <>
              <p className="text-sm leading-relaxed text-soluk">Takıma katılmak isteyenler sana buradan ulaşır. Yalnız giriş yapmış katılımcılara gösterilir.</p>
              <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                <Field label="Tür">
                  <select className={inputClass} value={contactType} onChange={(e) => setContactType(e.target.value as ContactType)}>
                    {CONTACT_TYPES.map((t) => <option key={t} value={t}>{CONTACT_LABELS[t]}</option>)}
                  </select>
                </Field>
                <Field label={contactType === 'email' ? 'E-posta' : 'Kullanıcı adı'} hint="Telefon numarası yazmayın.">
                  <input className={inputClass} value={contactValue} maxLength={120} placeholder={contactType === 'email' ? 'ornek@gmail.com' : '@kullaniciadi'}
                    onChange={(e) => setContactValue(e.target.value)} aria-invalid={contactPhone || undefined} />
                </Field>
              </div>
              {contactPhone && <Notice kind="error">{PHONE_MESSAGE}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy === 'contact' || contactPhone || contactValue.trim() === ''}
                  onClick={() => act('contact', `teams/${id}/update`, { contact: { type: contactType, value: contactValue } }, 'İletişim adresi kaydedildi.')}>
                  {busy === 'contact' && <Loader2 className="w-4 h-4 animate-spin" />} Kaydet
                </Button>
                {detail.contact && (
                  <Button variant="ghost" disabled={busy === 'contact-rm'} onClick={() => act('contact-rm', `teams/${id}/update`, { contact: null }, 'İletişim adresi kaldırıldı.')}>Kaldır</Button>
                )}
              </div>
            </>
          ) : detail.contact ? (
            <p className="break-words text-sm text-murekkep"><span className="font-bold">{CONTACT_LABELS[detail.contact.type]}:</span> {detail.contact.value}</p>
          ) : (
            <p className="text-sm text-soluk">Kaptan henüz iletişim adresi bırakmadı.</p>
          )}
        </Card>
      </section>

      {canSubmitForApproval && (
        <Card className="space-y-3">
          <p className="text-sm leading-relaxed text-soluk">Takım dolmadan da yönetim onayına gönderebilirsin; onaylanırsa etkinlik sayfasında &quot;üye arıyor&quot; olarak listelenir ve takımı olmayanlar katılma isteği gönderebilir. Onaya gönderdikten sonra takım adı kilitlenir.</p>
          <Button disabled={!enoughMembers || busy === 'submit'} onClick={() => act('submit', `teams/${id}/submit`, {}, 'Takım onaya gönderildi.')}>
            {busy === 'submit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Onaya gönder
          </Button>
          {!enoughMembers && <p className="text-xs text-soluk">Takım en çok {limits.max} kişi olabilir.</p>}
        </Card>
      )}

      {isCaptain && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">Takım sayfası</h2>
          {typeof detail.editsLeft === 'number' && (detail.editsLeft === 0
            ? <Notice kind="error">Çok sık düzenleme yaptınız. Düzenlemeye devam etmek için yönetimle iletişime geçin.</Notice>
            : detail.editsLeft <= 10 && <p className="text-xs font-semibold text-soluk">Kalan düzenleme hakkı: {detail.editsLeft}</p>)}
          {editableName && (
            <Card className="space-y-4">
              <Field label="Takım adı" hint="Onaya gönderdikten sonra değiştirilemez.">
                <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button disabled={busy === 'save' || name.trim() === team.name} onClick={() => act('save', `teams/${id}/update`, { name }, 'Takım adı kaydedildi.')}>
                {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Adı kaydet
              </Button>
            </Card>
          )}
          <TeamPageEditor
            team={team}
            initialDesign={validateDesign(detail.design)}
            onSave={async (design: TeamPageDesign) => {
              const r = await takim(`teams/${id}/update`, { design })
              if (!r.ok) throw new Error(r.error)
              setNotice('Sayfa tasarımı kaydedildi.')
              void load()
            }}
            onUploadGif={async (file: File) => uploadTeamImage(id, 'gif', file)}
            onUploadImage={async (kind: 'logo' | 'cover', file: File) => {
              const uploaded = await uploadTeamImage(id, kind, file)
              const r = await takim(`teams/${id}/update`, { [kind]: Number(uploaded.id) })
              if (!r.ok) throw new Error(r.error)
              return { url: uploaded.url }
            }}
            onClearImage={async (kind: 'logo' | 'cover') => {
              const r = await takim(`teams/${id}/update`, { [kind]: null })
              if (!r.ok) throw new Error(r.error)
              void load()
            }}
          />
        </section>
      )}

      {detail.status === 'accepted' && submission && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">Proje teslimi</h2>
          <Card className="space-y-4">
            {!detail.event.submission.open && <Notice>{detail.event.submission.reason || 'Proje teslimi şu an kapalı.'}</Notice>}
            {detail.event.submission.deadline && <p className="text-xs text-soluk">Son tarih: {new Date(detail.event.submission.deadline).toLocaleString('tr-TR')}</p>}
            {submission.submittedAt && <Notice kind="success">Son teslim: {new Date(submission.submittedAt).toLocaleString('tr-TR')}</Notice>}
            <fieldset disabled={!isCaptain || !detail.event.submission.open} className="space-y-4 disabled:opacity-70">
              <Field label="Proje adı"><input className={inputClass} maxLength={100} value={submission.projectName} onChange={(e) => setSubmission({ ...submission, projectName: e.target.value })} /></Field>
              <Field label="Amaç / açıklama"><textarea className={`${inputClass} resize-y min-h-28`} maxLength={3000} value={submission.summary} onChange={(e) => setSubmission({ ...submission, summary: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="GitHub"><input className={inputClass} type="url" placeholder="https://" maxLength={300} value={submission.githubUrl} onChange={(e) => setSubmission({ ...submission, githubUrl: e.target.value })} /></Field>
                <Field label="Demo"><input className={inputClass} type="url" placeholder="https://" maxLength={300} value={submission.demoUrl} onChange={(e) => setSubmission({ ...submission, demoUrl: e.target.value })} /></Field>
                <Field label="Video"><input className={inputClass} type="url" placeholder="https://" maxLength={300} value={submission.videoUrl} onChange={(e) => setSubmission({ ...submission, videoUrl: e.target.value })} /></Field>
              </div>
              {isCaptain && (
                <Button disabled={busy === 'sub'} onClick={() => act('sub', `teams/${id}/submission`, {
                  projectName: submission.projectName, summary: submission.summary, githubUrl: submission.githubUrl, demoUrl: submission.demoUrl, videoUrl: submission.videoUrl,
                }, 'Proje teslim edildi.')}>{busy === 'sub' && <Loader2 className="w-4 h-4 animate-spin" />} Teslim et</Button>
              )}
            </fieldset>
          </Card>
        </section>
      )}

      {!isCaptain && !locked && (
        <div className="space-y-2">
          <Button variant="danger" disabled={!!busy} onClick={() => setConfirming({ kind: 'leave' })}><LogOut className="w-4 h-4" /> Takımdan ayrıl</Button>
          <p className="text-xs text-soluk">Ayrıldıktan sonra bu takıma yeniden istek gönderebilir ya da başka bir takıma katılabilirsin.</p>
        </div>
      )}
      {isCaptain && !locked && detail.members.length <= 1 && (
        <div className="space-y-2">
          <Button variant="danger" disabled={!!busy} onClick={() => setConfirming({ kind: 'disband' })}><Trash2 className="w-4 h-4" /> Takımı dağıt</Button>
          <p className="text-xs text-soluk">Takımda yalnız sen kaldığın için takımı dağıtabilirsin. Takım silinir; sonra yeni takım kurabilir ya da başka bir takıma katılabilirsin.</p>
        </div>
      )}
      {isCaptain && (locked || detail.members.length > 1) && <p className="text-xs text-soluk">Kaptan takımdan ayrılamaz. Ayrılman gerekiyorsa önce kaptanlığı bir üyeye devret (üye listesinde &quot;Kaptan yap&quot;). Takımda yalnız sen kalırsan takımı dağıtabilirsin.</p>}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.kind === 'remove' ? 'Üyeyi çıkar' : confirming?.kind === 'captain' ? 'Kaptanlığı devret' : confirming?.kind === 'disband' ? 'Takımı dağıt' : 'Takımdan ayrıl'}
        confirmLabel={confirming?.kind === 'remove' ? 'Çıkar' : confirming?.kind === 'captain' ? 'Kaptanlığı devret' : confirming?.kind === 'disband' ? 'Takımı dağıt' : 'Ayrıl'}
        busy={busy !== ''}
        onCancel={closeConfirm}
        onConfirm={() => { void confirmAction() }}
      >
        {confirming?.kind === 'captain' ? (
          <div className="space-y-3">
            <p><strong>{confirming.name}</strong> takımın yeni kaptanı olacak. Sen üye olarak kalırsın; takım sayfasını düzenleme, başvuruları yönetme ve proje teslimi ona geçer. Bu işlemi yalnız yeni kaptan geri devredebilir.</p>
            <Field label={`Onaylamak için takım adını yaz: ${team.name}`}>
              <input className={inputClass} value={transferName} onChange={(e) => { setTransferName(e.target.value); setTransferError('') }} autoComplete="off" maxLength={60} />
            </Field>
            {transferError && <Notice kind="error">{transferError}</Notice>}
          </div>
        ) : confirming?.kind === 'disband' ? (
          <div className="space-y-3">
            <p><strong>{team.name}</strong> takımı silinecek; bekleyen katılma istekleri de kapanır. Bu işlem geri alınamaz.</p>
            <Field label={`Onaylamak için takım adını yaz: ${team.name}`}>
              <input className={inputClass} value={transferName} onChange={(e) => { setTransferName(e.target.value); setTransferError('') }} autoComplete="off" maxLength={60} />
            </Field>
            {transferError && <Notice kind="error">{transferError}</Notice>}
          </div>
        ) : confirming?.kind === 'remove'
          ? <p><strong>{confirming.name}</strong> takımdan çıkarılacak. Kişi daha sonra yeniden katılma isteği gönderebilir.</p>
          : <p><strong>{team.name}</strong> takımından ayrılacaksın. Bu sayfaya erişimin kapanır; istersen yeniden istek gönderebilirsin.</p>}
      </ConfirmDialog>
    </div>
  )
}
