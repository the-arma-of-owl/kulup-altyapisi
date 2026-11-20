import { KULUP } from '@/lib/kulup';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import NotFoundContent from '@/components/NotFoundContent';
import { ThemeProvider } from '@/components/ThemeProvider';
import { fetchSiteSettings } from '@/lib/api';
import { routing } from '@/i18n/routing';
import messages from '@/messages/tr.json';
import { fontVariables } from './fonts';
import './globals.css';

/**
 * Sitenin 404 sayfası (next.config: experimental.globalNotFound).
 * Kök layout `[locale]` dinamik segmentinde olduğu için normal not-found.tsx sunucuda
 * render edilemiyor (Next yedek sayfaya düşüyordu); Next bu durum için global-not-found öneriyor.
 * Hem eşleşmeyen adresleri hem de sayfalardaki notFound() çağrılarını karşılar.
 * Layout'u atladığı için [locale]/layout.tsx'teki sarmalayıcılar burada tekrar kurulur.
 */
export const metadata: Metadata = {
  title: `404 · Sayfa bulunamadı | ${KULUP.kisaAd}`,
  description: 'Aradığınız sayfa bulunamadı.',
  robots: { index: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Sitenin kendi koyu teması var: telefon tarayıcılarının (Chrome/Samsung) sayfayı
  // zorla koyulaştırıp yarı saydam kutuları bozmasını engeller.
  colorScheme: 'light dark',
};

export default async function GlobalNotFound() {
  const siteSettings = await fetchSiteSettings();

  return (
    <html lang={routing.defaultLocale} suppressHydrationWarning className={fontVariables} style={{ ['--kulup-ana' as string]: KULUP.tema.anaRenk, ['--kulup-ikinci' as string]: KULUP.tema.ikinciRenk }}>
      <body suppressHydrationWarning className="min-h-screen bg-zemin font-sans text-murekkep antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
            <Navbar />
            <NotFoundContent />
            <Footer siteSettings={siteSettings} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
