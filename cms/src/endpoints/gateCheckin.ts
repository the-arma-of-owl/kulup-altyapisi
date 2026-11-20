import type { Endpoint } from 'payload'
import { primaryFrontendUrl } from '../lib/frontendUrl'

// CMS panelindeki "Kapı QR okuyucu" (admin/kapi) için giriş uç noktası.
// Görevli kendi hesabıyla (yönetici veya kapı görevlisi) girer; bilet bir kez kaydedilir,
// seçilen WhatsApp hoş geldin şablonu kuyruğa eklenir ve masaüstü worker'ı gönderir.

type GateUser = { id: number | string; roles?: string[] | null; hasTotp?: boolean; _strategy?: string }
type GateFieldDefinition = { key: string; label?: string; required?: boolean; min?: number; max?: number; options?: string[] }

const KEY = /^[a-zA-ZçğıöşüÇĞİÖŞÜ0-9_]{1,40}$/
const WINDOW_MS = 60_000
const LIMIT = 60
const recentByUser = new Map<string, number[]>()

const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' })
const timeFormat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export const gateTokenFrom = (raw: string): string | null => {
  const value = raw.trim()
  if (/^[a-fA-F0-9]{16}$/.test(value)) return value.toLowerCase()
  try {
    const match = new URL(value).pathname.match(/\/ticket\/([a-fA-F0-9]{16})\/?$/)
    return match?.[1]?.toLowerCase() ?? null
  } catch { return null }
}

export const parseGateFields = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const fields: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (KEY.test(key) && (typeof raw === 'string' || typeof raw === 'number')) fields[key] = String(raw).trim().slice(0, 200)
  }
  return fields
}

export const gateDefinitions = (value: unknown): GateFieldDefinition[] =>
  Array.isArray(value) ? value as GateFieldDefinition[] : []

type GateFieldResult =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; code: 'invalid_definition' | 'missing_fields' | 'invalid_value'; error: string }

export const validateGateFields = (definitions: GateFieldDefinition[], submitted: Record<string, string>): GateFieldResult => {
  for (const definition of definitions) {
    if (!definition || typeof definition.key !== 'string' || !KEY.test(definition.key) ||
      (definition.options !== undefined && (!Array.isArray(definition.options) || !definition.options.length ||
        !definition.options.every((option) => typeof option === 'string' && option.trim().length > 0))) ||
      (definition.min !== undefined && !Number.isSafeInteger(definition.min)) ||
      (definition.max !== undefined && !Number.isSafeInteger(definition.max)) ||
      (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max)) {
      return { ok: false, code: 'invalid_definition', error: 'Etkinlikte geçersiz bir kapı alanı tanımlanmış. Yönetici alan anahtarlarını düzeltsin.' }
    }
  }
  const fields = Object.fromEntries(definitions.map(({ key }) => [key, submitted[key] || '']))
  const missing = definitions.filter(({ key, required }) => required && !fields[key]).map(({ label, key }) => label || key)
  if (missing.length) return { ok: false, code: 'missing_fields', error: `Zorunlu kapı alanlarını doldurun: ${missing.join(', ')}` }
  const invalid = definitions.filter(({ key, options, min, max }) => {
    const value = fields[key]
    if (!value) return false
    if (options && !options.includes(value)) return true
    if (min !== undefined || max !== undefined) {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return true
      const number = Number(value)
      if ((min !== undefined && number < min) || (max !== undefined && number > max)) return true
    }
    return false
  }).map(({ label, key }) => label || key)
  if (invalid.length) return { ok: false, code: 'invalid_value', error: `Geçersiz değer: ${invalid.join(', ')}` }
  return { ok: true, fields }
}

export const gateView = (registration: { fullName?: string | null; checkedInAt?: string | null; gateFields?: unknown }) => ({
  fullName: registration.fullName || '',
  checkedInAt: registration.checkedInAt || null,
  gateFields: parseGateFields(registration.gateFields),
})

/** Eksik veya boş kalan değişkenler "missing" listesine girer; o durumda mesaj gönderilmez. */
export const renderGateMessage = (template: string, variables: Record<string, string>) => {
  const missing = new Set<string>()
  const text = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, raw: string) => {
    const name = raw.trim()
    const value = variables[name]
    if (!value) { missing.add(name); return `{{${name}}}` }
    return value
  })
  return { text, missing: [...missing] }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const variablesFor = (registration: any, event: any, gateFields: Record<string, string>, extra: { team?: string; checkedInAt?: Date } = {}) => {
  // Ada yazılmış link / WhatsApp biçim karakterleri mesaja girmez
  const fullName = String(registration.fullName || '').replace(/(?:https?:\/\/|www\.)\S*/gi, '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()
  const date = event.date ? new Date(event.date) : null
  const valid = date && !Number.isNaN(date.getTime()) ? date : null
  const site = primaryFrontendUrl()
  return {
    adSoyad: fullName,
    ad: fullName.split(/\s+/)[0] || '',
    etkinlik: String(event.title || ''),
    tarih: valid ? dateFormat.format(valid) : '',
    saat: valid ? timeFormat.format(valid) : '',
    konum: String(event.location || ''),
    konumLinki: String(event.locationLink || ''),
    biletLinki: registration.ticketToken ? `${site}/ticket/${registration.ticketToken}` : '',
    // Okutma anı ("şu saatte giriş yaptınız"); {{saat}} etkinliğin başlangıç saatidir
    girisSaati: timeFormat.format(extra.checkedInAt ?? new Date()),
    // Takım modunda kişinin (kabul edilmiş) takımı: "X takımının masası 5"
    takim: extra.team ?? '',
    ...gateFields,
  }
}

/** Takım modunda kaydın sahibinin takım adı (hesap e-postası kayıttaki e-postayla eşleşir); yoksa ''. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function teamNameFor(req: any, event: any, email: unknown): Promise<string> {
  const mail = String(email ?? '').trim().toLowerCase()
  if (!event?.teamMode || !mail) return ''
  try {
    const people = await req.payload.find({ collection: 'participants', where: { email: { equals: mail } }, limit: 1, depth: 0, overrideAccess: true, req })
    const person = people.docs[0]
    if (!person) return ''
    const memberships = await req.payload.find({ collection: 'team-memberships',
      where: { and: [{ event: { equals: event.id } }, { participant: { equals: person.id } }, { status: { equals: 'accepted' } }] }, limit: 1, depth: 1, overrideAccess: true, req })
    const team = memberships.docs[0]?.team
    return team && typeof team === 'object' ? String(team.name ?? '') : ''
  } catch { return '' }
}

/**
 * Girişi atomik olarak işaretler: aynı bilet iki telefonda aynı anda okutulursa yalnız biri kazanır
 * (Postgres: tek UPDATE ... WHERE attended IS NOT TRUE). Yerel SQLite'ta okuma-yazma ile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function claimCheckin(req: any, id: unknown): Promise<boolean> {
  const pool = req.payload.db?.pool
  if (pool && typeof pool.query === 'function') {
    const result = await pool.query('UPDATE "event_registrations" SET "attended" = true WHERE "id" = $1 AND "attended" IS NOT TRUE', [id])
    return (result.rowCount ?? 0) === 1
  }
  const fresh = await req.payload.findByID({ collection: 'event-registrations', id, depth: 0, overrideAccess: true, req })
  return !fresh?.attended
}

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

export const gateCheckinEndpoint: Endpoint = {
  path: '/gate/checkin',
  method: 'post',
  handler: async (req) => {
    const user = req.user as GateUser | null
    if (!user) return reply(401, { code: 'unauthorized', error: 'Kapı hesabıyla giriş yapın.' })
    if (user.hasTotp && user._strategy !== 'totp') return reply(403, { code: 'forbidden', error: 'İki adımlı doğrulamayı tamamlayın.' })
    if (!user.roles?.some((role) => role === 'admin' || role === 'gate')) return reply(403, { code: 'forbidden', error: 'Bu hesabın kapı işlemi yetkisi yok.' })

    const now = Date.now()
    const recent = (recentByUser.get(String(user.id)) ?? []).filter((time) => now - time < WINDOW_MS)
    if (recent.length >= LIMIT) return reply(429, { code: 'rate_limited', error: 'Çok hızlı okutma yapıldı. Bir dakika bekleyip yeniden deneyin.' })
    recent.push(now)
    recentByUser.set(String(user.id), recent)

    let body: Record<string, unknown> = {}
    try { body = (await req.json?.()) ?? {} } catch { return reply(400, { code: 'invalid_request', error: 'Geçersiz istek.' }) }
    const eventId = Number(body.eventId)
    const token = gateTokenFrom(String(body.token ?? ''))
    const templateId = body.templateId ? Number(body.templateId) : null
    if (!Number.isInteger(eventId) || !token || (templateId !== null && !Number.isInteger(templateId))) {
      return reply(400, { code: 'invalid_request', error: 'Etkinlik veya bilet kodu geçersiz.' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await req.payload.findByID({ collection: 'events', id: eventId, depth: 0, overrideAccess: true, req }).catch((): null => null) as any
    if (!event) return reply(404, { code: 'event_not_found', error: 'Etkinlik bulunamadı.' })
    if (!event.scannerActive) return reply(409, { code: 'scanner_closed', error: 'Bu etkinliğin QR okuyucusu kapalı.' })
    const definitions = gateDefinitions(event.gateFieldDefinitions)
    const definitionCheck = validateGateFields(definitions, {})
    if ('code' in definitionCheck && definitionCheck.code === 'invalid_definition') return reply(409, { code: 'invalid_value', error: definitionCheck.error })

    const found = await req.payload.find({
      collection: 'event-registrations',
      where: { and: [{ event: { equals: eventId } }, { ticketToken: { equals: token } }] },
      limit: 1, depth: 0, overrideAccess: true, req,
    })
    const registration = found.docs[0]
    if (!registration) return reply(404, { code: 'not_found', error: 'Bilet bu etkinlikte bulunamadı.' })
    if (registration.status !== 'accepted') return reply(409, { code: 'not_accepted', error: 'Bu kayıt kabul edilmemiş.', registration: gateView(registration) })
    if (registration.attended) return reply(409, { code: 'already_in', error: 'Bu bilet daha önce okutuldu. Tekrar mesaj gönderilmedi.', registration: gateView(registration) })

    const validated = validateGateFields(definitions, parseGateFields(body.gateFields))
    if ('code' in validated) return reply(validated.code === 'invalid_definition' ? 409 : 400, {
      code: validated.code === 'invalid_definition' ? 'invalid_value' : validated.code, error: validated.error,
    })
    const gateFields = validated.fields

    const template = templateId
      ? await req.payload.findByID({ collection: 'whatsapp-templates', id: templateId, depth: 0, overrideAccess: true, req }).catch((): null => null)
      : null
    if (templateId && !template) return reply(400, { code: 'template_not_found', error: 'Seçilen WhatsApp şablonu bulunamadı.' })

    if (!(await claimCheckin(req, registration.id))) {
      return reply(409, { code: 'already_in', error: 'Bu bilet daha önce okutuldu. Tekrar mesaj gönderilmedi.', registration: gateView(registration) })
    }
    const checkedInAt = new Date()
    const updated = await req.payload.update({
      collection: 'event-registrations', id: registration.id,
      data: { attended: true, checkedInAt: checkedInAt.toISOString(), gateFields },
      depth: 0, overrideAccess: true, req,
    })

    const view = gateView(updated)
    if (!template) return reply(200, { code: 'ok', ok: true, registration: view })
    if (!registration.phone) return reply(200, { code: 'ok', ok: true, registration: view, warning: 'Giriş kaydedildi; kişinin telefonu olmadığı için mesaj gönderilmedi.' })
    const team = template.message.includes('takim') ? await teamNameFor(req, event, registration.email) : ''
    const rendered = renderGateMessage(template.message, variablesFor(registration, event, gateFields, { team, checkedInAt }))
    if (rendered.missing.length) {
      return reply(200, { code: 'ok', ok: true, registration: view, warning: `Giriş kaydedildi ancak mesaj gönderilmedi. Eksik değişkenler: ${rendered.missing.join(', ')}` })
    }
    await req.payload.create({
      collection: 'wa-queue',
      data: { to: registration.phone, message: rendered.text, source: 'gate', status: 'pending', attempts: 0, relatedEvent: eventId, relatedRegistration: registration.id },
      overrideAccess: true, req,
    })
    return reply(200, { code: 'ok', ok: true, registration: view })
  },
}
