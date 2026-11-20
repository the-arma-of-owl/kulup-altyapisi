import { NextResponse, type NextRequest } from 'next/server'
import { allowedOrigins, MAX_JSON_BYTES, MAX_UPLOAD_BYTES, originAllowed, publicBody, resolveRoute, type ResolvedRoute } from '@/lib/teams/bff'
import { clearedSessionCookieOptions, openSession, sealSession, sessionCookieName, sessionCookieOptions } from '@/lib/teams/session'
import { clientHeaders, getClientIp } from '@/lib/observe'
import { verifyTurnstile } from '@/lib/cmsProxy'
import { createHash } from 'node:crypto'

/**
 * /api/takim/* — katılımcı BFF'i. Tarayıcı yalnız bu site rotasıyla konuşur; oturum site alan adındaki şifreli
 * HttpOnly çerezdedir. Rota CMS'e sunucudan iç anahtar + "Authorization: JWT" ile gider.
 */

const CMS_URL = process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'
export const dynamic = 'force-dynamic'

// İlk katman taşkın sınırı (örnek başına, bellek içi). Asıl sınırlar CMS'te paylaşılan depoda.
const hits = new Map<string, { count: number; reset: number }>()
function flood(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.reset) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { count: 1, reset: now + 60_000 })
    return false
  }
  return ++entry.count > 120
}

// Turnstile jetonu tek kullanımlık; kullanılanlar 10 dk tutulur (formlardaki ile aynı)
const usedTokens = new Map<string, number>()
function tokenSeen(token: string): boolean {
  const now = Date.now()
  const key = createHash('sha256').update(token).digest('hex')
  if ((usedTokens.get(key) ?? 0) > now) return true
  if (usedTokens.size > 20000) for (const [k, until] of usedTokens) if (until <= now) usedTokens.delete(k)
  usedTokens.set(key, now + 10 * 60_000)
  return false
}

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** Oturum çerezini siler: aynı ad, Path=/, (canlıda) Secure, Max-Age=0. */
function clearCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName(), '', clearedSessionCookieOptions(process.env.NODE_ENV))
  return response
}

async function callCms(route: ResolvedRoute | { cmsPath: string }, init: { method: string; token?: string; body?: BodyInit; contentType?: string; ip: string; ua: string | null }) {
  const key = process.env.INTERNAL_API_KEY
  if (!key) throw new Error('INTERNAL_API_KEY eksik')
  const headers: Record<string, string> = { 'x-internal-api-key': key, ...clientHeaders(init.ip, init.ua) }
  if (init.token) headers.Authorization = `JWT ${init.token}`
  if (init.contentType) headers['Content-Type'] = init.contentType
  const response = await fetch(`${CMS_URL}${route.cmsPath}`, {
    method: init.method, headers, body: init.body, cache: 'no-store', signal: AbortSignal.timeout(25_000),
  })
  const data = await response.json().catch(() => ({ ok: false, error: 'Geçersiz yanıt' }))
  return { status: response.status, data: data as Record<string, unknown> }
}

async function handle(request: NextRequest, params: Promise<{ path: string[] }>) {
  const { path } = await params
  const route = resolveRoute(request.method, path)
  if (!route) return json(404, { ok: false, error: 'Bulunamadı' })
  const ip = getClientIp(request.headers)
  if (flood(ip)) return json(429, { ok: false, error: 'Çok fazla istek. Biraz bekleyin.' })

  if (request.method !== 'GET' && !originAllowed(request.headers, allowedOrigins(request.headers))) {
    return json(403, { ok: false, error: 'Geçersiz istek kaynağı.' })
  }

  const cookieName = sessionCookieName()
  const session = openSession(request.cookies.get(cookieName)?.value)
  if (route.auth && !session) {
    const response = json(401, { ok: false, error: 'Oturum açmanız gerekiyor.', code: 'unauthorized' })
    return request.cookies.has(cookieName) ? clearCookie(response) : response
  }
  if (route.human) {
    const human = await verifyTurnstile(request.headers.get('x-turnstile-token'), ip, {
      fetcher: fetch, turnstileSecret: process.env.TURNSTILE_SECRET_KEY, tokenSeen, nodeEnv: process.env.NODE_ENV,
    })
    if (human) return json(human.status, { ok: false, error: human.error, code: 'human_check' })
  }

  let body: BodyInit | undefined
  let contentType: string | undefined
  const length = Number(request.headers.get('content-length') || 0)
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || ''
    if (route.kind === 'upload') {
      if (!type.startsWith('multipart/form-data')) return json(415, { ok: false, error: 'Dosya bekleniyor.' })
      if (!length || length > MAX_UPLOAD_BYTES) return json(413, { ok: false, error: 'Dosya en fazla 4 MB olabilir.' })
      const form = await request.formData().catch(() => null)
      const file = form?.get('file')
      const kind = form?.get('kind')
      if (!(file instanceof Blob) || typeof kind !== 'string') return json(400, { ok: false, error: 'Dosya bulunamadı.' })
      // Yalnız beyaz listedeki alanlar; kullanıcının dosya adı ve türü CMS'e taşınmaz (orada imzadan belirlenir).
      const clean = new FormData()
      // Payload çok parçalı istekte alanları yalnız `_payload` (JSON) içinden okur
      clean.append('_payload', JSON.stringify({ kind }))
      clean.append('file', new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' }), 'upload.bin')
      body = clean
    } else {
      if (!type.startsWith('application/json')) return json(415, { ok: false, error: 'JSON bekleniyor.' })
      if (length > MAX_JSON_BYTES) return json(413, { ok: false, error: 'İstek çok büyük.' })
      const text = await request.text()
      if (text.length > MAX_JSON_BYTES) return json(413, { ok: false, error: 'İstek çok büyük.' })
      body = text || '{}'
      contentType = 'application/json'
    }
  }

  const ua = request.headers.get('user-agent')
  try {
    // Çıkış: CMS'teki oturum kaydı kapatılır (başarısız olsa da) ve çerez her durumda silinir.
    if (route.special === 'logout') {
      if (session) await callCms(route, { method: 'POST', token: session.token, ip, ua }).catch(() => null)
      return clearCookie(json(200, { ok: true }))
    }

    const result = await callCms(route, { method: request.method, token: session?.token, body, contentType, ip, ua })

    // Doğrulama başarılıysa ve istemci parolayı aynı adımda verdiyse doğrudan giriş yapılır.
    if (route.special === 'verify' && result.status === 200) {
      const input = JSON.parse(String(body || '{}')) as { email?: unknown; password?: unknown }
      if (typeof input.password === 'string') {
        const login = await callCms({ cmsPath: '/api/takim/auth/login' }, { method: 'POST', ip, ua, contentType: 'application/json',
          body: JSON.stringify({ email: input.email, password: input.password }) })
        return withLogin(login)
      }
    }
    if (route.special === 'login') return withLogin(result)

    const response = json(result.status, publicBody(result.data))
    if (route.special === 'reset' && result.status === 200) clearCookie(response)
    if (route.auth && result.status === 401) clearCookie(response)
    return response
  } catch (error) {
    console.error('[takim] CMS isteği başarısız:', (error as Error)?.message)
    return json(503, { ok: false, error: 'Sunucuya ulaşılamadı. Biraz sonra tekrar deneyin.' })
  }
}

function withLogin(result: { status: number; data: Record<string, unknown> }) {
  const { token, exp, user } = result.data as { token?: unknown; exp?: unknown; user?: { id?: unknown } }
  if (result.status !== 200 || typeof token !== 'string' || typeof exp !== 'number') {
    return json(result.status === 200 ? 502 : result.status, publicBody(result.data))
  }
  const response = json(200, { ok: true, user })
  const maxAge = Math.max(60, Math.min(exp - Math.floor(Date.now() / 1000), 3 * 24 * 3600))
  response.cookies.set(sessionCookieName(), sealSession({ token, exp, uid: String(user?.id ?? '') }), sessionCookieOptions(process.env.NODE_ENV, maxAge))
  return response
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(request, params)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(request, params)
}
