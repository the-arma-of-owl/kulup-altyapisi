// Kulübe özel değerlerin tek okuma noktası. Kaynak: kök dizindeki kulup.config.json;
// shared/kulup.json onun kopyasıdır ve scripts/kulup-ayarla.mjs tarafından üretilir (elle düzenlemeyin).
import kulup from './kulup.json'

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
  sosyal: Record<string, string>
  tema: { anaRenk: string; ikinciRenk: string }
  sertifika: { onEk: string; imzaMetni: string }
  kampus: { enlem: number; boylam: number; yakinlastirma: number }
  yasal: { epostaAltBilgisi: string }
}

export const KULUP: KulupAyarlari = kulup

/** Adresin yalnızca host kısmı (ör. "panel.kulubum.example.com"); geçersizse boş metin. */
export const hostOf = (url: string): string => { try { return new URL(url).host } catch { return '' } }
