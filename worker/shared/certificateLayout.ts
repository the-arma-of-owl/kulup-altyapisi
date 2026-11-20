import { KULUP } from './kulup.js'
export const certificateTypes = ['participation', 'achievement', 'appreciation'] as const
export type CertificateType = typeof certificateTypes[number]
export const certificateFonts = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'DejaVu Sans'] as const

/**
 * Seçilen yazı tipi yoksa (Inter ve DejaVu Windows'ta kurulu gelmez) tarayıcının rastgele varsayılanına
 * düşmesin: her seçenek, Windows'ta ve Linux'ta bulunan, ölçüsü yakın yazı tiplerine sırayla iner.
 * Önizleme (arayüz) ve sertifika çıktısı aynı yığını kullanır. Türkçe karakterlerin hepsi bu fontlarda var.
 */
const FONT_STACKS: Record<(typeof certificateFonts)[number], string> = {
  Inter: "'Inter','Segoe UI','Helvetica Neue',Arial,'Liberation Sans',sans-serif",
  Arial: "Arial,'Liberation Sans','Helvetica Neue',Helvetica,sans-serif",
  Georgia: "Georgia,'DejaVu Serif','Liberation Serif',serif",
  'Times New Roman': "'Times New Roman','Liberation Serif',Times,serif",
  'DejaVu Sans': "'DejaVu Sans',Verdana,'Bitstream Vera Sans','Segoe UI',sans-serif",
}
/** Google Fonts aile adı: yalnız harf, rakam ve boşluk (CSS ve adrese güvenle yazılır). */
export const isSafeFontName = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(value) && value.trim() === value
export const isBuiltinFont = (font: string) => certificateFonts.includes(font as (typeof certificateFonts)[number])
export function certificateFontStack(font: string): string {
  if (isBuiltinFont(font)) return FONT_STACKS[font as (typeof certificateFonts)[number]]
  // Google Fonts'tan eklenen aile; internet yoksa Arial yığınına iner
  return isSafeFontName(font) ? `'${font}',${FONT_STACKS.Arial}` : FONT_STACKS.Arial
}
/** Eklenen Google Fonts aileleri için stil adresi (önizleme ve Puppeteer çıktısı aynı adresi kullanır). */
export function googleFontsHref(fonts: string[]): string | null {
  const families = [...new Set(fonts.filter(font => isSafeFontName(font) && !isBuiltinFont(font)))]
  return families.length ? `https://fonts.googleapis.com/css2?${families.map(font => `family=${font.replace(/ /g, '+')}:wght@300;400;500;600;700;800;900`).join('&')}&display=swap` : null
}
export type CertificateBox = { x: number; y: number; w: number; h: number; fontFamily: string; fontSize: number; fontWeight: number; color: string; align: 'left' | 'center' | 'right' }
/** award: ödül satırı (takım · derece · ödül) — yalnız açılırsa ve kişinin ödülü varsa basılır (ör. Başarı şablonu). */
export type CertificateLayout = { name: CertificateBox; id: CertificateBox; award: CertificateBox; showId: boolean; showAward: boolean; customFonts: string[]; imageName: string }

export function isCertificateType(value: unknown): value is CertificateType {
  return certificateTypes.includes(value as CertificateType)
}

export function defaultLayout(): CertificateLayout {
  const box = (y: number, h: number, fontSize: number): CertificateBox => ({ x: 15, y, w: 70, h, fontFamily: 'Arial', fontSize, fontWeight: 400, color: '#000000', align: 'center' })
  return { name: box(45, 8, 48), id: box(82, 3, 20), award: box(57, 5, 28), showId: true, showAward: false, customFonts: [], imageName: '' }
}

export function normalizeLayout(input: unknown): CertificateLayout {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const defaults = defaultLayout()
  const customFonts = Array.isArray(source.customFonts) ? [...new Set(source.customFonts.filter(isSafeFontName).filter(font => !isBuiltinFont(font)))].slice(0, 20) : []
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  const box = (value: unknown, fallback: CertificateBox): CertificateBox => {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    return {
      x: number(raw.x, fallback.x, 0, 100), y: number(raw.y, fallback.y, 0, 100),
      w: number(raw.w, fallback.w, 0, 100), h: number(raw.h, fallback.h, 0, 100),
      fontFamily: typeof raw.fontFamily === 'string' && (isBuiltinFont(raw.fontFamily) || customFonts.includes(raw.fontFamily)) ? raw.fontFamily : fallback.fontFamily,
      fontSize: number(raw.fontSize, fallback.fontSize, 8, 200),
      fontWeight: number(raw.fontWeight, fallback.fontWeight, 100, 900),
      color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : fallback.color,
      align: raw.align === 'left' || raw.align === 'center' || raw.align === 'right' ? raw.align : fallback.align,
    }
  }
  return { name: box(source.name, defaults.name), id: box(source.id, defaults.id), award: box(source.award, defaults.award),
    showId: typeof source.showId === 'boolean' ? source.showId : defaults.showId,
    showAward: typeof source.showAward === 'boolean' ? source.showAward : defaults.showAward,
    customFonts, imageName: typeof source.imageName === 'string' ? source.imageName.replace(/[\u0000-\u001f]/g, '').slice(0, 120) : '' }
}

export const certificateId = (regId: number) => `${KULUP.sertifika.onEk}-${regId}`
// Doğrulama bağlantısı CMS'in ürettiği sertifika koduyla (bilet jetonu artık kullanılmaz; bilet sayfasını açığa vermez)
export const certificateLink = (siteUrl: string, code: string) => `${siteUrl.replace(/\/$/, '')}/sertifika/${encodeURIComponent(code)}`
/** Önizleme ve test çıktılarında gösterilen örnek kod; gerçek kod gönderimde CMS'te üretilir. */
export const SAMPLE_CERTIFICATE_CODE = `${KULUP.sertifika.onEk}-2026-KTLM-ORNEK0000000000000000`
export const SAMPLE_AWARD = 'Örnek Takım · 1. sıra · Birincilik Ödülü'

/** Ödül satırı: "Takım · 1. sıra · Ödül" (ödül yoksa yalnız takım ve sıra). */
export const awardText = (team: string, rank: number, prize?: string | null) =>
  [team, `${rank}. sıra`, prize].filter((part) => part && String(part).trim()).join(' · ')

/**
 * Kutudaki yazının piksel boyutu: uzun isimler kutu genişliğine sığacak kadar küçültülür (en az 8px).
 * Sunucu (Puppeteer) ve stüdyo önizlemesi aynı hesabı kullanır; ekranda görülen boyut çıktıyla aynıdır.
 */
export function fittedFontSize(box: Pick<CertificateBox, 'fontSize' | 'w'>, value: string, imageWidth: number): number {
  const estimated = Math.max(1, [...value].length) * box.fontSize * 0.55
  const fit = Math.min(box.fontSize, box.fontSize * ((imageWidth * box.w / 100) / estimated))
  return Math.max(8, fit)
}

/** Yazı satırının yüksekliği (önizleme ve çıktı aynı); el yazısı fontlarda alt/üst uzantılar kesilmesin diye 1'in biraz üstünde. */
export const CERTIFICATE_LINE_HEIGHT = 1.2

/**
 * Yazı kutuyu doldurur: kutunun yüksekliğine ve genişliğine sığan EN BÜYÜK boyut ölçülerek bulunur (ikili arama).
 * Kutu büyüyünce yazı büyür, küçülünce küçülür; boşluk kalmaz, kesilmez. Tarayıcıda (stüdyo) ve Puppeteer içinde aynı
 * kod çalışır. Fonksiyon kendi içinde bağımsızdır; Puppeteer'a metin olarak aktarılır, dışarıdan değişken kullanmaz.
 */
export function fitTextToBox(text: HTMLElement, box: HTMLElement, min: number): number {
  // İç fonksiyon yok: derleyici adlandırma yardımcısı (__name) eklerse Puppeteer içinde tanımsız kalır
  let low = min, high = Math.max(min, box.clientHeight)
  text.style.fontSize = `${high}px`
  if (text.offsetWidth <= box.clientWidth && text.offsetHeight <= box.clientHeight) return high
  for (let step = 0; step < 24 && high - low > 0.1; step++) {
    const middle = (low + high) / 2
    text.style.fontSize = `${middle}px`
    if (text.offsetWidth <= box.clientWidth && text.offsetHeight <= box.clientHeight) low = middle; else high = middle
  }
  text.style.fontSize = `${low}px`
  return low
}
