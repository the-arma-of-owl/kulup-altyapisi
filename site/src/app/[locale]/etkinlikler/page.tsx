import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchEvents, getMediaUrl } from '@/lib/api';
import { Calendar, MapPin, ArrowRight, CalendarX, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Etkinlikler',
  description: `${KULUP.kisaAd}’nin atölye, hackathon, seminer ve buluşmaları: yaklaşan ve geçmiş etkinlikler, kayıt ve takım başvuruları.`,
  path: '/etkinlikler',
});

export default async function EventsPage() {
  const events = await fetchEvents(50);
  
  // Find the single active event
  const activeEvent = events.find((e: any) => e.status === 'active');
  const pastEvents = events.filter((e: any) => e.status === 'completed');


  return (
    <main className="min-h-screen bg-zemin pb-20">
      <SayfaBasligi
        ust="Takvim"
        baslik="Etkinlikler"
        aciklama="Geçmiş ve gelecek tüm etkinliklerimiz, eğitimlerimiz ve zirvelerimiz."
        renk="ana"
        cikartma={<Cikartma renk="limon" aci={6}>🎉</Cikartma>}
      />

      <div className="px-4 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-6xl space-y-14">
        {events.length === 0 ? (
          <BosDurum
            simge={<CalendarX className="h-7 w-7" />}
            baslik="Şu anda planlanmış bir etkinlik bulunmuyor."
          />
        ) : (
          <div className="space-y-16">
            {/* Aktif Etkinlik */}
            {activeEvent && (
              <div className="space-y-6">
                <h2 className="flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep shadow-sert-sm">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  Gündemdeki Etkinlik
                </h2>
                <Link href={`/etkinlikler/${activeEvent.slug || activeEvent.id}`} className="group block">
                  <div className="kart kart-hover relative flex flex-col overflow-hidden md:flex-row">
                    {getMediaUrl(activeEvent.image) ? (
                      <div className="relative aspect-video w-full shrink-0 overflow-hidden border-b-2 border-kenar md:aspect-auto md:w-[42%] md:border-b-0 md:border-r-2">
                        <img src={getMediaUrl(activeEvent.image)} alt={activeEvent.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                    ) : (
                      <div className={cn('relative grid aspect-[16/7] w-full shrink-0 place-items-center border-b-2 border-kenar md:aspect-auto md:w-[34%] md:border-b-0 md:border-r-2', RENK_BG.gok)}>
                        <Calendar className="h-16 w-16" />
                      </div>
                    )}

                    <div className="relative flex flex-1 flex-col justify-center gap-5 p-6 sm:p-10">
                      <div className="flex flex-wrap items-center gap-3">
                        {activeEvent.registrationStage === 'open' && (
                          <span className={cn('rozet', RENK_BG.nane)}>
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-murekkep opacity-60"></span>
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-murekkep"></span>
                            </span>
                            Kayıtlar Açık
                          </span>
                        )}
                        {activeEvent.registrationStage === 'waitlist' && (
                          <span className={cn('rozet', RENK_BG.limon)}>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-murekkep"></span>
                            Yedek Alım / Geç Kayıt
                          </span>
                        )}
                        {activeEvent.registrationStage === 'closed' && (
                          <span className={cn('rozet', RENK_BG.pembe)}>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-murekkep"></span>
                            Kayıtlar Kapandı
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-murekkep [overflow-wrap:anywhere] md:text-5xl">{activeEvent.title}</h3>
                      
                      <div className="flex flex-wrap items-center gap-2.5 text-sm font-bold text-murekkep">
                        <span className="inline-flex items-center gap-2 rounded-full border border-kenar bg-zemin-2 px-3 py-1">
                          <Calendar className="h-4 w-4 text-ana-yazi" />
                          {new Date(activeEvent.date).toLocaleDateString('tr-TR')}
                        </span>
                        {activeEvent.location && (
                          <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-kenar bg-zemin-2 px-3 py-1">
                            <MapPin className="h-4 w-4 shrink-0 text-ana-yazi" />
                            <span className="min-w-0 break-words">{activeEvent.location}</span>
                          </span>
                        )}
                      </div>

                      <div className="pt-2">
                        <span className="dugme dugme-ana dugme-buyuk">
                          {(activeEvent.registrationStage === 'open' || activeEvent.registrationStage === 'waitlist') ? 'Hemen Başvur' : 'Detayları Gör'} <ArrowRight className="h-5 w-5 transition-transform " />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* Geçmiş Etkinlikler */}
            {pastEvents.length > 0 && (
              <div className="space-y-6">
                <div>
                  <p className="ust-baslik mb-2">Arşiv</p>
                  <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">Geçmiş Etkinlikler</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {pastEvents.map((event: any, idx: number) => {
                    const imageUrl = getMediaUrl(event.image);
                    const renk = RENK_SIRASI[idx % RENK_SIRASI.length];

                    return (
                      <Link key={idx} href={`/etkinlikler/${event.slug || event.id}`} className="group block">
                        <div className="kart kart-hover relative flex h-full flex-col overflow-hidden">
                          <div className={cn('relative aspect-video w-full overflow-hidden border-b-2 border-kenar', RENK_BG[renk])}>
                            {imageUrl ? (
                              <img src={imageUrl} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" alt={event.title} />
                            ) : (
                              <div className="grid h-full place-items-center"><Calendar className="h-12 w-12" /></div>
                            )}
                            <span className="rozet absolute left-3 top-3 bg-yuzey text-murekkep">Tamamlandı</span>
                          </div>
                          
                          <div className="flex flex-1 flex-col gap-4 p-5">
                            <h4 className="font-display text-xl font-extrabold leading-tight text-murekkep [overflow-wrap:anywhere]">{event.title}</h4>
                            <div className="mt-auto space-y-1.5 border-t-2 border-dashed border-kenar/20 pt-4 text-sm font-semibold text-soluk">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 shrink-0 text-ana-yazi" />
                                {new Date(event.date).toLocaleDateString('tr-TR')}
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 shrink-0 text-ana-yazi" />
                                  <span className="min-w-0 break-words">{event.location}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
