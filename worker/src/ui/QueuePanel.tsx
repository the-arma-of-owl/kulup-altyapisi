import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueueListItem } from '../../shared/types'
import { api } from '../api'

type Result = { sent: number; failed: number; cancelled: number; uncertain: number }
type Props = { connected: boolean; run: (action: () => Promise<void>) => Promise<void> }

const sourceLabels: Record<QueueListItem['source'], string> = {
  gate: 'Kapı', decision: 'Karar', bulk: 'Toplu', system: 'Sistem',
}
const timeFormat = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function QueuePanel({ connected, run }: Props) {
  const runRef = useRef(run)
  runRef.current = run
  const [items, setItems] = useState<QueueListItem[]>([])
  const [uncertainIds, setUncertainIds] = useState<number[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  // ABT: tarayıcı confirm() yerine satır içi "Emin misiniz?" kutusu
  const [pending, setPending] = useState<'send' | 'cancel' | null>(null)

  const load = useCallback(async () => {
    const [list, uncertain] = await Promise.all([
      api<QueueListItem[]>('/queue'), api<number[]>('/queue/uncertain'),
    ])
    setItems(list)
    setUncertainIds(uncertain)
    const selectable = new Set(list.filter((item) => !item.uncertain && !uncertain.includes(item.id)).map((item) => item.id))
    setSelected((current) => current.filter((id) => selectable.has(id)))
  }, [])

  useEffect(() => {
    void runRef.current(load)
    const timer = window.setInterval(() => { void runRef.current(load) }, 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  const selectable = items.filter((item) => !item.uncertain && !uncertainIds.includes(item.id))
  const readyIds = selected.filter((id) => selectable.some((item) => item.id === id))
  const allSelected = selectable.length > 0 && selectable.every((item) => readyIds.includes(item.id))

  const send = () => {
    if (!connected || working || !readyIds.length) return
    const ids = [...readyIds]
    setPending(null)
    setNotice('')
    setWorking(true)
    void run(async () => {
      try {
        if (!connected) return
        const result = await api<Result>('/queue/send', 'POST', { ids })
        setNotice(`Gönderildi: ${result.sent} · Hata: ${result.failed} · İptal: ${result.cancelled} · Belirsiz: ${result.uncertain}`)
        await load()
      } finally { setWorking(false) }
    })
  }

  const cancel = () => {
    if (working || !readyIds.length) return
    const ids = [...readyIds]
    setPending(null)
    setNotice('')
    setWorking(true)
    void run(async () => {
      try {
        const result = await api<{ cancelled: number }>('/queue/cancel', 'POST', { ids })
        setNotice(`${result.cancelled} mesaj iptal edildi.`)
        await load()
      } finally { setWorking(false) }
    })
  }

  return <section className="queue-panel card" aria-label="WhatsApp kuyruğu">
    <div><h2>Bekleyen mesajlar</h2><p>Bağlanmadan önce listeye bakın; tanımadığınız mesajları iptal edin.</p></div>
    {uncertainIds.length > 0 && <p className="queue-uncertain-help">Belirsiz kayıtlar: {uncertainIds.join(', ')}. Ulaşıp ulaşmadığı bilinmiyor; yeniden gönderilmez.</p>}
    <div className="actions">
      <button type="button" disabled={working || !selectable.length} onClick={() => setSelected(selectable.map((item) => item.id))}>Tümünü seç</button>
      <button type="button" disabled={working || !allSelected && !readyIds.length} onClick={() => setSelected([])}>Seçimi temizle</button>
      <button type="button" onClick={() => void run(load)}>Yenile</button>
    </div>
    {items.length === 0 ? <p>Bekleyen mesaj yok.</p> : <div className="table-wrap"><table className="queue-table"><thead><tr>
      <th>Seç</th><th>Alıcı</th><th>Kaynak</th><th>Saat</th><th>Metin önizlemesi</th><th>Görsel</th><th>Durum</th>
    </tr></thead><tbody>{items.map((item) => {
      const uncertain = item.uncertain || uncertainIds.includes(item.id)
      const date = new Date(item.createdAt)
      return <tr key={item.id} className={uncertain ? 'queue-row-uncertain' : undefined}>
        <td><input type="checkbox" aria-label={`${item.to} mesajını seç`} disabled={uncertain || working} checked={readyIds.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td>
        <td>{item.to}</td><td>{sourceLabels[item.source]}</td><td>{Number.isNaN(date.getTime()) ? '—' : timeFormat.format(date)}</td>
        <td className="queue-preview">{item.preview || '—'}</td><td>{item.hasMedia ? 'Var' : 'Yok'}</td>
        <td>{uncertain ? <span className="status queue-uncertain">Belirsiz — kontrol et</span> : item.autoSend ? <span className="status pending">Otomatik gidecek</span> : 'Onay bekliyor'}</td>
      </tr>
    })}</tbody></table></div>}
    {pending ? <div className="inline-confirm">
      <p>{pending === 'send' ? `${readyIds.length} mesaj gönderilecek; geri alınamaz.` : `${readyIds.length} mesaj iptal edilecek.`} Emin misiniz?</p>
      <div className="actions"><button type="button" onClick={() => setPending(null)}>Vazgeç</button>
        <button type="button" className={pending === 'send' ? 'primary' : 'danger'} disabled={working || !readyIds.length || (pending === 'send' && !connected)} onClick={pending === 'send' ? send : cancel}>{pending === 'send' ? 'Evet, gönder' : 'Evet, iptal et'}</button></div>
    </div> : <div className="actions">
      <button type="button" className="primary" disabled={!connected || working || !readyIds.length} onClick={() => setPending('send')}>Seçilenleri gönder ({readyIds.length})</button>
      <button type="button" className="danger" disabled={working || !readyIds.length} onClick={() => setPending('cancel')}>Seçilenleri iptal et ({readyIds.length})</button>
    </div>}
    {notice && <p className="queue-result" role="status">{notice}</p>}
  </section>
}
