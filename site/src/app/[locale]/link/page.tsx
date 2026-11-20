import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowUpRight, CalendarDays, Github, Globe, Linkedin, Mail, UserPlus, Youtube } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { fetchSiteSettings, getMediaUrl } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { DEFAULT_INSTAGRAM, InstagramIcon, WhatsAppIcon } from '@/components/layout/SocialIcons';
import { Cikartma, Desen, RENK_BG, type Renk } from '@/components/kit';
import { cn } from '@/lib/utils';

// Yaka kartındaki QR bu sayfayı açar (adres sabit). Düğmeler CMS → Site Ayarları → "Link Sayfası"ndan gelir;
// liste boşsa varsayılanlar gösterilir. Navbar/footer bu sayfada gizli (bkz. isLinkPage).
export const metadata: Metadata = pageMetadata({
  title: 'Bağlantılar',
  description: `${KULUP.tamAd}: etkinlikler, sosyal medya ve başvuru bağlantıları.`,
  path: '/link',
});

type LinkItem = { label: string; url: string; highlight?: boolean | null; active?: boolean | null };
/** İkon bağlantıdan seçilir (CMS'te ayrı alan yok). */
function LinkIcon({ url }: { url: string }) {
  const u = url.toLowerCase();
  const className = 'h-5 w-5';
  if (u.includes('instagram.com')) return <InstagramIcon className={className} />;
  if (u.includes('whatsapp.com') || u.includes('wa.me')) return <WhatsAppIcon className={className} />;
  if (u.includes('linkedin.com')) return <Linkedin className={className} />;
  if (u.includes('github.com')) return <Github className={className} />;
  if (u.includes('youtube.com') || u.includes('youtu.be')) return <Youtube className={className} />;
  if (u.startsWith('/etkinlikler')) return <CalendarDays className={className} />;
  if (u.startsWith('/basvuru')) return <UserPlus className={className} />;
  if (u.startsWith('/iletisim')) return <Mail className={className} />;
  return <Globe className={className} />;
}

function defaultLinks(settings: { instagramUrl?: string | null; whatsappUrl?: string | null } | null): LinkItem[] {
  const instagram = (settings?.instagramUrl === undefined ? DEFAULT_INSTAGRAM : settings.instagramUrl)?.trim();
  const whatsapp = settings?.whatsappUrl?.trim();
  return [
    ...(instagram ? [{ label: 'Instagram', url: instagram }] : []),
    ...(whatsapp ? [{ label: 'WhatsApp topluluğu', url: whatsapp }] : []),
    { label: 'Etkinlikler', url: '/etkinlikler' },
    { label: 'Üye ol', url: '/basvuru/uye-ol' },
    { label: 'İletişim', url: '/iletisim' },
    { label: 'Web sitemiz', url: '/' },
  ];
}

// Renkli, sert gölgeli düğmeler; vurgulu (highlight) bağlantı ana renkte.
const LINK_RENKLERI: Renk[] = ['limon', 'gok', 'pembe', 'nane', 'seftali'];

const buttonClass = (highlight: boolean) =>
  cn(
    'group flex w-full items-center gap-3 rounded-2xl border border-kenar px-3.5 py-3 font-display text-base font-bold shadow-sert transition-[transform,box-shadow] duration-150 hover:shadow-sert-lg active:shadow-sert-sm',
    highlight ? 'gk-btn--kilim bg-ana text-white' : 'bg-yuzey text-murekkep',
  );

function LinkButton({ item, index }: { item: LinkItem; index: number }) {
  const highlight = item.highlight === true;
  const content = (
    <>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-kenar', highlight ? 'bg-limon text-murekkep' : RENK_BG[LINK_RENKLERI[index % LINK_RENKLERI.length]])}>
        <LinkIcon url={item.url} />
      </span>
      <span className="min-w-0 flex-1 text-left">{item.label}</span>
      <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform " />
    </>
  );
  // Site içi yol: dil önekli yönlendirme; dış adres: yeni sekme
  return item.url.startsWith('/')
    ? <Link href={item.url} className={buttonClass(highlight)}>{content}</Link>
    : <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass(highlight)}>{content}</a>;
}

export default async function LinkPage() {
  const settings = await fetchSiteSettings();
  const fromCms = (Array.isArray(settings?.linkPageLinks) ? settings.linkPageLinks as LinkItem[] : [])
    .filter((item) => item?.active !== false && item?.label?.trim() && item?.url?.trim());
  const links = fromCms.length ? fromCms : defaultLinks(settings);

  const event = settings?.featuredEvent && typeof settings.featuredEvent === 'object' && settings.featuredEvent.status !== 'completed'
    ? settings.featuredEvent : null;
  const eventImage = event?.image ? getMediaUrl(event.image) : '';

  return (
    <main className="lk-page relative min-h-screen overflow-hidden bg-zemin px-4 pb-12 pt-10">
      <Desen className="text-murekkep opacity-[0.07]" />
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center">
        <div className="relative">
          <div className="grid h-[112px] w-[112px] place-items-center rounded-full border border-kenar bg-yuzey shadow-sert">
            <Image src="/logo.png" alt={KULUP.kisaAd} width={88} height={88} priority className="h-[80px] w-[80px] object-contain" />
          </div>
          <div className="absolute -right-10 -top-1"><Cikartma renk="pembe" aci={10}>Selam!</Cikartma></div>
        </div>
        <h1 className="mt-5 text-center font-display text-2xl font-extrabold leading-tight tracking-tight text-murekkep">{KULUP.tamAd}</h1>
        <p className="mt-2 text-center text-sm font-semibold text-soluk">{KULUP.universite} · {KULUP.sehir}</p>

        {event && (
          <Link href={`/etkinlikler/${event.slug}`} className="kart kart-hover group mt-7 block w-full overflow-hidden">
            {eventImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={eventImage} alt={event.title} decoding="async" className="h-32 w-full border-b-2 border-kenar object-cover" />
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="rozet mb-1 bg-limon">Yaklaşan etkinlik</span>
                <p className="font-display text-lg font-extrabold leading-tight text-murekkep">{event.title}</p>
                {event.date && (
                  <p className="mt-0.5 text-xs font-semibold text-soluk">
                    {new Date(event.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })}
                  </p>
                )}
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kenar bg-ana text-white transition-transform ">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>
          </Link>
        )}

        <nav aria-label="Bağlantılar" className="mt-7 flex w-full flex-col gap-3.5">
          {links.map((item, index) => <LinkButton key={`${item.url}-${index}`} item={item} index={index} />)}
        </nav>

        <Link href="/" className="mt-10 font-mono text-xs font-semibold text-soluk transition-colors hover:text-ana-yazi">{new URL(KULUP.adresler.site).hostname}</Link>
      </div>
    </main>
  );
}
