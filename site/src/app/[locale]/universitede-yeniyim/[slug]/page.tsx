import { KULUP } from '@/lib/kulup';
import React from 'react';
import type { Metadata } from 'next';
import { fetchUniversityGuideItems, fetchUniversityGuideItemBySlug } from '@/lib/api';
import { lexicalToPlainText, pageMetadata } from '@/lib/seo';
import { serializeLexicalToHtml } from '@/lib/lexical-html';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, MapPin, Calendar } from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/categoryMap';
import CesiumMap from '@/components/guide/CesiumMap';
import { RENK_BG, RENK_SIRASI } from '@/components/kit';
import { cn } from '@/lib/utils';

import { extractCoordinates } from '@/lib/maps';

// Slug'lar ilk ziyarette üretilip önbelleğe alınır (ISR)
export function generateStaticParams() {
  return [];
}

export const revalidate = 86400; // 1 gün yedek; asıl yenileme CMS kaydında (/api/revalidate)

// Bağlantı önizlemesi: kullanıcı isteğiyle rehberde görsel her zaman sitenin varsayılan görseli.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const res = await fetchUniversityGuideItemBySlug(resolvedParams.slug);
  const item = res?.docs?.[0];

  if (!item) {
    return pageMetadata({ title: 'Bulunamadı', description: `${KULUP.universite}’ne yeni başlayanlar için ${KULUP.kisaAd} rehberi.`, noindex: true });
  }

  return pageMetadata({
    title: `${item.title} · Üniversitede Yeniyim`,
    description: item.excerpt || lexicalToPlainText(item.content) || `${KULUP.universite}’ne yeni başlayanlar için ${KULUP.kisaAd} rehberi.`,
    path: `/universitede-yeniyim/${item.slug || resolvedParams.slug}`,
  });
}

export default async function UniversityGuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const res = await fetchUniversityGuideItemBySlug(resolvedParams.slug);
  const item = res?.docs?.[0];

  if (!item) {
    notFound();
  }

  const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP['ders'];
  const Icon = cat.icon;
  const contentHtml = item.content ? serializeLexicalToHtml(item.content) : '';
  
  const coords = await extractCoordinates(item.locationMapUrl);

  return (
    <main className="min-h-screen px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto w-full max-w-3xl space-y-8 sm:space-y-10">
        <Link
          href="/universitede-yeniyim"
          className="dugme dugme-yuzey"
        >
          <ArrowLeft className="h-4 w-4" />
          Rehbere Dön
        </Link>

        {/* Hero Section */}
        <header className="relative overflow-hidden rounded-[2rem] border border-kenar bg-nane px-6 py-8 text-murekkep shadow-sert-lg sm:px-10 sm:py-12">
          <div className="relative">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-kenar bg-white shadow-sert-sm">
                <Icon size={22} />
              </div>
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.18em]">
                {cat.label}
              </span>
            </div>

            <h1 className="mb-5 break-words font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {item.title}
            </h1>

            <div className="flex items-center gap-2 text-sm font-semibold opacity-80">
              <Calendar size={16} />
              {new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Content Section */}
        <div className="kart px-5 py-8 sm:px-10 sm:py-12">

          {/* Map Section */}
          {item.locationMapUrl && (
            <div className="mb-10">
              {coords ? (
                <div className="flex flex-col gap-4">
                  <div className="h-[340px] overflow-hidden rounded-2xl border border-kenar shadow-sert-sm sm:h-[450px]">
                    <CesiumMap lat={coords.lat} lng={coords.lng} label={item.title} />
                  </div>
                  <div className="flex justify-end">
                    <a
                      href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dugme dugme-limon group"
                    >
                      <MapPin size={16} className="transition-transform group-hover:scale-110" />
                      Google Haritalar&apos;da Aç
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <a
                    href={item.locationMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dugme dugme-limon dugme-buyuk group"
                  >
                    <MapPin className="h-5 w-5 transition-transform group-hover:scale-110" />
                    Konumu Google Haritalar&apos;da Gör
                  </a>
                </div>
              )}
            </div>
          )}

          {/* RichText Content */}
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>

        {/* Related Posts */}
        {item.relatedPosts && item.relatedPosts.length > 0 && (
          <section className="pt-6">
            <h3 className="mb-6 font-display text-2xl font-extrabold text-murekkep sm:text-3xl">İlgili Okumalar</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {item.relatedPosts.map((post: any, idx: number) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className={cn('kart kart-hover group flex flex-col justify-between gap-4 p-6', RENK_BG[RENK_SIRASI[idx % RENK_SIRASI.length]])}
                >
                  <h4 className="line-clamp-2 font-display text-lg font-extrabold leading-snug">
                    {post.title}
                  </h4>
                  <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold">
                    Blog Yazısına Git <ArrowRight className="h-4 w-4 transition-transform " />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
