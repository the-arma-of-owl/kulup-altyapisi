import React from 'react';
import type { Metadata } from 'next';
import { fetchAchievementBySlug, getMediaUrl } from '@/lib/api';
import { DEFAULT_DESCRIPTION, lexicalToPlainText, ogImageFromMedia, pageMetadata } from '@/lib/seo';
import { ArrowLeft, Trophy, Calendar } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { serializeLexicalToHtml } from '@/lib/lexical-html';

// Slug'lar ilk ziyarette üretilip önbelleğe alınır (ISR)
export function generateStaticParams() {
  return [];
}

// Bağlantı önizlemesi: başarı görseli, açıklama = özet (yoksa açıklamanın başı).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const achievement = await fetchAchievementBySlug(slug);
  if (!achievement) return pageMetadata({ title: 'Başarı bulunamadı', description: DEFAULT_DESCRIPTION, noindex: true });
  const summary = (typeof achievement.summary === 'string' && achievement.summary) || lexicalToPlainText(achievement.description);
  return pageMetadata({
    title: achievement.title,
    description: summary || DEFAULT_DESCRIPTION,
    path: `/basarilar/${achievement.slug || slug}`,
    image: ogImageFromMedia(achievement.image, achievement.title),
  });
}

export default async function AchievementDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const achievement = await fetchAchievementBySlug(slug);

  if (!achievement) {
    notFound();
  }

  const imageUrl = getMediaUrl(achievement.image);

  // Description: richText veya string
  let descriptionHtml = '';
  if (achievement.description) {
    if (typeof achievement.description === 'object') {
      descriptionHtml = serializeLexicalToHtml(achievement.description);
    } else {
      descriptionHtml = `<p>${achievement.description}</p>`;
    }
  }

  return (
    <main className="min-h-screen px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto max-w-5xl space-y-8 sm:space-y-10">
        <Link href="/basarilar" className="dugme dugme-yuzey">
          <ArrowLeft className="h-4 w-4" /> Tüm Başarılara Dön
        </Link>

        <div className="flex flex-col items-start gap-8 md:flex-row md:gap-10">
          <div className="relative w-full shrink-0 md:sticky md:top-28 md:w-72">
            <div className="kart relative grid aspect-square w-full place-items-center overflow-hidden bg-limon text-murekkep">
              {imageUrl ? (
                <img src={imageUrl} className="h-full w-full object-cover" alt={achievement.title} />
              ) : (
                <Trophy className="h-24 w-24" />
              )}
            </div>
          </div>

          <div className="w-full min-w-0 space-y-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rozet bg-limon">
                  <Trophy className="h-3 w-3" /> GURUR TABLOMUZ
                </span>
                {achievement.date && (
                  <span className="rozet bg-yuzey text-murekkep">
                    <Calendar className="h-3 w-3" /> {new Date(achievement.date).toLocaleDateString('tr-TR')}
                  </span>
                )}
                {achievement.category && (
                  <span className="rozet bg-gok">
                    {achievement.category}
                  </span>
                )}
              </div>
              <h1 className="break-words font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-murekkep md:text-5xl">{achievement.title}</h1>
            </div>

            {descriptionHtml && (
              <div className="kart px-5 py-7 sm:px-8 sm:py-9">
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                />
              </div>
            )}

            {/* Gallery Section */}
            {achievement.gallery && achievement.gallery.length > 0 && (
              <div className="space-y-5 pt-4">
                <h3 className="ust-baslik">BAŞARI GALERİSİ</h3>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {achievement.gallery.map((item: any, idx: number) => {
                    const gUrl = getMediaUrl(item.image);
                    if (!gUrl) return null;
                    return (
                      <div key={idx} style={{ rotate: `${idx % 2 ? 1 : -1}deg` }} className="kart group relative aspect-video overflow-hidden">
                        <img src={gUrl} alt={`Achievement Gallery ${idx}`} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
