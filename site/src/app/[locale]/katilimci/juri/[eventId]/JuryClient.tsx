'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { takim } from '@/lib/teams/client'
import JuryPanel from '@/components/jury/JuryPanel'
import LiveJury, { type LiveData } from '@/components/jury/LiveJury'
import ParticipantAuth from '@/components/teams/ParticipantAuth'
import { AutoSessionBar } from '@/components/teams/SessionBar'
import { Notice } from '@/components/teams/ui'
import { Desen } from '@/components/kit'

type JuryData = {
  event: { id: string; title: string; slug: string; criteria: Array<{ id: string; name: string; weight: number; max: number }> }
  submissions: Array<{ id: string; teamName: string; title: string; summary: string; links: Array<{ label: string; url: string }>; myScores?: Record<string, number>; myComment?: string }>
}

/**
 * Jüri paneli: yalnız etkinliğe atanmış jüri (ve canlı oturumun sunucusu); kendi takımı listede yer almaz (CMS süzer).
 * Canlı oturum varsa üstte canlı ekran; oturum başlamadıysa (ya da hiç yoksa) altta bağımsız puanlama.
 */
export default function JuryClient({ eventId }: { eventId: string }) {
  const [live, setLive] = useState<LiveData | null>(null)
  const [data, setData] = useState<JuryData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'error'>('loading')
  const [error, setError] = useState('')
  const apply = useCallback((r: Awaited<ReturnType<typeof takim<JuryData>>>) => {
    if (r.ok) { setData(r); setState('ready') } else if (r.status === 401) { setState('login') } else { setError(r.error); setState('error') }
  }, [])
  const fetchAll = useCallback(async () => {
    const [r, l] = await Promise.all([takim<JuryData>(`jury/${eventId}`), takim<LiveData>(`jury/${eventId}/live`)])
    return { r, l: l.ok && l.session ? l : null, host: l.ok && l.role.host }
  }, [eventId])
  const applyAll = useCallback(({ r, l, host }: Awaited<ReturnType<typeof fetchAll>>) => {
    setLive(l)
    // Yalnız sunucu (jüri değil) bağımsız listeyi açamaz; canlı ekranla devam eder
    if (!r.ok && r.status === 403 && host) { setData(null); setState('ready'); return }
    apply(r)
  }, [apply])
  const load = useCallback(async () => applyAll(await fetchAll()), [applyAll, fetchAll])
  useEffect(() => {
    let alive = true
    fetchAll().then((all) => { if (alive) applyAll(all) })
    return () => { alive = false }
  }, [applyAll, fetchAll])

  if (state === 'loading') return <div className="kart flex items-center justify-center gap-2 px-6 py-12 font-display font-bold text-soluk"><Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…</div>
  if (state === 'login') return <div className="kart p-5 sm:p-7"><ParticipantAuth onDone={() => void load()} /></div>
  // Yanlış hesapla girildiyse (ör. "jürisi değilsiniz") buradan çıkılıp doğru hesapla girilebilir
  const bar = <AutoSessionBar refreshKey={state} onLoggedOut={() => { setData(null); setState('login') }} />
  if (state === 'error' || (!data && !live)) return <div className="space-y-4">{bar}<Notice kind="error">{error || 'Jüri paneli açılamadı.'}</Notice></div>
  const liveActive = Boolean(live?.session && live.session.status !== 'idle')

  return (
    <div className="space-y-6">
      {bar}
      <header className="relative overflow-hidden rounded-[2rem] border border-kenar bg-ana px-6 py-8 text-white shadow-sert-lg sm:px-10 sm:py-10">
        <Desen />
        <div className="relative">
          <Link href={`/etkinlikler/${(data?.event ?? live!.event).slug}`} className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-white/80 hover:text-white hover:underline">← Etkinlik sayfası</Link>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">Jüri paneli</h1>
        </div>
      </header>
      {live && <LiveJury eventId={eventId} initial={live} onChange={(next) => setLive(next.session ? next : null)} />}
      {data && !liveActive && (
        <>
          {live && <h2 className="pt-4 font-display text-2xl font-extrabold tracking-tight text-murekkep">Bağımsız puanlama <span className="font-sans text-sm font-semibold text-soluk">(canlı oturum başlayınca kapanır)</span></h2>}
          {data.submissions.length === 0 && <Notice>Puanlanacak onaylı takım yok.</Notice>}
          <JuryPanel
            event={{ title: data.event.title, criteria: data.event.criteria }}
            submissions={data.submissions}
            onScore={async (submissionId, scores, comment) => {
              const r = await takim(`jury/${eventId}/score`, { teamId: Number(submissionId), scores, comment: comment ?? '' })
              if (!r.ok) throw new Error(r.error)
              await load()
            }}
          />
        </>
      )}
    </div>
  )
}
