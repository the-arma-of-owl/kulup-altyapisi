import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchHallOfFame, getMediaUrl } from '@/lib/api';
import Image from 'next/image';
import { ExternalLink, Star } from 'lucide-react';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Hall of Fame',
  description: 'Topluluğumuza unutulmaz katkılarda bulunan, iz bırakan değerli isimler.',
  path: '/ekstralar/hof',
});

export default async function HofPage() {
  const hofMembers = await fetchHallOfFame();

  // Yıla göre gruplama
  const groupedByYear = hofMembers.reduce((acc: any, member: any) => {
    const year = member.year || new Date().getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(member);
    return acc;
  }, {});

  const sortedYears = Object.keys(groupedByYear).sort((a, b) => Number(b) - Number(a));

  return (
    <main className="min-h-screen pb-20">
      <SayfaBasligi
        renk="seftali"
        ust="Ekstralar"
        baslik="Hall of Fame"
        aciklama="Topluluğumuza unutulmaz katkılarda bulunan, iz bırakan değerli isimler."
        cikartma={<Cikartma renk="limon" aci={6}>⭐ efsaneler</Cikartma>}
      />

      <div className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-6xl">
          {hofMembers.length === 0 ? (
            <BosDurum simge={<Star className="h-7 w-7" />} baslik="burada kimse yok" />
          ) : (
            <div className="space-y-14 sm:space-y-16">
              {sortedYears.map((year) => (
                <section key={year} className="relative">
                  {/* Yıl Başlığı */}
                  <div className="mb-6 flex items-center gap-4 sm:mb-8">
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep md:text-4xl">
                      {year}
                    </h2>
                    <div className="h-0 flex-1 border-t-2 border-dashed border-kenar/30"></div>
                  </div>

                  {/* O yılın kişileri */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {groupedByYear[year].map((member: any, idx: number) => (
                      <div
                        key={member.id}
                        className="kart group relative flex min-w-0 flex-col p-5 sm:p-6"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn('relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-kenar shadow-sert-sm', RENK_BG[RENK_SIRASI[idx % RENK_SIRASI.length]])}>
                            {member.image ? (
                              <Image
                                src={getMediaUrl(member.image)}
                                alt={member.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center font-display text-2xl font-extrabold">
                                {member.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-display text-xl font-extrabold text-murekkep" title={member.name}>
                              {member.name}
                            </h3>
                            <p className="mt-1 truncate text-sm font-semibold text-ana-yazi" title={member.title}>
                              {member.title}
                            </p>
                          </div>
                        </div>

                        {(member.link || member.link2 || member.link3) && (
                        <div className="mt-4 flex gap-2">
                          {member.link && (
                            <a
                              href={member.link.startsWith('http') ? member.link : `https://${member.link}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-10 w-10 place-items-center rounded-full border border-kenar bg-yuzey text-murekkep shadow-sert-sm transition-[transform,background-color] hover:bg-limon hover:text-murekkep"
                              title="Bağlantı 1'e Git"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {member.link2 && (
                            <a
                              href={member.link2.startsWith('http') ? member.link2 : `https://${member.link2}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-10 w-10 place-items-center rounded-full border border-kenar bg-yuzey text-murekkep shadow-sert-sm transition-[transform,background-color] hover:bg-limon hover:text-murekkep"
                              title="Bağlantı 2'ye Git"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {member.link3 && (
                            <a
                              href={member.link3.startsWith('http') ? member.link3 : `https://${member.link3}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-10 w-10 place-items-center rounded-full border border-kenar bg-yuzey text-murekkep shadow-sert-sm transition-[transform,background-color] hover:bg-limon hover:text-murekkep"
                              title="Bağlantı 3'e Git"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        )}

                        {member.description && (
                          <div className="mt-4 flex-1 border-t-2 border-dashed border-kenar/20 pt-4">
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-soluk">
                              {member.description}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
