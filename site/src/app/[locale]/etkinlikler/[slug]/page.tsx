import React from 'react';
import type { Metadata } from 'next';
import { fetchEventBySlug, getMediaUrl } from '@/lib/api';
import { DEFAULT_DESCRIPTION, formatDateRange, lexicalToPlainText, ogImageFromMedia, pageMetadata } from '@/lib/seo';
import { AlertTriangle, Calendar, MapPin, ArrowLeft, Users } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { serializeLexicalToHtml } from '@/lib/lexical-html';
import EventRegistrationForm from './EventRegistrationForm';
import EventMediaSection from './EventMediaSection';
import { extractCoordinates } from '@/lib/maps';
import EventMap from './EventMap';
import { TrackView } from '@/components/Analytics';
import { fetchEventTeamData } from '@/lib/teams/api';
import { splitEventTeams } from '@/lib/teams/types';
import TeamRegistration from '@/components/teams/TeamRegistration';
import TeamCard from '@/components/teams/TeamCard';
import StickySidebar from '@/components/events/StickySidebar';
import { EventDetailsCard, SidebarPrizes, SidebarTeams, type SidebarAction } from '@/components/events/EventSidebar';
import EventResults from '@/components/events/EventResults';
import { registrationFieldsOf } from '@/lib/eventRegistration';
import { RENK_BG, type Renk } from '@/components/kit';
import { cn } from '@/lib/utils';

function MediaItem({ media, caption }: { media: any; caption?: string }) {
  const url = getMediaUrl(media);
  if (!url) return null;
  const mimeType = typeof media === 'object' ? media?.mimeType : '';
  const isVideo = mimeType?.startsWith('video/') || url.match(/\.(mp4|webm|mov)(\?|$)/i);

  if (isVideo) {
    return (
      <div className="kart relative overflow-hidden">
        <video src={url} controls autoPlay muted loop playsInline className="max-h-96 w-full object-cover" />
        {caption && <p className="absolute bottom-2 left-2 rounded-lg border border-kenar bg-yuzey px-2 py-1 text-xs font-bold text-murekkep">{caption}</p>}
      </div>
    );
  }
  return (
    <div className="kart group relative overflow-hidden">
      <img src={url} alt={caption || ''} className="max-h-96 w-full object-cover transition-transform duration-700 group-hover:scale-105" />
      {caption && <p className="absolute bottom-2 left-2 rounded-lg border border-kenar bg-yuzey px-2 py-1 text-xs font-bold text-murekkep">{caption}</p>}
    </div>
  );
}

/** Bölüm başlığı (sol sütundaki Başvuru / Takımlar blokları). */
function KisimBaslik({ ust, id, children }: { ust: string; id?: string; children: React.ReactNode }) {
  return (
    <>
      <p className="ust-baslik">{ust}</p>
      <h2 id={id} className="mt-2 scroll-mt-28 font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">{children}</h2>
    </>
  );
}

// Slug'lar ilk ziyarette üretilip önbelleğe alınır (ISR)
export function generateStaticParams() {
  return [];
}

// Bağlantı önizlemesi: kapak görseli (yoksa varsayılan görsel), açıklama = tarih · konum · kısa metin.
// fetchEventBySlug sayfadakiyle aynı istek; Next tek fetch'e indirger.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug);
  if (!event) return pageMetadata({ title: 'Etkinlik bulunamadı', description: DEFAULT_DESCRIPTION, noindex: true });
  const summary = [formatDateRange(event.date, event.endDate), event.location, lexicalToPlainText(event.description)]
    .filter(Boolean)
    .join(' · ');
  return pageMetadata({
    title: event.title,
    description: summary || DEFAULT_DESCRIPTION,
    path: `/etkinlikler/${event.slug || slug}`,
    image: ogImageFromMedia(event.image, event.title),
  });
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug);

  if (!event) notFound();

  const coords = await extractCoordinates(event.locationLink);

  const imageUrl = getMediaUrl(event.image);

  // upcoming = Alımlar Kapalı (form kapalı), completed = tamamen bitti
  const isCompleted = event.status === 'completed';
  const descriptionHtml = event.description ? serializeLexicalToHtml(event.description) : '';

  // Takım modu / ödüller / sonuçlar: yalnız bunlardan biri varsa ek veri çekilir; yoksa sayfa eskisiyle birebir aynı.
  const teamMode = event.teamMode === true;
  const hasPrizes = Array.isArray(event.prizes) && event.prizes.length > 0;
  const teamData = teamMode || hasPrizes || event.resultsPublished === true ? await fetchEventTeamData(event.id) : null;
  const { accepted: acceptedTeams, applied: appliedTeams } = splitEventTeams(teamData?.teams ?? []);

  // Kapak üstündeki durum etiketi (ışıma/nabız yok)
  const statusLabels: Record<string, { label: string; renk: Renk }> = {
    open:     { label: 'Kayıt Açık',      renk: 'nane' },
    waitlist: { label: 'Yedek/Geç Alım',  renk: 'limon' },
    closed:   { label: 'Alımlar Kapandı', renk: 'pembe' },
  };
  const statusInfo: { label: string; renk: Renk } = isCompleted
    ? { label: 'Tamamlandı', renk: 'yuzey' }
    : (statusLabels[event.registrationStage] ?? statusLabels.closed);

  // Yan sütundaki ana düğme
  const canRegisterInternally = !isCompleted && !event.registrationLink && event.registrationStage !== 'closed';
  const sidebarAction: SidebarAction = isCompleted
    ? { kind: 'disabled', label: 'Etkinlik Tamamlandı' }
    : event.registrationLink
      ? { kind: 'external', href: event.registrationLink, label: 'Kayıt Formuna Git' }
      : teamMode && teamData?.registration.ok
        ? { kind: 'anchor', href: '#takim-kayit', label: 'Takımınla Katıl' }
        : !teamMode && canRegisterInternally
          ? { kind: 'anchor', href: '#kayit', label: 'Kayıt Ol' }
          : { kind: 'disabled', label: 'Alımlar Kapalı' };
  const prizeList = teamData?.prizes ?? [];
  const showResults = Boolean(teamData && teamData.results.length > 0);

  const registrationFields = registrationFieldsOf(event);


  const pill = 'rozet bg-yuzey py-1 text-sm text-murekkep';

  return (
    <main className="min-h-screen bg-zemin pb-20">
      <TrackView entityType="event" entityId={Number(event.id)} />

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <Link href="/etkinlikler" className="dugme dugme-yuzey mb-6 px-4 py-2">
          <ArrowLeft className="h-4 w-4" /> Tüm Etkinliklere Dön
        </Link>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Sol: kapak, başlık, etiketler ve içerik */}
        <div className="min-w-0 space-y-10">
            <div className="space-y-5">
              {imageUrl && (
                <div className="kart aspect-video w-full overflow-hidden bg-zemin-2 shadow-sert-lg">
                  <img src={imageUrl} alt={event.title} className="h-full w-full object-cover" />
                </div>
              )}
              <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-murekkep [overflow-wrap:anywhere] md:text-6xl">{event.title}</h1>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={cn('rozet py-1 text-sm', RENK_BG[statusInfo.renk])}>
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {statusInfo.label}
                </span>
                {event.date && (
                  <span className={pill}>
                    <Calendar className="h-4 w-4 text-ana-yazi" />
                    {new Date(event.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })}
                  </span>
                )}
                {event.location && (
                  <span className={cn(pill, 'min-w-0 max-w-full')}>
                    <MapPin className="h-4 w-4 shrink-0 text-ana-yazi" /> <span className="min-w-0 break-words">{event.location}</span>
                  </span>
                )}
                {teamMode && (
                  <span className={pill}>
                    <Users className="h-4 w-4 text-ana-yazi" /> Takımlı
                  </span>
                )}
              </div>
            </div>

          {/* Telefonda detay kartı başlığın hemen altında (yan sütun en sona düşüyor) */}
          <div className="lg:hidden"><EventDetailsCard event={event} action={sidebarAction} teamLimits={teamMode ? teamData?.limits ?? null : null} /></div>

          {descriptionHtml && (
            <div
              className="min-w-0 [overflow-wrap:anywhere] text-base leading-relaxed text-murekkep/85 sm:text-lg
                          [&_p]:my-3 [&_strong]:font-extrabold [&_strong]:text-murekkep
                          [&_h1]:mb-3 [&_h1]:mt-8 [&_h1]:text-3xl [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-xl
                          [&_h1,&_h2,&_h3,&_h4]:font-display [&_h1,&_h2,&_h3,&_h4]:font-extrabold [&_h1,&_h2,&_h3,&_h4]:tracking-tight [&_h1,&_h2,&_h3,&_h4]:text-murekkep
                          [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5 [&_li]:marker:text-ana
                          [&_a]:font-bold [&_a]:text-ana-yazi [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-2
                          [&_blockquote]:my-4 [&_blockquote]:rounded-2xl [&_blockquote]:border [&_blockquote]:border-kenar [&_blockquote]:bg-zemin-2 [&_blockquote]:px-5 [&_blockquote]:py-3
                          [&_img]:my-4 [&_img]:rounded-2xl [&_img]:border [&_img]:border-kenar
                          [&>*:first-child]:mt-0"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          )}

          <EventMediaSection event={event} />

          {/* Takım modu: bireysel form yerine "Takım oluştur / Takıma katıl" */}
          {teamMode && !isCompleted && (
            <div className="scroll-mt-28 border-t-2 border-dashed border-kenar/25 pt-12" id="takim-kayit">
              <div className="mb-8">
                <KisimBaslik ust="Başvuru">Takımınla Katıl</KisimBaslik>
                <p className="mt-3 max-w-2xl text-soluk">
                  Bu etkinlik takım hâlinde yapılıyor. Başvuru formunu doldurup bir şifre belirle, e-postana gelen kodu gir;
                  ardından takımını kur, davet koduyla katıl ya da üye arayan bir takıma istek gönder.
                </p>
              </div>
              <TeamRegistration
                eventId={String(event.id)}
                open={teamData?.registration.ok ?? false}
                closedReason={teamData ? teamData.registration.reason : 'Takım bilgileri şu an alınamıyor. Biraz sonra tekrar deneyin.'}
                limits={teamData?.limits ?? { min: event.teamSettings?.minMembers ?? 2, max: event.teamSettings?.maxMembers ?? 5 }}
                registrationFields={registrationFields}
                registrationStage={event.registrationStage}
                externalRegistration={Boolean(event.registrationLink)}
                seekingTeams={(teamData?.teams ?? []).filter((team) => team.seeking)}
              />
            </div>
          )}

          {/* Kabul edilen takımlar: yönetimin başvuranlar arasından seçtikleri (yalnız varsa) */}
          {teamMode && acceptedTeams.length > 0 && (
            <section className="space-y-6 border-t-2 border-dashed border-kenar/25 pt-12" aria-labelledby="kabul-edilen-takimlar-baslik">
              <div>
                <KisimBaslik ust="Takımlar" id="kabul-edilen-takimlar-baslik">Kabul edilen takımlar</KisimBaslik>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {acceptedTeams.map((team) => (
                  <TeamCard key={team.id} team={team} href={`/etkinlikler/${event.slug}/takimlar/${team.slug}`} />
                ))}
              </div>
            </section>
          )}

          {/* Başvuran takımlar: yönetimin onayladığı ama (henüz) kabul etmediği takımlar; reddedilenler hiç gelmez.
              Etkinlik tamamlanınca gizlenir (seçim bitti; "katılım hakkı vermez" uyarısı yanıltıcı olurdu). */}
          {teamMode && !isCompleted && (
            <section className="scroll-mt-28 space-y-6 border-t-2 border-dashed border-kenar/25 pt-12" aria-labelledby="takimlar-baslik">
              <div>
                <KisimBaslik ust="Takımlar" id="takimlar-baslik">
                  {teamData?.heading || event.teamSettings?.teamsHeading || 'Başvuran takımlar'}
                </KisimBaslik>
                {(teamData?.notice ?? event.teamSettings?.teamsNotice) && (
                  <p className="mt-3 text-soluk">{teamData?.notice ?? event.teamSettings?.teamsNotice}</p>
                )}
                {/* Onaylı ≠ katılım hakkı: yanlış anlaşılmasın diye açık uyarı */}
                <div role="note" className="mt-5 flex gap-3 rounded-2xl border border-kenar bg-limon p-4 text-sm leading-relaxed text-murekkep shadow-sert">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>
                    <strong>Kaptanlar ve üyeler dikkat: burada listelenmek etkinliğe katılım hakkı vermez.</strong> Takımın onaylanması yalnızca üye toplayabileceği ve
                    bir sonraki aşama olan seçim sürecine girdiği anlamına gelir. Etkinliğe katılacak takımlar yönetim tarafından seçilir ve
                    &quot;Kabul edilen takımlar&quot; bölümünde duyurulur.
                  </p>
                </div>
              </div>
              {appliedTeams.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {appliedTeams.map((team) => (
                    <TeamCard key={team.id} team={team} href={`/etkinlikler/${event.slug}/takimlar/${team.slug}`} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-kenar/40 px-5 py-6 text-center text-sm font-semibold text-soluk">
                  {acceptedTeams.length > 0 ? 'Bekleyen başvuran takım yok.' : 'Henüz yayımlanan takım yok.'}
                </p>
              )}
            </section>
          )}

          {/* Sonuçlar (ödüller yan sütunda) */}
          {teamData && showResults && (
            <section className="border-t-2 border-dashed border-kenar/25 pt-12">
              <EventResults mode={teamData.resultsDisplay} results={teamData.results} prizes={teamData.prizes} eventSlug={event.slug} />
            </section>
          )}

          {/* Site içi kayıt formu */}
          {!teamMode && !isCompleted && !event.registrationLink && (
            <div className="scroll-mt-28 border-t-2 border-dashed border-kenar/25 pt-12" id="kayit">
              <div className="mb-8">
                <KisimBaslik ust="Başvuru">Etkinliğe Kayıt Ol</KisimBaslik>
                <p className="mt-3 text-soluk">Başvurular değerlendirilir — kabul/ret durumu e-posta ile bildirilir.</p>
              </div>
              <EventRegistrationForm eventId={event.id} registrationFields={registrationFields} registrationStage={event.registrationStage} />
            </div>
          )}
        </div>

        {/* Sağ: detaylar, ödüller, takımlar, konum */}
        <StickySidebar className="min-w-0 space-y-6">
          <div className="hidden lg:block"><EventDetailsCard event={event} action={sidebarAction} teamLimits={teamMode ? teamData?.limits ?? null : null} /></div>
          {prizeList.length > 0 && <SidebarPrizes prizes={prizeList} heading="Ödüller" />}
          {teamMode && <SidebarTeams accepted={acceptedTeams} applied={isCompleted ? [] : appliedTeams} eventSlug={event.slug} />}
          {coords && <EventMap compact coords={coords} locationName={event.location} locationLink={event.locationLink} eventTitle={event.title} />}
        </StickySidebar>
      </div>
      </div>
    </main>
  );
}
