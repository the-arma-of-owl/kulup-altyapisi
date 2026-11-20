/**
 * Takım iletişim adresi (kaptan bırakır): tür + değer. Telefon numarası KESİNLİKLE kabul edilmez —
 * WhatsApp için de yalnız kullanıcı adı. Saf fonksiyonlar; testler tests/int/teams.int.spec.ts.
 * Bu dosya sitedeki site/src/lib/teams/contact.ts ile BİREBİR aynıdır (testle denetlenir): sitede yalnız
 * anında uyarı için kullanılır; asıl doğrulama CMS'te (sunucu) yapılır.
 */

// validate.ts EMAIL_RE ile aynı (dosya iki projede birebir aynı kalsın diye burada)
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/

export const CONTACT_TYPES = ['telegram', 'instagram', 'email', 'whatsapp'] as const
export type ContactType = (typeof CONTACT_TYPES)[number]
export type TeamContact = { type: ContactType; value: string }

export const CONTACT_LABELS: Record<ContactType, string> = {
  telegram: 'Telegram',
  instagram: 'Instagram',
  email: 'E-posta',
  whatsapp: 'WhatsApp kullanıcı adı',
}

export const PHONE_MESSAGE = 'Telefon numarası yazmayın; kullanıcı adı ya da e-posta girin.'

/**
 * Telefon numarasına benziyor mu? (NFKC ile tam genişlikli/Arapça rakamlar da sayılır)
 * - 7 ya da daha çok rakam
 * - +90 / 0090 öneki ya da 05xx kalıbı (araya boşluk, nokta, tire girse de)
 * - rakam ağırlıklı (en az 4 rakam ve harf/rakamların yarısı ya da fazlası rakam)
 */
export function looksLikePhone(input: string): boolean {
  const text = input.normalize('NFKC').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  const digits = (text.match(/\d/g) ?? []).length
  if (digits >= 7) return true
  const compact = text.replace(/[\s().\-_/]/g, '')
  if (/(?:\+|00)90/.test(compact)) return true
  if (/(?:^|\D)0?5\d{2}(?:\d|$)/.test(compact) && digits >= 4) return true
  const alnum = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  return digits >= 4 && alnum > 0 && digits / alnum >= 0.5
}

const USERNAME_RULES: Record<Exclude<ContactType, 'email'>, { re: RegExp; hint: string; prefixes: RegExp }> = {
  // Telegram: 5-32, harf/rakam/alt çizgi, harfle başlar
  telegram: { re: /^[A-Za-z][A-Za-z0-9_]{4,31}$/, hint: 'Telegram kullanıcı adı 5-32 karakter (harf, rakam, _) olmalı.', prefixes: /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i },
  // Instagram: 1-30, harf/rakam/nokta/alt çizgi
  instagram: { re: /^[A-Za-z0-9._]{1,30}$/, hint: 'Instagram kullanıcı adı 1-30 karakter (harf, rakam, . ve _) olmalı.', prefixes: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i },
  // WhatsApp kullanıcı adı: 3-35, harf/rakam/nokta/alt çizgi, en az bir harf
  whatsapp: { re: /^(?=.*[A-Za-z])[A-Za-z0-9._]{3,35}$/, hint: 'WhatsApp kullanıcı adı 3-35 karakter (harf, rakam, . ve _) olmalı.', prefixes: /^$/ },
}

/**
 * Girdi: { type, value } ya da null/'' (silme). Dönüş: temiz kayıt, null (silindi) ya da hata nedeni.
 */
export function validateContact(input: unknown): { ok: true; contact: TeamContact | null } | { ok: false; reason: string } {
  if (input === null || input === undefined) return { ok: true, contact: null }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Geçersiz iletişim bilgisi.' }
  const { type, value } = input as { type?: unknown; value?: unknown }
  if (typeof value !== 'string' || value.trim() === '') return { ok: true, contact: null }
  if (typeof type !== 'string' || !(CONTACT_TYPES as readonly string[]).includes(type)) {
    return { ok: false, reason: 'İletişim türü Telegram, Instagram, E-posta ya da WhatsApp kullanıcı adı olmalı.' }
  }
  const raw = value.trim()
  if (raw.length > 120) return { ok: false, reason: 'İletişim bilgisi çok uzun.' }
  if (looksLikePhone(raw)) return { ok: false, reason: PHONE_MESSAGE }
  if (type === 'email') {
    const email = raw.toLowerCase()
    if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: 'Geçerli bir e-posta adresi girin (ornek@alan.com).' }
    return { ok: true, contact: { type, value: email } }
  }
  const rule = USERNAME_RULES[type as Exclude<ContactType, 'email'>]
  const name = raw.replace(rule.prefixes, '').replace(/^@/, '').replace(/\/+$/, '')
  if (!rule.re.test(name)) return { ok: false, reason: rule.hint }
  return { ok: true, contact: { type: type as ContactType, value: `@${name}` } }
}
