import type { Endpoint } from 'payload'
import { hasInternalKey } from '../access'
import { isValidIp } from './clientIp'
import { logEvent } from './notify'
import { cleanReason, esc, hashIp, hashKey } from './privacy'
import { LIMITS, allow, clientLine, recordSecurity } from './security'
import { getObsStore } from './store'

/**
 * POST /api/obs/ingest — site sunucusunun (site) olayları. Yalnız iç anahtarla (INTERNAL_API_KEY).
 * Site Telegram anahtarı taşımak zorunda kalmaz; tüm bildirimler konu/kutu düzeniyle CMS'ten gider.
 *
 * Türler:
 *  - form_rejected  { ip, ua, form, status, reason }                 → Turnstile/hız sınırı reddi (sitede)
 *  - site_error     { where, reason }                                → sitede yutulan hata
 */

const text = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function handleIngest(payload: Parameters<typeof getObsStore>[0], body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const type = text(body.type, 40)
  const ip = typeof body.ip === 'string' && isValidIp(body.ip.trim()) ? body.ip.trim() : 'unknown'
  const ua = text(body.ua, 300)
  switch (type) {
    case 'form_rejected': {
      const form = text(body.form, 40).replace(/[^a-z-]/g, '') || 'bilinmeyen'
      const status = Number(body.status) || 0
      const reason = cleanReason(body.reason, 200)
      const ipHash = hashIp(ip)
      const { count } = await allow(payload, 'form:rejected:ip', ipHash, Number.MAX_SAFE_INTEGER, 600)
      await recordSecurity(payload, { kind: 'form_rejected', ip, ua, path: form, detail: { status, reason, count } })
      if (count >= 10) {
        await logEvent(payload, {
          kind: 'form_abuse', category: 'security', level: 'warn',
          dedupe: { key: `form-abuse-${ipHash}`, seconds: 3600 },
          text: `⚠️ <b>Şüpheli form trafiği</b>\nAynı IP'den 10 dakikada <b>${count}</b> reddedilen gönderim (${esc(form)}; son: ${status} ${esc(reason)}).\n${clientLine(ip, ua)}`,
        })
      }
      return { status: 200, body: { ok: true, count } }
    }
    case 'site_error': {
      const where = text(body.where, 80) || 'site'
      const reason = cleanReason(body.reason, 300) || 'ayrıntı yok'
      await logEvent(payload, {
        kind: 'site_error', category: 'system', topic: 'errors', level: 'error',
        dedupe: { key: `site-error-${hashKey(`${where}:${reason.slice(0, 80)}`, 'r')}`, seconds: 900 },
        text: `💥 <b>Site hatası</b> (${esc(where)})\n⚠️ ${esc(reason)}\n(Aynı hata 15 dk'da bir bildirilir.)`,
      })
      return { status: 200, body: { ok: true } }
    }
    default:
      return { status: 400, body: { ok: false, error: 'Bilinmeyen olay türü' } }
  }
}

export const ingestEndpoint: Endpoint = {
  path: '/obs/ingest',
  method: 'post',
  handler: async (req) => {
    if (!hasInternalKey(req.headers)) return Response.json({ ok: false }, { status: 401 })
    let body: unknown
    try {
      const raw = await req.text?.()
      if (!raw || raw.length > 12_000) return Response.json({ ok: false }, { status: 400 })
      body = JSON.parse(raw)
    } catch {
      return Response.json({ ok: false }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ ok: false }, { status: 400 })
    const result = await handleIngest(req.payload, body as Record<string, unknown>)
    return Response.json(result.body, { status: result.status })
  },
}
