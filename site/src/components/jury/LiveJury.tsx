'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Loader2, MonitorPlay, ShieldAlert, Trophy } from 'lucide-react'
import { takim } from '@/lib/teams/client'
import { type Criterion, isCompleteScoreCard, weightedTotal } from '@/lib/jury/score'
import { safeExternalUrl } from '@/lib/jury/safeUrl'
import { Button, ConfirmDialog, Notice } from '@/components/teams/ui'

/** Oturum durumuna göre rozet rengi (yalnız görünüm). */
const STATUS_BG: Record<LiveStatus, string> = { idle: 'bg-yuzey text-murekkep', voting: 'bg-limon text-murekkep', finished: 'bg-gok text-murekkep', revealing: 'bg-pembe text-murekkep', done: 'bg-nane text-murekkep' }
/** Sıralamada ilk üçün madalya rengi. */
const MEDAL_BG: Record<number, string> = { 1: 'bg-limon', 2: 'bg-gok', 3: 'bg-seftali' }

export type LiveStatus = 'idle' | 'voting' | 'finished' | 'revealing' | 'done'
type RevealMode = 'stepwise' | 'top3' | 'first' | 'full'

type TeamCard = { id: string; name: string; logoUrl: string | null; projectName: string; summary: string; links: Array<{ label: string; url: string }> }
type RankRow = { rank: number; teamId: string; teamName: string; average: number; judges: number; perJudge: Array<{ name: string; total: number }> }

export type LiveData = {
  role: { judge: boolean; host: boolean }
  event: { id: string; title: string; slug: string; criteria: Criterion[] }
  session: null | { status: LiveStatus; version: number; index: number; total: number; revealMode: RevealMode; revealStep: number; revealCount: number }
  current?: TeamCard | null
  progress?: { voted: number; required: number }
  me?: { canVote: boolean; conflict: boolean; voted: boolean; scores: Record<string, number> | null; comment: string }
  pending?: string[]
  ranking?: RankRow[]
  host?: { stageKey: string | null; order: Array<{ index: number; name: string }>; judges: number; resultsPublished: boolean }
}

const REVEAL_LABELS: Record<RevealMode, string> = { stepwise: 'Adım adım (ödül anı)', top3: 'İlk 3', first: 'Yalnız birinci', full: 'Tam sıralama' }

/** Yoklama aralığı: oy bekleyen ekranda sık, boşta seyrek; sekme gizliyken hiç. */
function pollDelay(data: LiveData | null): number {
  const status = data?.session?.status
  if (status === 'voting') return data?.me?.voted || !data?.role.judge ? 3000 : 6000
  if (status === 'revealing') return 4000
  return 10000
}

/**
 * Canlı jüri oturumu: tüm jürilerde aynı takım. Oy gizli (yalnız "2/3 oy verildi"); herkes oy verince sunucu sıradaki
 * takıma geçer. Bitince sıralama ve tüm puanlar jürilere açılır. Sunucu (host) başlatır, gerekirse geçer, açılışı yönetir.
 */
export default function LiveJury({ eventId, initial, onChange }: { eventId: string; initial: LiveData; onChange?: (data: LiveData) => void }) {
  const [data, setData] = useState<LiveData>(initial)
  const [error, setError] = useState('')
  const dataRef = useRef(data)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const load = useCallback(async () => {
    const r = await takim<LiveData>(`jury/${eventId}/live`)
    if (r.ok) {
      dataRef.current = r
      setData(r)
      setError('')
      onChangeRef.current?.(r)
    } else if (r.status !== 0) setError(r.error)
  }, [eventId])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    const tick = async () => {
      if (!document.hidden) await load()
      if (alive) timer = setTimeout(tick, pollDelay(dataRef.current))
    }
    timer = setTimeout(tick, pollDelay(dataRef.current))
    const onVisible = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  const session = data.session
  if (!session) return null

  return (
    <div className="space-y-5">
      {error && <Notice kind="error">{error}</Notice>}
      <StatusBar data={data} />
      {session.status === 'voting' && data.current && (
        <>
          <TeamPanel team={data.current} />
          {data.role.judge && data.me && (
            data.me.conflict
              ? <Notice kind="warning"><span className="inline-flex items-start gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> Bu takım senin takımın; tarafsızlık için bu takıma oy vermiyorsun. Diğer jüriler oylayınca ekran kendiliğinden ilerler.</span></Notice>
              : <VoteForm key={`${data.current.id}-${data.me.voted}`} eventId={eventId} teamId={data.current.id} criteria={data.event.criteria} me={data.me} onDone={load} />
          )}
        </>
      )}
      {session.status === 'idle' && !data.role.host && <Notice>Canlı oturum henüz başlamadı. Sunucu başlatınca ilk takım burada kendiliğinden açılacak.</Notice>}
      {data.ranking && session.status !== 'voting' && <RankingTable rows={data.ranking} />}
      {data.role.host && <HostControls eventId={eventId} data={data} onDone={load} />}
    </div>
  )
}

function StatusBar({ data }: { data: LiveData }) {
  const s = data.session!
  const label = { idle: 'Bekliyor', voting: 'Oylama', finished: 'Oylama bitti', revealing: 'Sahnede açılış', done: 'Sonuçlar yayınlandı' }[s.status]
  const p = data.progress
  return (
    <div className="kart p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rozet py-1 font-display text-sm ${STATUS_BG[s.status]}`}>
            {s.status === 'voting' && <span className="h-2.5 w-2.5 rounded-full border border-kenar bg-pembe animate-pulse" aria-hidden />}{label}
          </span>
          {s.status === 'voting' && <span className="font-display text-sm font-extrabold text-murekkep">Takım {Math.min(s.index + 1, s.total)} / {s.total}</span>}
        </div>
        {s.status === 'voting' && p && (
          <div className="flex min-w-[180px] flex-1 items-center gap-3 sm:max-w-xs" aria-live="polite">
            <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-kenar bg-zemin">
              <div className="h-full rounded-full bg-ana transition-all" style={{ width: `${p.required ? (p.voted / p.required) * 100 : 0}%` }} />
            </div>
            <span className="font-display text-sm font-extrabold tabular-nums text-murekkep">{p.voted}/{p.required} oy</span>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamPanel({ team }: { team: TeamCard }) {
  const links = team.links.map((l) => ({ label: l.label, href: safeExternalUrl(l.url) })).filter((l): l is { label: string; href: string } => Boolean(l.href))
  return (
    <div className="kart p-5 sm:p-7">
      <div className="flex items-start gap-4">
        {team.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={team.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-kenar object-cover shadow-sert-sm" />
          : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-kenar bg-limon font-display text-2xl font-extrabold text-murekkep shadow-sert-sm">{team.name.slice(0, 1)}</div>}
        <div className="min-w-0">
          <p className="ust-baslik break-words">{team.name}</p>
          <h2 className="mt-1 break-words font-display text-2xl font-extrabold leading-tight tracking-tight text-murekkep sm:text-3xl">{team.projectName || 'Proje adı yok'}</h2>
        </div>
      </div>
      {team.summary && <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-soluk sm:text-base">{team.summary}</p>}
      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-kenar bg-gok px-3 py-1.5 font-display text-xs font-bold text-murekkep shadow-sert-sm transition-[transform,box-shadow] duration-150 hover:shadow-sert">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{l.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function VoteForm({ eventId, teamId, criteria, me, onDone }: {
  eventId: string; teamId: string; criteria: Criterion[]; me: NonNullable<LiveData['me']>; onDone: () => Promise<void>
}) {
  const [scores, setScores] = useState<Record<string, number>>(me.scores ?? {})
  const [comment, setComment] = useState(me.comment ?? '')
  const [editing, setEditing] = useState(!me.voted)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const complete = isCompleteScoreCard(scores, criteria)
  let total: number | null = null
  try { total = complete ? weightedTotal(scores, criteria) : null } catch { total = null }

  if (!editing) {
    return (
      <div className="kart bg-nane p-5 text-murekkep">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 font-display text-base font-extrabold"><CheckCircle2 className="h-5 w-5 shrink-0" /> Oyun kaydedildi{total !== null ? ` (${total.toFixed(2)})` : ''}. Diğer jüriler bekleniyor…</p>
          {me.canVote && <Button variant="ghost" onClick={() => setEditing(true)}>Oyumu değiştir</Button>}
        </div>
      </div>
    )
  }

  const submit = async () => {
    setBusy(true); setError('')
    const r = await takim(`jury/${eventId}/live/vote`, { teamId: Number(teamId), scores, comment })
    setBusy(false)
    if (!r.ok) { setError(r.error); await onDone(); return }
    setEditing(false)
    await onDone()
  }

  return (
    <div className="kart p-5 sm:p-7">
      <h3 className="font-display text-lg font-extrabold text-murekkep">Oyun (diğer jüriler görmez)</h3>
      <ul className="mt-4 space-y-3">
        {criteria.map((c) => {
          const value = scores[c.id]
          const step = c.max <= 10 ? 0.5 : 1
          return (
            <li key={c.id} className="rounded-2xl border border-kenar bg-zemin px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`live-${c.id}`} className="min-w-0 break-words font-display text-base font-extrabold text-murekkep">{c.name}</label>
                <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums text-murekkep">{typeof value === 'number' ? value : '–'}<span className="font-mono text-xs font-bold text-soluk"> / {c.max}</span></span>
              </div>
              <input id={`live-${c.id}`} type="range" min={0} max={c.max} step={step} value={typeof value === 'number' ? value : 0}
                onChange={(e) => setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                onPointerDown={() => setScores((s) => (typeof s[c.id] === 'number' ? s : { ...s, [c.id]: 0 }))}
                className={`mt-2 h-2 w-full cursor-pointer accent-ana ${typeof value === 'number' ? '' : 'opacity-50'}`} />
            </li>
          )
        })}
      </ul>
      <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1000))} rows={2} placeholder="Not (isteğe bağlı; yalnız yönetim görür)"
        className="girdi mt-5 text-sm" />
      {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-soluk">{complete ? <>Toplam: <b className="rounded-lg border border-kenar bg-limon px-1.5 font-display text-base font-extrabold tabular-nums text-murekkep">{total?.toFixed(2)}</b> / 100</> : 'Tüm kriterleri puanla'}</span>
        <Button onClick={() => void submit()} disabled={!complete || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Oyumu gönder</Button>
      </div>
    </div>
  )
}

function RankingTable({ rows }: { rows: RankRow[] }) {
  return (
    <div className="kart p-5 sm:p-7">
      <h3 className="flex items-center gap-2.5 font-display text-xl font-extrabold text-murekkep"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-kenar bg-limon text-murekkep shadow-sert-sm"><Trophy className="h-5 w-5" /></span> Sıralama ve tüm puanlar</h3>
      <ol className="mt-4 divide-y-2 divide-dashed divide-kenar/15">
        {rows.map((r) => (
          <li key={r.teamId} className="py-3">
            <div className="flex items-center gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-kenar font-display text-base font-extrabold tabular-nums ${MEDAL_BG[r.rank] ? `${MEDAL_BG[r.rank]} text-murekkep` : 'bg-yuzey text-murekkep'}`}>{r.rank}.</span>
              <span className="min-w-0 flex-1 truncate font-display font-bold text-murekkep">{r.teamName}</span>
              <span className="shrink-0 font-display text-lg font-extrabold tabular-nums text-murekkep">{r.judges ? r.average.toFixed(2) : '–'}</span>
            </div>
            {r.perJudge.length > 0 && (
              <p className="ml-12 mt-1 break-words text-xs text-soluk">{r.perJudge.map((j) => `${j.name}: ${j.total.toFixed(2)}`).join(' · ')}</p>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-soluk">Eşit ortalama aynı sırayı alır. Sıralama oylama bittiği anda dondurulur.</p>
    </div>
  )
}

type Pending = { action: string; mode?: RevealMode; title: string; body: string; confirm: string } | null

function HostControls({ eventId, data, onDone }: { eventId: string; data: LiveData; onDone: () => Promise<void> }) {
  const s = data.session!
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Pending>(null)
  const [copied, setCopied] = useState(false)
  const stageUrl = data.host?.stageKey && typeof window !== 'undefined' ? `${window.location.origin}/sahne/${eventId}#${data.host.stageKey}` : null

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError('')
    const r = await takim(`jury/${eventId}/live/control`, { action, ...extra })
    setBusy(false); setConfirm(null)
    if (!r.ok) setError(r.error)
    await onDone()
  }
  const ask = (p: NonNullable<Pending>) => setConfirm(p)
  const pendingNames = data.pending ?? []

  return (
    <div className="kart overflow-hidden">
      <h3 className="border-b-2 border-kenar bg-ana px-5 py-3 font-display text-base font-extrabold text-white sm:px-7">Sunucu kontrolü</h3>
      <div className="p-5 sm:p-7 sm:pt-5">
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      <div className="flex flex-wrap gap-2">
        {s.status === 'idle' && (
          <Button disabled={busy} onClick={() => ask({ action: 'start', title: 'Oturum başlasın mı?', confirm: 'Başlat',
            body: 'Proje teslim etmiş kabul edilmiş takımlar teslim sırasıyla gelir. Başladıktan sonra takımlar teslimlerini değiştiremez ve bağımsız puanlama kapanır.' })}>Oturumu başlat</Button>
        )}
        {s.status === 'voting' && (
          <>
            <Button variant="ghost" disabled={busy || s.index === 0} onClick={() => void run('prev')}>← Önceki takım</Button>
            <Button variant="ghost" disabled={busy} onClick={() => ask({ action: 'next', title: 'Oy beklemeden geçilsin mi?', confirm: 'Geç',
              body: pendingNames.length ? `Henüz oy vermeyen: ${pendingNames.join(', ')}. Bu takımın ortalaması verilen oylarla hesaplanır.` : 'Sıradaki takıma geçilecek.' })}>Sıradaki takım →</Button>
            <Button variant="danger" disabled={busy} onClick={() => ask({ action: 'finish', title: 'Oylama şimdi bitsin mi?', confirm: 'Bitir',
              body: 'Kalan takımlar oylanmadan sıralama dondurulur. Gerekirse "Önceki takım" ile oylamaya geri dönebilirsiniz.' })}>Oylamayı bitir</Button>
          </>
        )}
        {s.status === 'finished' && (
          <Button variant="ghost" disabled={busy} onClick={() => void run('prev')}>← Son takıma dön</Button>
        )}
      </div>

      {s.status === 'voting' && pendingNames.length > 0 && (
        <p className="mt-3 text-sm text-soluk">Bekleniyor: <b className="text-murekkep">{pendingNames.join(', ')}</b></p>
      )}

      {(s.status === 'finished' || s.status === 'revealing' || s.status === 'done') && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="ust-baslik">Salon ekranında açılış</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(REVEAL_LABELS) as RevealMode[]).map((mode) => (
                <Button key={mode} variant={s.status !== 'finished' && s.revealMode === mode ? 'primary' : 'ghost'} disabled={busy}
                  onClick={() => void run('reveal', { mode })}>{REVEAL_LABELS[mode]}</Button>
              ))}
            </div>
          </div>
          {s.status !== 'finished' && s.revealMode === 'stepwise' && (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy || s.revealStep >= s.revealCount} onClick={() => void run('reveal-next')} className="!px-8 !py-4 !text-sm">
                {s.revealStep >= s.revealCount ? 'Hepsi açıldı' : `Sıradakini aç (${s.revealCount - s.revealStep}. sıra)`}
              </Button>
              <Button variant="ghost" disabled={busy || s.revealStep === 0} onClick={() => void run('reveal-prev')}>Geri al</Button>
              <span className="rozet bg-pembe py-1 font-mono">{s.revealStep}/{s.revealCount} açıldı</span>
            </div>
          )}
          {s.status !== 'done' && (
            <Button disabled={busy} onClick={() => ask({ action: 'publish', title: 'Sonuçlar sitede yayınlansın mı?', confirm: 'Yayınla',
              body: `Dondurulmuş sıralama etkinlik sayfasına yazılır (gösterim: ${s.revealMode === 'stepwise' ? 'İlk 3' : REVEAL_LABELS[s.revealMode]}). Sonra jüri puanları değiştirilemez.` })}>Sonuçları sitede yayınla</Button>
          )}
          {s.status === 'done' && <Notice kind="success">Sonuçlar etkinlik sayfasında yayında.</Notice>}
        </div>
      )}

      {stageUrl && (
        <div className="mt-5 rounded-2xl border border-dashed border-kenar bg-zemin p-4">
          <p className="flex items-center gap-2 font-display text-base font-extrabold text-murekkep"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-kenar bg-gok text-murekkep"><MonitorPlay className="h-4 w-4" /></span> Salon ekranı (projeksiyon)</p>
          <p className="mt-2 text-xs leading-relaxed text-soluk">Bu linki yalnız projeksiyon bilgisayarında açın; linki bilen ekranı görür. Oturum sıfırlanınca link geçersiz olur.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={stageUrl} target="_blank" rel="noopener noreferrer" className="dugme dugme-limon">
              <ExternalLink className="h-4 w-4" /> Aç
            </a>
            <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(stageUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}>
              <Copy className="h-4 w-4" /> {copied ? 'Kopyalandı' : 'Linki kopyala'}
            </Button>
          </div>
        </div>
      )}

      {data.host && data.host.order.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer font-display text-sm font-bold text-murekkep">Sunum sırası ({data.host.order.length} takım · {data.host.judges} jüri)</summary>
          <ol className="mt-3 space-y-1 rounded-2xl border border-kenar bg-zemin p-3 text-sm">
            {data.host.order.map((t) => (
              <li key={t.index} className={t.index === s.index && s.status === 'voting' ? 'rounded-lg bg-limon px-2 py-0.5 font-display font-extrabold text-murekkep' : t.index < s.index ? 'px-2 text-soluk opacity-70' : 'px-2 text-murekkep'}>
                {t.index + 1}. {t.name}
              </li>
            ))}
          </ol>
        </details>
      )}

      {s.status !== 'idle' && (
        <div className="mt-6 border-t-2 border-dashed border-kenar/20 pt-4">
          <Button variant="danger" disabled={busy} onClick={() => ask({ action: 'reset', title: 'Oturum sıfırlansın mı?', confirm: 'Sıfırla',
            body: 'Oturum başa döner ve salon ekranı linki geçersiz olur. Verilen puanlar silinmez; yeniden başlatınca jürilerin her takıma tekrar oy vermesi gerekir. Yayınlanmış sonuç geri alınmaz.' })}>Oturumu sıfırla</Button>
        </div>
      )}

      <ConfirmDialog open={Boolean(confirm)} title={confirm?.title ?? ''} confirmLabel={confirm?.confirm ?? ''} busy={busy}
        onCancel={() => setConfirm(null)} onConfirm={() => confirm && void run(confirm.action, confirm.mode ? { mode: confirm.mode } : {})}>
        {confirm?.body}
      </ConfirmDialog>
      </div>
    </div>
  )
}
