import type { Metadata } from 'next';
import { pageMetadata, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo';
import HeroSection from '@/components/home/HeroSection';
import {
  BlogPreviewSection,
  GalleryPreviewSection,
  ManifestoSection,
  AchievementsPreviewSection,
  FAQPreviewSection,
  SocialSection,
} from '@/components/home/HomeExtras';
import { fetchEvents, fetchBlogPosts, fetchAchievements, fetchFAQ, fetchSiteSettings } from '@/lib/api';

export const metadata: Metadata = pageMetadata({
  title: SITE_NAME,
  absoluteTitle: true,
  description: DEFAULT_DESCRIPTION,
  path: '/',
});

export default async function Home() {
  // Üye sayısı CMS → Site Ayarları → activeMembers alanından elle girilir (HeroSection).
  const [events, blogPosts, achievements, faqs, siteSettings] = await Promise.all([
    fetchEvents(4),
    fetchBlogPosts(2),
    fetchAchievements(10),
    fetchFAQ(),
    fetchSiteSettings(),
  ]);

  return (
    <main>
      <HeroSection events={events} siteSettings={siteSettings} />
      <div>
        <ManifestoSection aboutText={siteSettings?.aboutUsText} />
        <AchievementsPreviewSection achievements={achievements} />
        <GalleryPreviewSection galleryItems={siteSettings?.landingGallery || []} />
        <BlogPreviewSection posts={blogPosts} />
        <FAQPreviewSection faqs={faqs} />
        <SocialSection settings={siteSettings} />
      </div>
    </main>
  );
}
