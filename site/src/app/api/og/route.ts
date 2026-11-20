import sharp from 'sharp';
import { OG_MAX_BYTES, parseOgRequest } from '@/lib/ogImage';
import { SITE_URL } from '@/lib/seo';

// Bağlantı önizlemesi görseli: CMS görseli en fazla ~280 KB'lık JPEG'e çevrilir. WhatsApp ~300 KB üstünü
// göstermiyor; Next görsel iyileştiricisi ise Accept göndermeyen önizleme botlarına özgün biçimi (ör. 800 KB'lık
// PNG) veriyordu. Her adres bir kez işlenir, sonuç CDN'de 30 gün kalır (Vercel kotası).
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const fail = (message: string, status: number, cdnSeconds: number) =>
  new Response(message, { status, headers: { 'Cache-Control': `public, max-age=60, s-maxage=${cdnSeconds}` } });

export async function GET(request: Request) {
  const target = parseOgRequest(new URL(request.url), SITE_URL);
  if (!target) return fail('Geçersiz istek', 400, 86400);

  const res = await fetch(target.src, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.startsWith('image/') || type.includes('svg')) return fail('Görsel alınamadı', 502, 300);
  if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) return fail('Görsel çok büyük', 413, 86400);
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > MAX_SOURCE_BYTES) return fail('Görsel çok büyük', 413, 86400);

  try {
    const base = sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: target.width, withoutEnlargement: true })
      .flatten({ background: '#ffffff' });
    let out = await base.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    for (const quality of [68, 55]) {
      if (out.length <= OG_MAX_BYTES) break;
      out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    return new Response(new Uint8Array(out), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400' },
    });
  } catch {
    return fail('Görsel işlenemedi', 422, 3600);
  }
}
