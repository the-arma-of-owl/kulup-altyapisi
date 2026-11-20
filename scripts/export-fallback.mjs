/**
 * 📦 Yedek veri (fallback) dışa aktarma betiği
 * 
 * Kullanım:
 *   node scripts/export-fallback.mjs
 * 
 * CMS çalışırken bu scripti çalıştırın.
 * Tüm CMS verilerini çekip site/src/lib/fallbackData.ts dosyasını günceller.
 * Media dosyaları için URL'leri kaydeder (Vercel Blob veya lokal path).
 * 
 * Vercel'de deploy edildiğinde veya DB sıfırlandığında bile
 * site bu fallback verilerle çalışmaya devam eder.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMS_URL = process.env.CMS_URL || 'http://127.0.0.1:3001';
const OUT_FILE = path.join(__dirname, '../site/src/lib/fallbackData.ts');

const MEDIA_DIR = path.join(__dirname, '../site/public/fallback-media');

const log = (msg) => console.log(`\x1b[36m[export]\x1b[0m ${msg}`);
const ok  = (msg) => console.log(`\x1b[32m[✓]\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m[!]\x1b[0m ${msg}`);

async function fetchAll(path, query = '') {
  const url = `${CMS_URL}/api/${path}?limit=100&depth=2${query}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { warn(`${path} alınamadı: ${res.status}`); return []; }
    const data = await res.json();
    return data.docs || [];
  } catch (e) {
    warn(`${path} fetch hatası: ${e.message}`);
    return [];
  }
}

async function fetchGlobal(name) {
  const url = `${CMS_URL}/api/globals/${name}?depth=2`;
  try {
    const res = await fetch(url);
    if (!res.ok) { warn(`global/${name} alınamadı`); return null; }
    return await res.json();
  } catch (e) {
    warn(`global/${name} fetch hatası: ${e.message}`);
    return null;
  }
}

function resolveMediaUrl(media) {
  if (!media) return '/logo.png';
  if (typeof media === 'string') return media;
  if (typeof media === 'object') {
    // Vercel Blob veya absolute URL
    if (media.url?.startsWith('http')) return media.url;
    // Lokal CMS
    if (media.url) return `${CMS_URL}${media.url}`;
    if (media.filename) return `${CMS_URL}/media/${media.filename}`;
  }
  return '/logo.png';
}

async function downloadMedia(url, filename) {
  if (!url || url === '/logo.png') return url;
  // Sadece lokal CMS URL'lerini indir (Vercel Blob gibi harici URL'leri atla)
  if (!url.startsWith(CMS_URL)) return url;

  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const dest = path.join(MEDIA_DIR, filename);
  if (fs.existsSync(dest)) {
    return `/fallback-media/${filename}`;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buffer);
    log(`  İndirildi: ${filename}`);
    return `/fallback-media/${filename}`;
  } catch {
    warn(`  İndirilemedi: ${filename}`);
    return url;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
}

async function main() {
  log('CMS bağlantısı kontrol ediliyor...');
  try {
    await fetch(`${CMS_URL}/api/events?limit=1`);
    ok('CMS bağlantısı kuruldu.');
  } catch {
    console.error('\x1b[31m[HATA]\x1b[0m CMS\'e bağlanılamadı! Önce CMS\'i başlatın: cd cms && npm run dev');
    process.exit(1);
  }

  log('Veriler çekiliyor...');

  // --- Events ---
  log('Etkinlikler çekiliyor...');
  const rawEvents = await fetchAll('events', '&sort=-date');
  const events = [];
  for (const e of rawEvents) {
    const imgUrl = resolveMediaUrl(e.image);
    const imgFilename = e.image?.filename ? sanitizeFilename(e.image.filename) : null;
    const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;
    events.push({
      id: e.id,
      title: e.title,
      slug: e.slug,
      mode: e.mode || 'live',
      status: e.status || 'active',
      registrationStage: e.registrationStage || 'closed',
      date: e.date,
      location: e.location,
      capacity: e.capacity || 0,
      description: typeof e.description === 'string' ? e.description : '',
      image: localImg,
    });
  }
  ok(`${events.length} etkinlik alındı.`);

  // --- Blog Posts ---
  log('Blog yazıları çekiliyor...');
  const rawBlog = await fetchAll('blog-posts', '&where[status][equals]=published&sort=-publishedAt');
  const blogPosts = [];
  for (const b of rawBlog) {
    const imgUrl = resolveMediaUrl(b.coverImage);
    const imgFilename = b.coverImage?.filename ? sanitizeFilename(b.coverImage.filename) : null;
    const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;
    blogPosts.push({
      id: b.id,
      title: b.title,
      slug: b.slug,
      publishedAt: b.publishedAt,
      excerpt: b.excerpt || '',
      coverImage: localImg,
      author: b.author ? { 
        name: b.author.name || '', 
        role: b.author.role || '',
        links: b.author.links || []
      } : null,
      readTime: b.readTime || 5,
    });
  }
  ok(`${blogPosts.length} blog yazısı alındı.`);

  // --- Achievements ---
  log('Başarılar çekiliyor...');
  const rawAch = await fetchAll('achievements', '&sort=-date');
  const achievements = [];
  for (const a of rawAch) {
    const imgUrl = resolveMediaUrl(a.image);
    const imgFilename = a.image?.filename ? sanitizeFilename(a.image.filename) : null;
    const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;
    achievements.push({
      id: a.id,
      title: a.title,
      slug: a.slug,
      date: a.date,
      category: a.category || 'other',
      image: localImg,
      summary: a.summary || '',
    });
  }
  ok(`${achievements.length} başarı alındı.`);

  // --- Team Members ---
  log('Takım üyeleri çekiliyor...');
  const rawTeam = await fetchAll('team-members');
  const teamMembers = [];
  for (const t of rawTeam) {
    const imgUrl = resolveMediaUrl(t.photo);
    const imgFilename = t.photo?.filename ? sanitizeFilename(t.photo.filename) : null;
    const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;
    teamMembers.push({
      id: t.id,
      name: t.name,
      role: t.role || '',
      team: t.team || '',
      photo: localImg,
      linkedin: t.linkedin || '',
      github: t.github || '',
      order: t.order || 0,
    });
  }
  ok(`${teamMembers.length} takım üyesi alındı.`);

  // --- FAQ ---
  log('SSS çekiliyor...');
  const rawFaq = await fetchAll('faq');
  const faqs = rawFaq.map(f => ({
    id: f.id,
    question: f.question,
    answer: f.answer,
    category: f.category || null,
    order: f.order || 0,
  }));
  ok(`${faqs.length} SSS alındı.`);

  // --- Gallery Albums ---
  log('Galeri albümleri çekiliyor...');
  const rawGallery = await fetchAll('gallery-albums', '&sort=-date');
  const galleryAlbums = [];
  for (const g of rawGallery) {
    const imgUrl = resolveMediaUrl(g.coverImage);
    const imgFilename = g.coverImage?.filename ? sanitizeFilename(g.coverImage.filename) : null;
    const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;

    // Galeri öğeleri (resim + video)
    const items = [];
    for (const item of (g.items || [])) {
      const itemUrl = resolveMediaUrl(item.media);
      const itemFilename = item.media?.filename ? sanitizeFilename(item.media.filename) : null;
      const localItemUrl = itemFilename ? await downloadMedia(itemUrl, itemFilename) : itemUrl;
      items.push({
        media: localItemUrl,
        type: item.type || 'image',
        caption: item.caption || '',
      });
    }

    galleryAlbums.push({
      id: g.id,
      title: g.title,
      date: g.date,
      coverImage: localImg,
      mediaType: g.mediaType || 'image',
      items,
    });
  }
  ok(`${galleryAlbums.length} galeri albümü alındı.`);

  // --- Site Settings ---
  log('Site ayarları çekiliyor...');
  const siteSettings = await fetchGlobal('site-settings');

  // Site settings içindeki görselleri de işle
  let processedSettings = siteSettings;
  if (siteSettings) {
    const gallery = [];
    for (const item of (siteSettings.landingGallery || [])) {
      const imgUrl = resolveMediaUrl(item.image);
      const imgFilename = item.image?.filename ? sanitizeFilename(item.image.filename) : null;
      const localImg = imgFilename ? await downloadMedia(imgUrl, imgFilename) : imgUrl;
      gallery.push({ image: localImg });
    }

    const reels = [];
    for (const reel of (siteSettings.instagramReels || [])) {
      const videoUrl = resolveMediaUrl(reel.video);
      const videoFilename = reel.video?.filename ? sanitizeFilename(reel.video.filename) : null;
      const localVideo = videoFilename ? await downloadMedia(videoUrl, videoFilename) : videoUrl;
      reels.push({ video: localVideo });
    }

    processedSettings = {
      activeMembers: siteSettings.activeMembers || 250,
      contactEmail: siteSettings.contactEmail || '',
      aboutUsText: siteSettings.aboutUsText || '',
      instagramReels: reels,
      landingGallery: gallery,
    };
  }
  ok('Site ayarları alındı.');

  // --- Legal Docs ---
  log('Hukuki belgeler çekiliyor...');
  const legalDocs = await fetchGlobal('legal-docs');
  ok('Hukuki belgeler alındı.');

  // --- Members Count ---
  log('Üye sayısı çekiliyor...');
  let membersCount = 250;
  try {
    const res = await fetch(`${CMS_URL}/api/members?limit=1`);
    if (res.ok) {
      const data = await res.json();
      membersCount = data.totalDocs || 250;
    }
  } catch { /* fallback */ }
  ok(`Üye sayısı: ${membersCount}`);

  // --- Generate TypeScript ---
  log('fallbackData.ts oluşturuluyor...');

  const fallback = {
    events,
    blogPosts,
    achievements,
    galleryAlbums,
    teamMembers,
    faqs,
    siteSettings: processedSettings || {
      activeMembers: 250,
      contactEmail: '',
      aboutUsText: '',
      instagramReels: [{ video: null }],
      landingGallery: [],
    },
    membersCount,
    legalDocs: legalDocs || {},
  };

  const ts = `// ⚠️ Bu dosya otomatik oluşturulmuştur.
// Manuel düzenleme yapmayın — \`node scripts/export-fallback.mjs\` ile güncelleyin.
// Son güncelleme: ${new Date().toLocaleString('tr-TR')}
// Kaynak: ${CMS_URL}

export const fallbackData: any = ${JSON.stringify(fallback, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, ts, 'utf8');
  ok(`✅ fallbackData.ts güncellendi → ${OUT_FILE}`);

  if (fs.existsSync(MEDIA_DIR)) {
    const files = fs.readdirSync(MEDIA_DIR);
    ok(`📁 ${files.length} medya dosyası /public/fallback-media/ klasöründe.`);
  }

  console.log('\n\x1b[32m🎉 Tamamlandı!\x1b[0m Şimdi git push yapabilirsiniz:\n');
  console.log('  git add -A && git commit -m "chore: update fallback data" && git push\n');
}

main().catch(e => {
  console.error('\x1b[31m[HATA]\x1b[0m', e);
  process.exit(1);
});
