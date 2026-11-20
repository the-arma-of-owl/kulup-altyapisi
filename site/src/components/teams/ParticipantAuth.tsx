'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { takim } from '@/lib/teams/client'
import { Button, Field, Notice, inputClass } from './ui'
import { useHuman } from './useHuman'

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset'
type Manual = { manual?: boolean; message?: string }

export const MANUAL_FALLBACK = 'Hesabını şu an e-postayla doğrulayamıyoruz. Bilgilerin ekibimize iletildi; en kısa sürede elle değerlendirilip onaylanacaksın. Onaylandığında e-posta ve şifrenle giriş yapıp devam edebilirsin.'

/** Katılımcı girişi / kaydı / e-posta kodu / parola sıfırlama. Başarılı girişte onDone çağrılır. */
export default function ParticipantAuth({ onDone, initialMode = 'login', initialEmail = '', initialName = '', initialPassword = '', initialInfo = '', initialManual = '' }: {
  onDone: () => void
  initialMode?: Mode
  /** Takım akışında başvuru formundaki ad/e-posta önceden doldurulur (hesap e-postası başvuruyla eşleşmeli) */
  initialEmail?: string
  initialName?: string
  /** Başvuru formunda girilen şifre: kod doğrulanınca doğrudan giriş yapılır */
  initialPassword?: string
  initialInfo?: string
  /** Doğrulama maili gönderilemediyse: elle onay bekleniyor mesajı */
  initialManual?: string
}) {
  // Kayıt Turnstile ister (toplu hesap açmaya karşı)
  const human = useHuman('mt-0')
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState(initialPassword)
  const [fullName, setFullName] = useState(initialName)
  const [code, setCode] = useState('')
  const [kvkk, setKvkk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(initialInfo)
  const [manual, setManual] = useState(initialManual)
  // Doğrulama kodu parolayla birlikte gönderilir; parolası elde olmadan kod ekranına gelindiyse sorulur.
  const [askPassword, setAskPassword] = useState(initialMode === 'verify' && !initialPassword)

  const go = (next: Mode, message = '') => {
    setMode(next); setError(''); setInfo(message); setCode('')
    if (next === 'verify' && !password) setAskPassword(true)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      if (mode === 'login') {
        const r = await takim('auth/login', { email, password })
        if (r.ok) return onDone()
        if (r.code === 'not_verified') {
          const resend = await takim<Manual>('auth/resend', { email })
          if (resend.ok && resend.manual) return setManual(resend.message ?? MANUAL_FALLBACK)
          return go('verify', 'E-postanı henüz doğrulamadın. Yeni bir kod gönderdik.')
        }
        setError(r.error)
      } else if (mode === 'register') {
        const r = await takim<Manual>('auth/register', { email, password, fullName, kvkk }, await human.take())
        if (r.ok && r.manual) setManual(r.message ?? MANUAL_FALLBACK)
        else if (r.ok) go('verify', `${email} adresine 6 haneli bir kod gönderdik. Kod 15 dakika geçerli.`)
        else setError(r.error)
      } else if (mode === 'verify') {
        const r = await takim('auth/verify', { email, code, password })
        if (!r.ok) {
          if (r.code === 'password_required') setAskPassword(true)
          setError(r.error)
        } else onDone()
      } else if (mode === 'forgot') {
        const r = await takim('auth/forgot', { email })
        if (r.ok) go('reset', 'Hesap varsa e-postana bir sıfırlama kodu gönderdik.')
        else setError(r.error)
      } else {
        const r = await takim('auth/reset', { email, code, password })
        if (r.ok) { setPassword(''); go('login', 'Parolan değişti. Yeni parolanla giriş yapabilirsin.') }
        else setError(r.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Katılımcı girişi', register: 'Katılımcı hesabı oluştur', verify: 'E-posta doğrulama',
    forgot: 'Parolamı unuttum', reset: 'Yeni parola belirle',
  }

  if (manual) {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">Onay bekleniyor</h3>
        <Notice kind="success">{manual}</Notice>
        <p className="text-sm text-soluk">Başvurun kaydedildi; bir şey yapmana gerek yok. Daha sonra bu sayfadan giriş yapmayı deneyebilirsin.</p>
        <button type="button" onClick={() => { setManual(''); go('login') }} className="font-display text-sm font-bold text-ana-yazi underline decoration-2 underline-offset-4 hover:opacity-80">Giriş ekranına dön</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-2xl font-extrabold tracking-tight text-murekkep">{titles[mode]}</h3>
        {(mode === 'login' || mode === 'register') && (
          <div className="flex rounded-full border border-kenar bg-zemin-2 p-1 font-display text-sm font-bold">
            <button type="button" onClick={() => go('login')} className={`rounded-full px-4 py-1.5 transition-colors ${mode === 'login' ? 'bg-ana text-white shadow-sert-sm' : 'text-soluk hover:text-murekkep'}`}>Giriş</button>
            <button type="button" onClick={() => go('register')} className={`rounded-full px-4 py-1.5 transition-colors ${mode === 'register' ? 'bg-ana text-white shadow-sert-sm' : 'text-soluk hover:text-murekkep'}`}>Kayıt</button>
          </div>
        )}
      </div>
      {info && <Notice kind="success">{info}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {mode === 'register' && (
        <Field label="Ad soyad">
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required minLength={3} maxLength={80} />
        </Field>
      )}
      <Field label="E-posta">
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254}
          readOnly={mode === 'verify' || mode === 'reset'} />
      </Field>
      {(mode === 'verify' || mode === 'reset') && (
        <Field label="6 haneli kod">
          <input className={`${inputClass} tracking-[0.5em] font-mono text-lg`} inputMode="numeric" pattern="\d{6}" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required />
        </Field>
      )}
      {(mode === 'login' || mode === 'register' || mode === 'reset' || (mode === 'verify' && askPassword)) && (
        <Field label={mode === 'reset' ? 'Yeni parola' : mode === 'verify' ? 'Hesabının parolası' : 'Parola'} hint={mode === 'login' ? undefined : 'En az 8 karakter; harf ve rakam içermeli.'}>
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} />
        </Field>
      )}
      {mode === 'register' && (
        <label className="flex items-start gap-3 rounded-2xl border border-kenar bg-zemin-2 p-3 text-sm leading-relaxed text-soluk">
          <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--kulup-ana,#7c3aed)]" />
          <span>
            <a href="/kvkk" target="_blank" className="font-semibold text-ana-yazi underline decoration-2 underline-offset-2">KVKK aydınlatma metnini</a> ve{' '}
            <a href="/gizlilik" target="_blank" className="font-semibold text-ana-yazi underline decoration-2 underline-offset-2">gizlilik politikasını</a> okudum. Hesap ve takım bilgilerimin
            etkinlik yönetimi için işlenmesine; takımım onaylanırsa adımın ve takım bilgilerinin sitede yayımlanmasına açık rıza veriyorum.
          </span>
        </label>
      )}
      {mode === 'register' && human.element}

      <Button type="submit" disabled={busy} className="dugme-buyuk w-full">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {{ login: 'Giriş yap', register: 'Hesap oluştur', verify: 'Doğrula', forgot: 'Kod gönder', reset: 'Parolayı değiştir' }[mode]}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold text-soluk">
        {mode === 'login' && <button type="button" onClick={() => go('forgot')} className="underline-offset-4 hover:text-ana-yazi hover:underline">Parolamı unuttum</button>}
        {(mode === 'verify' || mode === 'reset') && (
          <button type="button" disabled={busy} className="underline-offset-4 hover:text-ana-yazi hover:underline" onClick={async () => {
            const r = await takim<Manual>('auth/resend', { email, purpose: mode === 'reset' ? 'reset' : 'verify' })
            if (r.ok && r.manual) setManual(r.message ?? MANUAL_FALLBACK)
            else if (r.ok) setInfo('Yeni kod gönderildi.')
            else setError(r.error)
          }}>Kodu yeniden gönder</button>
        )}
        {mode !== 'login' && <button type="button" onClick={() => go('login')} className="underline-offset-4 hover:text-ana-yazi hover:underline">Girişe dön</button>}
      </div>
    </form>
  )
}
