import { KULUP } from '@/lib/kulup';
import type { MetadataRoute } from 'next';

// Telefona/masaüstüne "uygulama" olarak yüklenebilmesi için web uygulaması bildirimi
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${KULUP.kisaAd} - ${KULUP.tamAd}`,
    short_name: `${KULUP.kisaAd}`,
    description: `${KULUP.tamAd}: etkinlikler, başvurular, biletler ve sertifikalar.`,
    start_url: '/tr?ref=uygulama',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f0f5f9',
    theme_color: '#050505',
    lang: 'tr',
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
