'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus, Send, UserPlus, Users } from 'lucide-react'
import { useRouter } from '@/i18n/routing'
import { takim, type ApplicationStatus, type Me } from '@/lib/teams/client'
import { teamSizeLabel, type TeamPublic } from '@/lib/teams/types'
import EventRegistrationForm, { type RegistrationField } from '@/app/[locale]/etkinlikler/[slug]/EventRegistrationForm'
import ParticipantAuth, { MANUAL_FALLBACK } from './ParticipantAuth'
import SessionBar from './SessionBar'
import { useHuman } from './useHuman'
import { Button, Card, Field, Notice, VitrinNoticeDialog, inputClass, statusLabel } from './ui'

type Props = {
  eventId: string
  open: boolean
  closedReason?: string
  limits: { min: number; max: number }
  /** Normal etkinlik başvurusunun alanları (aynı form, aynı özel sorular) */
  registrationFields: RegistrationField[]
  registrationStage: 'open' | 'waitlist' | 'closed'
  /** Harici kayıt formu kullanılıyorsa sitede başvuru adımı yok */
  externalRegistration: boolean
  /** Onaylı ama dolmamış ("üye arıyor") takımlar */
  seekingTeams: TeamPublic[]
}

type Step = 'form' | 'account' | 'team'

/**
 * Takım modundaki etkinliğin kayıt bölümü. Sıra:
 *  1) normal etkinlik başvurusu (aynı form ve özel sorular),
 *  2) katılımcı hesabı (giriş / kayıt — başvurudaki e-postayla),
 *  3) takım kur, davet koduyla katıl ya da "üye arıyor" takımlarından birine istek gönder.
 * Sunucu (CMS) da takım kurma/katılmada başvuru şartını denetler.
 */
export default function TeamRegistration({ eventId, open, closedReason, limits, registrationFields, registrationStage, externalRegistration, seekingTeams }: Props) {
  const router = useRouter()
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [application, setApplication] = useState<ApplicationStatus['application'] | null>(null)
  const [applied, setApplied] = useState<{ fullName: string; email: string } | null>(null)
  // Başvurudan sonra hesap: kod bekleniyor (verify) ya da var olan hesaba giriş (login)
  const [account, setAccount] = useState<{ mode: 'verify' | 'login' | 'register'; password: string; info: string; manual?: string } | null>(null)
  const [accountBusy, setAccountBusy] = useState(false)
  const [forceAccount, setForceAccount] = useState<'login' | 'register' | null>(null)
  const [choice, setChoice] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<{ team: { id: string; name: string; memberCount: number; maxMembers: number; full?: boolean; closedReason?: string | null }; event: { id: string; title: string } } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  // Hesap açma ve takım kurma Turnstile ister; kutu tek, görünmeden geçer
  const human = useHuman()

  const refresh = useCallback(async () => {
    const r = await takim<Me>('me')
    if (!r.ok) { setMe(null); setApplication(null); return }
    setMe(r)
    const a = await takim<ApplicationStatus>(`events/${eventId}/application`)
    setApplication(a.ok ? a.application : null)
  }, [eventId])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await takim<Me>('me')
      if (!alive) return
      if (!r.ok) { setMe(null); return }
      const a = await takim<ApplicationStatus>(`events/${eventId}/application`)
      if (!alive) return
      setMe(r)
      setApplication(a.ok ? a.application : null)
    })()
    return () => { alive = false }
  }, [eventId])

  const mine = me?.teams.find((t) => t.event.id === String(eventId))
  const hasApplication = externalRegistration || application === 'applied'

  // Hangi adım? Hesapla girilmişse başvuru durumu sunucudan; girilmemişse yerel ilerleme
  let step: Step
  if (me) step = hasApplication ? 'team' : 'form'
  else step = applied || forceAccount || externalRegistration ? 'account' : 'form'

  // Hesap adımına geçilince ("zaten başvurdum" düğmesi uzun formun altında kalıyor) kart ekrana gelsin, ilk boş alana odaklan
  const accountRef = useRef<HTMLDivElement>(null)
  const prevStep = useRef(step)
  useEffect(() => {
    const entered = step === 'account' && prevStep.current !== 'account'
    prevStep.current = step
    const box = accountRef.current
    if (!entered || !box) return
    box.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const inputs = [...box.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=checkbox]):not([disabled])')]
    ;(inputs.find((input) => !input.value) ?? inputs[0])?.focus({ preventScroll: true })
  }, [step])

  /** Bekleyen katılma isteğini geri çeker; sonra kişi takım kurabilir ya da başka takıma başvurabilir. */
  async function withdraw(teamId: string) {
    setBusy('withdraw'); setError('')
    const r = await takim(`teams/${teamId}/leave`, {})
    setBusy('')
    if (!r.ok) return setError(r.error)
    await refresh()
  }

  /** Başvuru formu şifreyle geldiyse hesabı arka planda aç; yeni hesapta tek kod maili gider. */
  async function afterApplication(data: { fullName: string; email: string; password?: string }) {
    setApplied(data)
    if (me) { void refresh(); return }
    if (!data.password) return
    const password = data.password
    setAccountBusy(true)
    try {
      const reg = await takim<{ manual?: boolean; message?: string }>('auth/register', { email: data.email, password, fullName: data.fullName, kvkk: true }, await human.take())
      if (!reg.ok) return setAccount({ mode: 'register', password: '', info: reg.error })
      // Doğrulama maili gidemediyse: yönetim elle onaylayacak (giriş denenmez)
      if (reg.manual) return setAccount({ mode: 'login', password: '', info: '', manual: reg.message ?? MANUAL_FALLBACK })
      // Doğrulanmış hesabı aynı şifreyle varsa doğrudan girer; yeni hesapta "doğrulanmadı" döner (kod register'da gitti)
      const login = await takim('auth/login', { email: data.email, password })
      if (login.ok) { setAccount(null); return void refresh() }
      if (login.code === 'not_verified') {
        return setAccount({ mode: 'verify', password, info: `${data.email} adresine 6 haneli bir kod gönderdik. Kodu gir, takım adımına geç. (15 dakika geçerli)` })
      }
      setAccount({ mode: 'login', password: '', info: 'Bu e-postayla daha önce katılımcı hesabı açılmış. O hesabın şifresiyle giriş yap (unuttuysan "Parolamı unuttum").' })
    } finally {
      setAccountBusy(false)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy('create'); setError('')
    const r = await takim<{ team: { id: string } }>('teams', { eventId: Number(eventId), name }, await human.take())
    setBusy('')
    if (r.ok) router.push(`/katilimci/takim/${r.team.id}`)
    else setError(r.error)
  }

  async function lookup(event: React.FormEvent) {
    event.preventDefault()
    setBusy('lookup'); setError(''); setPreview(null)
    const r = await takim<NonNullable<typeof preview>>('join/preview', { code })
    setBusy('')
    if (!r.ok) return setError(r.error)
    if (r.event.id !== String(eventId)) return setError('Bu davet kodu başka bir etkinliğin takımına ait.')
    setPreview(r)
  }

  async function join(body: { code: string } | { teamId: number }, key: string) {
    setBusy(key); setError('')
    const r = await takim('join', { ...body, message })
    setBusy('')
    if (r.ok) { setDone('İsteğin takım kaptanına iletildi. Kaptan kabul edince takımda görünürsün.'); void refresh() }
    else setError(r.error)
  }

  const steps: Array<{ id: Step; label: string }> = [
    ...(externalRegistration ? [] : [{ id: 'form' as const, label: 'Başvuru' }]),
    { id: 'account', label: externalRegistration ? 'Katılımcı hesabı' : 'E-posta kodu' },
    { id: 'team', label: 'Takım' },
  ]
  const stepIndex = steps.findIndex((s) => s.id === step)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-2xl border border-kenar bg-limon p-4 text-murekkep shadow-sert-sm"><p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] opacity-75">Takım büyüklüğü</p><p className="mt-1 font-display text-2xl font-extrabold">{teamSizeLabel(limits)}</p></div>
        <div className="rounded-2xl border border-kenar bg-gok p-4 text-murekkep shadow-sert-sm"><p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] opacity-75">Nasıl?</p><p className="mt-1 leading-relaxed">Başvur, e-postana gelen kodu gir, sonra takımını kur ya da bir takıma katıl.</p></div>
        <div className="rounded-2xl border border-kenar bg-pembe p-4 text-murekkep shadow-sert-sm"><p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] opacity-75">Takımın yok mu?</p><p className="mt-1 leading-relaxed">&quot;Üye arıyor&quot; takımlarından birine istek gönder.</p></div>
      </div>

      {me !== undefined && (
        <SessionBar
          user={me ? me.user : null}
          onLoggedOut={() => { setMe(null); setApplication(null); setApplied(null); setForceAccount(null); setChoice(null); setDone(''); setError('') }}
          onLogin={() => setForceAccount('login')}
          // Başvurular kapalıyken yerinde giriş formu (hesap adımı) gösterilmez; katılımcı sayfasındaki girişe gider
          loginHref={open ? undefined : '/katilimci'}
        />
      )}

      {!open && <Notice>{closedReason || 'Takım başvuruları şu an kapalı.'}</Notice>}

      {me === undefined && <div className="flex items-center gap-2 text-sm font-semibold text-soluk"><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…</div>}

      {me && mine && (
        <>
        <VitrinNoticeDialog show={mine.team.status === 'pending' || mine.team.status === 'approved'} />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="ust-baslik">Takımın</p>
              <p className="mt-1 break-words font-display text-2xl font-extrabold text-murekkep">{mine.team.name}</p>
              <p className="mt-1 text-sm text-soluk">
                {mine.membershipStatus === 'pending' ? 'İsteğin kaptanın onayını bekliyor.' : `${mine.role === 'captain' ? 'Kaptan' : 'Üye'} · ${statusLabel[mine.team.status] ?? mine.team.status}`}
              </p>
            </div>
            {mine.membershipStatus === 'accepted' && (
              <Button onClick={() => router.push(`/katilimci/takim/${mine.team.id}`)}><Users className="w-4 h-4" /> Takımı yönet</Button>
            )}
            {mine.membershipStatus === 'pending' && (
              <Button variant="ghost" disabled={busy === 'withdraw'} onClick={() => void withdraw(mine.team.id)}>
                {busy === 'withdraw' && <Loader2 className="w-4 h-4 animate-spin" />} İsteği geri çek
              </Button>
            )}
          </div>
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        </Card>
        </>
      )}

      {open && me !== undefined && !mine && (
        <>
          <ol className="flex flex-wrap gap-2 font-bold" aria-label="Adımlar">
            {steps.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-display text-sm ${i === stepIndex
                  ? 'border-kenar bg-ana text-white shadow-sert-sm'
                  : i < stepIndex ? 'border-kenar bg-nane text-murekkep' : 'border-kenar/30 text-soluk'}`}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span>{i + 1}.</span>} {s.label}
              </li>
            ))}
          </ol>

          {step === 'form' && (
            <div className="space-y-4">
              {me && application === 'rejected' ? (
                <Notice kind="error">Bu etkinliğe başvurun reddedildiği için takım kuramaz ya da takıma katılamazsın.</Notice>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-soluk">
                    Başvuru formunu doldur ve bir şifre belirle. Gönderince e-postana gelen kodu girip takım adımına geçersin.
                    {me && <> Formda katılımcı hesabındaki e-postayı (<strong className="text-murekkep">{me.user.email}</strong>) kullan.</>}
                  </p>
                  {me && applied && applied.email.trim().toLowerCase() !== me.user.email.toLowerCase() && (
                    <Notice kind="error">Başvurudaki e-posta ({applied.email}) bu hesabın e-postasıyla aynı değil. Doğru hesapla gir (yukarıdan çıkış yapabilirsin) ya da formu bu hesabın e-postasıyla doldur.</Notice>
                  )}
                  <EventRegistrationForm
                    key={me ? `me-${me.user.id}` : 'anon'}
                    eventId={eventId}
                    registrationFields={registrationFields}
                    registrationStage={registrationStage}
                    defaultValues={me ? { fullName: me.user.fullName, email: me.user.email } : undefined}
                    withAccount={!me}
                    onSuccess={(data) => { void afterApplication(data) }}
                  />
                  {!me && (
                    <button type="button" onClick={() => setForceAccount('login')} className="font-display text-sm font-bold text-ana-yazi underline decoration-2 underline-offset-4 hover:opacity-80">
                      Bu etkinliğe zaten başvurdum, giriş yapıp devam et →
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {step === 'account' && (
            <div ref={accountRef} className="scroll-mt-28">
            <Card className="space-y-4">
              {applied && !account && accountBusy && (
                <div className="flex items-center gap-2 text-sm font-semibold text-soluk"><Loader2 className="w-4 h-4 animate-spin" /> Başvurun alındı, hesabın hazırlanıyor…</div>
              )}
              {applied && !accountBusy && (
                <ParticipantAuth
                  key={forceAccount ?? account?.mode ?? 'register'}
                  initialMode={forceAccount ?? account?.mode ?? 'register'}
                  initialEmail={applied.email}
                  initialName={applied.fullName}
                  initialPassword={forceAccount ? '' : account?.password ?? ''}
                  initialInfo={forceAccount ? '' : account?.info ?? 'Başvurun alındı. Takım işlemleri için katılımcı hesabı oluştur.'}
                  initialManual={forceAccount ? '' : account?.manual ?? ''}
                  onDone={() => { setForceAccount(null); setAccount(null); void refresh() }}
                />
              )}
              {!applied && (
                <ParticipantAuth
                  key={forceAccount ?? 'login'}
                  initialMode={forceAccount ?? 'login'}
                  onDone={() => { setForceAccount(null); void refresh() }}
                />
              )}
              {!applied && !externalRegistration && (
                <button type="button" onClick={() => setForceAccount(null)} className="font-display text-sm font-bold text-soluk hover:text-ana-yazi">
                  ← Başvuru formuna dön
                </button>
              )}
            </Card>
            </div>
          )}

          {step === 'team' && me && (
            <Card className="space-y-5">
              <p className="text-sm leading-relaxed text-soluk">Merhaba <strong className="font-display text-murekkep">{me.user.fullName}</strong>. Başvurun alındı; şimdi bir takım kur ya da bir takıma katıl.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant={choice === 'create' ? 'primary' : 'ghost'} onClick={() => { setChoice('create'); setError('') }}><Plus className="w-4 h-4" /> Takım oluştur</Button>
                <Button variant={choice === 'join' ? 'primary' : 'ghost'} onClick={() => { setChoice('join'); setError('') }}><UserPlus className="w-4 h-4" /> Takıma katıl</Button>
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              {done && <Notice kind="success">{done}</Notice>}
              {choice === 'create' && (
                <form onSubmit={create} className="space-y-4">
                  <Field label="Takım adı" hint="Takım onaya gönderildikten sonra ad değiştirilemez. Takım dolmadan da onaya gönderebilirsin.">
                    <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required />
                  </Field>
                  <Button type="submit" disabled={busy === 'create' || name.trim().length < 2}>{busy === 'create' && <Loader2 className="w-4 h-4 animate-spin" />} Takımı kur (kaptan sen olursun)</Button>
                </form>
              )}
              {choice === 'join' && !done && (
                <div className="space-y-6">
                  <Field label="Kaptana mesajın (isteğe bağlı)">
                    <textarea className={`${inputClass} resize-none`} rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </Field>

                  <section className="space-y-3" aria-labelledby="uye-arayan-baslik">
                    <h3 id="uye-arayan-baslik" className="font-display text-lg font-extrabold text-murekkep">Üye arayan takımlar</h3>
                    {seekingTeams.length === 0 ? (
                      <p className="text-sm text-soluk">Şu an üye arayan onaylı takım yok. Davet koduyla katılabilir ya da kendi takımını kurabilirsin.</p>
                    ) : (
                      <ul className="divide-y-2 divide-kenar overflow-hidden rounded-2xl border border-kenar bg-zemin-2">
                        {seekingTeams.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <span className="min-w-0">
                              <span className="block truncate font-display font-bold text-murekkep">{t.name}</span>
                              <span className="text-xs font-semibold text-soluk">{t.memberCount}/{t.maxMembers} kişi</span>
                            </span>
                            <Button variant="ghost" disabled={!!busy} onClick={() => join({ teamId: Number(t.id) }, `t-${t.id}`)}>
                              {busy === `t-${t.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} İstek gönder
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <form onSubmit={lookup} className="space-y-4">
                    <Field label="Davet kodu" hint="Arkadaşının takımına katılmak için kodu kaptandan al (8 karakter).">
                      <input className={`${inputClass} font-mono uppercase tracking-[0.3em]`} value={code} maxLength={8}
                        onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setPreview(null) }} required />
                    </Field>
                    {!preview && <Button type="submit" variant="ghost" disabled={busy === 'lookup' || code.length !== 8}>{busy === 'lookup' && <Loader2 className="w-4 h-4 animate-spin" />} Takımı bul</Button>}
                    {preview && (
                      <div className="space-y-4">
                        <Notice>{preview.team.name} · {preview.team.memberCount}/{preview.team.maxMembers} kişi{preview.team.full ? ' · dolu' : ''}</Notice>
                        {/* Dolu takım katılma isteklerine kapalı (biri ayrılınca yeniden açılır) */}
                        {preview.team.closedReason && <Notice kind="error">{preview.team.closedReason}</Notice>}
                        <Button type="button" onClick={() => join({ code }, 'code')} disabled={busy === 'code' || Boolean(preview.team.closedReason)}>{busy === 'code' && <Loader2 className="w-4 h-4 animate-spin" />} Başvuru gönder</Button>
                      </div>
                    )}
                  </form>
                </div>
              )}
            </Card>
          )}
        </>
      )}
      {human.element}
    </div>
  )
}
