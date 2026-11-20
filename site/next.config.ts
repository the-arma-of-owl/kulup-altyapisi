import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const withNextIntl = createNextIntlPlugin();

// Kulübün adresleri (site, CMS, CDN) kulup.config.json'dan gelir; CSP ve görsel izinleri bunlardan üretilir.
const kulup = JSON.parse(readFileSync(join(process.cwd(), 'src/kulup.json'), 'utf8')) as { adresler: Record<string, string> };
const kulupHosts = [...new Set(Object.values(kulup.adresler).filter(Boolean).map((u) => new URL(u).hostname))];
// Ortam değişkeniyle verilen CMS/CDN adresleri de izinli olsun (config'ten farklıysa)
for (const value of [process.env.NEXT_PUBLIC_CMS_URL, process.env.NEXT_PUBLIC_CDN_URL]) {
  try { if (value) kulupHosts.push(new URL(value).hostname); } catch { /* geçersiz adres: yok say */ }
}
const kulupSources = [...new Set(kulupHosts)].filter((h) => h !== 'localhost' && h !== '127.0.0.1').map((h) => `https://${h}`).join(' ');
const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || kulup.adresler.cdn || '').replace(/\/+$/, '');

// ─── Güvenlik HTTP Başlıkları ─────────────────────────────────────────────────
// OWASP A02: Güvenlik yapılandırması — eksik HTTP güvenlik headerları eklendi.
// Bu başlıklar XSS, Clickjacking, MIME sniffing ve diğer saldırılara karşı koruma sağlar.
const isProduction = process.env.NODE_ENV === 'production';
// Yerel geliştirme sunucuları yalnız geliştirmede; canlıda hiçbir localhost bağlantısına izin verilmez.
const localConnect = isProduction ? '' : 'http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*';

const securityHeaders = [
  // DNS ön çözümlemeyi açık tut (performans)
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Clickjacking koruması: DENY - CSP frame-ancestors: none ile uyumlu
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME type sniffing saldırısını engeller
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer bilgisini sınırla
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Kamera, mikrofon ve konum izinlerini kısıtla
  { key: 'Permissions-Policy', value: 'microphone=(), geolocation=(), payment=()' },
  // HTTPS'i zorunlu kıl (HSTS) — production'da 2 yıl
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Content Security Policy (CSP) — XSS saldırılarına karşı
  // NOT: 'unsafe-inline' ve 'unsafe-eval' Next.js'in gerektirdiği minimum değerler.
  // İleride nonce tabanlı CSP'ye geçiş önerilir.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://challenges.cloudflare.com https://cesium.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://challenges.cloudflare.com https://cesium.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      `img-src 'self' data: blob: http://localhost:3001 ${kulupSources} https://*.r2.cloudflarestorage.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://challenges.cloudflare.com https://services.arcgisonline.com https://cesium.com`,
      `media-src 'self' blob: ${kulupSources} https://*.r2.cloudflarestorage.com https://*.r2.dev https://*.public.blob.vercel-storage.com`,
      `connect-src 'self' ${localConnect} blob: ${kulupSources} https://*.r2.cloudflarestorage.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://challenges.cloudflare.com https://services.arcgisonline.com https://cesium.com`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-src https://challenges.cloudflare.com https://www.youtube.com https://youtube.com", // Turnstile ve YouTube iframe'i için
      "frame-ancestors 'none'",                              // Clickjacking koruması
      "base-uri 'self'",                                     // Base URL manipülasyonunu engelle
      "form-action 'self'",                                  // Form hedeflerini kısıtla
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Kök layout [locale] segmentinde olduğu için 404 için app/global-not-found.tsx gerekiyor
  experimental: {
    globalNotFound: true,
  },
  // ─── Güvenlik Başlıkları ──────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Tüm sayfalara güvenlik başlıkları uygula
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // public/ altındaki büyük medya (video, 3D model, ses, görsel) tarayıcıda 1 saat taze kalsın,
        // sonra arka planda yenilensin. Dosya adları hash'siz — aynı isimle değiştirilen bir dosya
        // ziyaretçilere en geç ~1 saat sonra ulaşır; süreyi uzatmadan önce bunu göz önünde bulundur.
        source: '/:path((?!_next/).*\\.(?:mp4|glb|hdr|mp3|png|jpe?g|webp|ico|svg))',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ]
  },

  // ─── Resim Kaynak Güvenliği ───────────────────────────────────────────────
  // Sadece güvenilir domain'lerden resim yüklenmesine izin ver.
  // Wildcard (*) kullanılmadı.
  images: {
    qualities: [25, 50, 75, 100],
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '3001' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      ...kulupHosts.filter((h) => h !== 'localhost' && h !== '127.0.0.1').map((hostname) => ({ protocol: 'https' as const, hostname })),
      // Vercel Blob (production media)
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },

  // ─── CMS Reverse Proxy ───────────────────────────────────────────────────
  // Media ve API dosyalarını CMS'den proxy'le — aynı domain üzerinden sunar.
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: `${process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'}/media/:path*`,
      },
      {
        source: '/api/media/:path*',
        destination: `${process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'}/api/media/:path*`,
      },
      {
        // Takım görselleri (yerel geliştirmede CMS dosya ucu; canlıda adresler doğrudan CDN'dir)
        source: '/api/team-media/file/:path*',
        destination: `${process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'}/api/team-media/file/:path*`,
      },
      ...(cdnUrl ? [{ source: '/cdn-proxy/:path*', destination: `${cdnUrl}/:path*` }] : []),
    ]
  },
}

export default withNextIntl(nextConfig)
