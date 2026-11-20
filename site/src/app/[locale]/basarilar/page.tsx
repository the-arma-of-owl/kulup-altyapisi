import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchAchievements, getMediaUrl } from '@/lib/api';
import { ArrowRight, Trophy } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Başarılar',
  description: `${KULUP.kisaAd} ekiplerinin hackathon, CTF, yarışma ve kongrelerde elde ettiği başarılar.`,
  path: '/basarilar',
});

export default async function AchievementsPage() {
  const achievements = await fetchAchievements(50);

  return (
    <main className="min-h-screen pb-20">
      <SayfaBasligi
        renk="limon"
        ust="Gurur tablomuz"
        baslik="Başarılar"
        cikartma={<Cikartma renk="pembe" aci={-6}>🏆 helal olsun</Cikartma>}
      />

      <section className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-6xl">
          {achievements.length === 0 ? (
            <BosDurum simge={<Trophy className="h-7 w-7" />} baslik="Başarılarımız yakında eklenecektir." />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {achievements.map((item: any, idx: number) => {
                const imageUrl = getMediaUrl(item.image);
                const renk = RENK_SIRASI[idx % RENK_SIRASI.length];
                const descText = item.summary ||
                  (item.description && typeof item.description === 'string' ? item.description : '') ||
                  '';
                return (
                  <Link key={idx} href={`/basarilar/${item.slug || item.id}`} className="kart kart-hover group flex h-full flex-col overflow-hidden">
                    <div className={cn('relative h-52 shrink-0 overflow-hidden border-b-2 border-kenar', RENK_BG[renk])}>
                      {imageUrl ? (
                        <img src={imageUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <Trophy className="h-14 w-14 transition-transform duration-300 group-hover:scale-110" />
                        </div>
                      )}
                      {item.date && (
                        <span className="rozet absolute left-3 top-3 bg-yuzey text-murekkep">{new Date(item.date).getFullYear()}</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-6">
                      <h3 className="font-display text-2xl font-extrabold leading-tight text-murekkep">{item.title}</h3>
                      {descText ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-soluk">{descText}</p>
                      ) : null}
                      <span aria-hidden className="mt-auto grid h-9 w-9 place-items-center self-end rounded-full border border-kenar bg-limon text-murekkep transition-transform ">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
