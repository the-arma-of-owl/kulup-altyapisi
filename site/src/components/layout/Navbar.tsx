"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { Menu, X, ChevronDown, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import Marquee from './Marquee';
import { isLinkPage } from '@/lib/linkPage';
import { KULUP } from '@/lib/kulup';
import { RENK_BG, RENK_SIRASI } from '@/components/kit';

type NavLink = { name: string; href?: string; dropdown?: { name: string; href: string }[] };

const ADMIN_URL = `${process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'}/admin`;

// Akış içinde yapışkan (sticky) üst menü: sayfalar ekstra üst boşluk bırakmaz.
export default function Navbar({ marqueeText }: { marqueeText?: string | null }) {
  const t = useTranslations();
  const pathname = usePathname();
  const showMarquee = pathname === '/' && !!marqueeText?.trim();
  const [isOpen, setIsOpen] = useState(false);
  // Açılır menüler state ile: fareyle üzerine gelince VE tıklayınca açılır (dokunmatik cihazlar için).
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownsRef = useRef<HTMLDivElement>(null);
  const lastPointerType = useRef<string>('mouse');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpenDropdown(null);
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openDropdown) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!dropdownsRef.current?.contains(e.target as Node)) setOpenDropdown(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDropdown(null); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openDropdown]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Mobil menü açıkken sayfa kaymasın
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const navLinks: NavLink[] = [
    { name: t('nav.events'), href: '/etkinlikler' },
    { name: 'Üniversitede Yeniyim', href: '/universitede-yeniyim' },
    { name: t('nav.blog'), href: '/blog' },
    { name: t('nav.team'), href: '/takim' },
    {
      name: t('nav.apply'),
      dropdown: [
        { name: 'Üye Ol', href: '/basvuru/uye-ol' },
        { name: 'Core Team', href: '/basvuru/core-team' },
      ],
    },
    {
      name: 'Daha Fazla',
      dropdown: [
        { name: t('nav.achievements'), href: '/basarilar' },
        { name: 'SSS', href: '/sss' },
        { name: 'İletişim', href: '/iletisim' },
        { name: 'Sertifika Doğrula', href: '/sertifika' },
        { name: 'Hall of Fame', href: '/ekstralar/hof' },
        { name: 'KVKK', href: '/kvkk' },
        { name: 'Gizlilik', href: '/gizlilik' },
      ],
    },
  ];

  if (
    pathname.includes('/ticket') ||
    pathname.includes('/staff') ||
    pathname.includes('/sahne/') ||
    isLinkPage(pathname)
  ) return null;

  const isActive = (href?: string) => !!href && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      {showMarquee && (
        <div className="border-b border-kenar bg-yuzey py-2 text-xs font-medium tracking-wide text-soluk">
          <Marquee text={marqueeText!} />
        </div>
      )}

      <header
        className={cn(
          'sticky top-0 z-[100] border-b-2 transition-colors duration-200',
          scrolled || isOpen ? 'border-kenar bg-zemin/95 backdrop-blur-md' : 'border-transparent bg-zemin',
        )}
      >
        <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Logo */}
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label={`${KULUP.kisaAd} ana sayfa`}>
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-kenar bg-yuzey shadow-sert-sm transition-transform ">
              <Image src="/logo.png" alt="" width={88} height={88} className="h-full w-full object-cover" priority />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight text-murekkep">{KULUP.kisaAd}</span>
          </Link>

          {/* Masaüstü bağlantılar */}
          <div ref={dropdownsRef} className="hidden flex-1 items-center justify-center gap-1 xl:flex">
            {navLinks.map((link) => (
              <div
                key={link.name}
                className="relative"
                onPointerEnter={link.dropdown ? (e) => { if (e.pointerType === 'mouse') setOpenDropdown(link.name); } : undefined}
                onPointerLeave={link.dropdown ? (e) => { if (e.pointerType === 'mouse') setOpenDropdown((cur) => (cur === link.name ? null : cur)); } : undefined}
              >
                {link.dropdown ? (
                  <button
                    type="button"
                    aria-expanded={openDropdown === link.name}
                    aria-haspopup="true"
                    onPointerDown={(e) => { lastPointerType.current = e.pointerType; }}
                    onClick={() => setOpenDropdown((cur) => (cur === link.name && lastPointerType.current !== 'mouse' ? null : link.name))}
                    className={cn(
                      'flex items-center gap-1 whitespace-nowrap rounded-full border px-3.5 py-1.5 font-display text-[15px] font-bold transition-colors',
                      openDropdown === link.name || link.dropdown.some((d) => isActive(d.href))
                        ? 'border-kenar bg-yuzey text-murekkep'
                        : 'border-transparent text-murekkep/80 hover:border-kenar hover:bg-yuzey hover:text-murekkep',
                    )}
                  >
                    {link.name}
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', openDropdown === link.name && 'rotate-180')} />
                  </button>
                ) : (
                  <Link
                    href={link.href!}
                    className={cn(
                      'block whitespace-nowrap rounded-full border px-3.5 py-1.5 font-display text-[15px] font-bold transition-colors',
                      isActive(link.href)
                        ? 'border-kenar bg-ana text-white shadow-sert-sm'
                        : 'border-transparent text-murekkep/80 hover:border-kenar hover:bg-yuzey hover:text-murekkep',
                    )}
                  >
                    {link.name}
                  </Link>
                )}
                {link.dropdown && (
                  <div
                    className={cn(
                      'absolute left-1/2 top-full z-[100] -translate-x-1/2 pt-3 transition-all duration-150',
                      openDropdown === link.name ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
                    )}
                  >
                    <div className="kart flex w-56 flex-col gap-1 p-2">
                      {link.dropdown.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setOpenDropdown(null)}
                          className={cn(
                            'rounded-xl border border-transparent px-3 py-2 font-display text-sm font-bold transition-colors hover:border-kenar hover:bg-limon hover:text-murekkep',
                            isActive(sub.href) && 'border-kenar bg-limon text-murekkep',
                          )}
                        >
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sağ taraf */}
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <a
              href={ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="dugme dugme-yuzey hidden px-4 py-2 sm:inline-flex"
            >
              {t('nav.login')} <ArrowUpRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? 'Menüyü kapat' : 'Menüyü aç'}
              aria-expanded={isOpen}
              className="grid h-11 w-11 place-items-center rounded-full border border-kenar bg-limon text-murekkep shadow-sert-sm transition-transform active:shadow-none xl:hidden"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobil menü */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 top-[72px] z-[90] overflow-y-auto bg-zemin px-4 pb-10 pt-6 xl:hidden"
          >
            <div className="mx-auto flex max-w-lg flex-col gap-3">
              <Link href="/" onClick={() => setIsOpen(false)} className={cn('kart kart-hover px-5 py-4 font-display text-2xl font-extrabold', RENK_BG.ana)}>
                Ana Sayfa
              </Link>
              {navLinks.filter((l) => !l.dropdown).map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href!}
                  onClick={() => setIsOpen(false)}
                  className={cn('kart kart-hover px-5 py-4 font-display text-2xl font-extrabold', RENK_BG[RENK_SIRASI[i % RENK_SIRASI.length]])}
                >
                  {link.name}
                </Link>
              ))}
              {navLinks.filter((l) => l.dropdown).map((link) => (
                <div key={link.name} className="kart p-4">
                  <p className="ust-baslik mb-3">{link.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {link.dropdown!.map((sub) => (
                      <Link key={sub.href} href={sub.href} onClick={() => setIsOpen(false)} className="dugme dugme-yuzey px-4 py-2">
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer" onClick={() => setIsOpen(false)} className="dugme dugme-yuzey mt-2 self-start sm:hidden">
                {t('nav.login')} <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
