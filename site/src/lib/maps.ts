import { unstable_cache } from 'next/cache';

// Kısa link hep aynı adrese gider: çözümü 1 gün önbellekte tut. Önbelleksiz (no-store) fetch
// ISR ile üretilen etkinlik/rehber sayfalarını çalışma anında dinamiğe çevirip 500 verdiriyordu.
const resolveShortMapsUrl = unstable_cache(
  async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      return res.url || null;
    } catch (err) {
      console.error('Error resolving short Google Maps URL:', err);
      return null;
    }
  },
  ['maps-short-url'],
  { revalidate: 86400 }
);

// Helper to resolve short Google Maps URLs and extract coordinates
export async function extractCoordinates(url: string | undefined): Promise<{ lat: number, lng: number } | null> {
  if (!url) return null;

  let targetUrl = url;

  // 1. If it's a short Google Maps URL, resolve it on the server
  if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) {
    targetUrl = (await resolveShortMapsUrl(url)) || url;
  }

  // 2. Decode URL just in case
  const decodedUrl = decodeURIComponent(targetUrl);

  // 3. Search /maps/search/lat,+lng
  const searchMatch = decodedUrl.match(/\/maps\/search\/([0-9.-]+),\s*\+?([0-9.-]+)/);
  if (searchMatch) {
    return { lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) };
  }

  // 4. OpenStreetMap marker=lat,lng
  const osmMatch = decodedUrl.match(/marker=([0-9.-]+)%2C([0-9.-]+)/) || decodedUrl.match(/marker=([0-9.-]+),([0-9.-]+)/);
  if (osmMatch) {
    return { lat: parseFloat(osmMatch[1]), lng: parseFloat(osmMatch[2]) };
  }

  // 5. Google Maps !3dLat!2dLng or !3dLat!4dLng
  const gm3dMatch = decodedUrl.match(/!3d([0-9.-]+).*?!(?:2d|4d)([0-9.-]+)/);
  if (gm3dMatch) {
    return { lat: parseFloat(gm3dMatch[1]), lng: parseFloat(gm3dMatch[2]) };
  }

  // 6. Google Maps @Lat,Lng
  const gmAtMatch = decodedUrl.match(/@([0-9.-]+),([0-9.-]+)/);
  if (gmAtMatch) {
    return { lat: parseFloat(gmAtMatch[1]), lng: parseFloat(gmAtMatch[2]) };
  }

  return null;
}
