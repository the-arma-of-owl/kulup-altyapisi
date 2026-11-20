import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, MapPin, Sparkles } from 'lucide-react';
import { getMediaUrl } from '@/lib/api';
import { KULUP } from '@/lib/kulup';
import { Cikartma, Desen } from '@/components/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Giriş bölümü: kulüp adı, slogan, üye sayısı ve öne çıkan etkinlik.
export default function HeroSection({ events = [], siteSettings }: { events?: any[]; siteSettings?: any }) {
  // CMS → Site Ayarları'nda seçilen etkinlik, yoksa listedeki ilk etkinlik
  const featuredEvent = siteSettings?.featuredEvent || (events.length > 0 ? events[0] : null);
  const members = Number(siteSettings?.activeMembers) || 0;
  const registrationOpen = featuredEvent?.status === 'active'
    && (featuredEvent?.registrationStage === 'open' || featuredEvent?.registrationStage === 'waitlist');
  const imageUrl = featuredEvent?.image ? getMediaUrl(featuredEvent.image) : null;

  return (
    <section className="px-4 pb-10 pt-8 sm:px-6 lg:pb-16 lg:pt-12">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Cikartma renk="limon" aci={-3}>{KULUP.universite}</Cikartma>
            <Cikartma renk="pembe" aci={2}><Sparkles className="mr-1 inline h-3.5 w-3.5" />{KULUP.sehir}</Cikartma>
          </div>
          <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-murekkep sm:text-6xl lg:text-7xl">
            {KULUP.tamAd}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-soluk sm:text-xl">{KULUP.slogan}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/basvuru/uye-ol" className="dugme dugme-ana dugme-buyuk group">
              Üye Ol <ArrowRight className="h-5 w-5 transition-transform " />
            </Link>
            <Link href="/etkinlikler" className="dugme dugme-yuzey dugme-buyuk">Etkinlikler</Link>
          </div>
          {members > 0 && (
            <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-kenar bg-gok px-4 py-2 text-murekkep shadow-sert-sm">
              <span className="font-display text-3xl font-extrabold">{members}+</span>
              <span className="text-sm font-bold leading-tight">aktif<br />üye</span>
            </div>
          )}
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -right-3 -top-3 h-full w-full rounded-[2rem] border border-kenar bg-seftali" />
          <div className="relative overflow-hidden rounded-[2rem] border border-kenar bg-yuzey shadow-sert-lg">
            <div className="flex items-center justify-between border-b-2 border-kenar bg-ana px-5 py-3 text-white">
              <span className="font-display text-sm font-extrabold uppercase tracking-[0.15em]">Öne çıkan etkinlik</span>
              {registrationOpen && <span className="rozet bg-limon">Kayıt açık</span>}
            </div>
            {featuredEvent ? (
              <div className="p-5">
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-kenar bg-ana-acik">
                  {imageUrl ? (
                    <img src={imageUrl} decoding="async" className="h-full w-full object-cover" alt={featuredEvent.title} />
                  ) : (
                    <div className="grid h-full place-items-center text-ana-yazi"><Desen /><Calendar className="relative h-12 w-12" /></div>
                  )}
                </div>
                <h2 className="mt-5 font-display text-2xl font-extrabold leading-tight text-murekkep">{featuredEvent.title}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                  {featuredEvent.date && (
                    <span className="rozet bg-yuzey text-murekkep">
                      <Calendar className="h-4 w-4" />
                      {new Date(featuredEvent.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })}
                    </span>
                  )}
                  {featuredEvent.location && (
                    <span className="rozet bg-yuzey text-murekkep"><MapPin className="h-4 w-4" /> {featuredEvent.location}</span>
                  )}
                </div>
                <Link href={`/etkinlikler/${featuredEvent.slug || featuredEvent.id}`} className="dugme dugme-limon mt-5 w-full py-3">
                  {registrationOpen ? 'Hemen Katıl' : 'Detaylara Bak'} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-kenar bg-limon text-murekkep shadow-sert-sm"><Calendar className="h-6 w-6" /></div>
                <p className="font-display text-lg font-extrabold text-murekkep">Yakında yeni etkinlikler!</p>
                <p className="text-sm text-soluk">Şu an planlanmış etkinlik yok.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
