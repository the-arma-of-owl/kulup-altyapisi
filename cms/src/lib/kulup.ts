import kulup from '../kulup.json'

/**
 * Kulübe özel tüm kimlik bilgileri (ad, adresler, e-posta, sertifika öneki...).
 * Tek kaynak kök dizindeki `kulup.config.json`; `node scripts/kulup-ayarla.mjs` bu dosyayı
 * `src/kulup.json` olarak kopyalar. `src/kulup.json` dosyasını elle düzenleme.
 *
 * Ortam değişkeni tanımlıysa (NEXT_PUBLIC_FRONTEND_URL, PAYLOAD_PUBLIC_SERVER_URL, NEXT_PUBLIC_CDN_URL,
 * RESEND_FROM) o önceliklidir; buradaki değerler yalnız varsayılandır.
 */
export type KulupAyarlari = {
  kisaAd: string
  tamAd: string
  universite: string
  sehir: string
  slogan: string
  aciklama: string
  anahtarKelimeler: string[]
  adresler: { site: string; cms: string; cdn: string }
  eposta: { iletisim: string; gonderen: string; gonderenAd: string }
  sosyal: { instagram: string; whatsapp: string; linkedin: string; github: string; youtube: string; x: string }
  tema: { anaRenk: string; ikinciRenk: string }
  sertifika: { onEk: string; imzaMetni: string }
  kampus: { enlem: number; boylam: number; yakinlastirma: number }
  yasal: { epostaAltBilgisi: string }
}

export const KULUP: KulupAyarlari = kulup as KulupAyarlari

const sonEgikCizgisiz = (url: string) => url.replace(/\/+$/, '')
const ilkAdres = (value: string | undefined) => (value || '').split(',').map((u) => u.trim()).find(Boolean)

/** Sitenin ana adresi: NEXT_PUBLIC_FRONTEND_URL listesindeki ilk adres, yoksa config. */
export function kulupSiteUrl(): string {
  return sonEgikCizgisiz(ilkAdres(process.env.NEXT_PUBLIC_FRONTEND_URL) || KULUP.adresler.site)
}

/** CMS (panel) adresi: PAYLOAD_PUBLIC_SERVER_URL, yoksa config. */
export function kulupCmsUrl(): string {
  return sonEgikCizgisiz(process.env.PAYLOAD_PUBLIC_SERVER_URL || KULUP.adresler.cms)
}

/** CDN adresi: NEXT_PUBLIC_CDN_URL, yoksa config. */
export function kulupCdnUrl(): string {
  return sonEgikCizgisiz(process.env.NEXT_PUBLIC_CDN_URL || KULUP.adresler.cdn)
}

/** Varsayılan e-posta göndereni ("Ad <adres>"); RESEND_FROM tanımlıysa o kullanılır. */
export function kulupGonderen(): string {
  return process.env.RESEND_FROM || `${KULUP.eposta.gonderenAd} <${KULUP.eposta.gonderen}>`
}

/** URL'den host (www'lu ve www'suz) çıkarır; geçersizse boş liste. */
export function hostVaryantlari(url: string): string[] {
  try {
    const host = new URL(url).host
    const yalin = host.replace(/^www\./, '')
    return Array.from(new Set([host, yalin, `www.${yalin}`]))
  } catch {
    return []
  }
}

/** URL'nin www'lu ve www'suz köken (origin) varyantları. */
export function kokenVaryantlari(url: string): string[] {
  try {
    const u = new URL(url)
    return hostVaryantlari(url).map((h) => `${u.protocol}//${h}`)
  } catch {
    return []
  }
}
