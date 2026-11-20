import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

// ─── i18n Middleware ──────────────────────────────────────────────────────────
const intlMiddleware = createMiddleware(routing)

// Form gönderimlerinin hız sınırı burada DEĞİL, /api/cms rotasında (IP başına dakikada 30).
// Buradaki eski sınır (IP başına 15 dakikada 20) kampüs Wi-Fi'ı / mobil operatör NAT'ı arkasındaki
// öğrencileri toplu engelliyordu; botlara karşı asıl koruma Cloudflare Turnstile.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // /security ve /security.txt → /.well-known/security.txt (adres değişmeden aynı dosya)
  if (pathname === '/security' || pathname === '/security.txt') {
    return NextResponse.rewrite(new URL('/.well-known/security.txt', request.url))
  }
  // API route'larına intl middleware uygulanmaz
  if (!pathname.startsWith('/api/')) {
    return intlMiddleware(request)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // i18n: Tüm locale destekli sayfalar ve dili belirtilmemiş ana rotalar (yönlendirme için)
    '/',
    '/security.txt',
    '/(tr|en)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
