'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { WheelPicker } from './WheelPicker'
import { formatCheckinTime, pushRecent, resultTitle, shouldSkipDuplicate, templateMatchesFields, wheelValues, type GateFieldDefinition } from './gateUi'
import './gate.css'
import { KULUP } from '@/lib/kulup'

type EventDoc = { id: number; title: string; gateFieldDefinitions?: GateFieldDefinition[] | null }
type Template = { id: number; name: string; message?: string }
type Tone = 'success' | 'warning' | 'error'
type Docs<T> = { docs?: T[] }
type CheckinReply = { code?: string; error?: string; warning?: string; registration?: { fullName?: string; checkedInAt?: string | null; gateFields?: Record<string, string> } }
type Result = { tone: Tone; title: string; name?: string; detail?: string; warning?: string; time?: string }
type Recent = { name: string; title: string; time: string }
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type JsQR = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null

// Ses yalnızca bir kullanıcı dokunuşundan sonra açılabilir; kamera/doğrula düğmelerinde çağrılır.
let audio: AudioContext | null = null
const unlockAudio = () => {
  try { audio ??= new AudioContext(); if (audio.state === 'suspended') void audio.resume() } catch { audio = null }
}
const TONES: Record<Tone, Array<[number, number, number]>> = {
  success: [[880, 0, 0.12], [1320, 0.13, 0.18]],
  warning: [[660, 0, 0.25]],
  error: [[220, 0, 0.18], [180, 0.22, 0.28]],
}
const feedback = (tone: Tone) => {
  navigator.vibrate?.(tone === 'success' ? 120 : tone === 'warning' ? [80, 60, 80] : [250, 100, 250])
  if (!audio) return
  const now = audio.currentTime
  for (const [frequency, start, duration] of TONES[tone]) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = tone === 'error' ? 'square' : 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(now + start)
    oscillator.stop(now + start + duration + 0.02)
  }
}

const cameraError = (error: unknown): string => {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Kamera izni verilmedi. Adres çubuğundaki kilit simgesinden kameraya izin verip sayfayı yenileyin.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Bu cihazda kullanılabilir kamera bulunamadı. Bilet kodunu elle girin.'
  if (name === 'NotReadableError') return 'Kamera başka bir uygulama tarafından kullanılıyor. Onu kapatıp yeniden deneyin.'
  return 'Kamera açılamadı. Kamera iznini kontrol edin veya bilet kodunu elle girin.'
}

// BarcodeDetector olmayan tarayıcılarda (iPhone Safari, Firefox) jsQR kendi sunucumuzdan yüklenir.
let jsQRPromise: Promise<JsQR> | null = null
const loadJsQR = () => jsQRPromise ??= new Promise<JsQR>((resolve, reject) => {
  const existing = (window as unknown as { jsQR?: JsQR }).jsQR
  if (existing) { resolve(existing); return }
  const script = document.createElement('script')
  script.src = '/vendor/jsQR.js'
  script.onload = () => { const fn = (window as unknown as { jsQR?: JsQR }).jsQR; if (fn) resolve(fn); else reject(new Error('jsQR yüklenemedi')) }
  script.onerror = () => { jsQRPromise = null; reject(new Error('jsQR yüklenemedi')) }
  document.head.appendChild(script)
})

export const GateScanner = () => {
  const [events, setEvents] = useState<EventDoc[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [eventId, setEventId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [manual, setManual] = useState('')
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [loadError, setLoadError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanning = useRef(false)
  const lastSeen = useRef(new Map<string, number>())

  useEffect(() => {
    Promise.all([
      fetch('/api/events?where[scannerActive][equals]=true&limit=100&sort=-date&depth=0', { credentials: 'include' }).then((r) => r.json() as Promise<Docs<EventDoc>>),
      fetch('/api/whatsapp-templates?limit=100&sort=name&depth=0', { credentials: 'include' }).then((r) => (r.ok ? r.json() as Promise<Docs<Template>> : { docs: [] as Template[] })),
    ]).then(([eventData, templateData]) => {
      const list = eventData.docs || []
      setEvents(list)
      setTemplates(templateData.docs || [])
      setEventId(String(list[0]?.id || ''))
    }).catch(() => setLoadError('Etkinlikler veya şablonlar alınamadı. Sayfayı yenileyin.'))
  }, [])

  const selected = events.find(({ id }) => String(id) === eventId)
  const definitions = Array.isArray(selected?.gateFieldDefinitions) ? selected!.gateFieldDefinitions! : []
  const keys = definitions.map(({ key }) => key)
  const matchingTemplates = templates.filter(({ message }) => templateMatchesFields(message || '', keys))
  const selectedTemplate = templates.find(({ id }) => String(id) === templateId)
  const templateWarning = selectedTemplate && keys.length > 0 && !templateMatchesFields(selectedTemplate.message || '', keys)

  useEffect(() => {
    const event = events.find(({ id }) => String(id) === eventId)
    const fieldKeys = event?.gateFieldDefinitions?.map(({ key }) => key) || []
    const first = templates.find(({ message }) => templateMatchesFields(message || '', fieldKeys))
    if (first) setTemplateId((current) => current || String(first.id))
  }, [eventId, events, templates])

  const submit = useCallback(async (raw: string) => {
    if (scanning.current) return
    if (!eventId) { setResult({ tone: 'error', title: 'Önce etkinliği seçin.' }); return }
    const token = raw.trim()
    if (shouldSkipDuplicate(lastSeen.current, token, Date.now())) return
    scanning.current = true
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch('/api/gate/checkin', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: Number(eventId), templateId: templateId ? Number(templateId) : null, gateFields: fields, token: raw }),
      })
      const data = await response.json().catch(() => ({})) as CheckinReply
      const code = data.code || ''
      const tone: Tone = code === 'ok' ? 'success' : code === 'already_in' ? 'warning' : 'error'
      const title = resultTitle(code, data.error || 'Bilet doğrulanamadı.')
      // Eksik alan düzeltilince aynı bilet 10 sn beklemeden yeniden okutulabilsin
      if (code === 'missing_fields' || code === 'invalid_value') lastSeen.current.delete(token)
      const time = code === 'already_in' ? formatCheckinTime(data.registration?.checkedInAt) : ''
      feedback(tone)
      setResult({ tone, title, name: data.registration?.fullName, time,
        detail: time ? `İlk giriş: ${time}` : code === 'missing_fields' || code === 'invalid_value' ? data.error : undefined,
        warning: data.warning })
      setRecent((current) => pushRecent(current, {
        name: data.registration?.fullName || 'Ad bulunamadı', title,
        time: formatCheckinTime(new Date().toISOString()),
      }))
      if (response.ok) setManual('')
    } catch {
      lastSeen.current.delete(token)
      feedback('error')
      setResult({ tone: 'error', title: 'Bağlantı hatası. Yeniden deneyin.' })
    } finally {
      window.setTimeout(() => { scanning.current = false; setBusy(false) }, 1_500)
    }
  }, [eventId, fields, templateId])

  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | null = null
    let timer: number | null = null
    let stopped = false
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const video = videoRef.current
        if (stopped || !video) { stream.getTracks().forEach((track) => track.stop()); return }
        video.srcObject = stream
        await video.play()
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
        const detector = Native ? new Native({ formats: ['qr_code'] }) : null
        const decode = detector ? null : await loadJsQR()
        timer = window.setInterval(async () => {
          if (stopped || scanning.current || !video || video.readyState < 2) return
          let value: string | undefined
          try {
            if (detector) value = (await detector.detect(video))[0]?.rawValue
            else if (decode && canvasRef.current) {
              const canvas = canvasRef.current
              const context = canvas.getContext('2d', { willReadFrequently: true })
              if (!context) return
              canvas.width = video.videoWidth; canvas.height = video.videoHeight
              context.drawImage(video, 0, 0)
              value = decode(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data
            }
          } catch { return }
          if (value) void submit(value)
        }, 300)
      } catch (error) {
        // Alan ya da şablon değişince kamera yeniden kurulur; yarıda kalan eski kurulumun hatası yenisini kapatmasın
        if (stopped) return
        setCamera(false)
        setResult({ tone: 'error', title: cameraError(error) })
      }
    }
    void start()
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [camera, submit])

  const manualSubmit = (event: FormEvent) => { event.preventDefault(); unlockAudio(); void submit(manual) }

  return <main className="byt-gate">
    <header><p>{KULUP.kisaAd} Kapı</p><h1>QR okuyucu</h1><span>Etkinliği seçin; bileti okutunca giriş yalnızca bir kez kaydedilir.</span></header>
    <section className="byt-gate__settings">
      <label><span>Etkinlik</span><select value={eventId} onChange={(e) => { setEventId(e.target.value); setFields({}); setResult(null) }}>
        <option value="">Etkinlik seçin</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label><span>Hoş geldin WhatsApp mesajı</span><select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">Mesaj gönderme</option>{templates.map((item) => <option key={item.id} value={item.id}>{matchingTemplates.some(({ id }) => id === item.id) ? '✓ ' : ''}{item.name}</option>)}</select>
        {templateWarning && <small className="byt-gate__template-warning">⚠ Bu şablon etkinliğin kapı alanlarını içermiyor.</small>}</label>
      {loadError && <p className="byt-gate__empty">{loadError}</p>}
      {!loadError && !events.length && <p className="byt-gate__empty">QR okuyucusu açık etkinlik yok. Yönetici, etkinlik ayarlarından “QR Okuyucu Aktif” seçeneğini açmalı.</p>}
    </section>
    {definitions.length > 0 && <section className="byt-gate__fields"><h2>Her girişte kaydedilecek alanlar</h2>
      {definitions.map((definition) => {
        const values = wheelValues(definition)
        const change = (value: string) => setFields((current) => ({ ...current, [definition.key]: value }))
        return <label key={definition.key}><span>{definition.label || definition.key}{definition.required ? ' *' : ''}</span>
          {values ? <WheelPicker label={definition.label || definition.key} options={values} value={fields[definition.key] || ''} onChange={change} />
            : <input value={fields[definition.key] || ''} required={definition.required}
              inputMode={definition.min !== undefined || definition.max !== undefined ? 'numeric' : undefined}
              onChange={(e) => change(e.target.value)} />}</label>
      })}
    </section>}
    <section className="byt-gate__scanner">
      <div className="byt-gate__camera">{camera
        ? <><video ref={videoRef} muted playsInline aria-label="Bilet QR kamerası" /><canvas ref={canvasRef} hidden /></>
        : <div><strong>Kamera kapalı</strong><span>Telefon veya tabletin arka kamerasını kullanın.</span></div>}</div>
      <section className={`byt-gate__result${result ? ` byt-gate__result--${result.tone}` : ''}`} role="status" aria-live="polite">
        {result && <><strong>{result.title}</strong>{result.name && <span>{result.name}</span>}
          {result.detail && <span>{result.detail}</span>}{result.warning && <span className="byt-gate__result-warning">⚠ {result.warning}</span>}</>}
      </section>
      <section className="byt-gate__recent"><h2>Son 8 okutma</h2>
        {recent.length ? <ol>{recent.map((item, index) => <li key={index}><span>{item.name}</span><span>{item.title}</span><time>{item.time}</time></li>)}</ol>
          : <p>Henüz bilet okutulmadı.</p>}</section>
      <button type="button" className="byt-gate__primary" disabled={!eventId} onClick={() => { unlockAudio(); setCamera((on) => !on) }}>{camera ? 'Kamerayı kapat' : 'Kamerayı aç'}</button>
      {!eventId && <p className="byt-gate__hint">Kamerayı açmak için önce QR okuyucusu açık bir etkinlik seçin.</p>}
      <form onSubmit={manualSubmit}><label><span>Bilet kodunu elle girin</span><input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="16 karakterlik kod veya bilet linki" /></label>
        <button type="submit" disabled={busy || !manual.trim() || !eventId}>Kodu doğrula</button></form>
    </section>
  </main>
}
