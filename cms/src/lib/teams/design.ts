import { safeMediaUrl, validateDesign, type TeamPageDesign } from './teamDesign'

/**
 * Takım sayfası tasarımı — sunucu tarafı doğrulama.
 * 1) Sitedeki editörle birebir aynı validateDesign (teamDesign.ts kopyası): beyaz liste alanlar, sınırlar,
 *    hex renkler, yalnız izinli CDN/site kökenleri, güvenli manifesto.
 * 2) ownedUrls verilirse (katılımcı kaydı): logo/kapak/GIF adresleri yalnız BU takımın yüklediği görseller
 *    olabilir; başka adres sessizce atılır (logo/kapak → null = takımın kendi değeri).
 */
export function validateTeamDesign(input: unknown, ownedUrls?: Set<string>): TeamPageDesign {
  const design = validateDesign(input)
  if (!ownedUrls) return design
  const own = (url: string | null) => (url && ownedUrls.has(url) ? url : null)
  return {
    ...design,
    logoUrl: own(design.logoUrl),
    coverUrl: own(design.coverUrl),
    gifs: design.gifs.filter((gif) => ownedUrls.has(gif.url)),
  }
}

export { safeMediaUrl }
