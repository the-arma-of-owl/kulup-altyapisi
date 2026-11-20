import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { formatLine, mergeLines, type LogLine } from './logFormat'

type Filter = 'all' | 'problems'

export function LogPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  const [lines, setLines] = useState<LogLine[]>([])
  const [message, setMessage] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [clearing, setClearing] = useState(false)
  const lastId = useRef(0)
  const generation = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const noticeTimer = useRef<number | undefined>(undefined)

  const notify = (value: string) => {
    setMessage(value)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setMessage(''), 2500)
  }

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    let active = true
    let inFlight = false
    const currentGeneration = generation.current
    const poll = async () => {
      if (inFlight || clearing) return
      inFlight = true
      try {
        const query = `?after=${lastId.current}${filter === 'problems' ? '&level=problems' : ''}`
        const result = await api<{ lines: LogLine[] }>(`/system/logs${query}`)
        if (!active || generation.current !== currentGeneration) return
        setUnavailable(false)
        if (result.lines.length) {
          lastId.current = Math.max(lastId.current, ...result.lines.map((line) => line.id))
          setLines((current) => mergeLines(current, result.lines, 1000))
        }
      } catch {
        if (active && generation.current === currentGeneration) setUnavailable(true)
      } finally {
        inFlight = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [filter, clearing])

  useEffect(() => {
    if (box.current && stickToBottom.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines, filter])

  const changeFilter = (value: Filter) => {
    if (value === filter) return
    generation.current++
    lastId.current = 0
    setLines([])
    setUnavailable(false)
    stickToBottom.current = true
    setFilter(value)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map(formatLine).join('\n'))
      notify('Günlük kopyalandı.')
    } catch {
      notify('Günlük kopyalanamadı.')
    }
  }

  const clear = async () => {
    if (clearing) return
    generation.current++
    setClearing(true)
    try {
      await api<{ ok: true }>('/system/logs', 'DELETE')
      setLines([])
      setUnavailable(false)
      notify('Günlük temizlendi.')
    } catch {
      notify('Günlük temizlenemedi.')
    } finally {
      setClearing(false)
    }
  }

  return <section className="screen log-panel" aria-labelledby="log-title">
    <div className="heading"><div><h1 id="log-title">Günlük</h1><p>Worker işlemleri ve hataları. Paylaşmadan önce kayıtlar sunucuda maskelenir.</p></div></div>
    <div className="log-panel__toolbar">
      <div className="log-panel__filters" role="group" aria-label="Günlük süzgeci">
        <button type="button" className={filter === 'all' ? 'primary' : ''} aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>Tümü</button>
        <button type="button" className={filter === 'problems' ? 'primary' : ''} aria-pressed={filter === 'problems'} onClick={() => changeFilter('problems')}>Uyarı ve hatalar</button>
      </div>
      <div className="log-panel__actions">
        <button type="button" disabled={!lines.length} onClick={() => void copy()}>Kopyala</button>
        <button type="button" disabled={clearing} onClick={() => void clear()}>Temizle</button>
      </div>
    </div>
    {message && <p className="log-panel__message" role="status">{message}</p>}
    {unavailable && <p className="log-panel__error" role="alert">Günlük okunamadı; yerel sunucu yanıt vermiyor.</p>}
    <div className="log-panel__box" ref={box} role="log" aria-label="Günlük satırları" tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget
        stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
      }}>
      {!lines.length && <span className="log-panel__empty">{filter === 'problems' ? 'Uyarı veya hata yok.' : 'Henüz kayıt yok.'}</span>}
      {lines.map((line) => <div className={`log-panel__line log-panel__line--${line.level}`} key={line.id}>{formatLine(line)}</div>)}
    </div>
  </section>
}
