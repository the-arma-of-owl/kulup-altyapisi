import { turnstileDecision } from './chatGuard'
import { kulupHostuMu } from './kulup'
import { clientHeaders } from './observe'

export const FORM_COLLECTIONS = ['event-registrations', 'member-applications', 'core-team-applications', 'contact-messages'] as const
export type FormCollection = (typeof FORM_COLLECTIONS)[number]

const ALLOWED_FIELDS: Record<FormCollection, readonly string[]> = {
  'event-registrations': ['event', 'fullName', 'email', 'phone', 'department', 'kvkkApproved', 'privacyPolicyApproved', 'dynamicAnswers', 'applicationStage'],
  'member-applications': ['fullName', 'email', 'phone', 'department', 'year', 'kvkkApproved', 'privacyPolicyApproved'],
  'core-team-applications': ['fullName', 'email', 'phone', 'department', 'grade', 'hometown', 'area', 'portfolioUrl', 'githubUrl', 'motivationLetter', 'kvkkApproved', 'privacyPolicyApproved'],
  'contact-messages': ['fullName', 'email', 'subject', 'message'],
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const isScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

const GET_COLLECTIONS = new Set(['events', 'blog-posts', 'team-members', 'faq', 'faqCategories', 'achievements'])
const GET_GLOBALS = new Set(['site-settings', 'legal-docs', 'university-guide-settings'])

export function resolveGetTarget(pathParts: unknown): { path: string } | null {
  if (!Array.isArray(pathParts) || !pathParts.every(part => typeof part === 'string')) return null
  const [first, second] = pathParts as string[]
  if (GET_COLLECTIONS.has(first) && (pathParts.length === 1 ||
    (pathParts.length === 2 && /^[A-Za-z0-9_-]{1,64}$/.test(second)))) {
    return { path: pathParts.join('/') }
  }
  if (first === 'globals' && pathParts.length === 2 && GET_GLOBALS.has(second)) {
    return { path: `globals/${second}` }
  }
  return null
}

export function buildGetQuery(params: URLSearchParams): string {
  const output = new URLSearchParams()
  for (const [key, value] of params) {
    if ([...output].length >= 20) break
    if (value.length > 200) continue
    if (key === 'depth' && /^\d{1,3}$/.test(value)) output.append(key, String(Math.min(Number(value), 2)))
    else if (key === 'limit' && /^\d{1,9}$/.test(value)) output.append(key, String(Math.max(1, Math.min(Number(value), 100))))
    else if (key === 'page' && /^\d{1,6}$/.test(value) && Number(value) >= 1) output.append(key, value)
    else if (key === 'sort' && /^[A-Za-z0-9_.,-]{1,100}$/.test(value)) output.append(key, value)
    else if (key === 'locale' && (value === 'tr' || value === 'en' || value === 'all')) output.append(key, value)
    else if (/^where(\[[A-Za-z0-9_.-]{1,64}\]){1,6}$/.test(key)) output.append(key, value)
  }
  const query = output.toString()
  return query ? `?${query}` : ''
}

export async function handleCmsGet(
  input: { pathParts: unknown; searchParams: URLSearchParams },
  deps: { fetcher: typeof fetch; cmsUrl: string; internalKey: string | undefined },
): Promise<{ status: number; body: unknown; cacheable: boolean }> {
  const target = resolveGetTarget(input.pathParts)
  if (!target) return { status: 400, body: { error: 'Geçersiz endpoint' }, cacheable: false }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  try {
    const response = await deps.fetcher(`${deps.cmsUrl}/api/${target.path}${buildGetQuery(input.searchParams)}`, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    const data: unknown = await response.json()
    if (!response.ok) return { status: response.status, body: { error: 'İstek başarısız' }, cacheable: false }
    return { status: response.status, body: data, cacheable: true }
  } catch {
    return { status: 503, body: { error: 'CMS bağlantısı kurulamadı' }, cacheable: false }
  }
}

export function resolveFormCollection(pathParts: unknown): FormCollection | null {
  if (!Array.isArray(pathParts) || pathParts.length !== 1) return null
  const part: unknown = pathParts[0]
  return typeof part === 'string' && FORM_COLLECTIONS.some(collection => collection === part)
    ? part as FormCollection : null
}

export function sanitizeFormBody(collection: FormCollection, body: unknown):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: 'Geçersiz form verisi' }
  const clean: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS[collection]) {
    if (!hasOwn(body, key)) continue
    const value = body[key]
    if (key === 'applicationStage') {
      if (value === 'normal' || value === 'late') clean[key] = value
      continue
    }
    if (key === 'dynamicAnswers') {
      if (!Array.isArray(value) || value.length > 200) return { ok: false, error: 'Geçersiz form verisi' }
      const answers: { question: string; answer: string }[] = []
      for (const item of value) {
        if (!isPlainObject(item)) return { ok: false, error: 'Geçersiz form verisi' }
        const question = hasOwn(item, 'question') ? item.question : ''
        const answer = hasOwn(item, 'answer') ? item.answer : ''
        if (!isScalar(question) || !isScalar(answer)) return { ok: false, error: 'Geçersiz form verisi' }
        answers.push({ question: String(question), answer: String(answer) })
      }
      clean[key] = answers
      continue
    }
    if (!isScalar(value)) return { ok: false, error: 'Geçersiz form verisi' }
    if (key === 'event' && !(typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0) &&
      !(typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value))) {
      return { ok: false, error: 'Geçersiz form verisi' }
    }
    clean[key] = value
  }
  return { ok: true, body: clean }
}

type FormPostInput = {
  pathParts: unknown
  ip: string
  /** Ziyaretçinin tarayıcısı; IP ile birlikte CMS'e iletilir (CMS yalnız iç anahtarla kabul eder). */
  userAgent?: string | null
  turnstileToken: string | null
  contentLength: string | null
  readJson: () => Promise<unknown>
}

// Forma göre dakikalık sınır (IP başına; yalnız Turnstile'dan geçen istekler sayılır). Etkinlik kaydı stant/kampüs
// günlerinde aynı ağdan çok kişi gelebileceği için yüksek; asıl tekrar engeli CMS'te kişi bazında (duplicateGuard).
export const FORM_LIMITS: Record<FormCollection, number> = {
  'event-registrations': 100, 'member-applications': 30, 'core-team-applications': 30, 'contact-messages': 10,
}
// Cloudflare'in doğruladığı sayfa alan adı bizim sitemiz olmalı
const turnstileHostAllowed = (host: string) => kulupHostuMu(host) || host === 'localhost' || host === '127.0.0.1'

type FormPostDeps = {
  fetcher: typeof fetch
  cmsUrl: string
  internalKey: string | undefined
  turnstileSecret: string | undefined
  checkRateLimit: (ip: string) => boolean
  /** Doğrulamadan geçen istek için forma göre sınır; yoksa sınırsız (testler). */
  checkFormLimit?: (ip: string, collection: FormCollection) => boolean
  /** Turnstile jetonu daha önce kullanıldıysa true; kullanılmadıysa kaydeder ve false döner. */
  tokenSeen?: (token: string) => boolean
  nodeEnv?: string
}

type TurnstileDeps = Pick<FormPostDeps, 'fetcher' | 'turnstileSecret' | 'tokenSeen' | 'nodeEnv'>

/** Turnstile jetonunu Cloudflare'de doğrular; geçerse null, geçmezse kullanıcıya gösterilecek hata. Formlar ve takım kaydı ortak. */
export async function verifyTurnstile(token: string | null, ip: string, deps: TurnstileDeps): Promise<{ status: number; error: string } | null> {
  const decision = turnstileDecision(deps.turnstileSecret, deps.nodeEnv)
  if (decision === 'reject') return { status: 503, error: 'Güvenlik doğrulaması şu an yapılamıyor.' }
  if (decision === 'skip') {
    console.warn('TURNSTILE_SECRET_KEY bulunamadı, güvenlik atlanıyor.')
    return null
  }
  if (!token) return { status: 400, error: 'Güvenlik doğrulaması (CAPTCHA) eksik.' }
  if (deps.tokenSeen?.(token)) {
    return { status: 403, error: 'Bu güvenlik doğrulaması zaten kullanıldı. Doğrulama kutusu yenilendikten sonra tekrar gönder.' }
  }
  try {
    const response = await deps.fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: deps.turnstileSecret!, response: token, remoteip: ip }).toString(),
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json()
    if (!data.success || (typeof data.hostname === 'string' && !turnstileHostAllowed(data.hostname.toLowerCase()))) {
      console.warn('Turnstile reddetti:', JSON.stringify(data['error-codes'] ?? []), data.hostname ?? '')
      return { status: 403, error: 'Güvenlik doğrulaması geçersiz veya süresi dolmuş. Doğrulama kutusu yenilendikten sonra tekrar gönder.' }
    }
  } catch {
    return { status: 503, error: 'Güvenlik servisine ulaşılamadı, lütfen tekrar deneyin.' }
  }
  return null
}

export async function handleFormPost(input: FormPostInput, deps: FormPostDeps): Promise<{ status: number; body: unknown }> {
  if (!deps.checkRateLimit(input.ip)) {
    return { status: 429, body: { error: 'Bu ağdan kısa sürede çok fazla başvuru geldi. 1 dakika bekleyip tekrar gönder.' } }
  }
  const collection = resolveFormCollection(input.pathParts)
  if (!collection) return { status: 400, body: { error: 'Geçersiz endpoint' } }

  const human = await verifyTurnstile(input.turnstileToken, input.ip, deps)
  if (human) return { status: human.status, body: { error: human.error } }
  if (deps.checkFormLimit && !deps.checkFormLimit(input.ip, collection)) {
    return { status: 429, body: { error: 'Bu ağdan kısa sürede çok fazla başvuru geldi. 1 dakika bekleyip tekrar gönder.' } }
  }

  if (input.contentLength && parseInt(input.contentLength) > 1_000_000) {
    return { status: 413, body: { error: 'İstek boyutu çok büyük' } }
  }
  let body: unknown
  try {
    body = await input.readJson()
  } catch {
    return { status: 400, body: { error: 'Geçersiz JSON' } }
  }
  const sanitized = sanitizeFormBody(collection, body)
  if (!sanitized.ok) return { status: 400, body: { error: 'Geçersiz form verisi' } }
  if (!deps.internalKey) return { status: 500, body: { error: 'Sunucu yapılandırma hatası.' } }

  try {
    const response = await deps.fetcher(`${deps.cmsUrl}/api/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': deps.internalKey, ...clientHeaders(input.ip, input.userAgent) },
      body: JSON.stringify(sanitized.body),
      signal: AbortSignal.timeout(10000),
    })
    const data: unknown = await response.json()
    if (response.ok) return { status: response.status, body: { ok: true } }
    const errors = isPlainObject(data) && Array.isArray(data.errors)
      ? data.errors.filter((error: unknown) => isPlainObject(error) && typeof error.message === 'string')
        .slice(0, 5).map((error: Record<string, unknown>) => ({ message: (error.message as string).slice(0, 300) }))
      : []
    return { status: response.status, body: { errors } }
  } catch {
    return { status: 503, body: { error: 'CMS bağlantısı kurulamadı' } }
  }
}
