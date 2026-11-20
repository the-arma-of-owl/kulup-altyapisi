import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchTeamMembers, getMediaUrl } from '@/lib/api';
import { Linkedin, Github, Users } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Yönetim Kurulu',
  description: `${KULUP.tamAd}’na yön veren yönetim kurulu ve çekirdek ekiple tanışın.`,
  path: '/takim',
});

export default async function TeamPage() {
  const team = await fetchTeamMembers();

  // Gruplama ve sıralama
  const groupedTeam = team.reduce((acc: any, member: any) => {
    const year = member.year || 'Bilinmeyen Dönem';
    if (!acc[year]) acc[year] = { members: [], isActive: false };
    acc[year].members.push(member);
    if (member.isActiveTeam) acc[year].isActive = true;
    return acc;
  }, {});

  // Her yılın içindeki üyeleri 'order' değerine göre küçükten büyüğe sırala
  Object.keys(groupedTeam).forEach(year => {
    groupedTeam[year].members.sort((a: any, b: any) => (a.order || 99) - (b.order || 99));
  });

  // Yılları azalan sıraya göre (en yeni en üstte) sırala
  const sortedYears = Object.keys(groupedTeam).sort((a, b) => b.localeCompare(a));

  return (
    <main className="min-h-screen pb-20">
      <SayfaBasligi
        renk="pembe"
        ust="Takım"
        baslik="Yönetim Kurulu"
        aciklama="Topluluğumuza yön veren çekirdek ekibimizle tanışın."
        cikartma={<Cikartma renk="gok" aci={-5}>👋 selam!</Cikartma>}
      />

      <div className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-6xl">
          {team.length === 0 ? (
            <BosDurum simge={<Users className="h-7 w-7" />} baslik="Ekip üyeleri henüz eklenmedi." />
          ) : (
            <div className="space-y-16 sm:space-y-20">
              {sortedYears.map((year, yearIdx) => {
                const { members, isActive } = groupedTeam[year];
                return (
                  <section key={year} className="space-y-8">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep md:text-4xl">
                        {year}
                      </h2>
                      {isActive && (
                        <Cikartma renk="limon" aci={-3}>Aktif Ekip</Cikartma>
                      )}
                      <div className="hidden h-0 flex-1 border-t-2 border-dashed border-kenar/30 sm:block" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4">
                      {members.map((member: any, idx: number) => {
                        const photoUrl = getMediaUrl(member.photo);
                        const renk = RENK_SIRASI[(idx + yearIdx) % RENK_SIRASI.length];
                        return (
                          <div key={idx} className="kart group flex min-w-0 flex-col overflow-hidden">
                            <div className={cn('relative aspect-[3/4] w-full overflow-hidden border-b-2 border-kenar', RENK_BG[renk])}>
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={member.name}
                                  loading="lazy"
                                  decoding="async"
                                  className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${!member.isActiveTeam ? 'grayscale group-hover:grayscale-0' : ''}`}
                                />
                              ) : (
                                <div className="grid h-full w-full place-items-center font-display text-5xl font-extrabold sm:text-7xl">
                                  {member.name.charAt(0)}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
                              <div className="min-w-0 space-y-1">
                                <h3 className="break-words font-display text-base font-extrabold leading-tight text-murekkep sm:text-xl">{member.name}</h3>
                                <p className="text-xs font-semibold text-ana-yazi sm:text-sm">{member.role}</p>
                              </div>
                              {(member.linkedinUrl || member.githubUrl) && (
                                <div className="mt-auto flex gap-2">
                                  {member.linkedinUrl && (
                                    <Link href={member.linkedinUrl} target="_blank" aria-label="LinkedIn" className="grid h-9 w-9 place-items-center rounded-full border border-kenar bg-gok text-murekkep shadow-sert-sm transition-transform ">
                                      <Linkedin className="h-4 w-4" />
                                    </Link>
                                  )}
                                  {member.githubUrl && (
                                    <Link href={member.githubUrl} target="_blank" aria-label="GitHub" className="grid h-9 w-9 place-items-center rounded-full border border-kenar bg-yuzey text-murekkep shadow-sert-sm transition-transform ">
                                      <Github className="h-4 w-4" />
                                    </Link>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
