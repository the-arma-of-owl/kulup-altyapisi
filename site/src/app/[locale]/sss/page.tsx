import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchFAQ } from '@/lib/api';
import { groupFaqsByCategory } from '@/lib/faq';
import { HelpCircle } from 'lucide-react';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Sıkça Sorulan Sorular',
  description: `${KULUP.kisaAd} üyeliği, etkinlikler, başvurular ve topluluk hakkında sıkça sorulan sorular ve cevapları.`,
  path: '/sss',
});

export default async function FaqPage() {
  const faq = await fetchFAQ();

  // Sorular ve kategoriler CMS'teki sürükle-bırak sırasıyla (bkz. lib/faq.ts)
  const groups = groupFaqsByCategory(faq);

  return (
    <main className="pb-20">
      <SayfaBasligi
        renk="limon"
        ust="SSS"
        baslik="Sıkça Sorulan Sorular"
        aciklama={<>{KULUP.kisaAd} hakkında merak edilen her şey.</>}
        cikartma={<Cikartma renk="pembe" aci={7}>?!</Cikartma>}
      />

      <div className="mx-auto mt-10 max-w-4xl px-4 sm:px-6">
        {faq.length === 0 ? (
          <BosDurum simge={<HelpCircle className="h-6 w-6" />} baslik="Henüz SSS eklenmedi." />
        ) : (
          <div className="space-y-12">
            {groups.map(({ name: cat, items }, gIdx) => {
              if (items.length === 0) return null;
              const renk = RENK_SIRASI[gIdx % RENK_SIRASI.length];
              return (
                <section key={cat} className="space-y-4">
                  <h2 className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight text-murekkep sm:text-3xl">
                    <span aria-hidden className={cn('h-4 w-4 shrink-0 rounded-full border border-kenar', RENK_BG[renk])} />
                    {cat}
                  </h2>
                  <div className="space-y-3">
                    {items.map((item: any, idx: number) => {
                      return (
                        <details
                          key={idx}
                          className="kart group overflow-hidden shadow-sert-sm transition-shadow open:shadow-sert"
                        >
                          <summary className="flex cursor-pointer select-none list-none items-center gap-4 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
                            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-kenar', RENK_BG[renk])}>
                              <HelpCircle className="h-5 w-5" />
                            </span>
                            <span className="flex-1 font-display text-base font-bold text-murekkep md:text-lg">{item.question}</span>
                            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kenar bg-yuzey font-display text-xl font-bold leading-none text-murekkep transition-transform duration-300 group-open:rotate-45 group-open:bg-limon group-open:text-murekkep">+</span>
                          </summary>
                          <div className="border-t-2 border-dashed border-kenar/30 px-5 pb-5 pt-4 text-sm leading-relaxed text-soluk md:px-6 md:pb-6 md:pl-[76px] md:text-base">
                            {item.answer}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
