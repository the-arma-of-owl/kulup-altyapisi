'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Gavel, Loader2, LogOut, Users } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { logoutParticipant, takim, type Me } from '@/lib/teams/client'
import ParticipantAuth from '@/components/teams/ParticipantAuth'
import { Button, Card, VitrinNoticeDialog, statusLabel } from '@/components/teams/ui'
import { Cikartma, Desen } from '@/components/kit'

/** Takım durumuna göre rozet rengi (nane: tamam, limon: bekliyor, pembe: ret). */
const DURUM_RENK: Record<string, string> = {
  draft: 'bg-zemin-2 text-murekkep', pending: 'bg-limon text-murekkep', approved: 'bg-gok text-murekkep',
  accepted: 'bg-nane text-murekkep', rejected: 'bg-pembe text-murekkep',
}
const KART_SERIT = ['bg-limon', 'bg-pembe', 'bg-gok', 'bg-seftali', 'bg-nane']

export default function ParticipantHome() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const r = await takim<Me>('me')
    setMe(r.ok ? r : null)
  }, [])
  useEffect(() => {
    let alive = true
    takim<Me>('me').then((r) => { if (alive) setMe(r.ok ? r : null) })
    return () => { alive = false }
  }, [])

  /** Bekleyen katılma isteğini geri çeker (kaptan onaylamadan önce) */
  async function withdraw(teamId: string) {
    setBusy(teamId); setError('')
    const r = await takim(`teams/${teamId}/leave`, {})
    setBusy('')
    if (!r.ok) return setError(r.error)
    await load()
  }

  if (me === undefined) return <div className="flex items-center gap-2 font-display font-bold text-soluk"><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…</div>

  if (me === null) {
    return (
      <div className="space-y-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-kenar bg-ana px-6 py-9 text-white shadow-sert-lg sm:px-10 sm:py-12">
          <Desen />
          <div className="relative">
            <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] opacity-80">Hackathon / Yarışma</span>
            <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">Katılımcı hesabı</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed opacity-85">Takım modundaki etkinliklerde takım kurmak, takıma katılmak ve proje teslim etmek için.</p>
          </div>
          <div className="absolute right-5 top-5 hidden sm:block"><Cikartma renk="limon" aci={6}>Takımını kur!</Cikartma></div>
        </header>
        <p className="text-sm text-soluk">Çıkış yaptın ya da henüz giriş yapmadın. Aşağıdan <strong className="text-murekkep">giriş yap</strong> ya da yeni hesap oluştur.</p>
        <Card><ParticipantAuth onDone={() => void load()} /></Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-[2rem] border border-kenar bg-ana px-6 py-9 text-white shadow-sert-lg sm:px-10 sm:py-12">
        <Desen />
        <div className="relative min-w-0">
          <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] opacity-80">Katılımcı hesabı</span>
          <h1 className="mt-2 break-words font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">{me.user.fullName}</h1>
          <p className="mt-2 break-all text-sm opacity-85">{me.user.email}</p>
        </div>
        <Button variant="ghost" className="relative" onClick={async () => { await logoutParticipant(); setMe(null) }}><LogOut className="w-4 h-4" /> Çıkış yap</Button>
      </header>

      <VitrinNoticeDialog show={me.teams.some((t) => t.team.status === 'pending' || t.team.status === 'approved')} />
      <section className="space-y-3">
        <h2 className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-tight text-murekkep"><span className="grid h-9 w-9 place-items-center rounded-xl border border-kenar bg-limon text-murekkep shadow-sert-sm"><Users className="w-4 h-4" /></span> Takımlarım</h2>
        {me.teams.length === 0 && (
          <Card><p className="text-sm leading-relaxed text-soluk">Henüz bir takımın yok. Takım modundaki bir etkinliğin sayfasından takım kurabilir ya da davet koduyla katılabilirsin. <Link href="/etkinlikler" className="font-bold text-ana-yazi underline decoration-2 underline-offset-2">Etkinlikler</Link></p></Card>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-hata">{error}</p>}
        {me.teams.map((t, i) => (
          <Card key={t.team.id} className="relative overflow-hidden !p-5 !pl-7">
            <span aria-hidden className={`absolute inset-y-0 left-0 w-2.5 border-r-2 border-kenar ${KART_SERIT[i % KART_SERIT.length]}`} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-soluk">{t.event.title}</p>
                <p className="break-words font-display text-xl font-extrabold text-murekkep">{t.team.name}</p>
                <p className={`mt-1.5 inline-flex rounded-full border border-kenar px-2.5 py-0.5 text-xs font-bold ${t.membershipStatus === 'pending' ? DURUM_RENK.pending : (DURUM_RENK[t.team.status] ?? DURUM_RENK.draft)}`}>
                  {t.membershipStatus === 'pending' ? 'Başvurun kaptanın onayını bekliyor' : `${t.role === 'captain' ? 'Kaptan' : 'Üye'} · ${statusLabel[t.team.status] ?? t.team.status}`}
                </p>
              </div>
              {t.membershipStatus === 'accepted' && <Link href={`/katilimci/takim/${t.team.id}`} className="dugme dugme-limon">Takımı aç →</Link>}
              {t.membershipStatus === 'pending' && (
                <Button variant="ghost" disabled={busy === t.team.id} onClick={() => void withdraw(t.team.id)}>
                  {busy === t.team.id && <Loader2 className="w-4 h-4 animate-spin" />} İsteği geri çek
                </Button>
              )}
            </div>
          </Card>
        ))}
      </section>

      {me.judgeEvents.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-tight text-murekkep"><span className="grid h-9 w-9 place-items-center rounded-xl border border-kenar bg-gok text-murekkep shadow-sert-sm"><Gavel className="w-4 h-4" /></span> Jüri paneli</h2>
          {me.judgeEvents.map((e) => (
            <Card key={e.id} className="!p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 break-words font-display text-lg font-bold text-murekkep">{e.title}</p>
                <Link href={`/katilimci/juri/${e.id}`} className="dugme dugme-ana">Teslimleri puanla →</Link>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}
