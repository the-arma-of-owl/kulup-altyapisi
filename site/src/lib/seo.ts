/**
 * Bağlantı önizlemesi (Open Graph / Twitter kartı) ve sayfa başlıkları için ortak yardımcılar.
 *
 * Next metadata'yı segmentler arasında SIĞ birleştirir: bir sayfa `openGraph` verirse kök layout'taki
 * openGraph tümüyle düşer. Bu yüzden her sayfa `pageMetadata` ile siteName/locale/görsel dahil tam
 * nesneyi üretir.
 */
import type { Metadata } from 'next';
import { KULUP, SITE_ADRESI } from './kulup';
import { getMediaUrl } from './api';
import { OPTIMIZABLE_HOST, ogImagePath } from './ogImage';

/** Mutlak adreslerin tabanı (metadataBase): NEXT_PUBLIC_SITE_URL, yoksa kulup.config.json → adresler.site */
export const SITE_URL = SITE_ADRESI;
export const SITE_NAME = `${KULUP.kisaAd} — ${KULUP.tamAd}`;
export const DEFAULT_DESCRIPTION = KULUP.aciklama;

export type OgImage = { url: string; width?: number; height?: number; alt: string; type?: string };

/**
 * 1200×630, ~65 KB JPG (public/og/varsayilan.jpg). WhatsApp ~300 KB üstü ya da uygunsuz oranlı
 * görseli önizlemede göstermiyor; logo.png (800 KB, kare) bu yüzden kullanılmıyor.
 */
export const DEFAULT_OG_IMAGE: OgImage = {
  url: '/og/varsayilan.jpg',
  width: 1200,
  height: 630,
  alt: `${KULUP.tamAd} logosu`,
  type: 'image/jpeg',
};

/**
 * CMS medyasını önizleme görseline çevirir (video/boş → null).
 * CMS dosyaları özgün boyutta (MB'larca) olduğundan /api/og'dan küçültülmüş JPEG verilir
 * (metadataBase ile mutlak olur). Next görsel iyileştiricisi (/_next/image) Accept göndermeyen
 * önizleme botlarına özgün biçimi verdiğinden kare bir PNG 800 KB'ı geçip WhatsApp'ta görünmüyordu.
 * Dikey görsellerde genişlik 828'e düşürülür.
 */
export function ogImageFromMedia(media: unknown, alt: string): OgImage | null {
  const url = getMediaUrl(media);
  if (!url) return null;
  const m = (typeof media === 'object' && media !== null ? media : {}) as { mimeType?: string; width?: number; height?: number };
  if (m.mimeType && !m.mimeType.startsWith('image/')) return null;
  if (!m.mimeType && /\.(mp4|webm|mov|m4v|pdf)(\?|$)/i.test(url)) return null;
  if (/\.svg(\?|$)/i.test(url)) return null; // önizleme botları SVG göstermiyor

  let optimizable = url.startsWith('/') && !url.startsWith('//');
  if (!optimizable) {
    try {
      const parsed = new URL(url);
      optimizable = parsed.protocol === 'https:' && OPTIMIZABLE_HOST.test(parsed.hostname);
    } catch {
      return null;
    }
  }
  if (!optimizable) return { url, alt };

  const srcW = typeof m.width === 'number' && m.width > 0 ? m.width : undefined;
  const srcH = typeof m.height === 'number' && m.height > 0 ? m.height : undefined;
  const target = srcW && srcH && srcH > srcW ? 828 : 1200;
  const image: OgImage = { url: ogImagePath(url, target), alt, type: 'image/jpeg' };
  if (srcW && srcH) {
    // İyileştirici büyütmez: kaynak daha darsa özgün boyut döner
    const outW = Math.min(srcW, target);
    image.width = outW;
    image.height = Math.round((srcH * outW) / srcW);
  }
  return image;
}

/** Düz metni önizleme açıklamasına uygun kısaltır (kelime ortasından kesmez). */
export function clampText(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

const trDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

/** "16 Ekim 2026" ya da "16 Ekim 2026 – 24 Ekim 2026"; geçersiz tarihte boş. */
export function formatDateRange(start?: string | null, end?: string | null): string {
  const a = start ? new Date(start) : null;
  if (!a || Number.isNaN(a.getTime())) return '';
  const b = end ? new Date(end) : null;
  const first = trDate.format(a);
  if (!b || Number.isNaN(b.getTime())) return first;
  const last = trDate.format(b);
  return last === first ? first : `${first} – ${last}`;
}

/** Lexical zengin metinden düz metin (yalnız text düğümleri). */
export function lexicalToPlainText(value: unknown, max = 600): string {
  const parts: string[] = [];
  let length = 0;
  const walk = (node: unknown) => {
    if (length >= max || !node || typeof node !== 'object') return;
    const n = node as { text?: unknown; children?: unknown[]; root?: unknown; type?: string };
    if (n.root) return walk(n.root);
    if (typeof n.text === 'string') {
      parts.push(n.text);
      length += n.text.length;
    }
    if (Array.isArray(n.children)) {
      n.children.forEach(walk);
      // Paragraf/başlık sonları arasında boşluk kalsın
      if (n.type && n.type !== 'root' && n.type !== 'text') parts.push(' ');
    }
  };
  if (typeof value === 'string') return value;
  walk(value);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

type PageMetadataInput = {
  /** Sayfa başlığı; kök layout şablonuyla "<başlık> | <kısa ad>" olur (absoluteTitle ile şablonsuz). */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** Sitedeki yol, ör. "/etkinlikler/abc" (og:url ve canonical). Gizli adresli sayfada (bilet) verilmez. */
  path?: string;
  image?: OgImage | null;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
};

/** Sayfa başlığı, açıklama, canonical, Open Graph ve Twitter kartı (eksiksiz). */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const description = clampText(input.description || DEFAULT_DESCRIPTION, 200);
  const image = input.image || DEFAULT_OG_IMAGE;
  const ogTitle = input.title;
  const url = input.path ? { url: input.path } : {};
  const openGraph: NonNullable<Metadata['openGraph']> =
    input.type === 'article'
      ? {
          type: 'article',
          title: ogTitle,
          description,
          ...url,
          siteName: SITE_NAME,
          locale: 'tr_TR',
          images: [image],
          ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
          ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
        }
      : {
          type: 'website',
          title: ogTitle,
          description,
          ...url,
          siteName: SITE_NAME,
          locale: 'tr_TR',
          images: [image],
        };
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description,
    ...(input.path ? { alternates: { canonical: input.path } } : {}),
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
