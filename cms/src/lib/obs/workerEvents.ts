import type { Endpoint } from 'payload'
import { hasVerifiedTotp } from '../requireTotp'
import { logEvent, type LogEventInput } from './notify'
import { cleanReason, esc } from './privacy'

/**
 * POST /api/worker/event — masaüstü worker'ın olayları (WhatsApp bağlandı/koptu, kuyruk hatası,
 * sertifika sonuçları). Worker kendi Telegram anahtarını taşımaz; olaylar CMS üzerinden loglanır.
 * Yalnız TOTP doğrulanmış yönetici oturumu (worker'ın oturumu) gönderebilir.
 */

export const WORKER_EVENT_KINDS = [
  'worker_started', 'worker_error',
  'wa_connected', 'wa_disconnected', 'wa_auth_failure', 'wa_reconnect_exhausted', 'wa_start_failed',
  'queue_error', 'queue_interrupted', 'queue_run',
  'certificate_result', 'certificate_failed', 'certificate_batch',
  'send_batch',
] as const
export type WorkerEventKind = (typeof WORKER_EVENT_KINDS)[number]

type Data = Record<string, unknown>
const str = (value: unknown, max = 200): string => (typeof value === 'string' || typeof value === 'number') ? cleanReason(String(value), max) : ''
const num = (value: unknown): number | null => {
  const n = Number(value)
  return value !== null && value !== '' && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.floor(n) : null
}
const channel = (value: unknown, ok: string, labels: Record<string, string>) =>
  labels[String(value)] ?? (value ? esc(str(value, 20)) : ok)

/** Olayı doğrular ve Telegram metnine çevirir; geçersizse null. */
export function formatWorkerEvent(kind: string, data: Data, operator: string): Omit<LogEventInput, 'category'> & { category: LogEventInput['category'] } | null {
  if (!(WORKER_EVENT_KINDS as readonly string[]).includes(kind)) return null
  const by = `\n🖥️ Worker: ${esc(operator)}`
  switch (kind as WorkerEventKind) {
    case 'worker_started':
      return { kind, category: 'worker', notify: false, text: `🖥️ Worker başlatıldı${data.version ? ` (sürüm ${esc(str(data.version, 20))})` : ''}${by}` }
    case 'worker_error':
      return { kind, category: 'worker', topic: 'errors', level: 'error',
        dedupe: { key: `worker-error-${str(data.path, 60)}-${str(data.message, 80)}`, seconds: 600 },
        text: `💥 <b>Worker hatası</b>${data.path ? ` (${esc(str(data.path, 80))})` : ''}\n⚠️ ${esc(str(data.message, 300) || 'ayrıntı yok')}${by}` }
    case 'wa_connected':
      return { kind, category: 'whatsapp', topic: 'system',
        text: `🟢 <b>WhatsApp bağlandı</b>${data.account ? ` — ${esc(str(data.account, 60))}` : ''}${num(data.pending) !== null ? `\n📦 Kuyrukta bekleyen: ${num(data.pending)}` : ''}${by}` }
    case 'wa_disconnected':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'warn',
        dedupe: { key: `wa-disc-${str(data.reason, 60)}`, seconds: 120 },
        text: `🔴 <b>WhatsApp bağlantısı koptu</b>\n⚠️ Neden: ${esc(str(data.reason, 200) || 'bilinmiyor')}${data.willRetry ? `\n🔁 Otomatik yeniden bağlanma deneniyor (${num(data.attempt) ?? '?'}. deneme)` : '\n✋ Otomatik deneme yok; Worker\'da Bağlan gerekli'}${by}` }
    case 'wa_auth_failure':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'error',
        text: `🔴 <b>WhatsApp oturumu doğrulanamadı</b>\nKayıtlı oturum silindi; Worker'da yeni QR okutulmalı.${by}` }
    case 'wa_reconnect_exhausted':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'error',
        text: `🔴 <b>WhatsApp yeniden bağlanamadı</b> — otomatik denemeler bitti.\n⚠️ Son neden: ${esc(str(data.reason, 200) || '-')}\nWorker'da Bağlan'a basılmalı; kuyruk bu sürede gönderilmez.${by}` }
    case 'wa_start_failed':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'error', dedupe: { key: `wa-start-${str(data.reason, 60)}`, seconds: 600 },
        text: `🔴 <b>WhatsApp başlatılamadı</b>\n⚠️ ${esc(str(data.reason, 300) || '-')}${by}` }
    case 'queue_error':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'error',
        dedupe: { key: `queue-error-${str(data.message, 80)}`, seconds: 900 },
        text: `💥 <b>WhatsApp kuyruğu çalışmadı</b>\n⚠️ ${esc(str(data.message, 300) || 'ayrıntı yok')}${data.automatic ? '\n(otomatik gönderim turu; 5 sn\'de bir tekrar denenir, bu uyarı 15 dk\'da bir gelir)' : ''}${by}` }
    case 'queue_interrupted':
      return { kind, category: 'whatsapp', topic: 'errors', level: 'warn',
        text: `⏸️ <b>WhatsApp gönderimi yarıda kaldı</b>\n✅ Giden: ${num(data.sent) ?? 0}/${num(data.total) ?? '?'} · 📦 Kalan: <b>${num(data.remaining) ?? '?'}</b>\n⚠️ Neden: ${esc(str(data.reason, 200) || 'bağlantı koptu')}\nYeniden bağlanınca Worker'da "Devam et".${by}` }
    case 'queue_run': {
      const sent = num(data.sent) ?? 0, failed = num(data.failed) ?? 0
      if (!sent && !failed) return { kind, category: 'whatsapp', notify: false, text: 'WhatsApp turu: gönderim yok' }
      return { kind, category: 'whatsapp', notify: false,
        text: `📨 WhatsApp turu: ${sent} gönderildi, ${failed} başarısız, ${num(data.cancelled) ?? 0} iptal${by}` }
    }
    case 'certificate_result': {
      const mail = channel(data.mail, '-', { sent: '✅ gönderildi', failed: '❌ gitmedi', skipped: '➖ yok' })
      const wa = channel(data.whatsapp, '-', { queued: '🕒 kuyrukta', failed: '❌ kuyruğa girmedi', skipped: '➖ yok' })
      const failed = data.mail === 'failed' || data.whatsapp === 'failed' || Boolean(data.error)
      return { kind, category: 'certificate', level: failed ? 'error' : 'info',
        text: `${failed ? '⚠️' : '🎓'} <b>Sertifika${failed ? ' — sorunlu' : ' gönderildi'}</b> → ${esc(str(data.name, 120) || 'İsimsiz')}`
          + `${data.code ? `\n🔖 ${esc(str(data.code, 60))}` : ''}`
          + `${data.eventTitle ? `\n🎪 ${esc(str(data.eventTitle, 160))}` : ''}`
          + `\n📧 Mail: ${mail} · 💬 WhatsApp: ${wa}`
          + `${data.error ? `\n⚠️ <b>Neden:</b> ${esc(str(data.error, 300))}` : ''}`
          + `${num(data.index) !== null && num(data.total) !== null ? `\n📦 Sıra: ${num(data.index)}/${num(data.total)} (kalan ${Math.max(0, (num(data.total) ?? 0) - (num(data.index) ?? 0))})` : ''}` }
    }
    case 'certificate_failed':
      return { kind, category: 'certificate', level: 'error',
        text: `❌ <b>Sertifika üretilemedi/yüklenemedi</b> → ${esc(str(data.name, 120) || 'İsimsiz')}\n⚠️ <b>Neden:</b> ${esc(str(data.reason, 300) || 'bilinmiyor')}${data.eventTitle ? `\n🎪 ${esc(str(data.eventTitle, 160))}` : ''}${num(data.index) !== null ? `\n📦 Sıra: ${num(data.index)}/${num(data.total) ?? '?'}` : ''}` }
    case 'certificate_batch':
      return { kind, category: 'certificate',
        level: (num(data.mailFailed) ?? 0) + (num(data.failed) ?? 0) + (num(data.waFailed) ?? 0) > 0 ? 'warn' : 'info',
        text: `🏁 <b>Sertifika gönderimi bitti</b>${data.eventTitle ? ` — ${esc(str(data.eventTitle, 160))}` : ''}\n👥 ${num(data.total) ?? 0} kişi · 📧 ${num(data.mailSent) ?? 0} mail (❌ ${num(data.mailFailed) ?? 0}) · 💬 ${num(data.waQueued) ?? 0} WA kuyrukta (❌ ${num(data.waFailed) ?? 0}) · 🛠️ üretilemeyen ${num(data.failed) ?? 0}${by}` }
    case 'send_batch':
      return { kind, category: 'mail',
        level: (num(data.failed) ?? 0) > 0 ? 'warn' : 'info',
        text: `🏁 <b>${esc(str(data.label, 120) || 'Toplu gönderim')} bitti</b>\n👥 ${num(data.total) ?? 0} kişi · ✅ ${num(data.sent) ?? 0} · ❌ ${num(data.failed) ?? 0}${num(data.waQueued) !== null ? ` · 💬 ${num(data.waQueued)} WA kuyrukta` : ''}${by}` }
  }
}

export const workerEventEndpoint: Endpoint = {
  path: '/worker/event',
  method: 'post',
  handler: async (req) => {
    const user = req.user as (typeof req.user & { hasTotp?: boolean; _strategy?: string; email?: string }) | null
    if (!user) return Response.json({ ok: false, error: 'Oturum açmanız gerekiyor' }, { status: 401 })
    if (!hasVerifiedTotp(user) || !(user as { roles?: string[] | null }).roles?.includes('admin')) {
      return Response.json({ ok: false, error: 'İki adımlı doğrulaması tamamlanmış yönetici gerekiyor' }, { status: 403 })
    }
    let body: unknown
    try {
      const raw = await req.text?.()
      if (!raw || raw.length > 20_000) return Response.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
      body = JSON.parse(raw)
    } catch {
      return Response.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 })
    }
    const { kind, data } = (body && typeof body === 'object' ? body : {}) as { kind?: unknown; data?: unknown }
    const payloadData = data && typeof data === 'object' && !Array.isArray(data) ? data as Data : {}
    const event = typeof kind === 'string' ? formatWorkerEvent(kind, payloadData, String(user.email || user.id)) : null
    if (!event) return Response.json({ ok: false, error: 'Bilinmeyen olay' }, { status: 400 })
    await logEvent(req.payload, { ...event, data: { ...pickNumbers(payloadData), source: 'worker' } })
    return Response.json({ ok: true })
  },
}

function pickNumbers(data: Data): Data {
  const out: Data = {}
  for (const key of ['sent', 'failed', 'total', 'remaining', 'mailSent', 'mailFailed', 'waQueued', 'waFailed', 'index', 'cancelled']) {
    const value = num(data[key])
    if (value !== null) out[key] = value
  }
  for (const key of ['mail', 'whatsapp']) if (typeof data[key] === 'string') out[key] = str(data[key], 20)
  return out
}
