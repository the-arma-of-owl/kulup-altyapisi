import { describeDevice } from './clientIp'
import { logEvent } from './notify'
import { esc, hashIp, hashKey, ipLabel, maskEmail } from './privacy'
import { getObsStore } from './store'

type PayloadLike = Parameters<typeof getObsStore>[0]

/** Sınırlar tek yerde (ABT'deki Upstash sınırlarının Postgres karşılığı). */
export const LIMITS = {
  /** Parola denemesi (başarılı + başarısız) IP başına: ABT ile aynı 30 / 15 dk. */
  loginAttemptsPerIp: { bucket: 'login:attempt:ip', max: 30, windowSec: 900 },
  /** Başarısız parola IP başına 5 / 10 dk → IP 15 dk engellenir. */
  loginFailuresPerIp: { bucket: 'login:fail:ip', max: 5, windowSec: 600, blockSec: 900 },
  /** Aynı hesaba saatte 10 başarısız deneme (farklı IP'lerden dağıtık saldırı) → uyarı. */
  loginFailuresPerAccount: { bucket: 'login:fail:acct', max: 10, windowSec: 3600 },
  /** payload-totp hatalı kodda 200 döner; Payload hesap kilidine girmez. Tek sınır bu. */
  totpAttemptsPerIp: { bucket: 'totp:attempt:ip', max: 20, windowSec: 900 },
  totpFailuresPerUser: { bucket: 'totp:fail:user', max: 5, windowSec: 900, blockSec: 900 },
  /** Site formları, ziyaretçi IP'si başına 10 dk. Kampüs/NAT için etkinlik kaydı geniş. */
  forms: {
    'event-registrations': { max: 60, warn: 15 },
    'member-applications': { max: 10, warn: 4 },
    'core-team-applications': { max: 6, warn: 3 },
    'contact-messages': { max: 10, warn: 5 },
  } as Record<string, { max: number; warn: number }>,
  formWindowSec: 600,
  certificateVerifyPerIp: { bucket: 'cert:verify:ip', max: 30, windowSec: 60 },
  workerMailPerUser: { bucket: 'mail:worker:user', max: 60, windowSec: 60 },
} as const

/** Sayaç + sınır; depo hatasında izin verir (fail-open), hata günlüğe düşer. */
export async function allow(payload: PayloadLike, bucket: string, keyHash: string, max: number, windowSec: number): Promise<{ allowed: boolean; count: number }> {
  try {
    const count = await getObsStore(payload).hit(bucket, keyHash, windowSec)
    return { allowed: count <= max, count }
  } catch (error) {
    console.error('[obs] hız sınırı okunamadı:', (error as Error)?.message)
    return { allowed: true, count: 0 }
  }
}

export async function isBlocked(payload: PayloadLike, bucket: string, keyHash: string): Promise<Date | null> {
  try { return await getObsStore(payload).blockedUntil(bucket, keyHash) } catch { return null }
}

export async function recordSecurity(payload: PayloadLike, input: {
  kind: string; ip?: string; ua?: string; actor?: string | null; path?: string; detail?: Record<string, unknown>
}): Promise<void> {
  try {
    await getObsStore(payload).recordSecurity({
      kind: input.kind,
      ip: input.ip && input.ip !== 'unknown' ? input.ip : null,
      ipHash: input.ip ? hashIp(input.ip) : null,
      device: input.ua ? describeDevice(input.ua) : null,
      actor: input.actor ?? null,
      path: input.path ?? null,
      detail: input.detail,
    })
  } catch (error) {
    console.error('[obs] güvenlik olayı kaydedilemedi:', (error as Error)?.message)
  }
}

// KVKK: Telegram'a tam IP gitmez; maskeli IP + geri çevrilemeyen etiket (aynı kişiyi tanımaya yeter).
export const clientLine = (ip: string | undefined, ua: string | undefined): string =>
  `🌐 <b>IP:</b> <code>${esc(ipLabel(ip))}</code> · ${esc(describeDevice(ua))}`

// ─── Panik (acil kilit) ─────────────────────────────────────────────────────────
// ABT'de panic bayrağı yalnız açılıp kapanıyor, hiçbir yerde denetlenmiyordu. Burada gerçekten uygulanır:
// açıkken yeni panel girişi (parola + TOTP), oturumlu tüm yazma işlemleri ve worker mail gönderimi durur.
// Site formları ve okumalar çalışmaya devam eder. Yalnız Telegram'dan (grup yöneticisi) açılıp kapanır;
// panel girişi kapalı olduğundan ele geçirilmiş bir oturum kilidi kaldıramaz.

export type PanicState = { active: boolean; by?: string; at?: string; reason?: string }
let panicCache: { value: PanicState; until: number } | null = null

export async function getPanic(payload: PayloadLike, fresh = false): Promise<PanicState> {
  if (!fresh && panicCache && panicCache.until > Date.now()) return panicCache.value
  let value: PanicState = { active: false }
  try {
    value = (await getObsStore(payload).kvGet<PanicState>('panic')) ?? { active: false }
  } catch (error) {
    console.error('[obs] panik durumu okunamadı:', (error as Error)?.message)
    value = panicCache?.value ?? { active: false }
  }
  panicCache = { value, until: Date.now() + 10_000 }
  return value
}

export async function setPanic(payload: PayloadLike, active: boolean, by: string, reason = ''): Promise<PanicState> {
  const value: PanicState = active ? { active: true, by, at: new Date().toISOString(), reason: reason.slice(0, 200) } : { active: false, by, at: new Date().toISOString() }
  await getObsStore(payload).kvSet('panic', value)
  panicCache = { value, until: Date.now() + 10_000 }
  await recordSecurity(payload, { kind: active ? 'panic_on' : 'panic_off', actor: by, detail: { reason } })
  await logEvent(payload, {
    kind: active ? 'panic_on' : 'panic_off', category: 'security', level: active ? 'error' : 'warn',
    text: active
      ? `🚨 <b>ACİL KİLİT AÇILDI</b>\nAçan: ${esc(by)}${reason ? `\nNeden: ${esc(reason)}` : ''}\n\nYeni panel girişi, oturumlu yazma işlemleri ve worker mail gönderimi durduruldu. Site formları çalışıyor.\nKapatmak için: <code>/panik kapat</code>`
      : `✅ <b>Acil kilit kapatıldı</b>\nKapatan: ${esc(by)}`,
  })
  return value
}

export const PANIC_MESSAGE = 'Acil kilit açık: yönetim işlemleri geçici olarak durduruldu.'

// ─── Giriş olayları ──────────────────────────────────────────────────────────────

export function loginActor(email: unknown): string {
  return maskEmail(email)
}

export const accountKey = (email: unknown) => hashKey(String(email ?? '').trim().toLowerCase(), 'acct')
