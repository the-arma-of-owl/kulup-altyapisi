import type { FieldHook } from 'payload'

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/**
 * Elle girilen slug'ı adrese uygun kısa ada çevirir. Tam adres yapıştırılırsa ("https://site/blog/yazi-adi")
 * son parça alınır; Türkçe harfler sadeleşir, boşluk ve işaretler tireye döner. Boşsa '' döner.
 */
export function normalizeSlug(value: string): string {
  let text = value.trim()
  if (/^https?:\/\//i.test(text) || text.includes('/')) {
    text = text.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? ''
  }
  try { text = decodeURIComponent(text) } catch { /* bozuk kodlama: olduğu gibi */ }
  return text
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR[ch] ?? ch)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** Slug alanı için kayıt öncesi kanca: girilen değeri normalleştirir (boş değere dokunmaz). */
export const normalizeSlugHook: FieldHook = ({ value }) =>
  typeof value === 'string' && value.trim() ? normalizeSlug(value) || value : value
