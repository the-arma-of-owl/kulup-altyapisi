/**
 * API Client — kulüp sitesi
 *
 * Server components: doğrudan CMS_URL üzerinden fetch (CORS yok)
 * Client components: /api/cms/* proxy üzerinden fetch (CORS sorunu çözümü)
 */

import { fallbackData } from './fallbackData';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001';

// Fetch timeout — CMS kapalıyken sonsuz beklemeyi önler
const FETCH_TIMEOUT_MS = 3000; // 3 saniye (Eğer yanıt vermiyorsa hemen fallback veriye dön)

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Client-side fetch için proxy URL üretir */
function clientUrl(path: string, query = ''): string {
  if (typeof window === 'undefined') {
    return `${CMS_URL}/api/${path}${query}`;
  }
  return `/api/cms/${path}${query}`;
}

/** Server-side fetch için direkt CMS URL */
function serverUrl(path: string, query = ''): string {
  return `${CMS_URL}/api/${path}${query}`;
}

// ─── Server-Side Fetch Helpers ─────────────────────────────────

export async function fetchEvents(limit = 10) {
  try {
    const res = await fetchWithTimeout(
      serverUrl('events', `?where[mode][equals]=live&limit=${limit}&sort=-date&depth=1`),
      { next: { revalidate: 3600, tags: ['events'] } }
    );
    if (!res.ok) return fallbackData.events;
    const data = await res.json();
    return data?.docs?.length > 0 ? data.docs : fallbackData.events;
  } catch { return fallbackData.events; }
}

export async function fetchEventBySlug(slug: string) {
  const eventsArr = fallbackData.events as unknown as any[];
  try {
    const res = await fetchWithTimeout(
      serverUrl('events', `?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=2`),
      { next: { revalidate: 3600, tags: ['events'] } }
    );
    if (!res.ok) return eventsArr?.[0] || null;
    const data = await res.json();
    return data?.docs?.[0] || eventsArr?.[0] || null;
  } catch { return eventsArr?.[0] || null; }
}

export async function fetchBlogPosts(limit = 2) {
  try {
    const res = await fetchWithTimeout(
      serverUrl('blog-posts', `?where[status][equals]=published&limit=${limit}&sort=-publishedAt&depth=1`),
      { next: { revalidate: 86400, tags: ['blog-posts'] } }
    );
    if (!res.ok) return fallbackData.blogPosts;
    const data = await res.json();
    return data?.docs?.length > 0 ? data.docs : fallbackData.blogPosts;
  } catch { return fallbackData.blogPosts; }
}

export async function fetchAchievements(limit = 3) {
  try {
    const res = await fetchWithTimeout(
      serverUrl('achievements', `?limit=${limit}&sort=-date&depth=1`),
      { next: { revalidate: 86400, tags: ['achievements'] } }
    );
    if (!res.ok) return fallbackData.achievements;
    const data = await res.json();
    return data?.docs?.length > 0 ? data.docs : fallbackData.achievements;
  } catch { return fallbackData.achievements; }
}

export async function fetchBlogPostBySlug(slug: string) {
  try {
    // slug ile ara
    const res = await fetchWithTimeout(
      serverUrl('blog-posts', `?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=1`),
      { next: { revalidate: 86400, tags: ['blog-posts'] } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.docs?.[0]) return data.docs[0];
    }
    // slug bulunamazsa id ile dene
    const res2 = await fetchWithTimeout(
      serverUrl(`blog-posts/${slug}`, '?depth=1'),
      { next: { revalidate: 86400, tags: ['blog-posts'] } }
    );
    if (!res2.ok) return null;
    return await res2.json();
  } catch { return null; }
}

export async function fetchAchievementBySlug(slug: string) {
  try {
    const res = await fetchWithTimeout(
      serverUrl('achievements', `?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=1`),
      { next: { revalidate: 86400, tags: ['achievements'] } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.docs?.[0]) return data.docs[0];
    }
    const res2 = await fetchWithTimeout(
      serverUrl(`achievements/${slug}`, '?depth=1'),
      { next: { revalidate: 86400, tags: ['achievements'] } }
    );
    if (!res2.ok) return null;
    return await res2.json();
  } catch { return null; }
}

export async function fetchTeamMembers() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('team-members', '?limit=100&depth=1'),
      { next: { revalidate: 86400, tags: ['team-members'] } }
    );
    if (!res.ok) return [];
    return (await res.json()).docs || [];
  } catch { return []; }
}

export async function fetchFAQ() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('faq', '?limit=100&sort=_order&depth=1'),
      { next: { revalidate: 86400, tags: ['faq'] } }
    );
    if (!res.ok) return fallbackData.faqs;
    const data = await res.json();
    return data?.docs?.length > 0 ? data.docs : fallbackData.faqs;
  } catch { return fallbackData.faqs; }
}

// ─── Client-Side Form Submissions (uses proxy) ────────────────

export type FormResult = { ok: boolean; error?: string }

/** Form gönderimi: başarısızlıkta sunucunun Türkçe hata mesajını da döndürür. */
async function postForm(collection: string, data: Record<string, unknown>, token: string): Promise<FormResult> {
  try {
    const res = await fetch(clientUrl(collection), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-turnstile-token': token },
      body: JSON.stringify(data),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null) as { error?: string; errors?: { message?: string }[] } | null;
    // CMS doğrulama/tekrar mesajları errors[] içinde gelir (ör. "Bu etkinliğe zaten kayıt yapılmış")
    return { ok: false, error: body?.error || body?.errors?.find((item) => item?.message)?.message };
  } catch { return { ok: false, error: 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.' }; }
}

export async function submitMemberApplication(data: Record<string, unknown>, token: string): Promise<FormResult> {
  return postForm('member-applications', data, token);
}

export async function submitContactMessage(data: Record<string, unknown>, token: string): Promise<FormResult> {
  return postForm('contact-messages', data, token);
}

export async function submitEventRegistration(data: Record<string, unknown>, token: string): Promise<FormResult> {
  return postForm('event-registrations', data, token);
}

export async function submitCoreTeamApplication(data: Record<string, unknown>, token: string): Promise<FormResult> {
  return postForm('core-team-applications', data, token);
}


export async function fetchHallOfFame() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('hall-of-fame', '?limit=100&sort=-year,order'),
      { next: { revalidate: 86400, tags: ['hall-of-fame'] } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.docs || [];
  } catch { return []; }
}

// ─── Media URL Helper ───────────────────────────────────────────

// Dosya adındaki '#' tarayıcıda parça (fragment) sayılıp adresi keser (ör. "...🔥#.mp4" → 404)
const encodeHash = (url: string) => url.replace(/#/g, '%23');

export function getMediaUrl(media: unknown): string {
  return encodeHash(rawMediaUrl(media));
}

function rawMediaUrl(media: unknown): string {
  if (!media) return '';
  if (typeof media === 'string') {
    // '/' ile başlayan her şey zaten site içi bir yol (örn. /media/..., /reels/1.mp4)
    if (media.startsWith('http') || media.startsWith('/')) return media;
    // Eğer ID ise veya sadece dosya adı ise
    if (media.includes('.')) return `/media/${media}`;
    return '';
  }
  if (typeof media === 'object' && media !== null) {
    const m = media as { url?: string, filename?: string };
    if (m.url) return m.url;
    if (m.filename) return `/media/${m.filename}`;
  }
  return '';
}

export async function fetchSiteSettings() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('globals/site-settings', '?depth=2'),
      { next: { revalidate: 86400, tags: ['site-settings'] } }
    );
    if (!res.ok) return fallbackData.siteSettings;
    const data = await res.json();
    return (data && Object.keys(data).length > 0) ? data : fallbackData.siteSettings;
  } catch { return fallbackData.siteSettings; }
}

export async function fetchLegalDocs() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('globals/legal-docs'),
      { next: { revalidate: 86400, tags: ['legal-docs'] } }
    );
    if (!res.ok) return fallbackData.legalDocs;
    const data = await res.json();
    return (data && Object.keys(data).length > 0) ? data : fallbackData.legalDocs;
  } catch { return fallbackData.legalDocs; }
}

export async function fetchUniversityGuideItems() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('university-guide', '?where[active][equals]=true&sort=order,createdAt&depth=0'),
      { next: { revalidate: 86400, tags: ['university-guide'] } }
    );
    if (!res.ok) return { docs: [] };
    return await res.json();
  } catch { return { docs: [] }; }
}

export async function fetchUniversityGuideItemBySlug(slug: string) {
  try {
    const res = await fetchWithTimeout(
      serverUrl('university-guide', `?where[slug][equals]=${encodeURIComponent(slug)}&depth=1`),
      { next: { revalidate: 86400, tags: ['university-guide'] } }
    );
    if (!res.ok) return { docs: [] };
    return await res.json();
  } catch { return { docs: [] }; }
}

export async function fetchUniversityGuideSettings() {
  try {
    const res = await fetchWithTimeout(
      serverUrl('globals/university-guide-settings', '?depth=1'),
      { next: { revalidate: 86400, tags: ['university-guide-settings'] } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
