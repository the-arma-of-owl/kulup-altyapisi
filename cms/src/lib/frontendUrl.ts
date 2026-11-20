import { KULUP } from './kulup'

// NEXT_PUBLIC_FRONTEND_URL virgülle ayrılmış liste (CORS/CSRF için tüm site adresleri).
// Bağlantı üretmek veya siteye istek atmak için listedeki ilk adres kullanılır.
// Liste boşsa kulup.config.json'daki site adresi (veya verilen fallback) kullanılır.
export function primaryFrontendUrl(fallback = KULUP.adresler.site): string {
  const first = (process.env.NEXT_PUBLIC_FRONTEND_URL || '').split(',').map((u) => u.trim()).find(Boolean)
  return (first || fallback).replace(/\/+$/, '')
}
