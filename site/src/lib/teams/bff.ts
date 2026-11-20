/**
 * Takım modu BFF kuralları (saf; testler tests/teams.test.ts). /api/takim/* site rotası yalnız buradaki
 * beyaz listedeki uçları CMS'e iletir. Tarayıcı CMS'e hiçbir kimlik göndermez.
 */

export type RouteKind = 'json' | 'upload'
export type Special = 'login' | 'verify' | 'logout' | 'reset'
export type ResolvedRoute = { cmsPath: string; auth: boolean; kind: RouteKind; special?: Special; human?: boolean }

const ID = /^[1-9]\d{0,9}$/

// human: Turnstile jetonu zorunlu (x-turnstile-token) — toplu hesap / takım açmaya karşı
type Rule = { method: 'GET' | 'POST'; pattern: Array<string | RegExp>; auth: boolean; kind?: RouteKind; special?: Special; human?: boolean }

const RULES: Rule[] = [
  { method: 'GET', pattern: ['me'], auth: true },
  { method: 'GET', pattern: ['teams', ID], auth: true },
  { method: 'GET', pattern: ['jury', ID], auth: true },
  { method: 'GET', pattern: ['events', ID, 'application'], auth: true },
  { method: 'GET', pattern: ['teams', ID, 'contact'], auth: true },
  { method: 'POST', pattern: ['auth', 'register'], auth: false, human: true },
  { method: 'POST', pattern: ['auth', 'resend'], auth: false },
  { method: 'POST', pattern: ['auth', 'verify'], auth: false, special: 'verify' },
  { method: 'POST', pattern: ['auth', 'login'], auth: false, special: 'login' },
  { method: 'POST', pattern: ['auth', 'logout'], auth: false, special: 'logout' },
  { method: 'POST', pattern: ['auth', 'forgot'], auth: false },
  { method: 'POST', pattern: ['auth', 'reset'], auth: false, special: 'reset' },
  { method: 'POST', pattern: ['teams'], auth: true, human: true },
  { method: 'POST', pattern: ['join', 'preview'], auth: true },
  { method: 'POST', pattern: ['join'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'update'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'submit'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'members', ID], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'leave'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'captain'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'disband'], auth: true },
  { method: 'POST', pattern: ['teams', ID, 'upload'], auth: true, kind: 'upload' },
  { method: 'POST', pattern: ['teams', ID, 'submission'], auth: true },
  { method: 'POST', pattern: ['jury', ID, 'score'], auth: true },
  // Canlı jüri oturumu: jüri/sunucu ekranı (oturumlu) ve salon ekranı (oturumsuz; gövdedeki anahtarla)
  { method: 'GET', pattern: ['jury', ID, 'live'], auth: true },
  { method: 'POST', pattern: ['jury', ID, 'live', 'vote'], auth: true },
  { method: 'POST', pattern: ['jury', ID, 'live', 'control'], auth: true },
  { method: 'POST', pattern: ['jury', ID, 'stage'], auth: false },
]

export function resolveRoute(method: string, parts: unknown): ResolvedRoute | null {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 4 || !parts.every((p) => typeof p === 'string')) return null
  for (const rule of RULES) {
    if (rule.method !== method || rule.pattern.length !== parts.length) continue
    const match = rule.pattern.every((segment, i) => (typeof segment === 'string' ? segment === parts[i] : segment.test(parts[i])))
    if (match) return { cmsPath: `/api/takim/${parts.join('/')}`, auth: rule.auth, kind: rule.kind ?? 'json', special: rule.special, ...(rule.human ? { human: true } : {}) }
  }
  return null
}

/**
 * CSRF: durum değiştiren her istekte Origin başlığı ZORUNLU ve sitenin kendi kökeni olmalı
 * (SameSite=Lax çerezle birlikte). Sec-Fetch-Site varsa same-origin olmalı.
 */
export function originAllowed(headers: { get(name: string): string | null }, allowed: string[]): boolean {
  const origin = headers.get('origin')
  if (!origin) return false
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  let normalized: string
  try { normalized = new URL(origin).origin } catch { return false }
  return allowed.includes(normalized)
}

/** İzinli kökenler: isteğin kendi ana makinesi (+ Vercel'in ilettiği) ve SITE_ORIGINS listesi. */
export function allowedOrigins(headers: { get(name: string): string | null }, env: { NODE_ENV?: string; SITE_ORIGINS?: string } = process.env): string[] {
  const list = new Set<string>()
  const production = env.NODE_ENV === 'production'
  for (const host of [headers.get('x-forwarded-host'), headers.get('host')]) {
    if (!host || !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) continue
    list.add(`https://${host}`)
    if (!production) list.add(`http://${host}`)
  }
  for (const origin of (env.SITE_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)) {
    try { list.add(new URL(origin).origin) } catch { /* geçersiz satır yok sayılır */ }
  }
  return [...list]
}

/** CMS yanıtından tarayıcıya gidecek gövde: token hiçbir zaman tarayıcıya gitmez. */
export function publicBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const rest = { ...(body as Record<string, unknown>) }
  delete rest.token
  delete rest.exp
  return rest
}

export const MAX_JSON_BYTES = 64 * 1024
/** Vercel istek gövdesi ~4.5 MB; en büyük görsel 4 MB GIF + çok parçalı başlık payı. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 + 64 * 1024
