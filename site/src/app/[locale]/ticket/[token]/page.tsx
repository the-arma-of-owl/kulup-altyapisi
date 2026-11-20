import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import TicketCard from '@/components/ticket/TicketCard';
import { pageMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { extractCoordinates } from '@/lib/maps';
import { fetchTicketView } from '@/lib/ticket';
import { Link } from '@/i18n/routing';
import { ArrowLeft } from 'lucide-react';

// Kişisel bilet: arama motoruna kapalı; önizlemede ad/etkinlik/QR yok, adres (gizli jeton) og:url'e yazılmaz.
export const metadata: Metadata = pageMetadata({
  title: 'Etkinlik Bileti',
  description: `${KULUP.kisaAd} etkinlik giriş bileti.`,
  noindex: true,
});

export default async function TicketPage({ params }: { params: { locale: string; token: string } }) {
  const { token, locale } = await params;
  const t = await getTranslations('common'); // Assuming common exists, else we use hardcoded TR for now.
  
  const view = await fetchTicketView(token, {
    fetcher: fetch,
    cmsUrl: process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001',
    internalKey: process.env.INTERNAL_API_KEY,
  });
  
  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zemin p-4">
        <div className="kart w-full max-w-md p-8 text-center shadow-sert-lg">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-kenar bg-pembe text-2xl shadow-sert-sm">❌</div>
          <h1 className="mb-2 font-display text-3xl font-extrabold tracking-tight text-murekkep">Geçersiz Bilet</h1>
          <p className="text-soluk">Bu bilet bulunamadı veya onaylanmamış. Lütfen başvuru durumunuzu kontrol edin.</p>
        </div>
      </div>
    );
  }

  const coords = await extractCoordinates(view.event.locationLink);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zemin px-4 pb-16 pt-6 font-sans sm:pt-10">
      <div className="flex w-full max-w-md flex-col">
        <Link 
          href="/"
          className="dugme dugme-yuzey group mb-6 self-start px-4 py-2"
        >
          <ArrowLeft size={14} className="transition-transform" />
          Ana Sayfaya Dön
        </Link>
        <TicketCard ticket={view.ticket} event={view.event} coords={coords} />
        
        <p className="mt-6 text-center text-xs font-semibold text-soluk">
          {KULUP.tamAd}
        </p>
      </div>
    </div>
  );
}
