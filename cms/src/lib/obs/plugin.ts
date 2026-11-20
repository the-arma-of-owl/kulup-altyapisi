import { APIError, type CollectionConfig, type Config, type Endpoint, type GlobalConfig, type PayloadRequest, type Plugin } from 'payload'
import { describeDevice, requestClient } from './clientIp'
import { describeWaError, waRecipient, waSourceLabel } from './formatters'
import { ingestEndpoint } from './ingest'
import { logEvent } from './notify'
import { esc, hashIp, hashKey, maskEmail } from './privacy'
import {
  LIMITS, PANIC_MESSAGE, accountKey, allow, clientLine, getPanic, isBlocked, recordSecurity,
} from './security'
import { getObsStore } from './store'
import { workerEventEndpoint } from './workerEvents'

/**
 * Gözlem + yönetim sertleştirme eklentisi (payload.config.ts'de payloadTotp'tan SONRA eklenir):
 *  - Panel girişi: IP başına deneme sınırı, 5 hatada 15 dk IP engeli, başarılı/başarısız giriş bildirimi (IP, cihaz)
 *  - TOTP: payload-totp hatalı kodda 200 döndüğü için Payload hesap kilidi devreye girmez → ayrı sınır + engel
 *  - Panik (acil kilit): giriş + oturumlu yazma + worker maili durur (Telegram'dan açılır/kapanır)
 *  - Site formları: ziyaretçi IP'siyle sayaç, paylaşılan hız sınırı, şüpheli tekrar uyarısı
 *  - WhatsApp kuyruğu: her gönderim / hata nedeniyle bildirim
 *  - Yönetici hesabı oluşturma / yetki değişikliği uyarısı
 *  - Uçlar: /api/obs/ingest (site), /api/worker/event (worker)
 */

const FORM_COLLECTIONS = ['event-registrations', 'member-applications', 'core-team-applications', 'contact-messages']
const FORM_LABEL: Record<string, string> = {
  'event-registrations': 'etkinlik kaydı', 'member-applications': 'üyelik başvurusu',
  'core-team-applications': 'core team başvurusu', 'contact-messages': 'iletişim mesajı',
}
const WRITE_OPERATIONS = new Set(['create', 'update', 'updateByID', 'delete', 'deleteByID'])

const pathOf = (req: PayloadRequest | undefined): string => {
  try { return new URL(req?.url || 'http://x/').pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase() } catch { return '' }
}
const obsError = (message: string, status: number, marker: string) => new APIError(message, status, { obs: marker }, true)
const isObsError = (error: unknown) => Boolean((error as { data?: { obs?: unknown } })?.data?.obs)

// ─── Panel girişi ───────────────────────────────────────────────────────────────

async function beforeLogin(req: PayloadRequest): Promise<void> {
  const { ip, ua } = requestClient(req)
  const ipHash = hashIp(ip)
  const email = (req.data as { email?: unknown } | undefined)?.email
  if ((await getPanic(req.payload)).active) {
    await recordSecurity(req.payload, { kind: 'login_panic_rejected', ip, ua, actor: maskEmail(email) })
    throw obsError(PANIC_MESSAGE, 423, 'panic')
  }
  const until = await isBlocked(req.payload, 'login', ipHash)
  if (until) {
    await recordSecurity(req.payload, { kind: 'login_blocked', ip, ua, actor: maskEmail(email) })
    throw obsError(`Çok fazla başarısız giriş denemesi. Bu ağdan girişler ${Math.ceil((until.getTime() - Date.now()) / 60000)} dakika engellendi.`, 429, 'login_blocked')
  }
  const attempts = LIMITS.loginAttemptsPerIp
  const { allowed, count } = await allow(req.payload, attempts.bucket, ipHash, attempts.max, attempts.windowSec)
  if (!allowed) {
    await recordSecurity(req.payload, { kind: 'login_rate_limited', ip, ua, actor: maskEmail(email), detail: { count } })
    await logEvent(req.payload, {
      kind: 'login_rate_limited', category: 'security', level: 'warn', dedupe: { key: `login-rl-${ipHash}`, seconds: 900 },
      text: `🚫 <b>Giriş deneme sınırı aşıldı</b>\nBu IP'den 15 dk'da ${count} giriş denemesi (sınır ${attempts.max}).\n${clientLine(ip, ua)}\nSon denenen hesap: ${esc(maskEmail(email))}`,
    })
    throw obsError('Çok fazla giriş denemesi. 15 dakika sonra yeniden deneyin.', 429, 'login_rate_limited')
  }
}

async function onLoginError(req: PayloadRequest, error: unknown): Promise<void> {
  const status = (error as { status?: number })?.status
  if (isObsError(error) || (status !== 401 && status !== 423 && (error as Error)?.name !== 'AuthenticationError')) return
  const { ip, ua } = requestClient(req)
  const ipHash = hashIp(ip)
  const email = (req.data as { email?: unknown } | undefined)?.email
  const locked = status === 423 || (error as Error)?.name === 'LockedAuth'
  const fail = LIMITS.loginFailuresPerIp
  const { count } = await allow(req.payload, fail.bucket, ipHash, Number.MAX_SAFE_INTEGER, fail.windowSec)
  const acct = await allow(req.payload, LIMITS.loginFailuresPerAccount.bucket, accountKey(email), Number.MAX_SAFE_INTEGER, LIMITS.loginFailuresPerAccount.windowSec)
  await recordSecurity(req.payload, { kind: locked ? 'login_locked' : 'login_failed', ip, ua, actor: maskEmail(email), path: '/api/users/login', detail: { count, account: acct.count } })
  let blockedNow = false
  if (count >= fail.max) {
    try { await getObsStore(req.payload).block('login', ipHash, fail.blockSec, 'başarısız giriş') ; blockedNow = true } catch { /* engel yazılamazsa uyarı yine gider */ }
  }
  await logEvent(req.payload, {
    kind: locked ? 'login_locked' : 'login_failed', category: 'security', level: blockedNow || locked ? 'error' : 'warn',
    text: `${locked ? '🔒' : '⛔'} <b>${locked ? 'Hesap kilitli — giriş reddedildi' : 'Başarısız panel girişi'}</b>\n👤 Hesap: ${esc(maskEmail(email))}\n${clientLine(ip, ua)}\n📈 Bu IP: 10 dk'da ${count}/${fail.max} hata · bu hesap: 1 saatte ${acct.count}`
      + (blockedNow ? `\n🚫 <b>IP ${fail.blockSec / 60} dk engellendi.</b>` : '')
      + (locked ? '\nℹ️ Payload hesabı 5 hatalı parolada 10 dk kilitler.' : ''),
  })
  if (acct.count >= LIMITS.loginFailuresPerAccount.max) {
    await logEvent(req.payload, {
      kind: 'login_account_targeted', category: 'security', level: 'error', dedupe: { key: `acct-target-${accountKey(email)}`, seconds: 3600 },
      text: `🎯 <b>Hesaba yoğun parola denemesi</b>\n👤 ${esc(maskEmail(email))}: 1 saatte ${acct.count} başarısız deneme (farklı IP'lerden olabilir).\nGerekirse /panik ile girişleri kapatın ve parolayı değiştirin.`,
    })
  }
}

async function afterPasswordLogin(req: PayloadRequest, user: { id?: unknown; email?: unknown }): Promise<void> {
  const { ip, ua } = requestClient(req)
  // Parola adımı; giriş TOTP doğrulanınca tamamlanır (bildirim orada).
  await recordSecurity(req.payload, { kind: 'login_password_ok', ip, ua, actor: String(user.email ?? user.id ?? '') })
}

// ─── TOTP uçları ────────────────────────────────────────────────────────────────

const totpReply = (message: string, status: number) => Response.json({ ok: false, message }, { status })

export function wrapTotpEndpoint(endpoint: Endpoint, kind: 'verify' | 'setup' | 'remove'): Endpoint {
  const original = endpoint.handler
  return {
    ...endpoint,
    handler: async (req) => {
      const { ip, ua } = requestClient(req)
      const ipHash = hashIp(ip)
      const user = req.user as { id?: unknown; email?: string } | null
      const userKey = user?.id !== undefined ? hashKey(String(user.id), 'user') : ipHash
      if ((await getPanic(req.payload)).active) return totpReply(PANIC_MESSAGE, 423)
      const until = (await isBlocked(req.payload, 'totp', userKey)) || (await isBlocked(req.payload, 'login', ipHash))
      if (until) {
        await recordSecurity(req.payload, { kind: 'totp_blocked', ip, ua, actor: user?.email ?? null })
        return totpReply(`Çok fazla hatalı doğrulama kodu. ${Math.ceil((until.getTime() - Date.now()) / 60000)} dakika sonra yeniden deneyin.`, 429)
      }
      const attempts = LIMITS.totpAttemptsPerIp
      const { allowed, count: tries } = await allow(req.payload, attempts.bucket, ipHash, attempts.max, attempts.windowSec)
      if (!allowed) {
        await recordSecurity(req.payload, { kind: 'totp_rate_limited', ip, ua, actor: user?.email ?? null, detail: { tries } })
        return totpReply('Çok fazla doğrulama denemesi. 15 dakika sonra yeniden deneyin.', 429)
      }
      const response = await original(req)
      let ok = false
      try { ok = ((await response.clone().json()) as { ok?: unknown } | null)?.ok === true } catch { ok = response.ok }
      const label = kind === 'verify' ? 'doğrulama' : kind === 'setup' ? 'kurulum' : 'kaldırma'
      if (ok) {
        await recordSecurity(req.payload, { kind: `totp_${kind}_ok`, ip, ua, actor: user?.email ?? null })
        await logEvent(req.payload, {
          kind: kind === 'verify' ? 'login_success' : `totp_${kind}`, category: 'security', level: kind === 'remove' ? 'warn' : 'info',
          text: kind === 'verify'
            ? `✅ <b>Panele giriş yapıldı</b> (parola + 2FA)\n👤 ${esc(user?.email ?? '-')}\n${clientLine(ip, ua)}`
            : kind === 'setup'
              ? `🔐 <b>2FA kuruldu</b>\n👤 ${esc(user?.email ?? '-')}\n${clientLine(ip, ua)}`
              : `⚠️ <b>2FA kaldırıldı</b>\n👤 ${esc(user?.email ?? '-')}\n${clientLine(ip, ua)}\nBu işlemi siz yapmadıysanız hemen /panik çalıştırın.`,
        })
        return response
      }
      if (!user) return response
      const fail = LIMITS.totpFailuresPerUser
      const { count } = await allow(req.payload, fail.bucket, userKey, Number.MAX_SAFE_INTEGER, fail.windowSec)
      let blockedNow = false
      if (count >= fail.max) {
        try {
          await getObsStore(req.payload).block('totp', userKey, fail.blockSec, 'hatalı 2FA kodu')
          blockedNow = true
        } catch { /* uyarı yine gider */ }
      }
      await recordSecurity(req.payload, { kind: `totp_${kind}_failed`, ip, ua, actor: user.email ?? null, detail: { count } })
      await logEvent(req.payload, {
        kind: 'totp_failed', category: 'security', level: blockedNow ? 'error' : 'warn',
        text: `⛔ <b>Hatalı 2FA kodu</b> (${label})\n👤 ${esc(user.email ?? '-')} — <i>parola doğru girildi</i>\n${clientLine(ip, ua)}\n📈 15 dk'da ${count}/${fail.max} hata`
          + (blockedNow ? `\n🚫 <b>2FA ${fail.blockSec / 60} dk kilitlendi.</b> Siz değilseniz parolayı hemen değiştirin.` : ''),
      })
      return response
    },
  }
}

// ─── Site formları ──────────────────────────────────────────────────────────────

function formHooks(collection: CollectionConfig): CollectionConfig {
  const slug = collection.slug
  const limit = LIMITS.forms[slug]
  const beforeValidate = async ({ data, operation, req }: { data?: Record<string, unknown>; operation: string; req: PayloadRequest }) => {
    if (operation !== 'create' || req.user || req.context?.restore === true) return data
    const { ip, ua, viaSite } = requestClient(req)
    ;(req.context as Record<string, unknown>).obsClient = { ip, ua }
    const ipHash = hashIp(ip)
    const { allowed, count } = await allow(req.payload, `form:${slug}`, ipHash, limit.max, LIMITS.formWindowSec)
    await recordSecurity(req.payload, { kind: allowed ? 'form_submit' : 'form_rate_limited', ip, ua, path: slug,
      detail: { count, viaSite, event: typeof data?.event === 'object' ? undefined : data?.event } })
    if (!allowed) {
      await logEvent(req.payload, {
        kind: 'form_rate_limited', category: 'security', level: 'warn', dedupe: { key: `form-limit-${slug}-${ipHash}`, seconds: 3600 },
        text: `🚫 <b>Form hız sınırı</b>: ${esc(FORM_LABEL[slug])}\nAynı IP'den 10 dk'da ${count} gönderim (sınır ${limit.max}); fazlası reddediliyor.\n${clientLine(ip, ua)}`,
      })
      throw obsError('Bu ağdan kısa sürede çok fazla başvuru geldi. Biraz bekleyip tekrar dene.', 429, 'form_rate_limited')
    }
    if (count > limit.warn) {
      await logEvent(req.payload, {
        kind: 'form_suspicious', category: 'security', level: 'warn', dedupe: { key: `form-sus-${slug}-${ipHash}`, seconds: 3600 },
        text: `⚠️ <b>Şüpheli tekrar</b>: ${esc(FORM_LABEL[slug])}\nAynı IP'den 10 dk'da <b>${count}</b> gönderim (uyarı eşiği ${limit.warn}, sınır ${limit.max}).\n${clientLine(ip, ua)}\nKampüs Wi-Fi'ı olabilir; kayıtları kontrol edin.`,
      })
    }
    return data
  }
  const afterError = async ({ error, req }: { error: unknown; req: PayloadRequest }) => {
    if (req.user || isObsError(error) || req.method !== 'POST') return
    const status = (error as { status?: number })?.status ?? 500
    const { ip, ua } = requestClient(req)
    await recordSecurity(req.payload, { kind: 'form_rejected', ip, ua, path: slug,
      detail: { status, reason: String((error as Error)?.message ?? '').slice(0, 160) } })
    if (status >= 500) {
      await logEvent(req.payload, {
        kind: 'form_error', category: 'application', topic: 'errors', level: 'error',
        dedupe: { key: `form-error-${slug}-${String((error as Error)?.message).slice(0, 60)}`, seconds: 600 },
        text: `💥 <b>Form kaydedilemedi</b> (${esc(FORM_LABEL[slug])}) — ziyaretçi hata gördü\n⚠️ ${esc(String((error as Error)?.message ?? 'bilinmeyen').slice(0, 300))}\n${clientLine(ip, ua)}`,
      })
    }
  }
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeValidate: [beforeValidate as never, ...(collection.hooks?.beforeValidate ?? [])],
      afterError: [...(collection.hooks?.afterError ?? []), afterError as never],
    },
  }
}

// ─── WhatsApp kuyruğu ───────────────────────────────────────────────────────────

async function registrationInfo(req: PayloadRequest, registration: unknown, event: unknown): Promise<{ name: string | null; eventTitle: string | null }> {
  const id = (value: unknown) => value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  let name: string | null = null
  let eventTitle: string | null = null
  try {
    if (id(registration)) {
      const doc = await req.payload.findByID({ collection: 'event-registrations', id: id(registration) as number, depth: 0, overrideAccess: true, req, select: { fullName: true } as never })
      name = (doc as { fullName?: string })?.fullName ?? null
    }
    if (id(event)) {
      const doc = await req.payload.findByID({ collection: 'events', id: id(event) as number, depth: 0, overrideAccess: true, req, select: { title: true } as never })
      eventTitle = (doc as { title?: string })?.title ?? null
    }
  } catch { /* isim bulunamazsa maskeli numara gösterilir */ }
  return { name, eventTitle }
}

function waHooks(collection: CollectionConfig): CollectionConfig {
  const afterChange = async ({ doc, previousDoc, operation, req }: { doc: any; previousDoc?: any; operation: string; req: PayloadRequest }) => {
    if (operation !== 'update' || req.context?.restore === true) return doc
    const statusChanged = previousDoc?.status !== doc.status
    const retried = !statusChanged && doc.status === 'pending' && Number(doc.attempts) > Number(previousDoc?.attempts ?? 0) && doc.error
    if (!statusChanged && !retried) return doc
    if (!['sent', 'failed', 'cancelled'].includes(doc.status) && !retried) return doc
    const { name, eventTitle } = await registrationInfo(req, doc.relatedRegistration, doc.relatedEvent)
    let pending: number | null = null
    try { pending = (await req.payload.count({ collection: 'wa-queue', where: { status: { equals: 'pending' } }, overrideAccess: true, req })).totalDocs } catch { /* sayı opsiyonel */ }
    const context = `🏷️ ${esc(waSourceLabel(doc.source))}${eventTitle ? ` · ${esc(eventTitle)}` : ''}${doc.mediaUrl ? ' · 🖼️ görselli' : ''}${pending !== null ? `\n📦 Kuyrukta bekleyen: ${pending}` : ''}`
    const who = waRecipient(name, doc.to)
    if (doc.status === 'sent') {
      await logEvent(req.payload, { kind: 'wa_sent', category: 'whatsapp', text: `💬 <b>WhatsApp gönderildi</b> → ${who}\n${context}`, data: { source: doc.source } })
    } else if (doc.status === 'failed') {
      await logEvent(req.payload, { kind: 'wa_failed', category: 'whatsapp', level: 'error',
        text: `❌ <b>WhatsApp gönderilemedi</b> → ${who}\n⚠️ <b>Neden:</b> ${esc(describeWaError(doc.error))} (${Number(doc.attempts) || 0}. deneme, vazgeçildi)\n${context}`, data: { source: doc.source } })
    } else if (doc.status === 'cancelled') {
      await logEvent(req.payload, { kind: 'wa_cancelled', category: 'whatsapp', level: 'warn',
        text: `🚫 <b>WhatsApp iptal edildi</b> → ${who}\n⚠️ ${esc(describeWaError(doc.error) || 'iptal')}\n${context}`, data: { source: doc.source } })
    } else {
      await logEvent(req.payload, { kind: 'wa_retry', category: 'whatsapp', level: 'warn',
        text: `⚠️ <b>WhatsApp denemesi başarısız</b> (${Number(doc.attempts)}/3), yeniden denenecek → ${who}\n⚠️ <b>Neden:</b> ${esc(describeWaError(doc.error))}\n${context}` })
    }
    return doc
  }
  return { ...collection, hooks: { ...collection.hooks, afterChange: [...(collection.hooks?.afterChange ?? []), afterChange as never] } }
}

// ─── Yönetici hesapları ─────────────────────────────────────────────────────────

function userHooks(collection: CollectionConfig): CollectionConfig {
  const hooks = collection.hooks ?? {}
  const actor = (req: PayloadRequest) => String((req.user as { email?: string } | null)?.email ?? 'sistem')
  return {
    ...collection,
    hooks: {
      ...hooks,
      beforeOperation: [...(hooks.beforeOperation ?? []), (async ({ args, operation, req }: any) => {
        if (operation === 'login') await beforeLogin(req)
        return args
      }) as never],
      afterLogin: [...(hooks.afterLogin ?? []), (async ({ req, user }: any) => { await afterPasswordLogin(req, user) }) as never],
      afterError: [...(hooks.afterError ?? []), (async ({ error, req }: any) => {
        if (pathOf(req).endsWith('/users/login')) await onLoginError(req, error)
      }) as never],
      afterChange: [...(hooks.afterChange ?? []), (async ({ doc, previousDoc, operation, req }: any) => {
        if (req.context?.restore === true) return doc
        const roles = (value: unknown) => (Array.isArray(value) ? value : []).map(String).sort().join(', ') || '-'
        if (operation === 'create') {
          await logEvent(req.payload, { kind: 'admin_user_created', category: 'security', level: 'warn',
            text: `👤 <b>Yeni panel hesabı oluşturuldu</b>\n📧 ${esc(doc.email)} · roller: ${esc(roles(doc.roles))}\n🛠️ Oluşturan: ${esc(actor(req))}${req.user ? '' : '\n⚠️ Oturumsuz oluşturma (ilk kullanıcı / betik)'}` })
        } else if (operation === 'update' && roles(doc.roles) !== roles(previousDoc?.roles)) {
          await logEvent(req.payload, { kind: 'admin_roles_changed', category: 'security', level: 'warn',
            text: `🛡️ <b>Yetki değişti</b>\n📧 ${esc(doc.email)}: ${esc(roles(previousDoc?.roles))} → <b>${esc(roles(doc.roles))}</b>\n🛠️ Değiştiren: ${esc(actor(req))}` })
        }
        return doc
      }) as never],
      afterDelete: [...(hooks.afterDelete ?? []), (async ({ doc, req }: any) => {
        await logEvent(req.payload, { kind: 'admin_user_deleted', category: 'security', level: 'warn',
          text: `🗑️ <b>Panel hesabı silindi</b>\n📧 ${esc(doc?.email ?? '-')}\n🛠️ Silen: ${esc(actor(req))}` })
      }) as never],
    },
  }
}

// ─── Panik: oturumlu yazmaları durdur ───────────────────────────────────────────

function panicGuardCollection(collection: CollectionConfig): CollectionConfig {
  const guard = async ({ args, operation, req }: any) => {
    const sensitiveAnon = operation === 'forgotPassword' || operation === 'resetPassword'
    if ((req?.user && WRITE_OPERATIONS.has(operation)) || sensitiveAnon) {
      if ((await getPanic(req.payload)).active) throw obsError(PANIC_MESSAGE, 423, 'panic')
    }
    return args
  }
  return { ...collection, hooks: { ...collection.hooks, beforeOperation: [guard as never, ...(collection.hooks?.beforeOperation ?? [])] } }
}

function panicGuardGlobal(global: GlobalConfig): GlobalConfig {
  const guard = async ({ data, req }: any) => {
    if (req?.user && (await getPanic(req.payload)).active) throw obsError(PANIC_MESSAGE, 423, 'panic')
    return data
  }
  return { ...global, hooks: { ...global.hooks, beforeChange: [guard as never, ...(global.hooks?.beforeChange ?? [])] } }
}

// ─── Eklenti ────────────────────────────────────────────────────────────────────

export const observabilityPlugin = (): Plugin => (config: Config): Config => {
  const collections = (config.collections ?? []).map((collection) => {
    let next = panicGuardCollection(collection)
    if (FORM_COLLECTIONS.includes(collection.slug)) next = formHooks(next)
    if (collection.slug === 'wa-queue') next = waHooks(next)
    if (collection.slug === 'users') next = userHooks(next)
    return next
  })
  const endpoints = (config.endpoints ?? []).map((endpoint) => {
    if (endpoint.method !== 'post') return endpoint
    if (endpoint.path === '/verify-totp') return wrapTotpEndpoint(endpoint, 'verify')
    if (endpoint.path === '/setup-totp') return wrapTotpEndpoint(endpoint, 'setup')
    if (endpoint.path === '/remove-totp') return wrapTotpEndpoint(endpoint, 'remove')
    return endpoint
  })
  return {
    ...config,
    collections,
    globals: (config.globals ?? []).map(panicGuardGlobal),
    endpoints: [...endpoints, ingestEndpoint, workerEventEndpoint],
  }
}

export { describeDevice }
