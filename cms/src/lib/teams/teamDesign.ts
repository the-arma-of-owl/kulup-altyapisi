// BİREBİR KOPYA: site/src/lib/teams/design.ts (takim-sayfa). Sunucu kayıttan önce sitedeki editörle AYNI
// validateDesign'ı uygular; değişiklik iki dosyaya birden yapılmalı (tests/int/teams.int.spec.ts eşitliği denetler).
import kulup from '../../kulup.json';
/**
 * Takım sayfası tasarımı: veri şeması, hazır setler ve doğrulama.
 *
 * SAF modül — React/DOM/Node API'si kullanmaz; sunucuda (kaydetmeden önce) ve istemcide
 * (editör) aynı `validateDesign` çalışır. Bilinmeyen alanlar atılır, sayılar sınırlara
 * kırpılır, renkler hex olmak zorundadır, adresler yalnız https:// veya site-içi (/...) olabilir.
 */

// ─── Sınırlar ────────────────────────────────────────────────────────────────

export const LIMITS = {
  maxStickers: 20,
  maxGifs: 4,
  manifestoMax: 2000,
  gifAltMax: 120,
  urlMax: 600,
  stickerSize: { min: 5, max: 40, default: 14 }, // sahne genişliğinin yüzdesi
  gifSize: { min: 12, max: 60, default: 30 },
  patternOpacity: { min: 0.04, max: 0.3, default: 0.14 },
  patternSize: { min: 24, max: 96, default: 44 }, // px (desen karosu)
  // Sunucudaki IMAGE_LIMITS (cms/src/lib/teams/imageSafety.ts) ile aynı: logo 2 MB, kapak 3 MB, GIF 4 MB
  maxGifBytes: 4 * 1024 * 1024,
  maxLogoBytes: 2 * 1024 * 1024,
  maxCoverBytes: 3 * 1024 * 1024,
} as const;

// ─── Hazır setler ────────────────────────────────────────────────────────────

/** Sitenin kendi sticker seti (çizimler: components/teams/stickerArt.tsx). Kullanıcı SVG yükleyemez. */
export const STICKERS = [
  { id: 'kalp', label: 'Kalp' },
  { id: 'yildiz', label: 'Yıldız' },
  { id: 'roket', label: 'Roket' },
  { id: 'kod', label: 'Kod' },
  { id: 'bug', label: 'Böcek (bug)' },
  { id: 'kahve', label: 'Kahve' },
  { id: 'kupa', label: 'Kupa' },
  { id: 'ates', label: 'Ateş' },
  { id: 'robot', label: 'Robot' },
  { id: 'simsek', label: 'Şimşek' },
  { id: 'isilti', label: 'Işıltı' },
  { id: 'tac', label: 'Taç' },
  { id: 'oyun', label: 'Oyun kolu' },
  { id: 'laptop', label: 'Dizüstü' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'ampul', label: 'Ampul' },
  { id: 'ordek', label: 'Lastik ördek' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'git', label: 'Git dalı' },
  { id: 'gezegen', label: 'Gezegen' },
  { id: 'disli', label: 'Dişli' },
  { id: 'gulucuk', label: 'Gülücük' },
  { id: 'yuz', label: '100 puan' },
  { id: 'gg', label: 'GG balonu' },
] as const;

export type StickerId = (typeof STICKERS)[number]['id'];

export const PATTERNS = [
  { id: 'none', label: 'Yok' },
  { id: 'hearts', label: 'Kalp' },
  { id: 'stars', label: 'Yıldız' },
  { id: 'code', label: 'Kod sembolü' },
  { id: 'dots', label: 'Nokta' },
  { id: 'grid', label: 'Izgara' },
] as const;

export type PatternId = (typeof PATTERNS)[number]['id'];

export const LAYOUTS = [
  { id: 'vitrin', label: 'Vitrin', hint: 'Solda manifesto, sağda üyeler' },
  { id: 'merkez', label: 'Merkez', hint: 'Ortalanmış tek sütun' },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]['id'];

// ─── Şema ────────────────────────────────────────────────────────────────────

export type PlacedSticker = {
  uid: string;
  sticker: StickerId;
  /** Merkez konumu, sahnenin yüzdesi (0-100) */
  x: number;
  y: number;
  /** Genişlik, sahne genişliğinin yüzdesi */
  size: number;
  /** Derece (-180..180) */
  rotation: number;
};

export type PlacedGif = {
  uid: string;
  url: string;
  alt: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

export type TeamPageDesign = {
  version: 1;
  layout: LayoutId;
  /** null → takımın kendi logosu/kapağı/manifestosu kullanılır */
  logoUrl: string | null;
  coverUrl: string | null;
  manifesto: string | null;
  colors: { background: string; accent: string };
  pattern: { id: PatternId; color: string; opacity: number; size: number };
  /** Dizi sırası = çizim sırası (sonraki üstte) */
  stickers: PlacedSticker[];
  gifs: PlacedGif[];
};

export const DEFAULT_DESIGN: TeamPageDesign = {
  version: 1,
  layout: 'vitrin',
  logoUrl: null,
  coverUrl: null,
  manifesto: null,
  colors: { background: '#f8fafc', accent: '#01477b' },
  pattern: { id: 'none', color: '#01477b', opacity: LIMITS.patternOpacity.default, size: LIMITS.patternSize.default },
  stickers: [],
  gifs: [],
};

/** Editördeki hazır şablonlar: renk + desen birlikte uygulanır. */
export const DESIGN_PRESETS: Array<{
  id: string;
  label: string;
  colors: TeamPageDesign['colors'];
  pattern: TeamPageDesign['pattern'];
}> = [
  { id: 'sade', label: 'Sade', colors: { background: '#f8fafc', accent: '#01477b' }, pattern: { id: 'none', color: '#01477b', opacity: 0.12, size: 44 } },
  { id: 'kulup', label: 'Lacivert', colors: { background: '#01477b', accent: '#8ecfff' }, pattern: { id: 'dots', color: '#ffffff', opacity: 0.12, size: 32 } },
  { id: 'pembe', label: 'Pembe Kalpler', colors: { background: '#ffe4ef', accent: '#be185d' }, pattern: { id: 'hearts', color: '#f472b6', opacity: 0.26, size: 48 } },
  { id: 'gece', label: 'Gece Kodu', colors: { background: '#0b1220', accent: '#38bdf8' }, pattern: { id: 'code', color: '#38bdf8', opacity: 0.12, size: 56 } },
  { id: 'yildiz', label: 'Yıldız Tozu', colors: { background: '#1e1b4b', accent: '#fbbf24' }, pattern: { id: 'stars', color: '#fde68a', opacity: 0.18, size: 52 } },
  { id: 'matrix', label: 'Matrix', colors: { background: '#04130a', accent: '#4ade80' }, pattern: { id: 'grid', color: '#22c55e', opacity: 0.14, size: 28 } },
  { id: 'limon', label: 'Limonata', colors: { background: '#fef9c3', accent: '#a16207' }, pattern: { id: 'dots', color: '#eab308', opacity: 0.22, size: 28 } },
  { id: 'turuncu', label: 'Enerji', colors: { background: '#ff7a1a', accent: '#1f1300' }, pattern: { id: 'stars', color: '#ffffff', opacity: 0.2, size: 40 } },
];

// ─── Küçük yardımcılar ───────────────────────────────────────────────────────

const STICKER_IDS = new Set<string>(STICKERS.map((s) => s.id));
const PATTERN_IDS = new Set<string>(PATTERNS.map((p) => p.id));
const LAYOUT_IDS = new Set<string>(LAYOUTS.map((l) => l.id));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, min: number, max: number, fallback: number, decimals = 2): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const f = 10 ** decimals;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
}

/** Açıyı -180..180 aralığına sarar (kırpmaz): 270 → -90. */
function angle(v: unknown): number {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return 0;
  let a = Math.round(n) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/** "#abc" / "#AABBCC" → "#aabbcc"; geçersizse null. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (m3) return ('#' + m3[1].split('').map((c) => c + c).join('')).toLowerCase();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

const HAS_CONTROL = new RegExp(CONTROL_CHARS.source);

/** Tek satırlık düz metin: kontrol/yön karakterleri atılır, boşluk sıkıştırılır, kesilir. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Görsellerin gelebileceği kökenler: yalnız kendi CDN'imiz ve site alan adlarımız. Başka bir sunucudaki görsel
 * (izleme pikseli, yanıltıcı içerik) takım sayfasına giremez. Ek kökenler (ör. yerel geliştirmede CMS)
 * NEXT_PUBLIC_TEAM_MEDIA_ORIGINS ile virgüllü verilir (sitede derlemede gömülür, CMS'te çalışma anında okunur).
 */
export const MEDIA_ORIGINS = [kulup.adresler.cdn, kulup.adresler.site]
  .filter(Boolean)
  .flatMap((u) => { const x = new URL(u); return [x.origin, `${x.protocol}//${x.hostname.startsWith('www.') ? x.hostname.slice(4) : `www.${x.hostname}`}`]; });

export function allowedMediaOrigins(): string[] {
  let extra = '';
  try {
    extra = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TEAM_MEDIA_ORIGINS) || '';
  } catch {
    extra = '';
  }
  return [...MEDIA_ORIGINS, ...extra.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)];
}

/**
 * Görsel adresi: yalnız izinli kökenlerden (allowedMediaOrigins) https:// ya da site-içi kök yol (/uploads/...).
 * `allowBlob` yalnız çizimde (editörün yerel önizlemesi) kullanılır; kayda asla girmez.
 */
export function safeMediaUrl(v: unknown, opts: { allowBlob?: boolean } = {}): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > LIMITS.urlMax) return null;
  if (/[\s"'<>\\`]/.test(s) || HAS_CONTROL.test(s)) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (opts.allowBlob && /^blob:https?:\/\/[^/]+\/[0-9a-f-]+$/i.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.username || u.password || !allowedMediaOrigins().includes(u.origin)) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowedMediaOrigins().includes(u.origin))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Bağlantı adresi (manifesto): yalnız http/https, kullanıcı adı/şifre yok. */
export function safeLinkUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > LIMITS.urlMax || /[\s"'<>\\`]/.test(s)) return null;
  try {
    const u = new URL(s);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Manifesto metnini temizler (Markdown kaynağı olarak saklanır; çizim yine kaçışlı yapılır):
 * kontrol karakterleri, HTML etiketleri, http/https dışı bağlantı hedefleri atılır; uzunluk sınırlanır.
 * "<3" veya "a < b" gibi etiket olmayan ifadeler korunur.
 */
export function sanitizeManifesto(v: unknown): string {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '');
  // HTML yorumları ve etiketleri (<script>, <img onerror=...>, </div> ...)
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '');
  // Betik/stil blokları içerikleriyle birlikte atılır (yalnız etiketi silmek "alert(1)" metnini bırakırdı)
  s = s.replace(/<(script|style|iframe|noscript|template)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '');
  for (let i = 0; i < 3; i++) s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, '');
  // [metin](hedef) — hedef http/https değilse yalnız metin kalır; hedefte bir düzey parantez olabilir: (javascript:alert(1))
  s = s.replace(/\[([^\]\n]*)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g, (all, text: string, href: string) => (safeLinkUrl(href) ? all : text));
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim().slice(0, LIMITS.manifestoMax);
}

function cleanUid(v: unknown, used: Set<string>, prefix: string, index: number): string {
  let uid = typeof v === 'string' && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : `${prefix}${index}`;
  while (used.has(uid)) uid = `${uid}x`;
  used.add(uid);
  return uid;
}

// ─── Doğrulama ───────────────────────────────────────────────────────────────

export function validateDesign(input: unknown): TeamPageDesign {
  const d = isObj(input) ? input : {};
  const colors = isObj(d.colors) ? d.colors : {};
  const pattern = isObj(d.pattern) ? d.pattern : {};
  const used = new Set<string>();

  const stickers: PlacedSticker[] = [];
  if (Array.isArray(d.stickers)) {
    for (const raw of d.stickers) {
      if (stickers.length >= LIMITS.maxStickers) break;
      if (!isObj(raw) || typeof raw.sticker !== 'string' || !STICKER_IDS.has(raw.sticker)) continue;
      stickers.push({
        uid: cleanUid(raw.uid, used, 's', stickers.length),
        sticker: raw.sticker as StickerId,
        x: num(raw.x, 0, 100, 50),
        y: num(raw.y, 0, 100, 50),
        size: num(raw.size, LIMITS.stickerSize.min, LIMITS.stickerSize.max, LIMITS.stickerSize.default),
        rotation: angle(raw.rotation),
      });
    }
  }

  const gifs: PlacedGif[] = [];
  if (Array.isArray(d.gifs)) {
    for (const raw of d.gifs) {
      if (gifs.length >= LIMITS.maxGifs) break;
      if (!isObj(raw)) continue;
      const url = safeMediaUrl(raw.url);
      if (!url) continue;
      gifs.push({
        uid: cleanUid(raw.uid, used, 'g', gifs.length),
        url,
        alt: cleanLine(raw.alt, LIMITS.gifAltMax),
        x: num(raw.x, 0, 100, 50),
        y: num(raw.y, 0, 100, 50),
        size: num(raw.size, LIMITS.gifSize.min, LIMITS.gifSize.max, LIMITS.gifSize.default),
        rotation: angle(raw.rotation),
      });
    }
  }

  const manifesto = d.manifesto === null || d.manifesto === undefined ? null : sanitizeManifesto(d.manifesto);

  return {
    version: 1,
    layout: typeof d.layout === 'string' && LAYOUT_IDS.has(d.layout) ? (d.layout as LayoutId) : DEFAULT_DESIGN.layout,
    logoUrl: safeMediaUrl(d.logoUrl),
    coverUrl: safeMediaUrl(d.coverUrl),
    manifesto,
    colors: {
      background: normalizeHex(colors.background) ?? DEFAULT_DESIGN.colors.background,
      accent: normalizeHex(colors.accent) ?? DEFAULT_DESIGN.colors.accent,
    },
    pattern: {
      id: typeof pattern.id === 'string' && PATTERN_IDS.has(pattern.id) ? (pattern.id as PatternId) : 'none',
      color: normalizeHex(pattern.color) ?? DEFAULT_DESIGN.pattern.color,
      opacity: num(pattern.opacity, LIMITS.patternOpacity.min, LIMITS.patternOpacity.max, LIMITS.patternOpacity.default),
      size: num(pattern.size, LIMITS.patternSize.min, LIMITS.patternSize.max, LIMITS.patternSize.default, 0),
    },
    stickers,
    gifs,
  };
}

// ─── Renk / kontrast ─────────────────────────────────────────────────────────

const DARK_TEXT = '#0f172a';
const LIGHT_TEXT = '#ffffff';

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const toHex = (c: number[]) => '#' + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');

/** a ile b arasında t oranında karışım (t=0 → a). */
export function mixHex(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Zemin üstünde en okunur metin rengi (koyu lacivert ya da beyaz). */
export function readableOn(bg: string): string {
  const dark = contrastRatio(DARK_TEXT, bg);
  const light = contrastRatio(LIGHT_TEXT, bg);
  if (light > dark) return LIGHT_TEXT;
  // Orta tonlarda lacivert yetmeyebilir: saf siyah her zaman ≥4.58 sağlar (beyazdan iyi olduğu sürece)
  return dark >= 4.5 ? DARK_TEXT : '#000000';
}

/** `color` zemin üstünde `min` kontrastı sağlamazsa okunur renge doğru kaydırılır. */
export function ensureContrast(color: string, bg: string, min: number): string {
  const target = readableOn(bg);
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const c = mixHex(color, target, t);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return target;
}

export type TeamTheme = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  /** Vurgu zemini üstündeki metin */
  onAccent: string;
  surface: string;
  surfaceText: string;
  surfaceMuted: string;
  surfaceAccent: string;
  border: string;
  isDark: boolean;
};

/** Tasarım renklerinden okunurluğu garanti eden tema türetir (WCAG: metin ≥4.5, vurgu ≥3). */
export function deriveTheme(design: Pick<TeamPageDesign, 'colors'>): TeamTheme {
  const bg = normalizeHex(design.colors.background) ?? DEFAULT_DESIGN.colors.background;
  const text = readableOn(bg);
  const isDark = text === LIGHT_TEXT;
  const surface = isDark ? mixHex(bg, '#ffffff', 0.08) : mixHex(bg, '#ffffff', 0.85);
  const surfaceText = readableOn(surface);
  const rawAccent = normalizeHex(design.colors.accent) ?? DEFAULT_DESIGN.colors.accent;
  const accent = ensureContrast(rawAccent, bg, 3);
  return {
    bg,
    text,
    muted: ensureContrast(mixHex(text, bg, 0.3), bg, 4.5),
    accent,
    onAccent: readableOn(accent),
    surface,
    surfaceText,
    surfaceMuted: ensureContrast(mixHex(surfaceText, surface, 0.3), surface, 4.5),
    surfaceAccent: ensureContrast(rawAccent, surface, 4.5),
    border: mixHex(bg, text, isDark ? 0.18 : 0.12),
    isDark,
  };
}

// ─── Desen karoları ──────────────────────────────────────────────────────────

const HEART = 'M6 11C2 8 0 6 0 3.5 0 1.5 1.5 0 3.5 0 4.7 0 5.5.7 6 1.6 6.5.7 7.3 0 8.5 0 10.5 0 12 1.5 12 3.5 12 6 10 8 6 11Z';
const STAR = '0,-6 1.53,-2.1 5.7,-1.85 2.47,0.8 3.53,4.85 0,2.6 -3.53,4.85 -2.47,0.8 -5.7,-1.85 -1.53,-2.1';

function tileBody(id: PatternId, c: string): string {
  switch (id) {
    case 'hearts':
      return `<g fill="${c}"><path transform="translate(4 5)" d="${HEART}"/><path transform="translate(24 25)" d="${HEART}"/></g>`;
    case 'stars':
      return `<g fill="${c}"><polygon transform="translate(10 10)" points="${STAR}"/><polygon transform="translate(30 30) rotate(18) scale(.8)" points="${STAR}"/></g>`;
    case 'code':
      return `<g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5 3 9l4 4M15 5l4 4-4 4M12.5 4l-3 10"/><path d="M27 25c-2 0-2 1-2 2.5s0 2.5-2 2.5c2 0 2 1 2 2.5s0 2.5 2 2.5M33 25c2 0 2 1 2 2.5s0 2.5 2 2.5c-2 0-2 1-2 2.5s0 2.5-2 2.5"/></g>`;
    case 'dots':
      return `<g fill="${c}"><circle cx="10" cy="10" r="2.2"/><circle cx="30" cy="30" r="2.2"/></g>`;
    case 'grid':
      return `<path d="M0 .5H40M.5 0V40" stroke="${c}" stroke-width="1" fill="none"/>`;
    default:
      return '';
  }
}

/**
 * CSS `background-image` değeri (data: URL'li SVG karo). Renk/opaklık doğrulanmış
 * değerlerden üretilir; dışarıdan metin girmez.
 */
export function patternBackground(pattern: TeamPageDesign['pattern']): string | null {
  if (!PATTERN_IDS.has(pattern.id) || pattern.id === 'none') return null;
  const color = normalizeHex(pattern.color) ?? DEFAULT_DESIGN.pattern.color;
  const opacity = num(pattern.opacity, LIMITS.patternOpacity.min, LIMITS.patternOpacity.max, LIMITS.patternOpacity.default);
  const size = num(pattern.size, LIMITS.patternSize.min, LIMITS.patternSize.max, LIMITS.patternSize.default, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40"><g opacity="${opacity}">${tileBody(pattern.id, color)}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function stickerLabel(id: string): string {
  return STICKERS.find((s) => s.id === id)?.label ?? 'Sticker';
}

/** Editörde yeni öğe kimliği (kısa, şemaya uygun). */
export function newUid(prefix: 's' | 'g', existing: Array<{ uid: string }>): string {
  const used = new Set(existing.map((e) => e.uid));
  let uid = '';
  do uid = prefix + Math.random().toString(36).slice(2, 9);
  while (used.has(uid));
  return uid;
}
