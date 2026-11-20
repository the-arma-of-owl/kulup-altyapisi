import { kulupHostlari } from './kulup';
// Bağlantı önizlemesi görseli: /api/og?src=…&w=… CMS görselinin küçük bir JPEG'ini verir (src/app/api/og/route.ts).

// next.config.ts images.remotePatterns ile aynı alanlar: kulübün kendi adresleri + R2 + Vercel Blob
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const OPTIMIZABLE_HOST = new RegExp(
  `^(${kulupHostlari().map(escapeRe).join('|')})$|(^|\\.)(r2\\.cloudflarestorage\\.com|public\\.blob\\.vercel-storage\\.com)$`,
);

/** İzinli genişlikler: yatay/kare görsel 1200, dikey 828 (seo.ts ogImageFromMedia) */
export const OG_WIDTHS = [828, 1200] as const;
/** WhatsApp ~300 KB üstünü önizlemede göstermiyor */
export const OG_MAX_BYTES = 280 * 1024;

export const ogImagePath = (src: string, width: number) => `/api/og?src=${encodeURIComponent(src)}&w=${width}`;

/**
 * /api/og isteğini doğrular; kaynak adres ve genişlik ya da null.
 * Yalnız `src` ve `w` kabul edilir; fazladan parametre, kaynakta sorgu/çapa ya da farklı yazılmış genişlik
 * CDN önbelleğini deler (her ıskada görsel yeniden işlenir, Vercel kotası). Kaynak sitenin kendi yolu ya da
 * izinli alanlardan bir https adresi olmalı.
 */
export function parseOgRequest(requestUrl: URL, siteUrl: string): { src: URL; width: number } | null {
  const keys = [...requestUrl.searchParams.keys()];
  if (keys.length !== 2 || !keys.includes('src') || !keys.includes('w')) return null;
  const w = requestUrl.searchParams.get('w') ?? '';
  const width = Number(w);
  if (!(OG_WIDTHS as readonly number[]).includes(width) || String(width) !== w) return null;

  const raw = requestUrl.searchParams.get('src') ?? '';
  let src: URL;
  try {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      const site = new URL(siteUrl);
      src = new URL(raw, site);
      // "/\evil.com" gibi yollar başka bir alana çözülebilir
      if (src.origin !== site.origin) return null;
      if (/^\/(api\/og|_next)(\/|$)/.test(src.pathname)) return null;
    } else {
      src = new URL(raw);
      if (src.protocol !== 'https:' || !OPTIMIZABLE_HOST.test(src.hostname)) return null;
    }
  } catch {
    return null;
  }
  if (src.search || src.hash || src.username || src.password || src.port) return null;
  return { src, width };
}
