import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { FORM_LIMITS, handleCmsGet, handleFormPost, resolveFormCollection, type FormCollection } from '@/lib/cmsProxy'
import { getClientIp, reportSiteEvent } from '@/lib/observe'

const CMS_URL = process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params

  const { status, body, cacheable } = await handleCmsGet(
    { pathParts: path, searchParams: request.nextUrl.searchParams },
    { fetcher: fetch, cmsUrl: CMS_URL, internalKey: process.env.INTERNAL_API_KEY },
  )
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': cacheable ? 'public, s-maxage=60, stale-while-revalidate=600' : 'no-store' },
  })
}

// ─── Rate Limiting (Spam / Bot Koruması) ──────────────────────────────────────
const rateLimitMap = new Map<string, { count: number, resetTime: number }>()
// Genel taşkın sınırı (doğrulamadan önce): siteverify çağrılarını korur. Asıl form sınırları FORM_LIMITS'te.
const FORM_LIMIT_PER_MINUTE = 300

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const limitData = rateLimitMap.get(ip)
  
  if (!limitData || now > limitData.resetTime) {
    // Kampüs Wi-Fi / mobil operatör NAT'ında çok kişi aynı IP'den görünür; eski 5/dk sınırı
    // gerçek başvuruları engelliyordu. Botlara karşı asıl koruma Turnstile.
    if (rateLimitMap.size > 5000) rateLimitMap.clear()
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 })
    return true
  }
  
  if (limitData.count >= FORM_LIMIT_PER_MINUTE) {
    return false // Limit aşıldı
  }
  
  limitData.count++
  return true
}

// Forma göre dakikalık sayaç (yalnız doğrulanmış istekler)
const formHits = new Map<string, { count: number; resetTime: number }>()
function checkFormLimit(ip: string, collection: FormCollection): boolean {
  const now = Date.now()
  const key = `${collection}:${ip}`
  const entry = formHits.get(key)
  if (!entry || now > entry.resetTime) {
    if (formHits.size > 5000) for (const [k, v] of formHits) if (now > v.resetTime) formHits.delete(k)
    formHits.set(key, { count: 1, resetTime: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= FORM_LIMITS[collection]
}

// Turnstile jetonu tek kullanımlık olmalı; canlı testte aynı jeton 3 kez kabul edildi. Kullanılanlar 10 dk tutulur.
const usedTokens = new Map<string, number>()
function tokenSeen(token: string): boolean {
  const now = Date.now()
  const key = createHash('sha256').update(token).digest('hex')
  if ((usedTokens.get(key) ?? 0) > now) return true
  if (usedTokens.size > 20000) for (const [k, until] of usedTokens) if (until <= now) usedTokens.delete(k)
  usedTokens.set(key, now + 10 * 60_000)
  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params

  // Rate Limit Kontrolü (OWASP)
  // Vercel'de gerçek istemci IP'si x-real-ip (Cloudflare arkasında cf-connecting-ip); x-forwarded-for'a güvenilmez
  const ip = getClientIp(request.headers)
  const userAgent = request.headers.get('user-agent')
  const result = await handleFormPost({
    pathParts: path,
    ip,
    userAgent,
    turnstileToken: request.headers.get('x-turnstile-token'),
    contentLength: request.headers.get('content-length'),
    readJson: () => request.json(),
  }, {
    fetcher: fetch,
    cmsUrl: CMS_URL,
    internalKey: process.env.INTERNAL_API_KEY,
    turnstileSecret: process.env.TURNSTILE_SECRET_KEY,
    checkRateLimit,
    checkFormLimit,
    tokenSeen,
    nodeEnv: process.env.NODE_ENV,
  })
  // Sitede reddedilen gönderimler (Turnstile, hız sınırı, boyut) CMS'e ulaşmaz; IP izlemesi için ayrıca bildirilir.
  // CMS'ten dönen hatalar (409 tekrar, 429 paylaşılan sınır) orada zaten kaydedilir.
  const form = resolveFormCollection(path)
  if (form && [403, 413, 429, 503].includes(result.status) && !(result.body && typeof result.body === 'object' && 'errors' in result.body)) {
    const reason = result.body && typeof result.body === 'object' && 'error' in result.body ? String((result.body as { error: unknown }).error) : ''
    reportSiteEvent({ type: 'form_rejected', ip, ua: userAgent, form, status: result.status, reason: reason.slice(0, 200) })
  }
  return NextResponse.json(result.body, { status: result.status })
}
