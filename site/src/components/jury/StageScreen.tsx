'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Maximize2 } from 'lucide-react'
import { takim } from '@/lib/teams/client'

/** Sahne paleti: tema ne olursa olsun koyu sahne + canlı vurgular (koyu temanın renkleri). */
const VURGU = ['bg-[#c4ea3a]', 'bg-[#ff6fb5]', 'bg-[#5ec4f5]', 'bg-[#ff8a57]', 'bg-[#34cf91]']
const MADALYA: Record<number, string> = { 1: 'bg-[#c4ea3a]', 2: 'bg-[#5ec4f5]', 3: 'bg-[#ff8a57]' }
const SERT = 'shadow-[0.35vw_0.35vw_0_0_var(--kulup-ana,#7c3aed)]'

type StageTeam = { id: string; name: string; logoUrl?: string | null; projectName?: string; summary?: string; members?: string[] }
type StageRow = { rank: number; average: number | null; team: StageTeam; prize: { title: string; description: string | null; imageUrl: string | null } | null }
type StageData = {
  event: { title: string }
  status: 'idle' | 'voting' | 'finished' | 'revealing' | 'done'
  version: number
  index: number
  total: number
  current?: StageTeam | null
  progress?: { voted: number; required: number }
  reveal?: { mode: 'stepwise' | 'top3' | 'first' | 'full'; step: number; count: number; rows: StageRow[] }
}

const delayFor = (d: StageData | null) => (d?.status === 'revealing' ? 2000 : d?.status === 'voting' ? 3000 : 5000)

/**
 * Salon / projeksiyon ekranı. Anahtar linkin # kısmında durur (sunucuya ve günlüklere gitmez); site BFF'ine gövdeyle
 * gönderilir. Ekran yalnız açılmış bilgiyi alır: oylamada puan yok, açılışta henüz açılmamış sıra yanıtta yok.
 * Kontrol sunucunun telefonundan/bilgisayarından yapılır; bu ekranda düğme yok (tam ekran dışında).
 */
export default function StageScreen({ eventId }: { eventId: string }) {
  const [data, setData] = useState<StageData | null>(null)
  const [error, setError] = useState('')
  const dataRef = useRef<StageData | null>(null)

  const load = useCallback(async () => {
    const key = window.location.hash.replace(/^#/, '')
    if (!key) { setError('Salon ekranı linki eksik. Sunucu panelindeki "Salon ekranı" linkini kullanın.'); return }
    const r = await takim<StageData>(`jury/${eventId}/stage`, { k: key })
    if (r.ok) { dataRef.current = r; setData(r); setError('') }
    else if (r.status !== 0) setError(r.error)
  }, [eventId])

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await load()
      if (alive) timer = setTimeout(tick, delayFor(dataRef.current))
    }
    void tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [load])

  return (
    <div className="fixed inset-0 z-[400] overflow-hidden bg-[#14111c] font-sans text-[#f6f3ff] select-none" style={{ fontFeatureSettings: '"tnum"' }}>
      <StageBackdrop />
      <FullscreenButton />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[6vh]">
        <header className="flex items-center justify-between gap-6">
          <p className={`min-w-0 truncate rounded-full border-[0.18vw] border-[#f6f3ff] bg-[#211c2f] px-[1.4vw] py-[0.6vh] font-display text-[1.5vw] font-bold ${data?.event.title ? '' : 'invisible'}`}>{data?.event.title ?? ''}</p>
          {data?.status === 'voting' && <p className="shrink-0 rounded-[1vw] border-[0.18vw] border-[#f6f3ff] bg-[#c4ea3a] px-[1.4vw] py-[0.6vh] font-display text-[1.6vw] font-extrabold tabular-nums text-[#1a1625] shadow-[0.3vw_0.3vw_0_0_var(--kulup-ana,#7c3aed)]">Takım {Math.min(data.index + 1, data.total)} / {data.total}</p>}
        </header>
        <main className="flex min-h-0 flex-1 items-center justify-center">
          {error ? <Message title={error} />
            : !data ? <Message title="Bağlanıyor…" />
              : <Body data={data} />}
        </main>
      </div>
    </div>
  )
}

/** Sahne zemini: hafif nokta deseni + köşelerde renkli bloklar (yalnız süs). */
function StageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 text-[#f6f3ff] opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(currentColor 1.4px, transparent 1.6px)', backgroundSize: '2.2vw 2.2vw' }} />
      <div className="absolute -left-[6vw] -top-[8vw] h-[18vw] w-[18vw] rounded-[3vw] bg-[var(--kulup-ana,#7c3aed)] opacity-60" />
      <div className="absolute -bottom-[7vw] -right-[5vw] h-[16vw] w-[16vw] rounded-full bg-[#ff6fb5] opacity-40" />
      <div className="absolute bottom-[8vh] -left-[3vw] h-[5vw] w-[12vw] rounded-full bg-[#c4ea3a] opacity-25" />
    </div>
  )
}

async function toggle() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  else await document.documentElement.requestFullscreen().catch(() => undefined)
}

function FullscreenButton() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    let timer = setTimeout(() => setVisible(false), 4000)
    const show = () => { setVisible(true); clearTimeout(timer); timer = setTimeout(() => setVisible(false), 3000) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') void toggle() }
    window.addEventListener('mousemove', show)
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); window.removeEventListener('mousemove', show); window.removeEventListener('keydown', onKey) }
  }, [])
  return (
    <button type="button" onClick={() => void toggle()} aria-label="Tam ekran (F)"
      className={`absolute right-4 top-8 z-10 rounded-full border border-[#f6f3ff] bg-[#211c2f] p-3 text-[#f6f3ff] shadow-[3px_3px_0_0_var(--kulup-ana,#7c3aed)] transition-opacity hover:bg-[#c4ea3a] hover:text-[#1a1625] ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <Maximize2 className="h-5 w-5" />
    </button>
  )
}

function Message({ title, sub }: { title: string; sub?: string }) {
  return (
    <motion.div key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-[70vw] text-center">
      <p className="font-display text-[4.2vw] font-extrabold leading-[1.02] tracking-tight">{title}</p>
      {sub && <p className="mx-auto mt-[3vh] inline-block rounded-[1vw] border-[0.18vw] border-[#f6f3ff] bg-[#c4ea3a] px-[1.6vw] py-[1vh] font-display text-[1.8vw] font-bold text-[#1a1625]">{sub}</p>}
    </motion.div>
  )
}

function Body({ data }: { data: StageData }) {
  if (data.status === 'idle') return <Message title={data.event.title} sub="Jüri değerlendirmesi birazdan başlıyor." />
  if (data.status === 'voting' && data.current) return <VotingView team={data.current} progress={data.progress} />
  if (data.status === 'finished' || !data.reveal) return <Message title="Oylama tamamlandı" sub="Sonuçlar birazdan açıklanacak." />
  const { reveal } = data
  if (reveal.mode === 'full') return <FullTable rows={reveal.rows} />
  if (reveal.mode === 'top3') return <Podium rows={reveal.rows} />
  if (reveal.mode === 'first') return reveal.rows[0] ? <Spotlight row={reveal.rows[0]} /> : <Message title="Sonuç yok" />
  // Adım adım: son açılan sıra büyük, öncekiler altta küçük
  const last = reveal.rows.at(-1)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[4vh]">
      <AnimatePresence mode="wait">
        {last ? <Spotlight key={`${last.rank}-${last.team.id}`} row={last} /> : <Message key="ready" title="Ödül töreni" sub={`${reveal.count} ödül sırayla açıklanacak.`} />}
      </AnimatePresence>
      {reveal.rows.length > 1 && (
        <div className="flex flex-wrap justify-center gap-[1.5vw]">
          {reveal.rows.slice(0, -1).map((r, i) => (
            <div key={`${r.rank}-${r.team.id}`} className={`rounded-[1.2vw] border-[0.18vw] border-[#f6f3ff] px-[1.6vw] py-[1.2vh] text-center text-[#1a1625] ${MADALYA[r.rank] ?? VURGU[i % VURGU.length]} ${SERT}`}>
              <p className="font-display text-[1.1vw] font-extrabold uppercase tracking-[0.15em] opacity-75">{r.rank}. sıra</p>
              <p className="font-display text-[1.7vw] font-extrabold leading-tight">{r.team.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Logo({ team, size }: { team: StageTeam; size: string }) {
  return team.logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={team.logoUrl} alt="" className={`shrink-0 rounded-[1.2vw] border-[0.22vw] border-[#f6f3ff] bg-[#f6f3ff] object-cover ${SERT}`} style={{ width: size, height: size }} />
    : <div className={`flex shrink-0 items-center justify-center rounded-[1.2vw] border-[0.22vw] border-[#f6f3ff] bg-[#c4ea3a] font-display font-extrabold text-[#1a1625] ${SERT}`} style={{ width: size, height: size, fontSize: `calc(${size} / 2.2)` }}>{team.name.slice(0, 1)}</div>
}

function VotingView({ team, progress }: { team: StageTeam; progress?: { voted: number; required: number } }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={team.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.5 }}
        className="flex w-full max-w-[85vw] flex-col items-center text-center">
        <Logo team={team} size="12vw" />
        <h1 className="mt-[4vh] font-display text-[6vw] font-extrabold leading-[0.95] tracking-tight">{team.name}</h1>
        {team.projectName && <p className={`mt-[3vh] rounded-[1vw] border-[0.18vw] border-[#f6f3ff] bg-[#ff6fb5] px-[1.6vw] py-[0.8vh] font-display text-[2.4vw] font-bold leading-tight text-[#1a1625] ${SERT}`}>{team.projectName}</p>}
        {team.members && team.members.length > 0 && <p className="mt-[3vh] text-[1.7vw] font-medium text-[#aaa3c2]">{team.members.join(' · ')}</p>}
        {progress && progress.required > 0 && (
          <div className="mt-[6vh] flex items-center gap-[1.2vw]" aria-label={`${progress.voted} / ${progress.required} jüri oy verdi`}>
            {Array.from({ length: progress.required }, (_, i) => (
              <span key={i} className={`h-[1.6vw] w-[1.6vw] rounded-full border-[0.18vw] border-[#f6f3ff] transition-colors duration-500 ${i < progress.voted ? 'bg-[#34cf91]' : 'bg-transparent'}`} />
            ))}
            <span className="ml-[0.8vw] font-display text-[1.6vw] font-bold text-[#aaa3c2]">Jüri oyları {progress.voted}/{progress.required}</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/** Ödül anı: sıra, ödül, takım, proje ve üye adları. */
function Spotlight({ row }: { row: StageRow }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
      className="flex w-full max-w-[88vw] items-center justify-center gap-[4vw]">
      {row.prize?.imageUrl && (
        <motion.img src={row.prize.imageUrl} alt="" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
          className={`max-h-[52vh] w-[26vw] shrink-0 rounded-[1.5vw] border-[0.25vw] border-[#f6f3ff] object-cover ${SERT}`} />
      )}
      <div className="min-w-0 text-left">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`inline-block max-w-full rounded-full border-[0.18vw] border-[#f6f3ff] px-[1.6vw] py-[0.6vh] font-display text-[1.9vw] font-extrabold uppercase tracking-[0.12em] text-[#1a1625] ${MADALYA[row.rank] ?? 'bg-[#ff6fb5]'}`}>
          {row.rank}. sıra{row.prize ? ` · ${row.prize.title}` : ''}
        </motion.p>
        <div className="mt-[2.5vh] flex items-center gap-[2vw]">
          <Logo team={row.team} size="8vw" />
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="min-w-0 break-words font-display text-[6.5vw] font-extrabold leading-[0.95] tracking-tight">{row.team.name}</motion.h1>
        </div>
        {row.team.projectName && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-[3vh] font-display text-[2.6vw] font-bold text-[#c4ea3a]">{row.team.projectName}</motion.p>}
        {row.team.members && row.team.members.length > 0 && (
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-[3vh] flex flex-wrap gap-x-[1vw] gap-y-[1.2vh] text-[1.8vw] font-semibold">
            {row.team.members.map((m) => <li key={m} className="rounded-full border-[0.15vw] border-[#f6f3ff] bg-[#211c2f] px-[1.2vw] py-[0.4vh]">{m}</li>)}
          </motion.ul>
        )}
        {row.prize?.description && <p className="mt-[3vh] text-[1.6vw] text-[#aaa3c2]">{row.prize.description}</p>}
      </div>
    </motion.div>
  )
}

function Podium({ rows }: { rows: StageRow[] }) {
  const byRank = (rank: number) => rows.filter((r) => r.rank === rank)
  const order = [...byRank(2), ...byRank(1), ...byRank(3)]
  const height: Record<number, string> = { 1: '22vh', 2: '15vh', 3: '10vh' }
  return (
    <div className="flex h-full w-full items-end justify-center gap-[2.5vw] pb-[4vh]">
      {order.map((r, i) => (
        <motion.div key={`${r.rank}-${r.team.id}`} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.25 }}
          className="flex w-[26vw] flex-col items-center text-center">
          <Logo team={r.team} size={r.rank === 1 ? '9vw' : '7vw'} />
          <p className={`mt-[2.5vh] font-display font-extrabold leading-tight tracking-tight ${r.rank === 1 ? 'text-[3.4vw]' : 'text-[2.5vw]'}`}>{r.team.name}</p>
          {r.team.projectName && <p className="mt-[0.8vh] font-display text-[1.5vw] font-bold text-[#c4ea3a]">{r.team.projectName}</p>}
          {r.team.members && <p className="mt-[0.8vh] text-[1.15vw] text-[#aaa3c2]">{r.team.members.join(' · ')}</p>}
          <div className={`mt-[2.5vh] flex w-full flex-col items-center justify-start rounded-t-[1.4vw] border-[0.22vw] border-b-0 border-[#f6f3ff] pt-[1.5vh] ${MADALYA[r.rank] ? `${MADALYA[r.rank]} text-[#1a1625]` : 'bg-[#211c2f]'} ${SERT}`} style={{ height: height[r.rank] ?? '8vh' }}>
            <p className="font-display text-[3.4vw] font-extrabold leading-none">{r.rank}</p>
            {r.prize && <p className="mt-[0.6vh] px-[1vw] font-display text-[1.2vw] font-bold">{r.prize.title}</p>}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function FullTable({ rows }: { rows: StageRow[] }) {
  const twoColumns = rows.length > 10
  return (
    <div className={`grid w-full max-w-[90vw] gap-x-[4vw] ${twoColumns ? 'grid-cols-2' : 'grid-cols-1 max-w-[70vw]'}`}>
      {rows.map((r, i) => (
        <motion.div key={`${r.rank}-${r.team.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
          className="flex items-center gap-[1.5vw] border-b-[0.15vw] border-dashed border-[#3a3350] py-[1.2vh]">
          <span className={`grid h-[3.4vw] w-[4vw] shrink-0 place-items-center rounded-[0.8vw] border-[0.15vw] border-[#f6f3ff] font-display text-[1.8vw] font-extrabold tabular-nums ${MADALYA[r.rank] ? `${MADALYA[r.rank]} text-[#1a1625]` : 'bg-[#211c2f]'}`}>{r.rank}.</span>
          <Logo team={r.team} size="3.2vw" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[1.9vw] font-extrabold">{r.team.name}</span>
            {r.team.projectName && <span className="block truncate text-[1.1vw] text-[#aaa3c2]">{r.team.projectName}</span>}
          </span>
          {r.average !== null && <span className="shrink-0 font-display text-[1.9vw] font-extrabold tabular-nums text-[#c4ea3a]">{r.average.toFixed(2)}</span>}
        </motion.div>
      ))}
    </div>
  )
}
