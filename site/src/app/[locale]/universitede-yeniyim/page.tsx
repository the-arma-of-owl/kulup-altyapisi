import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchUniversityGuideItems, fetchUniversityGuideSettings } from '@/lib/api';
import UniversityGuideClient from '@/components/guide/UniversityGuideClient';
import { serializeLexicalToHtml } from '@/lib/lexical-html';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Cikartma, SayfaBasligi } from '@/components/kit';
import Link from 'next/link';

export const metadata: Metadata = pageMetadata({
  title: 'Üniversitede Yeniyim',
  description: `${KULUP.universite}’ne yeni başlayanlar için ${KULUP.kisaAd} rehberi: kampüs, dersler, ulaşım ve öğrenci hayatına dair bilmen gerekenler.`,
  path: '/universitede-yeniyim',
});

export const revalidate = 86400; // 1 gün yedek; asıl yenileme CMS kaydında (/api/revalidate)

export default async function UniversityGuidePage() {
  let items = [];
  let settings = null;

  try {
    const [resResources, resSettings] = await Promise.all([
      fetchUniversityGuideItems(),
      fetchUniversityGuideSettings()
    ]);

    if (resResources && resResources.docs) {
      items = resResources.docs;
    }
    
    if (resSettings) {
      settings = resSettings;
    }
  } catch (error) {
    console.error('Üniversitede yeniyim verileri çekilemedi:', error);
  }

  const processedItems = items.map((item: any) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    category: item.category,
    excerpt: item.excerpt || 'Bu konu hakkında detayları okumak için tıklayın.',
  }));

  const welcomeTitle = settings?.welcomeTitle || 'Kampüse Hoş Geldin!';
  const startReadingLink = settings?.startReadingLink;
  
  const welcomeMessageHtml = settings?.welcomeMessage ? serializeLexicalToHtml(settings.welcomeMessage) : '';

  return (
    <main className="min-h-screen pb-24">
      <SayfaBasligi
        renk="nane"
        ust="Üniversitede Yeniyim"
        baslik={welcomeTitle}
        cikartma={<Cikartma renk="limon" aci={5}>🎒 ilk gün rehberi</Cikartma>}
      >
        {startReadingLink && typeof startReadingLink === 'object' && (
          <Link
            href={`/universitede-yeniyim/${startReadingLink.slug}`}
            className="dugme dugme-yuzey dugme-buyuk group"
          >
            <Sparkles className="h-5 w-5" />
            İlk Bunu Oku
            <ArrowRight className="h-5 w-5 transition-transform " />
          </Link>
        )}
      </SayfaBasligi>

      <div className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto w-full max-w-6xl">
          {welcomeMessageHtml && (
            <div className="kart mb-10 px-5 py-7 sm:mb-14 sm:px-10 sm:py-9">
              <div
                className="prose max-w-3xl"
                dangerouslySetInnerHTML={{ __html: welcomeMessageHtml }}
              />
            </div>
          )}

          <UniversityGuideClient items={processedItems} />
        </div>
      </div>
    </main>
  );
}
