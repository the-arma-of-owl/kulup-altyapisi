"use client";

import { usePathname } from 'next/navigation';
import { WhatsAppIcon, InstagramIcon, DEFAULT_INSTAGRAM } from './SocialIcons';
import { isReadingPage } from '@/lib/readingPages';
import { isLinkPage } from '@/lib/linkPage';

interface FloatingSocialsProps {
  whatsappUrl?: string | null;
  instagramUrl?: string | null;
  enabled?: boolean | null;
}

// Sol kenarda sabit kutular; CMS'te bağlantısı boş olan kutu hiç çizilmez.
export default function FloatingSocials({ whatsappUrl, instagramUrl, enabled }: FloatingSocialsProps) {
  const pathname = usePathname();
  const wa = whatsappUrl?.trim();
  const ig = (instagramUrl === undefined ? DEFAULT_INSTAGRAM : instagramUrl)?.trim();

  if (enabled === false || (!wa && !ig)) return null;
  if (pathname.includes('/ticket') || pathname.includes('/staff') || pathname.includes('/sahne/') || isLinkPage(pathname)) return null;
  if (isReadingPage(pathname)) return null; // okuma sayfalarında dikkat dağıtmasın

  const base =
    'grid place-items-center w-12 h-12 text-white rounded-full border border-kenar shadow-sert-sm transition-transform ';

  return (
    <div className="fixed bottom-4 md:bottom-6 left-4 md:left-6 z-[90] flex flex-col gap-2 print:hidden">
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" title="WhatsApp" className={`${base} bg-[#25D366]`}>
          <WhatsAppIcon className="w-6 h-6" />
        </a>
      )}
      {ig && (
        <a
          href={ig}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          title="Instagram"
          className={`${base} bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]`}
        >
          <InstagramIcon className="w-6 h-6" />
        </a>
      )}
    </div>
  );
}
