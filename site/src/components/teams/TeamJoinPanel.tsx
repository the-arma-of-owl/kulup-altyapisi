'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, Send } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { takim, type Me } from '@/lib/teams/client'
import { CONTACT_LABELS, type TeamContact } from '@/lib/teams/contact'
import ParticipantAuth from './ParticipantAuth'
import SessionBar from './SessionBar'
import { Button, Card, Field, Notice, inputClass } from './ui'

/** İletişim değerinden güvenli bağlantı (değer CMS'te doğrulanmış kullanıcı adı/e-posta). WhatsApp kullanıcı adı için bağlantı yok. */
export function contactHref(contact: TeamContact): string | null {
  const name = contact.value.replace(/^@/, '')
  if (contact.type === 'email') return `mailto:${encodeURIComponent(contact.value).replace('%40', '@')}`
  if (contact.type === 'telegram') return `https://t.me/${encodeURIComponent(name)}`
  if (contact.type === 'instagram') return `https://instagram.com/${encodeURIComponent(name)}`
  return null
}

/**
 * Herkese açık takım sayfasının yan paneli: oturum (giriş/çıkış), "üye arıyor" takıma katılma isteği ve
 * kaptanın iletişim adresi. İletişim yalnız giriş yapmış katılımcıya gösterilir (sunucu da öyle verir).
 */
export default function TeamJoinPanel({ teamId, teamName, eventSlug, seeking, hasContact }: {
  teamId: string; teamName: string; eventSlug: string; seeking: boolean; hasContact: boolean
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [contact, setContact] = useState<TeamContact | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; code?: string } | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    const r = await takim<Me>('me')
    setMe(r.ok ? r : null)
    if (r.ok && hasContact) {
      const c = await takim<{ contact: TeamContact | null }>(`teams/${teamId}/contact`)
      setContact(c.ok ? c.contact : null)
    }
  }, [hasContact, teamId])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await takim<Me>('me')
      if (!alive) return
      setMe(r.ok ? r : null)
      if (r.ok && hasContact) {
        const c = await takim<{ contact: TeamContact | null }>(`teams/${teamId}/contact`)
        if (alive) setContact(c.ok ? c.contact : null)
      }
    })()
    return () => { alive = false }
  }, [hasContact, teamId])

  if (!seeking && !hasContact) return null
  if (me === undefined) return <div className="flex items-center gap-2 text-sm font-semibold text-soluk"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>

  const inTeam = me?.teams.some((t) => t.team.id === teamId)
  const href = contact ? contactHref(contact) : null

  return (
    <Card className="space-y-5">
      <SessionBar user={me ? me.user : null} onLoggedOut={() => { setMe(null); setContact(null); setDone(false); setError(null) }} onLogin={() => setShowAuth(true)} />
      {!me && showAuth && <ParticipantAuth onDone={() => { setShowAuth(false); void load() }} />}

      {hasContact && (
        <section className="space-y-2" aria-labelledby="takim-iletisim">
          <h2 id="takim-iletisim" className="flex items-center gap-2 font-display text-lg font-extrabold text-murekkep"><span className="grid h-7 w-7 place-items-center rounded-lg border border-kenar bg-gok text-murekkep"><Mail className="h-3.5 w-3.5" aria-hidden /></span> Takımla iletişim</h2>
          {me && contact ? (
            <p className="break-words text-sm text-murekkep">
              <span className="font-bold">{CONTACT_LABELS[contact.type]}:</span>{' '}
              {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-ana-yazi underline decoration-2 underline-offset-2">{contact.value}</a> : <span>{contact.value}</span>}
            </p>
          ) : me ? (
            <p className="text-sm text-soluk">İletişim bilgisi şu an alınamadı.</p>
          ) : (
            <p className="text-sm text-soluk">Kaptanın iletişim adresini görmek için katılımcı hesabınla giriş yap.</p>
          )}
        </section>
      )}

      {seeking && !inTeam && (
        <section className="space-y-3" aria-labelledby="takim-katil">
          <h2 id="takim-katil" className="inline-block rounded-xl border border-kenar bg-nane px-3 py-1 font-display text-base font-extrabold text-murekkep shadow-sert-sm">Bu takım üye arıyor</h2>
          {done ? (
            <Notice kind="success">İsteğin {teamName} kaptanına iletildi. Kaptan kabul edince takımda görünürsün.</Notice>
          ) : me ? (
            <>
              <Field label="Kaptana mesajın (isteğe bağlı)">
                <textarea className={`${inputClass} resize-none`} rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              {error && (
                <Notice kind="error">
                  {error.text}{' '}
                  {error.code === 'application_required' && <Link href={`/etkinlikler/${eventSlug}#takim-kayit`} className="font-bold underline decoration-2 underline-offset-2">Başvuru formuna git</Link>}
                </Notice>
              )}
              <Button disabled={busy} onClick={async () => {
                setBusy(true); setError(null)
                const r = await takim('join', { teamId: Number(teamId), message })
                setBusy(false)
                if (r.ok) setDone(true)
                else setError({ text: r.error, code: r.code })
              }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Katılma isteği gönder
              </Button>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-soluk">
              Katılmak için önce <Link href={`/etkinlikler/${eventSlug}#takim-kayit`} className="font-semibold text-ana-yazi underline decoration-2 underline-offset-2">etkinlik başvurusunu</Link> yap,
              sonra katılımcı hesabınla giriş yapıp istek gönder.
            </p>
          )}
        </section>
      )}
    </Card>
  )
}
