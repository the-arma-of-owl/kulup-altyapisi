// Kulübe özel tüm bilgiler kök dizindeki kulup.config.json'dan gelir.
// Bu klasördeki src/kulup.json bir kopyadır: `node scripts/kulup-ayarla.mjs` üretir, elle düzenlenmez.
import kulup from '../kulup.json';

export type Kulup = typeof kulup;

export const KULUP: Kulup = kulup;

/** Sosyal medya bağlantıları: yalnız doldurulmuş olanlar. */
export function sosyalBaglantilar(): Array<{ ad: keyof Kulup['sosyal']; url: string }> {
  return (Object.entries(KULUP.sosyal) as Array<[keyof Kulup['sosyal'], string]>)
    .filter(([, url]) => typeof url === 'string' && url.trim() !== '')
    .map(([ad, url]) => ({ ad, url }));
}

/** kulup.config.json'daki adreslerin alan adları (www'lu ve www'suz hâlleriyle). */
export function kulupHostlari(): string[] {
  const set = new Set<string>();
  for (const url of Object.values(KULUP.adresler)) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      set.add(host);
      set.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`);
    } catch { /* boş ya da geçersiz adres */ }
  }
  return [...set];
}

/** Alan adı kulübün kendi adreslerinden biri mi? (alt alan adı ya da benzer ad kabul edilmez) */
export function kulupHostuMu(hostname: string): boolean {
  return kulupHostlari().includes(hostname.toLowerCase());
}

/** Sitenin kendi adresi (sonunda "/" yok). Ortam değişkeni öncelikli. */
export const SITE_ADRESI = (process.env.NEXT_PUBLIC_SITE_URL || KULUP.adresler.site).replace(/\/+$/, '');
