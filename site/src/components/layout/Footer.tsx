"use client";

import { KULUP } from '@/lib/kulup';
import React from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Linkedin, ArrowUp, ArrowUpRight, Download } from 'lucide-react';
import { WhatsAppIcon, InstagramIcon, DEFAULT_INSTAGRAM } from './SocialIcons';
import { useInstallState, promptInstall, IOS_HINT_EVENT } from '@/lib/installPrompt';

import { usePathname } from 'next/navigation';
import { isLinkPage } from '@/lib/linkPage';

interface FooterProps {
  siteSettings?: {
    footerEmails?: Array<{ email: string }>;
    instagramUrl?: string | null;
    whatsappUrl?: string | null;
    linkedinUrl?: string | null;
    showLinkedin?: boolean | null;
  };
}

const PAGE_LINKS = [
  { href: '/etkinlikler', label: 'Etkinlikler' },
  { href: '/blog', label: 'Blog' },
  { href: '/takim', label: 'Takım' },
  { href: '/universitede-yeniyim', label: 'Üniversitede Yeniyim' },
  { href: '/sss', label: 'SSS' },
];

const APPLY_LINKS = [
  { href: '/basvuru/uye-ol', label: 'Üye Ol' },
  { href: '/basvuru/core-team', label: 'Core Team' },
  { href: '/sertifika', label: 'Sertifika Doğrula' },
];

// CMS'e ulaşılamazsa (Site Ayarları → Footer İletişim E-Postaları boşsa da) gösterilir
const DEFAULT_EMAILS: string[] = [];

// Footer her iki temada da koyu mürekkep zemin üzerinde krem yazı kullanır.
export default function Footer({ siteSettings }: FooterProps) {
  const pathname = usePathname();
  const install = useInstallState();

  if (
    pathname.includes('/ticket') ||
    pathname.includes('/staff') ||
    pathname.includes('/sahne/') ||
    isLinkPage(pathname)
  ) return null;

  // CMS'te boş bırakılan (ya da LinkedIn için kapalı) bağlantı gösterilmez
  const socials = [
    { href: (siteSettings?.instagramUrl === undefined ? DEFAULT_INSTAGRAM : siteSettings.instagramUrl)?.trim(), label: 'Instagram', Icon: InstagramIcon },
    { href: siteSettings?.whatsappUrl?.trim(), label: 'WhatsApp', Icon: WhatsAppIcon },
    { href: siteSettings?.showLinkedin ? siteSettings?.linkedinUrl?.trim() : '', label: 'LinkedIn', Icon: Linkedin },
  ].filter((item): item is typeof item & { href: string } => !!item.href);

  const emails = siteSettings?.footerEmails?.length
    ? siteSettings.footerEmails.map((item) => item.email)
    : DEFAULT_EMAILS;

  const linkClass = 'text-soluk hover:text-murekkep transition-colors';
  const headingClass = 'font-display text-xs font-medium uppercase tracking-[0.14em] text-soluk mb-4';

  return (
    <footer className="mt-16 px-4 pb-4 sm:px-6 sm:pb-6">
      {/* Katılım çağrısı */}
      <div className="relative z-10 mx-auto -mb-10 max-w-6xl">
        <div className="kart flex flex-col items-start justify-between gap-5 p-6 text-murekkep sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Sen de aramıza katıl!</p>
            <p className="mt-1 text-soluk">{KULUP.slogan}</p>
          </div>
          <Link href="/basvuru/uye-ol" className="dugme dugme-ana dugme-buyuk shrink-0">
            Üye Ol <ArrowUpRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-kenar bg-yuzey text-murekkep">
        <div className="mx-auto max-w-6xl px-6 pb-6 pt-20 sm:px-8">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-kenar bg-white">
                  <Image src="/logo.png" alt="" width={96} height={96} className="h-full w-full object-cover" />
                </span>
                <span className="font-display text-2xl font-extrabold">{KULUP.kisaAd}</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-soluk">{KULUP.tamAd}</p>
              {socials.length > 0 && (
                <div className="mt-5 flex gap-2">
                  {socials.map(({ href, label, Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
                      className="grid h-10 w-10 place-items-center rounded-full border border-kenar transition-colors hover:bg-zemin-2">
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <nav aria-label="Sayfalar">
              <h4 className={headingClass}>Sayfalar</h4>
              <ul className="space-y-2.5 font-medium">
                {PAGE_LINKS.map((l) => <li key={l.href}><Link href={l.href} className={linkClass}>{l.label}</Link></li>)}
              </ul>
            </nav>
            <nav aria-label="Başvuru">
              <h4 className={headingClass}>Başvuru</h4>
              <ul className="space-y-2.5 font-medium">
                {APPLY_LINKS.map((l) => <li key={l.href}><Link href={l.href} className={linkClass}>{l.label}</Link></li>)}
              </ul>
            </nav>
            <div className="col-span-2 md:col-span-1">
              <h4 className={headingClass}>İletişim</h4>
              <ul className="space-y-2.5 font-medium">
                <li><Link href="/iletisim" className={linkClass}>İletişim Sayfası</Link></li>
                {emails.map((email) => (
                  <li key={email}>
                    <a href={`mailto:${email}`} className={linkClass}>
                      {email.split('@')[0]}<wbr />@{email.split('@').slice(1).join('@')}
                    </a>
                  </li>
                ))}
                <li className="text-sm text-soluk">{KULUP.universite}, {KULUP.sehir}</li>
              </ul>
            </div>
          </div>

          {/* Dev kısa ad */}
          <p aria-hidden="true" className="pointer-events-none mt-10 select-none text-center font-display text-[26vw] font-extrabold leading-[0.8] tracking-normal text-transparent [-webkit-text-stroke:1px_var(--k-kenar)] md:text-[18vw] xl:text-[15rem]">
            {KULUP.kisaAd}
          </p>

          <div className="mt-8 flex flex-col gap-4 border-t border-kenar pt-6 text-sm md:flex-row md:items-center md:justify-between">
            <span className="text-soluk">© {new Date().getFullYear()} {KULUP.tamAd}</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-soluk">
              <Link href="/gizlilik" className="hover:text-murekkep">Gizlilik</Link>
              <Link href="/kvkk" className="hover:text-murekkep">KVKK</Link>
              {install.mode !== 'none' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (install.mode === 'ios') window.dispatchEvent(new Event(IOS_HINT_EVENT));
                    else await promptInstall();
                  }}
                  className="inline-flex items-center gap-1.5 hover:text-murekkep"
                >
                  <Download className="h-4 w-4" /> Uygulamayı Yükle
                </button>
              )}
              <a href="https://github.com/the-arma-of-owl" target="_blank" rel="noopener noreferrer" className="hover:text-murekkep">
                Efe Çam tarafından ❤️ ile kodlandı
              </a>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="grid h-9 w-9 place-items-center rounded-full border border-kenar transition-colors hover:bg-zemin-2"
                title="Başa Dön"
                aria-label="Başa dön"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
