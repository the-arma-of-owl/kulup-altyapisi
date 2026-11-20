import { addDataAndFileToRequest, APIError, type Endpoint, type PayloadRequest } from 'payload'
import { hasInternalKey } from '../lib/access'
import { notifySiteRevalidate } from '../lib/siteRevalidate'
import { requestClient } from '../lib/obs/clientIp'
import { hashIp, hashKey, maskEmail } from '../lib/obs/privacy'
import { allow, recordSecurity } from '../lib/obs/security'
import { CODE_MESSAGES, CODE_TTL_MS, checkCode, generateCode, hashCode, type CodePurpose } from '../lib/teams/codes'
import { validateTeamDesign } from '../lib/teams/design'
import { ImageRejected, randomObjectName, sanitizeImage, type ImageKind } from '../lib/teams/imageSafety'
import { sendCodeMail, sendTeamNoticeMail } from '../lib/teams/mail'
import { logEvent } from '../lib/obs/notify'
import { esc } from '../lib/obs/privacy'
import {
  acceptedCount, acceptMemberState, applicationState, approvalRequestState, canEditTeam, canScore, acceptOverflow, captainTransferState, criteriaOf, disbandState, hasActiveMembership,
  idOf, isJudge, isNameLocked, isPubliclyVisible, isRosterLocked, isSeekingMembers, joinRequestState, leaveState, memberLimits,
  pendingToCloseWhenFull, removeMemberState, sameId, submissionState, suggestRanking, teamRegistrationState, transferNameMatches, validateScores,
  visibleResults, weightedTotal, type ApplicationState, type EventLite, type MembershipLite, type TeamLite,
} from '../lib/teams/rules'
import { validateContact, type TeamContact } from '../lib/teams/contact'
import {
  cleanName, cleanText, cleanUrl, isPositiveId, normalizeEmail, randomInviteCode, teamSlug, validPassword,
} from '../lib/teams/validate'
import { KULUP } from '../lib/kulup'

/**
 * Takım modu uçları: /api/takim/*
 *
 * Güvenlik modeli (BFF): tarayıcı bu uçlara HİÇ doğrudan erişmez. Her istek site sunucusundan gelir ve
 *  1) iç anahtar (x-internal-api-key) taşımak zorundadır — yoksa 404 (uç yokmuş gibi),
 *  2) katılımcı işlemlerinde "Authorization: JWT <token>" ile katılımcı oturumu (Payload JWT + oturum kimliği).
 * Token sitede şifreli HttpOnly çerezde durur; tarayıcıya hiç verilmez.
 * Yetki kararları lib/teams/rules.ts'teki saf fonksiyonlardan; veritabanı işlemleri overrideAccess ile ve
 * yalnız beyaz listedeki alanlarla yapılır (REST koleksiyon erişimi katılımcıya kapalı).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>
export type Participant = { id: number | string; email: string; fullName?: string; emailVerified?: boolean; collection?: string; _sid?: string }

export const reply = (status: number, body: Json) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export const fail = (status: number, error: string, extra: Json = {}) => reply(status, { ok: false, error, ...extra })

const MAX_JSON_BYTES = 64 * 1024
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 + 64 * 1024 // en büyük görsel (4 MB GIF) + çok parçalı başlıklar

export async function body(req: PayloadRequest): Promise<Json> {
  const length = Number(req.headers.get('content-length') || 0)
  if (length > MAX_JSON_BYTES) throw new APIError('İstek çok büyük', 413, undefined, true)
  await addDataAndFileToRequest(req)
  const data = req.data
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Json : {}
}

const participantOf = (req: PayloadRequest): Participant | null => {
  const user = req.user as unknown as Participant | null
  return user && user.collection === 'participants' && user.emailVerified ? user : null
}

/** Uç sarmalayıcı: iç anahtar şartı, katılımcı şartı, hata yakalama. */
/** Teslim durumu + kapalıysa nedeni (ör. "en az 4 kişi olmalı"); kaptan neden teslim edemediğini görsün. */
const submissionView = (state: { ok: true } | { ok: false; reason: string }, deadline?: string | null) =>
  ({ open: state.ok, reason: 'reason' in state ? state.reason : null, deadline: deadline ?? null })

export function route(method: Endpoint['method'], path: string, options: { auth?: boolean },
  handler: (req: PayloadRequest, me: Participant | null) => Promise<Response>): Endpoint {
  return {
    method,
    path: `/takim${path}`,
    handler: async (req) => {
      if (!hasInternalKey(req.headers)) return fail(404, 'Bulunamadı')
      const me = participantOf(req)
      if (options.auth && !me) return fail(401, 'Oturum açmanız gerekiyor.', { code: 'unauthorized' })
      try {
        const response = await handler(req, me)
        if (me && method !== 'get' && response.status >= 400 && response.status !== 429) await recordActionFailure(req, me, method, path, response)
        return response
      } catch (error) {
        const status = (error as { status?: number })?.status
        if (status && status < 500) {
          const response = fail(status, (error as Error).message || 'İstek reddedildi')
          if (me) await recordActionFailure(req, me, method, path, response)
          return response
        }
        req.payload.logger.error({ msg: '[takim] uç hatası', path, err: (error as Error)?.message })
        if (me) await recordSecurity(req.payload, { ...actionClient(req, me), kind: 'takim_action_failed', path: `${method} ${path}`,
          detail: { status: 500, error: String((error as Error)?.message ?? '').slice(0, 300) } })
        return fail(500, 'Beklenmeyen bir hata oluştu.')
      }
    },
  }
}

const actionClient = (req: PayloadRequest, me: Participant) => {
  const { ip, ua } = requestClient(req)
  return { ip, ua, actor: maskEmail(me.email) }
}

/** Oturumlu takım işlemi reddedildiğinde nedeni kaydedilir (kullanıcı "olmuyor" dediğinde ne gördüğü bilinsin). */
async function recordActionFailure(req: PayloadRequest, me: Participant, method: string, path: string, response: Response): Promise<void> {
  const data = await response.clone().json().catch((): Json => ({})) as Json
  await recordSecurity(req.payload, { ...actionClient(req, me), kind: 'takim_action_failed', path: `${method} ${path}`,
    detail: { status: response.status, error: String(data.error ?? '').slice(0, 200), ...(data.code ? { code: String(data.code) } : {}) } })
}

export const param = (req: PayloadRequest, name: string): string => String((req.routeParams as Json | undefined)?.[name] ?? '')

/** Paylaşılan (Postgres) hız sınırı; aşılırsa güvenlik olayı kaydedilir. */
export async function limited(req: PayloadRequest, bucket: string, key: string, max: number, windowSec: number): Promise<boolean> {
  const { allowed, count } = await allow(req.payload, `takim:${bucket}`, key, max, windowSec)
  if (!allowed) {
    const { ip, ua } = requestClient(req)
    await recordSecurity(req.payload, { kind: 'takim_rate_limited', ip, ua, path: bucket, detail: { count } })
  }
  return !allowed
}
export const ipKey = (req: PayloadRequest) => hashIp(requestClient(req).ip)

// Takım sayfası toplam düzenleme hakkı (kayıt + logo/kapak/GIF yükleme); yönetim panelden editCount'u 0 yaparak açar
const MAX_TEAM_EDITS = 30
const EDIT_LIMIT_MESSAGE = 'Çok sık düzenleme yaptınız. Düzenlemeye devam etmek için yönetimle iletişime geçin.'
const editCountOf = (team: Json) => Math.max(0, Number(team.editCount) || 0)
const editLimitReached = (team: Json) => editCountOf(team) >= MAX_TEAM_EDITS
const acctKey = (email: string) => hashKey(email, 'takim-acct')

// ─── Veri yardımcıları ──────────────────────────────────────────────────────────

export async function loadEvent(req: PayloadRequest, id: unknown): Promise<(EventLite & Json) | null> {
  if (!isPositiveId(id)) return null
  try {
    return await req.payload.findByID({ collection: 'events', id: String(id), depth: 0, overrideAccess: true, req }) as unknown as EventLite & Json
  } catch { return null }
}

export async function loadTeam(req: PayloadRequest, id: unknown): Promise<(TeamLite & Json) | null> {
  if (!isPositiveId(id)) return null
  try {
    return await req.payload.findByID({ collection: 'teams', id: String(id), depth: 0, overrideAccess: true, req }) as unknown as TeamLite & Json
  } catch { return null }
}

export async function membershipsOf(req: PayloadRequest, where: Json): Promise<Array<MembershipLite & Json>> {
  const { docs } = await req.payload.find({ collection: 'team-memberships', where: where as never, depth: 0, limit: 500, overrideAccess: true, req, pagination: false })
  return docs as unknown as Array<MembershipLite & Json>
}

export async function namesOf(req: PayloadRequest, ids: unknown[]): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids.map(idOf).filter(Boolean))]
  if (!unique.length) return new Map()
  const { docs } = await req.payload.find({ collection: 'participants', where: { id: { in: unique } }, depth: 0, limit: unique.length, overrideAccess: true, req, pagination: false })
  return new Map(docs.map((d) => [String(d.id), { name: String((d as Json).fullName ?? ''), email: String((d as Json).email ?? '') }]))
}

/**
 * Görselin sitede kullanılacak adresi: canlıda CDN (<NEXT_PUBLIC_CDN_URL>/takim/...); CMS'in kendi dosya
 * ucuysa (yerel geliştirme) site-içi yol /api/team-media/file/... (site bunu CMS'e yönlendirir).
 */
export function publicMediaUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  const match = /^(?:https?:\/\/[^/]+)?(\/api\/team-media\/file\/[A-Za-z0-9._-]+)$/.exec(url)
  return match ? match[1] : url
}

/** Genel medya (ödül görseli): CMS dosya ucu site-içi yola (/api/media/file/...) çevrilir; CDN adresi aynen kalır. */
export function publicSiteMediaUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  const match = /^(?:https?:\/\/[^/]+)?(\/api\/media\/file\/[^?#\s]+)$/.exec(url)
  return match ? match[1] : url
}

export async function mediaUrl(req: PayloadRequest, id: unknown): Promise<string | null> {
  if (!isPositiveId(idOf(id))) return null
  try {
    const doc = await req.payload.findByID({ collection: 'team-media', id: idOf(id), depth: 0, overrideAccess: true, req }) as { url?: string | null }
    return publicMediaUrl(doc?.url)
  } catch { return null }
}

/** Takımın yüklediği tüm görsellerin site adresleri (tasarımdaki adres sahipliği denetimi). */
async function ownedMediaUrls(req: PayloadRequest, teamId: unknown): Promise<Set<string>> {
  const { docs } = await req.payload.find({ collection: 'team-media', where: { team: { equals: idOf(teamId) } }, depth: 0, limit: 200, overrideAccess: true, req, pagination: false })
  return new Set(docs.map((d) => publicMediaUrl((d as Json).url)).filter((u): u is string => Boolean(u)))
}

/** Sözleşme: site/src/lib/teams/types.ts → TeamPublic */
async function teamPublic(req: PayloadRequest, team: TeamLite & Json, event: EventLite, memberships?: Array<MembershipLite & Json>) {
  const list = memberships ?? await membershipsOf(req, { team: { equals: team.id } })
  const accepted = list.filter((m) => m.status === 'accepted')
  const names = await namesOf(req, accepted.map((m) => m.participant))
  const members = accepted
    .sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : 0))
    .map((m) => ({ name: names.get(idOf(m.participant))?.name || 'Üye', role: m.role, avatarUrl: null as string | null }))
  return {
    id: String(team.id),
    slug: String(team.slug ?? ''),
    name: String(team.name ?? ''),
    logoUrl: await mediaUrl(req, team.logo),
    coverUrl: await mediaUrl(req, team.cover),
    memberCount: accepted.length,
    maxMembers: memberLimits(event).max,
    members,
    manifesto: String(team.manifesto ?? ''),
    status: (team.status === 'draft' ? 'pending' : team.status) as 'pending' | 'approved' | 'accepted' | 'rejected',
    // Onaylı/kabul edilmiş, dolmamış ve teslim etmemiş: "üye arıyor" (takımı olmayanlar katılma isteği gönderebilir)
    seeking: isSeekingMembers(team, accepted.length, memberLimits(event).max),
    // İletişim değeri herkese açık veride YOK; yalnız giriş yapmış katılımcıya /teams/:id/contact ile verilir
    hasContact: Boolean(contactOf(team)),
  }
}

/** Takım kaydındaki geçerli iletişim (tür + değer) ya da null. */
function contactOf(team: Json): TeamContact | null {
  const c = team.contact as { type?: unknown; value?: unknown } | null | undefined
  if (!c || typeof c.value !== 'string' || !c.value) return null
  const checked = validateContact(c)
  return checked.ok ? checked.contact : null
}

/** Katılımcının bu etkinlikteki başvuru durumu (event-registrations, hesabın e-postasıyla). */
async function eventApplication(req: PayloadRequest, eventId: unknown, email: string): Promise<ApplicationState> {
  if (!email) return 'none'
  const { docs } = await req.payload.find({ collection: 'event-registrations', where: { event: { equals: idOf(eventId) }, email: { like: email.trim() } } as never,
    depth: 0, limit: 50, overrideAccess: true, req, pagination: false, select: { email: true, status: true } as never })
  return applicationState(docs as Array<{ email?: unknown; status?: unknown }>, email)
}

const APPLICATION_MESSAGES: Record<Exclude<ApplicationState, 'applied'>, (email: string) => string> = {
  none: (email) => `Takım kurmadan/katılmadan önce etkinlik başvuru formunu bu hesabın e-postasıyla (${email}) doldurun.`,
  rejected: () => 'Etkinlik başvurunuz reddedildiği için takım kuramaz ya da takıma katılamazsınız.',
}

async function requireApplication(req: PayloadRequest, event: EventLite & Json, me: Participant): Promise<Response | null> {
  // Harici kayıt formu kullanan etkinlikte sitede başvuru kaydı oluşmaz; bu durumda şart aranmaz.
  if (typeof event.registrationLink === 'string' && event.registrationLink.trim()) return null
  const state = await eventApplication(req, event.id, me.email)
  if (state === 'applied') return null
  return fail(409, APPLICATION_MESSAGES[state](me.email), { code: state === 'none' ? 'application_required' : 'application_rejected' })
}

// ─── Kimlik ─────────────────────────────────────────────────────────────────────

/**
 * Doğrulama maili gönderilemezse (kota bitti / Resend arızası) hesap AÇILMAZ; yönetim CMS'te
 * "E-posta doğrulandı"yı elle işaretler. Kullanıcıya nedeni söylenmez, yalnız "elle onaylanacak" denir.
 * Güvenlik: kararı sunucu verir (gerçek gönderim hatası); istemci bu yolu tetikleyemez, onay yalnız yönetimde.
 */
const MANUAL_VERIFY_MESSAGE = 'Hesabını şu an e-postayla doğrulayamıyoruz. Bilgilerin ekibimize iletildi; en kısa sürede elle değerlendirilip onaylanacaksın. Onaylandığında e-posta ve şifrenle giriş yapıp devam edebilirsin.'

async function requestManualVerify(req: PayloadRequest, participant: { email: string; fullName?: unknown }) {
  await logEvent(req.payload, {
    kind: 'takim_manual_verify', category: 'application', level: 'warn',
    dedupe: { key: `manual-verify-${hashKey(participant.email)}`, seconds: 6 * 3600 },
    text: `🙋 <b>Elle e-posta onayı bekliyor</b>\n👤 ${esc(String(participant.fullName ?? '') || 'İsimsiz')} (${esc(maskEmail(participant.email))})\nDoğrulama kodu gönderilemedi. Kişiyle (telefon/WhatsApp) e-posta adresini teyit ettikten sonra CMS → 🏆 Takım Modu → Katılımcılar → kayıt → <b>E-posta doğrulandı</b> işaretleyip kaydedin. Teyit etmeden onaylamayın: başkasının e-postasıyla açılmış olabilir.`,
  })
}

async function findParticipant(req: PayloadRequest, email: string): Promise<(Participant & Json) | null> {
  const { docs } = await req.payload.find({ collection: 'participants', where: { email: { equals: email } }, limit: 1, depth: 0,
    overrideAccess: true, showHiddenFields: true, req })
  return (docs[0] as unknown as Participant & Json) ?? null
}

async function issueCode(req: PayloadRequest, participant: Participant & Json, purpose: CodePurpose): Promise<'sent' | 'blocked' | 'failed'> {
  const code = generateCode()
  const prefix = purpose === 'verify' ? 'verify' : 'reset'
  await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req, data: {
    [`${prefix}CodeHash`]: hashCode(purpose, participant.email, code),
    [`${prefix}CodeExpires`]: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    [`${prefix}Attempts`]: 0,
  } as never })
  return sendCodeMail(req.payload, { to: participant.email, name: String(participant.fullName ?? ''), code, purpose })
}

const authEndpoints: Endpoint[] = [
  route('post', '/auth/register', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    const fullName = cleanName(data.fullName, 3, 80)
    if (!email || !fullName) return fail(400, 'Ad soyad ve geçerli bir e-posta girin.')
    if (!validPassword(data.password)) return fail(400, 'Parola en az 8 karakter olmalı; harf ve rakam içermeli.')
    if (data.kvkk !== true) return fail(400, 'Aydınlatma metnini ve açık rızayı onaylamanız gerekiyor.')
    // IP sınırı geniş: mobil operatör NAT'ı ve kampüs Wi-Fi'ında çok kişi aynı IP'den gelir; bot koruması Turnstile'da
    if (await limited(req, 'register:ip', ipKey(req), 100, 3600) || await limited(req, 'code:acct', acctKey(email), 4, 900)) {
      return fail(429, 'Çok fazla deneme. Biraz sonra tekrar deneyin.')
    }
    const existing = await findParticipant(req, email)
    // Hesap varlığı sızdırılmaz: doğrulanmış hesapta aynı yanıt döner, mail gitmez.
    if (existing?.emailVerified) return reply(200, { ok: true })
    let participant = existing
    if (participant) {
      await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req,
        data: { fullName, password: data.password, kvkkApprovedAt: new Date().toISOString() } as never })
    } else {
      participant = await req.payload.create({ collection: 'participants', overrideAccess: true, req, showHiddenFields: true,
        data: { email, fullName, password: data.password as string, emailVerified: false, kvkkApprovedAt: new Date().toISOString() } as never }) as unknown as Participant & Json
    }
    const mail = await issueCode(req, { ...(participant as Participant & Json), email, fullName }, 'verify')
    if (mail === 'failed') {
      await requestManualVerify(req, { email, fullName })
      return reply(200, { ok: true, manual: true, message: MANUAL_VERIFY_MESSAGE })
    }
    return reply(200, { ok: true })
  }),

  route('post', '/auth/resend', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    const purpose: CodePurpose = data.purpose === 'reset' ? 'reset' : 'verify'
    if (!email) return fail(400, 'Geçerli bir e-posta girin.')
    if (await limited(req, 'resend:ip', ipKey(req), 60, 3600) || await limited(req, 'code:acct', acctKey(email), 4, 900)) {
      return fail(429, 'Çok fazla kod istendi. 15 dakika sonra tekrar deneyin.')
    }
    const participant = await findParticipant(req, email)
    const eligible = participant && (purpose === 'verify' ? !participant.emailVerified : participant.emailVerified)
    if (eligible) {
      const mail = await issueCode(req, participant, purpose)
      if (mail === 'failed') {
        // Doğrulamada elle onay yolu; parola sıfırlamada elle yol yok (hesabı ele geçirmeye kapı açar)
        if (purpose === 'verify') {
          await requestManualVerify(req, participant)
          return reply(200, { ok: true, manual: true, message: MANUAL_VERIFY_MESSAGE })
        }
        return fail(502, 'E-posta gönderilemedi. Birazdan tekrar deneyin.')
      }
    }
    return reply(200, { ok: true })
  }),

  route('post', '/auth/verify', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    if (!email) return fail(400, 'Geçerli bir e-posta girin.')
    // Parola kodla birlikte istenir ve doğrulamada yeniden yazılır: doğrulanmamış hesaba başkası /auth/register ile
    // kendi parolasını koymuş olsa bile, hesabın son parolasını e-postanın sahibi (kodu bilen) belirler.
    if (!validPassword(data.password)) return fail(400, 'Kodla birlikte hesabının parolasını gir (en az 8 karakter; harf ve rakam).', { code: 'password_required' })
    if (await limited(req, 'verify:ip', ipKey(req), 30, 900)) return fail(429, 'Çok fazla deneme. Biraz sonra tekrar deneyin.')
    const participant = await findParticipant(req, email)
    if (!participant || participant.emailVerified) return fail(400, CODE_MESSAGES.missing)
    const result = checkCode({ hash: participant.verifyCodeHash as string, expires: participant.verifyCodeExpires as string,
      attempts: participant.verifyAttempts as number }, 'verify', email, data.code)
    if (result.ok === false) {
      if (result.reason === 'wrong') {
        await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req, data: { verifyAttempts: result.attempts } as never })
      }
      return fail(400, CODE_MESSAGES[result.reason], { code: result.reason })
    }
    await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req,
      data: { emailVerified: true, password: data.password, verifyCodeHash: null, verifyCodeExpires: null, verifyAttempts: 0, loginAttempts: 0, lockUntil: null } as never })
    return reply(200, { ok: true })
  }),

  route('post', '/auth/login', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    if (!email || typeof data.password !== 'string' || data.password.length > 128) return fail(400, 'E-posta ve parola girin.')
    if (await limited(req, 'login:ip', ipKey(req), 30, 900)) return fail(429, 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.')
    try {
      const result = await req.payload.login({ collection: 'participants', data: { email, password: data.password }, req, overrideAccess: true })
      const user = result.user as unknown as Participant
      if (!result.token) return fail(401, 'E-posta veya parola hatalı.')
      return reply(200, { ok: true, token: result.token, exp: result.exp, user: { id: user.id, email: user.email, fullName: user.fullName } })
    } catch (error) {
      const status = (error as { status?: number })?.status
      const code = (error as { data?: { code?: string } })?.data?.code
      const { ip, ua } = requestClient(req)
      await recordSecurity(req.payload, { kind: 'takim_login_failed', ip, ua, actor: maskEmail(email), detail: { status } })
      if (code === 'not_verified') return fail(403, 'E-posta adresinizi doğrulamanız gerekiyor.', { code: 'not_verified' })
      if (status === 423 || (error as Error)?.name === 'LockedAuth') return fail(423, 'Çok fazla hatalı deneme; hesap 15 dakika kilitlendi.')
      return fail(401, 'E-posta veya parola hatalı.')
    }
  }),

  route('post', '/auth/logout', { auth: true }, async (req, me) => {
    const user = await req.payload.db.findOne({ collection: 'participants', where: { id: { equals: me!.id } }, req }) as Json | null
    if (user && Array.isArray(user.sessions)) {
      user.sessions = (user.sessions as Array<{ id: string }>).filter((s) => s.id !== me!._sid)
      user.updatedAt = null
      await req.payload.db.updateOne({ collection: 'participants', id: me!.id, data: user, req, returning: false })
    }
    return reply(200, { ok: true })
  }),

  route('post', '/auth/forgot', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    if (!email) return fail(400, 'Geçerli bir e-posta girin.')
    if (await limited(req, 'forgot:ip', ipKey(req), 30, 3600) || await limited(req, 'code:acct', acctKey(email), 4, 900)) {
      return fail(429, 'Çok fazla istek. 15 dakika sonra tekrar deneyin.')
    }
    const participant = await findParticipant(req, email)
    if (participant?.emailVerified) {
      const mail = await issueCode(req, participant, 'reset')
      if (mail === 'failed') return fail(502, 'E-posta gönderilemedi. Birazdan tekrar deneyin.')
    }
    return reply(200, { ok: true }) // hesap olsun olmasın aynı yanıt
  }),

  route('post', '/auth/reset', {}, async (req) => {
    const data = await body(req)
    const email = normalizeEmail(data.email)
    if (!email) return fail(400, 'Geçerli bir e-posta girin.')
    if (!validPassword(data.password)) return fail(400, 'Parola en az 8 karakter olmalı; harf ve rakam içermeli.')
    if (await limited(req, 'reset:ip', ipKey(req), 30, 900)) return fail(429, 'Çok fazla deneme. Biraz sonra tekrar deneyin.')
    const participant = await findParticipant(req, email)
    if (!participant?.emailVerified) return fail(400, CODE_MESSAGES.missing)
    const result = checkCode({ hash: participant.resetCodeHash as string, expires: participant.resetCodeExpires as string,
      attempts: participant.resetAttempts as number }, 'reset', email, data.code)
    if (result.ok === false) {
      if (result.reason === 'wrong') {
        await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req, data: { resetAttempts: result.attempts } as never })
      }
      return fail(400, CODE_MESSAGES[result.reason], { code: result.reason })
    }
    await req.payload.update({ collection: 'participants', id: participant.id, overrideAccess: true, req,
      data: { password: data.password, resetCodeHash: null, resetCodeExpires: null, resetAttempts: 0, loginAttempts: 0, lockUntil: null } as never })
    // Tüm açık oturumlar kapanır.
    const raw = await req.payload.db.findOne({ collection: 'participants', where: { id: { equals: participant.id } }, req }) as Json | null
    if (raw) {
      raw.sessions = []
      raw.updatedAt = null
      await req.payload.db.updateOne({ collection: 'participants', id: participant.id, data: raw, req, returning: false })
    }
    return reply(200, { ok: true })
  }),

  route('get', '/me', { auth: true }, async (req, me) => {
    const memberships = await membershipsOf(req, { participant: { equals: me!.id }, status: { in: ['pending', 'accepted'] } })
    const teams = []
    for (const m of memberships) {
      const team = await loadTeam(req, idOf(m.team))
      const event = team ? await loadEvent(req, idOf(team.event)) : null
      if (!team || !event) continue
      teams.push({ membershipStatus: m.status, role: m.role, team: { id: String(team.id), name: team.name, slug: team.slug, status: team.status },
        event: { id: String(event.id), title: event.title, slug: event.slug } })
    }
    // Jüri paneli bağlantısı: jürisi olunan etkinlikler + canlı oturumunu yönettiği (sunucu) etkinlikler
    const { docs: hosted } = await req.payload.find({ collection: 'jury-sessions', where: { host: { equals: me!.id } } as never, depth: 0, limit: 20, overrideAccess: true, req, select: { event: true } as never })
    const hostedIds = (hosted as Json[]).map((h) => idOf(h.event)).filter(Boolean)
    const { docs: judgeEvents } = await req.payload.find({ collection: 'events',
      where: hostedIds.length ? { or: [{ judges: { in: [me!.id] } }, { id: { in: hostedIds } }] } : { judges: { in: [me!.id] } },
      depth: 0, limit: 20, overrideAccess: true, req }) as unknown as { docs: Json[] }
    return reply(200, { ok: true, user: { id: me!.id, email: me!.email, fullName: me!.fullName }, teams,
      judgeEvents: judgeEvents.map((e) => ({ id: String(e.id), title: e.title, slug: e.slug })) })
  }),

  // Takım modu akışı: bu etkinliğe (hesabın e-postasıyla) başvuru yapılmış mı?
  route('get', '/events/:eventId/application', { auth: true }, async (req, me) => {
    const event = await loadEvent(req, param(req, 'eventId'))
    if (!event) return fail(404, 'Etkinlik bulunamadı.')
    const external = typeof event.registrationLink === 'string' && event.registrationLink.trim() !== ''
    return reply(200, { ok: true, application: external ? 'applied' : await eventApplication(req, event.id, me!.email), email: me!.email })
  }),
]

// ─── Takımlar ───────────────────────────────────────────────────────────────────

/** Kaptan/üye görünümü: üyelere takım ayrıntısı; kaptana davet kodu ve bekleyen başvurular. */
async function teamDetail(req: PayloadRequest, team: TeamLite & Json, event: EventLite & Json, me: Participant) {
  const memberships = await membershipsOf(req, { team: { equals: team.id } })
  const mine = memberships.find((m) => sameId(m.participant, me.id) && (m.status === 'accepted' || m.status === 'pending'))
  const captain = canEditTeam(team, me.id)
  if (!captain && mine?.status !== 'accepted') return null
  const names = await namesOf(req, memberships.map((m) => m.participant))
  const { min, max } = memberLimits(event)
  const sub = (team.submission ?? {}) as Json
  const accepted = acceptedCount(memberships)
  return {
    team: await teamPublic(req, team, event, memberships),
    status: team.status,
    adminNote: team.adminNote ?? null,
    design: team.design ?? null,
    isCaptain: captain,
    // Kadro kilitliyken (kabul/teslim) davet kodu gösterilmez: kodla katılma zaten reddedilir
    inviteCode: captain && !isRosterLocked(team) ? team.inviteCode : null,
    editsLeft: captain ? Math.max(0, MAX_TEAM_EDITS - editCountOf(team)) : null,
    // Teslimden sonra kadro kilitli (ayrılma/çıkarma/yeni üye yok)
    rosterLocked: isRosterLocked(team),
    limits: { min, max },
    event: { id: String(event.id), title: event.title, slug: event.slug,
      submission: submissionView(submissionState(event, team, new Date(), accepted), event.teamSettings?.submissionDeadline) },
    contact: contactOf(team),
    submission: { projectName: sub.projectName ?? '', summary: sub.summary ?? '', githubUrl: sub.githubUrl ?? '',
      demoUrl: sub.demoUrl ?? '', videoUrl: sub.videoUrl ?? '', submittedAt: sub.submittedAt ?? null },
    applications: captain ? memberships.filter((m) => m.status === 'pending').map((m) => ({
      id: String(m.id), name: names.get(idOf(m.participant))?.name ?? '', message: m.message ?? '', createdAt: m.createdAt,
    })) : [],
    members: memberships.filter((m) => m.status === 'accepted').map((m) => ({
      id: String(m.id), name: names.get(idOf(m.participant))?.name ?? '', role: m.role, isMe: sameId(m.participant, me.id),
    })),
  }
}

async function captainTeam(req: PayloadRequest, me: Participant): Promise<{ team: TeamLite & Json; event: EventLite & Json } | Response> {
  const team = await loadTeam(req, param(req, 'id'))
  if (!team) return fail(404, 'Takım bulunamadı.')
  if (!canEditTeam(team, me.id)) return fail(403, 'Bu işlemi yalnız takım kaptanı yapabilir.')
  const event = await loadEvent(req, idOf(team.event))
  if (!event) return fail(404, 'Etkinlik bulunamadı.')
  return { team, event }
}

const teamEndpointsList: Endpoint[] = [
  // Takım oluştur → kaptan
  route('post', '/teams', { auth: true }, async (req, me) => {
    const data = await body(req)
    const event = await loadEvent(req, data.eventId)
    if (!event) return fail(404, 'Etkinlik bulunamadı.')
    const state = teamRegistrationState(event)
    if (state.ok === false) return fail(409, state.reason)
    const name = cleanName(data.name)
    if (!name) return fail(400, 'Takım adı 2-60 karakter olmalı.')
    if (isJudge(event, me!.id)) return fail(409, 'Bu etkinliğin jürisi takım kuramaz.')
    if (await limited(req, 'team-create:acct', hashKey(String(me!.id), 'takim-user'), 5, 3600)) return fail(429, 'Çok fazla deneme.')
    const gate = await requireApplication(req, event, me!)
    if (gate) return gate
    const existing = await membershipsOf(req, { event: { equals: event.id }, participant: { equals: me!.id } })
    if (hasActiveMembership(existing, me!.id)) return fail(409, 'Bu etkinlikte zaten bir takımdasınız ya da bekleyen başvurunuz var.')
    const { docs: sameName } = await req.payload.find({ collection: 'teams', where: { event: { equals: event.id }, name: { equals: name } }, limit: 1, depth: 0, overrideAccess: true, req })
    if (sameName.length) return fail(409, 'Bu etkinlikte aynı adlı bir takım var.')
    const team = await req.payload.create({ collection: 'teams', overrideAccess: true, req, data: {
      name, event: event.id, captain: me!.id, status: 'draft', slug: teamSlug(name), inviteCode: randomInviteCode(),
    } as never })
    await req.payload.create({ collection: 'team-memberships', overrideAccess: true, req, data: {
      team: team.id, event: event.id, participant: me!.id, role: 'captain', status: 'accepted', decidedAt: new Date().toISOString(),
    } as never })
    return reply(201, { ok: true, team: { id: String(team.id), slug: (team as Json).slug } })
  }),

  // Davet koduyla takımı önizle (katılmadan önce adı görmek için)
  route('post', '/join/preview', { auth: true }, async (req, me) => {
    const data = await body(req)
    if (await limited(req, 'join-code:acct', hashKey(String(me!.id), 'takim-user'), 20, 900)) return fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.')
    const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9]{8}$/.test(code)) return fail(400, 'Davet kodu 8 karakterdir.')
    const { docs } = await req.payload.find({ collection: 'teams', where: { inviteCode: { equals: code } }, limit: 1, depth: 0, overrideAccess: true, req })
    const team = docs[0] as unknown as (TeamLite & Json) | undefined
    if (!team || team.status === 'rejected') return fail(404, 'Bu koda ait takım bulunamadı.')
    const event = await loadEvent(req, idOf(team.event))
    if (!event) return fail(404, 'Bu koda ait takım bulunamadı.')
    const count = acceptedCount(await membershipsOf(req, { team: { equals: team.id } }))
    const joinable = joinRequestState(team, count, memberLimits(event).max)
    return reply(200, { ok: true, team: { id: String(team.id), name: team.name, memberCount: count, maxMembers: memberLimits(event).max,
      full: count >= memberLimits(event).max, closedReason: joinable.ok === false ? joinable.reason : null },
      event: { id: String(event.id), title: event.title } })
  }),

  // Katılma başvurusu: davet koduyla ya da (kodsuz) "üye arıyor" listesindeki onaylı/kabul edilmiş, dolmamış takıma istek.
  // Dolu takım isteklere kapalı. Ayrılan/çıkarılan kişi yeniden istek gönderebilir (eski kayıt "left/removed" kalır, engellemez).
  route('post', '/join', { auth: true }, async (req, me) => {
    const data = await body(req)
    if (await limited(req, 'join-code:acct', hashKey(String(me!.id), 'takim-user'), 20, 900)) return fail(429, 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.')
    const message = cleanText(data.message ?? '', 500)
    if (message === null) return fail(400, 'Mesaj en fazla 500 karakter olabilir.')
    let team: (TeamLite & Json) | undefined
    const byOpenList = data.code === undefined && data.teamId !== undefined
    if (byOpenList) {
      team = (await loadTeam(req, data.teamId)) ?? undefined
      if (!team || !isPubliclyVisible(team)) return fail(404, 'Takım bulunamadı.')
    } else {
      const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : ''
      if (!/^[A-Z0-9]{8}$/.test(code)) return fail(400, 'Davet kodu 8 karakterdir.')
      const { docs } = await req.payload.find({ collection: 'teams', where: { inviteCode: { equals: code } }, limit: 1, depth: 0, overrideAccess: true, req })
      team = docs[0] as unknown as (TeamLite & Json) | undefined
      if (!team || team.status === 'rejected') return fail(404, 'Bu koda ait takım bulunamadı.')
    }
    const event = await loadEvent(req, idOf(team.event))
    if (!event) return fail(404, 'Takım bulunamadı.')
    const state = teamRegistrationState(event)
    if (state.ok === false) return fail(409, state.reason)
    if (isJudge(event, me!.id)) return fail(409, 'Bu etkinliğin jürisi takıma katılamaz.')
    const mineInEvent = await membershipsOf(req, { event: { equals: event.id }, participant: { equals: me!.id } })
    if (hasActiveMembership(mineInEvent, me!.id)) return fail(409, 'Bu etkinlikte zaten bir takımdasınız ya da bekleyen başvurunuz var.')
    const teamMembers = await membershipsOf(req, { team: { equals: team.id } })
    const joinable = joinRequestState(team, acceptedCount(teamMembers), memberLimits(event).max)
    if (joinable.ok === false) return fail(409, joinable.reason, { code: 'team_closed' })
    if (byOpenList && !isSeekingMembers(team, acceptedCount(teamMembers), memberLimits(event).max)) return fail(409, 'Bu takım şu an üye aramıyor.')
    const gate = await requireApplication(req, event, me!)
    if (gate) return gate
    await req.payload.create({ collection: 'team-memberships', overrideAccess: true, req, data: {
      team: team.id, event: event.id, participant: me!.id, role: 'member', status: 'pending', message,
    } as never })
    return reply(201, { ok: true, team: { id: String(team.id), name: team.name } })
  }),

  route('get', '/teams/:id', { auth: true }, async (req, me) => {
    const team = await loadTeam(req, param(req, 'id'))
    const event = team ? await loadEvent(req, idOf(team.event)) : null
    if (!team || !event) return fail(404, 'Takım bulunamadı.')
    const detail = await teamDetail(req, team, event, me!)
    if (!detail) return fail(403, 'Bu takımın üyesi değilsiniz.')
    return reply(200, { ok: true, ...detail })
  }),

  // Onaylı/kabul edilmiş takımın iletişim adresi: yalnız giriş yapmış (e-postası doğrulanmış) katılımcıya; herkese açık veride yok
  route('get', '/teams/:id/contact', { auth: true }, async (req, me) => {
    if (await limited(req, 'contact:acct', hashKey(String(me!.id), 'takim-user'), 60, 3600)) return fail(429, 'Çok fazla istek. Biraz sonra tekrar deneyin.')
    const team = await loadTeam(req, param(req, 'id'))
    if (!team || !isPubliclyVisible(team)) return fail(404, 'Takım bulunamadı.')
    return reply(200, { ok: true, contact: contactOf(team) })
  }),

  // Kaptan: takım sayfasını düzenle (beyaz liste)
  route('post', '/teams/:id/update', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team } = loaded
    if (editLimitReached(team)) return fail(429, EDIT_LIMIT_MESSAGE, { code: 'edit_limit' })
    const data = await body(req)
    const patch: Json = {}
    if (data.name !== undefined) {
      if (isNameLocked(team)) return fail(409, 'Onaya gönderilen takımın adı değiştirilemez.')
      const name = cleanName(data.name)
      if (!name) return fail(400, 'Takım adı 2-60 karakter olmalı.')
      patch.name = name
    }
    if (data.manifesto !== undefined) {
      const manifesto = cleanText(data.manifesto, 2000)
      if (manifesto === null) return fail(400, 'Manifesto en fazla 2000 karakter olabilir.')
      patch.manifesto = manifesto
    }
    if (data.design !== undefined) {
      if (JSON.stringify(data.design ?? null).length > 32_000) return fail(413, 'Tasarım verisi çok büyük.')
      patch.design = validateTeamDesign(data.design, await ownedMediaUrls(req, team.id))
      // Kartta/listede de aynı metin görünsün: tasarımdaki manifesto takımın manifestosu olur (null → değişmez)
      const designManifesto = (patch.design as { manifesto: string | null }).manifesto
      if (designManifesto !== null && data.manifesto === undefined) patch.manifesto = designManifesto
    }
    if (data.contact !== undefined) {
      const checked = validateContact(data.contact)
      if (checked.ok === false) return fail(400, checked.reason, { code: 'invalid_contact' })
      patch.contact = checked.contact ?? { type: null, value: null }
    }
    for (const kind of ['logo', 'cover'] as const) {
      if (data[kind] === undefined) continue
      if (data[kind] === null) {
        patch[kind] = null
        // Kaldırılan görsel kayıtlı tasarımdan da düşer; yoksa sayfada tasarımdaki eski adres görünmeye devam eder
        const saved = (patch.design ?? team.design) as Json | null | undefined
        if (saved && typeof saved === 'object') patch.design = { ...saved, [`${kind}Url`]: null }
        continue
      }
      if (!isPositiveId(data[kind])) return fail(400, 'Geçersiz görsel.')
      const media = await req.payload.findByID({ collection: 'team-media', id: String(data[kind]), depth: 0, overrideAccess: true, req }).catch((): null => null) as Json | null
      if (!media || !sameId(media.team, team.id) || media.kind !== kind) return fail(400, 'Görsel bu takıma ait değil.')
      patch[kind] = media.id
    }
    if (!Object.keys(patch).length) return fail(400, 'Değişiklik yok.')
    patch.editCount = editCountOf(team) + 1
    await req.payload.update({ collection: 'teams', id: team.id, overrideAccess: true, req, data: patch as never })
    return reply(200, { ok: true })
  }),

  // Kaptan: onaya gönder (üye sayısı min..max)
  route('post', '/teams/:id/submit', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team, event } = loaded
    if (team.status !== 'draft' && team.status !== 'rejected') return fail(409, 'Takım zaten onaya gönderildi.')
    const state = teamRegistrationState(event)
    if (state.ok === false) return fail(409, state.reason)
    // Erken onay: takım dolmadan da onaya gönderilebilir (yönetim onaylarsa "üye arıyor" listelenir)
    const count = acceptedCount(await membershipsOf(req, { team: { equals: team.id } }))
    const ready = approvalRequestState(team, count, memberLimits(event).max)
    if (ready.ok === false) return fail(409, ready.reason)
    await req.payload.update({ collection: 'teams', id: team.id, overrideAccess: true, req, data: { status: 'pending' } as never })
    return reply(200, { ok: true })
  }),

  // Kaptan: başvuruyu kabul/ret, üyeyi çıkar (onaylı/kabul edilmiş takımda da; teslimden sonra kadro kilitli)
  route('post', '/teams/:id/members/:membershipId', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team, event } = loaded
    const data = await body(req)
    const action = data.action
    if (action !== 'accept' && action !== 'reject' && action !== 'remove') return fail(400, 'Geçersiz işlem.')
    const memberships = await membershipsOf(req, { team: { equals: team.id } })
    const target = memberships.find((m) => String(m.id) === param(req, 'membershipId'))
    if (!target) return fail(404, 'Başvuru bulunamadı.')
    if (target.role === 'captain') return fail(409, 'Kaptan çıkarılamaz.')
    const now = new Date().toISOString()
    if (action === 'remove') {
      const removable = removeMemberState(team, target)
      if (removable.ok === false) return fail(409, removable.reason)
      // Takım dolu değilse yeniden "üye arıyor" olur (sayım okumada yapılır); çıkarılan kişi yeniden istek gönderebilir.
      await req.payload.update({ collection: 'team-memberships', id: target.id, overrideAccess: true, req, data: { status: 'removed', decidedAt: now } as never })
      await notifySiteRevalidate('teams') // etkinlik sayfasındaki üye sayısı / "üye arıyor"
      return reply(200, { ok: true })
    }
    if (target.status !== 'pending') return fail(409, 'Bu başvuru zaten sonuçlandı.')
    if (action === 'reject') {
      await req.payload.update({ collection: 'team-memberships', id: target.id, overrideAccess: true, req, data: { status: 'rejected', decidedAt: now } as never })
      return reply(200, { ok: true })
    }
    // Onaylı/onay bekleyen takım da dolana kadar üye alır (erken onay)
    const canAccept = acceptMemberState(team, acceptedCount(memberships), memberLimits(event).max)
    if (canAccept.ok === false) return fail(409, canAccept.reason)
    await req.payload.update({ collection: 'team-memberships', id: target.id, overrideAccess: true, req, data: { status: 'accepted', decidedAt: now } as never })
    // Aynı anda gelen iki kabul sınırı aşmış olabilir (ikisi de eski sayımı gördü): güncel listeyle yeniden say, fazlaysa bu kabul geri alınır
    const after = await membershipsOf(req, { team: { equals: team.id } })
    if (acceptOverflow(after as Array<MembershipLite & Json & { id: number }>, memberLimits(event).max).some((m) => sameId(m.id, target.id))) {
      await req.payload.update({ collection: 'team-memberships', id: target.id, overrideAccess: true, req, data: { status: 'rejected', decidedAt: now } as never })
      return fail(409, 'Takım doldu; bu başvuru kabul edilemedi.')
    }
    // Takım bu kabulle dolduysa kalan bekleyen istekler otomatik reddedilir (kişiler başka takıma katılabilsin)
    const closed = pendingToCloseWhenFull(after, memberLimits(event).max)
    for (const m of closed) {
      await req.payload.update({ collection: 'team-memberships', id: m.id, overrideAccess: true, req, data: { status: 'rejected', decidedAt: now } as never })
    }
    await notifySiteRevalidate('teams')
    return reply(200, { ok: true, closedRequests: closed.length })
  }),

  // Kaptan: kaptanlığı kabul edilmiş bir üyeye devret (takım adını yazarak onay). Roller Teams kancalarında aynı işlemde değişir.
  route('post', '/teams/:id/captain', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team } = loaded
    if (await limited(req, 'captain:acct', hashKey(String(me!.id), 'takim-user'), 5, 3600)) return fail(429, 'Çok fazla deneme. Biraz sonra tekrar deneyin.')
    const data = await body(req)
    if (!transferNameMatches(data.confirmName, team.name)) return fail(400, 'Onay için takım adını aynen yazın.', { code: 'confirm_name' })
    const memberships = await membershipsOf(req, { team: { equals: team.id } })
    const target = memberships.find((m) => String(m.id) === String(data.membershipId ?? ''))
    if (!target) return fail(404, 'Üye bulunamadı.')
    const state = captainTransferState(memberships, team.captain, target.participant)
    if (state.ok === false) return fail(409, state.reason)
    // Payload sayı kimlikli ilişkide metin kimliği reddeder ("field is invalid: Kaptan"); kimlik sayı olarak yazılır
    await req.payload.update({ collection: 'teams', id: team.id, overrideAccess: true, req, data: { captain: Number(idOf(target.participant)) } as never })
    // Bildirim (devir kaydedildikten sonra; mail gidemezse devir geri alınmaz)
    const people = await req.payload.find({ collection: 'participants', where: { id: { in: [idOf(me!.id), idOf(target.participant)] } } as never,
      depth: 0, limit: 2, overrideAccess: true, req, pagination: false })
    const person = (id: unknown) => (people.docs as Array<{ id: unknown; fullName?: string; email?: string }>).find((p) => sameId(p.id, id))
    const next = person(target.participant)
    const prev = person(me!.id)
    const teamName = String(team.name)
    if (next?.email) await sendTeamNoticeMail(req.payload, { to: next.email, name: next.fullName ?? '', subject: `${KULUP.kisaAd} · ${teamName} takımının kaptanı oldun`,
      lines: [`${prev?.fullName ?? 'Takım kaptanı'}, ${teamName} takımının kaptanlığını sana devretti.`, 'Takım sayfasını düzenleme, üye başvurularını yönetme ve proje teslimi artık senin sorumluluğunda. Katılımcı panelinden takımına ulaşabilirsin.'] })
    if (prev?.email) await sendTeamNoticeMail(req.payload, { to: prev.email, name: prev.fullName ?? '', subject: `${KULUP.kisaAd} · ${teamName} kaptanlığını devrettin`,
      lines: [`${teamName} takımının kaptanlığını ${next?.fullName ?? 'bir üyeye'} devrettin. Takımda üye olarak kalmaya devam ediyorsun.`, 'Bu işlemi sen yapmadıysan hemen yönetimle iletişime geç.'] })
    return reply(200, { ok: true })
  }),

  // Üye: takımdan ayrıl / başvuruyu geri çek (onaylı/kabul edilmiş takımda da; kaptan ayrılamaz; teslimden sonra kilitli)
  route('post', '/teams/:id/leave', { auth: true }, async (req, me) => {
    const team = await loadTeam(req, param(req, 'id'))
    if (!team) return fail(404, 'Takım bulunamadı.')
    const mine = (await membershipsOf(req, { team: { equals: team.id }, participant: { equals: me!.id } }))
      .find((m) => m.status === 'accepted' || m.status === 'pending')
    if (!mine && !canEditTeam(team, me!.id)) return fail(404, 'Bu takımda üyeliğiniz yok.')
    const leavable = leaveState(team, mine ?? { participant: me!.id, role: 'captain', status: 'accepted' }, me!.id)
    if (leavable.ok === false) return fail(409, leavable.reason)
    await req.payload.update({ collection: 'team-memberships', id: mine!.id, overrideAccess: true, req, data: { status: 'left', decidedAt: new Date().toISOString() } as never })
    if (mine!.status === 'accepted') await notifySiteRevalidate('teams')
    return reply(200, { ok: true })
  }),

  // Kaptan: takımı dağıt (yalnız kendisi kalmışken, kabul/teslimden önce). Üyelikler ve takım silinir; görseller takımsız kalır.
  route('post', '/teams/:id/disband', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team } = loaded
    const data = await body(req)
    if (!transferNameMatches(data.confirmName, team.name)) return fail(400, 'Onay için takım adını aynen yazın.', { code: 'confirm_name' })
    const memberships = await membershipsOf(req, { team: { equals: team.id } })
    const state = disbandState(team, memberships, me!.id)
    if (state.ok === false) return fail(409, state.reason)
    // Puan ve üyelik sütunu takıma bağlı (boş olamaz): takımdan önce silinir
    for (const collection of ['team-scores', 'team-memberships'] as const) {
      await req.payload.delete({ collection, where: { team: { equals: team.id } } as never, overrideAccess: true, req })
    }
    await req.payload.delete({ collection: 'teams', id: team.id, overrideAccess: true, req })
    await notifySiteRevalidate('teams')
    return reply(200, { ok: true })
  }),

  // Kaptan: görsel yükle (logo/kapak/GIF) — imza doğrulama + sharp ile yeniden kodlama, rastgele ad, hız sınırı
  route('post', '/teams/:id/upload', { auth: true }, async (req, me) => {
      const loaded = await captainTeam(req, me!)
      if (loaded instanceof Response) return loaded
      const { team } = loaded
      if (editLimitReached(team)) return fail(429, EDIT_LIMIT_MESSAGE, { code: 'edit_limit' })
      if (Number(req.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES) return fail(413, 'Dosya çok büyük.')
      if (await limited(req, 'upload:user', hashKey(String(me!.id), 'takim-user'), 20, 3600)
        || await limited(req, 'upload:ip', ipKey(req), 60, 3600)) return fail(429, 'Saatlik yükleme sınırına ulaşıldı.')
      await addDataAndFileToRequest(req)
      const kind = (req.data as Json | undefined)?.kind
      if (kind !== 'logo' && kind !== 'cover' && kind !== 'gif') return fail(400, 'Geçersiz görsel türü.')
      const file = req.file
      if (!file?.data || !Buffer.isBuffer(file.data)) return fail(400, 'Dosya bulunamadı.')
      let clean
      try {
        clean = await sanitizeImage(file.data, kind as ImageKind)
      } catch (error) {
        if (error instanceof ImageRejected) {
          const { ip, ua } = requestClient(req)
          await recordSecurity(req.payload, { kind: 'takim_upload_rejected', ip, ua, actor: maskEmail(me!.email), detail: { code: error.code, kind } })
          return fail(422, error.message, { code: error.code })
        }
        throw error
      }
      if (kind === 'gif') {
        const { totalDocs } = await req.payload.count({ collection: 'team-media', where: { team: { equals: team.id }, kind: { equals: 'gif' } }, overrideAccess: true, req })
        if (totalDocs >= 30) return fail(409, 'Bu takım için GIF sınırına ulaşıldı.')
      }
      const name = randomObjectName(clean.ext)
      const doc = await req.payload.create({ collection: 'team-media', overrideAccess: true, req,
        data: { kind, team: team.id, uploadedBy: me!.id } as never,
        file: { data: clean.buffer, mimetype: clean.mime, name, size: clean.buffer.length } })
      return reply(201, { ok: true, id: String(doc.id), url: publicMediaUrl((doc as Json).url), width: clean.width, height: clean.height })
    }),

  // Kaptan: proje teslimi
  route('post', '/teams/:id/submission', { auth: true }, async (req, me) => {
    const loaded = await captainTeam(req, me!)
    if (loaded instanceof Response) return loaded
    const { team, event } = loaded
    const state = submissionState(event, team, new Date(), acceptedCount(await membershipsOf(req, { team: { equals: team.id } })))
    if (state.ok === false) return fail(409, state.reason)
    if (await liveSessionActive(req, event.id)) return fail(409, 'Jüri değerlendirmesi başladı; teslim artık değiştirilemez.')
    const data = await body(req)
    const projectName = cleanName(data.projectName, 2, 100)
    const summary = cleanText(data.summary, 3000)
    if (!projectName) return fail(400, 'Proje adı 2-100 karakter olmalı.')
    if (!summary || summary.length < 20) return fail(400, 'Açıklama 20-3000 karakter olmalı.')
    const links: Json = {}
    for (const key of ['githubUrl', 'demoUrl', 'videoUrl'] as const) {
      const url = cleanUrl(data[key])
      if (url === null) return fail(400, 'Bağlantılar http:// veya https:// ile başlayan geçerli adresler olmalı.')
      links[key] = url
    }
    await req.payload.update({ collection: 'teams', id: team.id, overrideAccess: true, req, data: {
      submission: { projectName, summary, ...links, submittedAt: new Date().toISOString() },
    } as never })
    return reply(200, { ok: true })
  }),
]

/** Bağımsız puanlama ve proje teslimi: canlı jüri oturumu başladıktan sonra kapalı (oylama tek yoldan, teslim sabit). */
async function liveSessionActive(req: PayloadRequest, eventId: unknown): Promise<boolean> {
  const { docs } = await req.payload.find({ collection: 'jury-sessions', where: { event: { equals: idOf(eventId) } } as never,
    limit: 1, depth: 0, overrideAccess: true, req, select: { status: true } as never })
  const status = (docs[0] as { status?: string } | undefined)?.status
  return Boolean(status && status !== 'idle')
}

// ─── Jüri ───────────────────────────────────────────────────────────────────────

async function judgeEvent(req: PayloadRequest, me: Participant): Promise<(EventLite & Json) | Response> {
  const event = await loadEvent(req, param(req, 'eventId'))
  if (!event) return fail(404, 'Etkinlik bulunamadı.')
  if (!isJudge(event, me.id)) return fail(403, 'Bu etkinliğin jürisi değilsiniz.')
  return event
}

const juryEndpoints: Endpoint[] = [
  route('get', '/jury/:eventId', { auth: true }, async (req, me) => {
    const event = await judgeEvent(req, me!)
    if (event instanceof Response) return event
    const criteria = criteriaOf(event)
    // Jüri yalnız kabul edilen takımları görür (canScore da aynı kuralı uygular)
    const { docs: teams } = await req.payload.find({ collection: 'teams', where: { event: { equals: event.id }, status: { equals: 'accepted' } },
      depth: 0, limit: 200, overrideAccess: true, req, pagination: false })
    const memberships = await membershipsOf(req, { event: { equals: event.id } })
    const { docs: scores } = await req.payload.find({ collection: 'team-scores', where: { event: { equals: event.id }, judge: { equals: me!.id } },
      depth: 0, limit: 500, overrideAccess: true, req, pagination: false })
    const submissions = (teams as unknown as Array<TeamLite & Json>)
      .filter((team) => canScore(event, team, me!.id, memberships.filter((m) => sameId(m.team, team.id))).ok)
      .map((team) => {
        const sub = (team.submission ?? {}) as Json
        const links = ([['GitHub', sub.githubUrl], ['Demo', sub.demoUrl], ['Video', sub.videoUrl]] as const)
          .filter(([, url]) => typeof url === 'string' && url).map(([label, url]) => ({ label, url: String(url) }))
        const mine = scores.find((s) => sameId((s as Json).team, team.id)) as Json | undefined
        return { id: String(team.id), teamName: String(team.name), title: String(sub.projectName || 'Teslim yok'), summary: String(sub.summary ?? ''),
          submitted: Boolean(sub.submittedAt), links, myScores: (mine?.scores as Record<string, number> | undefined) ?? undefined,
          myComment: (mine?.comment as string | undefined) ?? '' }
      })
    return reply(200, { ok: true, event: { id: String(event.id), title: event.title, slug: event.slug, criteria }, submissions })
  }),

  route('post', '/jury/:eventId/score', { auth: true }, async (req, me) => {
    const event = await judgeEvent(req, me!)
    if (event instanceof Response) return event
    if (event.resultsPublished) return fail(409, 'Sonuçlar yayınlandı; puanlar artık değiştirilemez.')
    if (await liveSessionActive(req, event.id)) return fail(409, 'Canlı jüri oturumu sürüyor; puanı canlı ekrandan verin.')
    const data = await body(req)
    const team = await loadTeam(req, data.teamId)
    if (!team) return fail(404, 'Takım bulunamadı.')
    const memberships = await membershipsOf(req, { team: { equals: team.id } })
    const allowed = canScore(event, team, me!.id, memberships)
    if (allowed.ok === false) return fail(403, allowed.reason)
    const criteria = criteriaOf(event)
    const checked = validateScores(data.scores, criteria)
    if (checked.ok === false) return fail(400, checked.reason)
    const comment = cleanText(data.comment ?? '', 1000)
    if (comment === null) return fail(400, 'Yorum en fazla 1000 karakter olabilir.')
    const total = weightedTotal(checked.scores, criteria)
    const { docs } = await req.payload.find({ collection: 'team-scores', where: { team: { equals: team.id }, judge: { equals: me!.id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const record = { event: event.id, team: team.id, judge: me!.id, scores: checked.scores, total, comment }
    if (docs[0]) await req.payload.update({ collection: 'team-scores', id: docs[0].id, overrideAccess: true, req, data: record as never })
    else await req.payload.create({ collection: 'team-scores', overrideAccess: true, req, data: record as never })
    return reply(200, { ok: true, total })
  }),
]

/** Etkinliğin ödülleri (sıraya göre), görselleri site adresiyle. */
export async function prizesOf(req: PayloadRequest, event: Json) {
  const rawPrizes = Array.isArray(event.prizes) ? event.prizes as Json[] : []
  // Ödül görselleri (media): tek sorguda; yalnız görsel türündeki dosyalar
  const imageIds = [...new Set(rawPrizes.map((p) => idOf(p.image)).filter((id) => isPositiveId(id)))]
  const images = new Map<string, { url: string; alt: string }>()
  if (imageIds.length) {
    const { docs } = await req.payload.find({ collection: 'media', where: { id: { in: imageIds } }, depth: 0, limit: imageIds.length, overrideAccess: true, req, pagination: false })
    for (const doc of docs as Json[]) {
      const url = publicSiteMediaUrl(doc.url)
      if (url && String(doc.mimeType ?? '').startsWith('image/')) images.set(String(doc.id), { url, alt: String(doc.alt ?? '') })
    }
  }
  return rawPrizes
    .map((p) => {
      const image = images.get(idOf(p.image))
      return { rank: Number(p.rank), title: String(p.title ?? ''), description: p.description ? String(p.description) : undefined,
        imageUrl: image?.url, imageAlt: image?.alt || undefined }
    })
    .filter((p) => p.title && Number.isFinite(p.rank)).sort((a, b) => a.rank - b.rank)
}

// ─── Herkese açık (site sunucusu; onaylı = başvuran, kabul edilen; reddedilen gizli) ─

export async function publicEventData(req: PayloadRequest, event: EventLite & Json) {
  const settings = (event.teamSettings ?? {}) as Json
  const teams = event.teamMode
    ? await (async () => {
      // Site ikiye ayırır: status 'accepted' → "Kabul edilen takımlar", 'approved' → "Başvuran takımlar"
      const { docs } = await req.payload.find({ collection: 'teams', where: { event: { equals: event.id }, status: { in: ['approved', 'accepted'] } },
        depth: 0, limit: 200, sort: 'approvedAt', overrideAccess: true, req, pagination: false })
      const all = await membershipsOf(req, { event: { equals: event.id }, status: { equals: 'accepted' } })
      // design: ana sayfadaki takım kartları takımın kendi renk/desen/kapak/sticker'ıyla çizilir (kayıtta doğrulanmış)
      return Promise.all((docs as unknown as Array<TeamLite & Json>).map(async (team) => ({
        ...(await teamPublic(req, team, event, all.filter((m) => sameId(m.team, team.id)))),
        design: team.design ?? null,
      })))
    })()
    : []
  let results: Array<{ rank: number; name: string; teamSlug: string | null; score: number | null }> = []
  if (event.resultsPublished && Array.isArray(event.results)) {
    for (const row of event.results as Json[]) {
      const team = row.team ? await loadTeam(req, idOf(row.team)) : null
      const visibleTeam = team && isPubliclyVisible(team) ? team : null
      const name = String(row.name || visibleTeam?.name || '').trim()
      if (!name) continue
      results.push({ rank: Number(row.rank), name, teamSlug: visibleTeam ? String(visibleTeam.slug) : null,
        score: typeof row.score === 'number' ? row.score : null })
    }
    results = visibleResults(results, event.resultsDisplay as string)
  }
  const prizes = await prizesOf(req, event)
  return {
    teamMode: Boolean(event.teamMode),
    heading: String(settings.teamsHeading || 'Başvuran takımlar'),
    notice: String(settings.teamsNotice ?? 'Başvuru aşamasında seçilen takımlar burada yayımlanacaktır.'),
    registration: event.teamMode ? teamRegistrationState(event) : { ok: false, reason: '' },
    limits: memberLimits(event),
    teams,
    results,
    resultsDisplay: (['top3', 'first', 'full'].includes(String(event.resultsDisplay)) ? event.resultsDisplay : 'top3') as 'top3' | 'first' | 'full',
    prizes,
  }
}

const publicEndpoints: Endpoint[] = [
  route('get', '/public/event/:eventId', {}, async (req) => {
    const event = await loadEvent(req, param(req, 'eventId'))
    if (!event) return fail(404, 'Etkinlik bulunamadı.')
    return reply(200, { ok: true, ...(await publicEventData(req, event)) })
  }),

  route('get', '/public/team/:slug', {}, async (req) => {
    const slug = param(req, 'slug')
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) return fail(404, 'Takım bulunamadı.')
    const { docs } = await req.payload.find({ collection: 'teams', where: { slug: { equals: slug }, status: { in: ['approved', 'accepted'] } }, limit: 1, depth: 0, overrideAccess: true, req })
    const team = docs[0] as unknown as (TeamLite & Json) | undefined
    const event = team ? await loadEvent(req, idOf(team.event)) : null
    if (!team || !event) return fail(404, 'Takım bulunamadı.')
    return reply(200, { ok: true, team: await teamPublic(req, team, event), design: team.design ?? null,
      event: { id: String(event.id), title: event.title, slug: event.slug } })
  }),
]

/** Yönetici paneli: jüri puanlarından öneri sıralaması (Events → Ödüller ve sonuçlar). */
export async function rankingForEvent(req: PayloadRequest, eventId: string | number) {
  const event = await loadEvent(req, eventId)
  const { docs: scores } = await req.payload.find({ collection: 'team-scores', where: { event: { equals: eventId } }, depth: 0, limit: 5000, overrideAccess: true, req, pagination: false })
  const { docs: accepted } = await req.payload.find({ collection: 'teams', where: { event: { equals: eventId }, status: { equals: 'accepted' } }, depth: 0, limit: 500, overrideAccess: true, req, pagination: false, select: { id: true } as never })
  const acceptedIds = new Set((accepted as Json[]).map((t) => String(t.id)))
  // Yalnız güncel jürinin, kabul edilen takımlara verdiği puanlar (jüriden çıkarılan / kabulden düşen sayılmaz)
  const current = (scores as Json[]).filter((s) => event && isJudge(event, s.judge) && acceptedIds.has(idOf(s.team)))
  const ranking = suggestRanking(current.map((s) => ({ team: idOf(s.team), total: Number(s.total) || 0 })))
  const names = new Map<string, string>()  
  if (ranking.length) {
    const { docs } = await req.payload.find({ collection: 'teams', where: { id: { in: ranking.map((r) => r.team) } }, depth: 0, limit: ranking.length, overrideAccess: true, req, pagination: false })
    for (const t of docs) names.set(String(t.id), String((t as Json).name))
  }
  return ranking.map((r) => ({ ...r, name: names.get(r.team) ?? `#${r.team}` }))
}

export const teamEndpoints: Endpoint[] = [...authEndpoints, ...teamEndpointsList, ...juryEndpoints, ...publicEndpoints]
