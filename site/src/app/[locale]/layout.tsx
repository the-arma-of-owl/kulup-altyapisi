import { KULUP } from '@/lib/kulup';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import Navbar from '@/components/layout/Navbar';
import NavProgress from '@/components/layout/NavProgress';
import FloatingSocials from '@/components/layout/FloatingSocials';
import InstallAppPrompt from '@/components/layout/InstallAppPrompt';
import Footer from '@/components/layout/Footer';
import { fetchSiteSettings } from '@/lib/api';
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from '@/lib/seo';
import { ThemeProvider } from '@/components/ThemeProvider';
import StagingBanner from '@/components/StagingBanner';
import Analytics from '@/components/Analytics';

// CMS'e ulaşılamazsa kullanılır; CMS'te alan boş bırakılırsa bant hiç gösterilmez
const DEFAULT_MARQUEE = `${KULUP.tamAd} Etkinliklerine Katıl! • Yeni Dönem Kayıtları Başladı! •`;
import { Metadata, Viewport } from 'next';
import { fontVariables } from '../fonts';
import '../globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Sitenin kendi koyu teması var: telefon tarayıcılarının (Chrome/Samsung) sayfayı
  // zorla koyulaştırıp yarı saydam kutuları bozmasını engeller.
  colorScheme: 'light dark',
};

// Bağlantı önizlemesi: her sayfa kendi başlık/açıklama/og:url/görselini src/lib/seo.ts ile verir;
// buradakiler metadata vermeyen sayfalar için varsayılandır (og:url yok: yanlış sayfayı göstermesin).
export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_BYT_STAGING === '1' ? { robots: { index: false, follow: false } } : {}),
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${KULUP.kisaAd}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: `${KULUP.kisaAd}`,
  keywords: `${KULUP.universite}, Yazılım, Bilişim, Topluluk, ${KULUP.kisaAd}, Teknoloji, ${KULUP.tamAd}, ${KULUP.sehir}`,
  openGraph: {
    type: 'website',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    siteName: SITE_NAME,
    locale: 'tr_TR',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE.url, alt: DEFAULT_OG_IMAGE.alt }],
  },
};

// Sayfalar statik üretilip (ISR) önbellekten sunulsun: ziyaretçi her tıklamada ABD'deki
// fonksiyonu → CMS'i → veritabanını beklemesin. CMS verisi fetch'lerdeki revalidate (60 sn)
// ile arka planda yenilenir.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const { locale } = await params;
  
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }
  setRequestLocale(locale);
 
  const messages = await getMessages();
  const siteSettings = await fetchSiteSettings();
 
  return (
    <html lang={locale} suppressHydrationWarning className={fontVariables} style={{ ['--kulup-ana' as string]: KULUP.tema.anaRenk, ['--kulup-ikinci' as string]: KULUP.tema.ikinciRenk }}>
      <body suppressHydrationWarning className="min-h-screen bg-zemin font-sans text-murekkep antialiased">
        {/* "Uygulamayı yükle" olayı sayfa hidrasyonundan önce gelebilir; erkenden yakala */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bytInstallEvent=e;window.dispatchEvent(new Event('byt:install-ready'))});",
          }}
        />
        <StagingBanner />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <NextIntlClientProvider messages={messages}>
            <NavProgress />
            <Navbar marqueeText={siteSettings?.marqueeText === undefined ? DEFAULT_MARQUEE : siteSettings.marqueeText} />
            {children}
            <Footer siteSettings={siteSettings} />
            <FloatingSocials
              whatsappUrl={siteSettings?.whatsappUrl}
              instagramUrl={siteSettings?.instagramUrl}
              enabled={siteSettings?.showFloatingSocials}
            />
            <InstallAppPrompt />
            <Analytics enabled={siteSettings?.analyticsEnabled} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
