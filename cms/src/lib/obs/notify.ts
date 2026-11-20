import { after } from 'next/server'
import { getObsStore, type ObsStore } from './store'
import { telegramSend, type TelegramTopic } from '../telegram'

/**
 * Merkezi olay günlüğü: logEvent() her olayı
 *  1) Vercel günlüğüne (console) yazar,
 *  2) obs.events tablosuna kaydeder (gün sonu raporu buradan sayar),
 *  3) Telegram'a bildirim kutusu (outbox) üzerinden gönderir.
 *
 * Telegram bir grupta dakikada ~20 mesaj kabul eder. Toplu sertifika/mail gönderiminde (saniyede ~1)
 * mesaj başına istek atılırsa çoğu 429 ile kaybolur. Kutu bunu çözer: her olay ayrı satır olarak kaydedilir;
 * gönderici en fazla 3,2 sn'de bir mesaj atar ve o ana kadar biriken olayları aynı konudaki TEK mesajda
 * alt alta (her kişi ayrı satır) birleştirir. Sakin zamanda her olay kendi mesajıyla gider.
 * Veritabanı yoksa (yerel/SQLite) olay doğrudan gönderilir.
 */

export type ObsLevel = 'info' | 'warn' | 'error'
export type ObsCategory = 'mail' | 'certificate' | 'whatsapp' | 'worker' | 'security' | 'application' | 'system' | 'report'

export type LogEventInput = {
  kind: string
  category: ObsCategory
  level?: ObsLevel
  topic?: TelegramTopic
  /** Telegram HTML metni (esc() ile kaçışlanmış). */
  text: string
  data?: Record<string, unknown>
  /** false: yalnız kaydet (rapora girer), Telegram'a gönderme. */
  notify?: boolean
  /** Aynı anahtar bu süre içinde yalnız bir kez bildirilir (ör. "kota doldu"). */
  dedupe?: { key: string; seconds: number }
}

type PayloadLike = Parameters<typeof getObsStore>[0]

const SEND_INTERVAL_MS = 3200
const MAX_MESSAGE = 3900
const defaultTopic: Record<ObsCategory, TelegramTopic> = {
  mail: 'sends', certificate: 'sends', whatsapp: 'sends', worker: 'system', security: 'security',
  application: 'applications', system: 'system', report: 'reports',
}

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Asla hata fırlatmaz; isteğin akışını bozmaz. */
export async function logEvent(payload: PayloadLike, input: LogEventInput): Promise<void> {
  const level = input.level ?? 'info'
  const topic = input.topic ?? defaultTopic[input.category]
  try {
    const line = `[obs] ${input.kind}: ${plain(input.text).replace(/\s+/g, ' ').slice(0, 400)}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.info(line)
  } catch { /* günlük yazımı akışı kesmez */ }

  const store = getObsStore(payload)
  let notify = input.notify !== false
  try {
    if (notify && input.dedupe) {
      notify = await store.kvSetIfAbsent(`dedupe:${input.dedupe.key}`, { at: Date.now() }, input.dedupe.seconds)
    }
  } catch (error) { console.error('[obs] tekilleştirme okunamadı:', (error as Error)?.message) }

  try {
    await store.recordEvent({ level, category: input.category, kind: input.kind, topic, text: input.text,
      data: input.data, notify: notify && store.durable })
  } catch (error) {
    console.error('[obs] olay kaydedilemedi:', (error as Error)?.message)
    // Kayıt yoksa bildirimi kaybetme: doğrudan gönder.
    if (notify) await sendDirect(input.text, topic)
    return
  }
  if (!notify) return
  if (!store.durable) {
    await sendDirect(input.text, topic)
    return
  }
  runInBackground(() => flushOutbox(payload, { maxDurationMs: 25_000 }))
}

async function sendDirect(text: string, topic: TelegramTopic): Promise<void> {
  try { await telegramSend(text, { topic }) } catch (error) { console.error('[obs] Telegram gönderilemedi:', (error as Error)?.message) }
}

/** Yanıt döndükten sonra da çalışsın (Vercel after()); istek bağlamı yoksa beklemeden çalıştır. */
export function runInBackground(task: () => Promise<unknown>): void {
  const safe = () => task().catch((error) => console.error('[obs] arka plan işi:', (error as Error)?.message))
  try {
    after(safe)
  } catch {
    void safe()
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Biriken bildirimleri gönderir. Aynı anda çalışan diğer örneklerle yuva (slot) üzerinden sıralanır. */
export async function flushOutbox(payload: PayloadLike, options: { maxDurationMs?: number; store?: ObsStore; sleep?: (ms: number) => Promise<unknown> } = {}): Promise<{ sent: number; failed: number }> {
  const store = options.store ?? getObsStore(payload)
  const sleep = options.sleep ?? wait
  if (!store.durable) return { sent: 0, failed: 0 }
  const deadline = Date.now() + (options.maxDurationMs ?? 25_000)
  let sent = 0
  let failed = 0
  while (Date.now() < deadline) {
    if ((await store.pendingCount()) === 0) break
    const slot = await store.claimSendSlot(SEND_INTERVAL_MS)
    if ('waitMs' in slot) {
      if (Date.now() + slot.waitMs > deadline) break
      await sleep(Math.min(slot.waitMs + 50, SEND_INTERVAL_MS + 500))
      continue
    }
    const claimed = await store.claimPending(60)
    if (!claimed.length) break
    // En eski olayın konusundan tek mesaj; diğer konular bırakılır, sonraki yuvada gider.
    const topic = claimed[0].topic
    const sameTopic = claimed.filter((item) => item.topic === topic)
    const message = packMessages(sameTopic.map((item) => item.text))
    const included = sameTopic.slice(0, message.count)
    const release = claimed.filter((item) => !included.includes(item)).map((item) => item.id)
    const result = await telegramSend(message.text, { topic: topic as TelegramTopic })
    if (result.ok || result.skipped) {
      sent += included.length
      await store.releasePending(release)
    } else {
      failed += included.length
      await store.releasePending(claimed.map((item) => item.id))
      if (result.status === 429 && result.retryAfter) await store.pushSendSlot(Date.now() + result.retryAfter * 1000)
      else break // kalıcı hata (ör. 400): döngüye girme; olay 5 denemeden sonra bırakılır
    }
  }
  return { sent, failed }
}

/** Mesajları 3900 karakteri aşmadan alt alta birleştirir; kaç tanesinin sığdığını döner. */
export function packMessages(texts: string[], max = MAX_MESSAGE): { text: string; count: number } {
  const fit = (text: string) => text.length <= max ? text : `${plain(text).slice(0, max - 20).replace(/[<>&]/g, '')}…`
  if (texts.length === 1) return { text: fit(texts[0]), count: 1 }
  const header = (n: number) => `🧾 <i>${n} bildirim birleştirildi</i>\n`
  let body = ''
  let count = 0
  for (const raw of texts) {
    const text = fit(raw)
    const next = body ? `${body}\n\n${text}` : text
    if (count > 0 && header(count + 1).length + next.length > max) break
    body = next
    count++
  }
  return { text: count > 1 ? `${header(count)}${body}` : body, count }
}
