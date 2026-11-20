'use client';

import React, { useEffect, useState, useRef } from 'react';
import { WhatsAppIcon, DEFAULT_INSTAGRAM } from '@/components/layout/SocialIcons';
import { Trophy, Instagram, ArrowRight, Plus, Linkedin, BookOpen } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getMediaUrl } from '@/lib/api';
import { homepageFaqs } from '@/lib/faq';
import { KULUP } from '@/lib/kulup';
import { Bolum, Cikartma, RENK_BG, RENK_SIRASI } from '@/components/kit';
import { cn } from '@/lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    instgrm: any;
  }
}

const TumuLink = ({ href }: { href: string }) => (
  <Link href={href} className="dugme dugme-yuzey">Tümü <ArrowRight className="h-4 w-4" /></Link>
);

export function BlogPreviewSection({ posts = [] }: { posts?: any[] }) {
  if (!posts || posts.length === 0) return null;

  return (
    <Bolum ust="Son yazılar" baslik="Blog & Writeup" sag={<TumuLink href="/blog" />}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {posts.map((post, idx) => {
          const imageUrl = getMediaUrl(post.coverImage);
          const renk = RENK_SIRASI[(idx + 2) % RENK_SIRASI.length];
          return (
            <Link key={idx} href={`/blog/${post.slug || post.id}`} className="kart kart-hover group flex flex-col overflow-hidden sm:flex-row">
              <div className={cn('relative h-48 shrink-0 overflow-hidden border-b-2 border-kenar sm:h-auto sm:w-48 sm:border-b-0 sm:border-r-2', RENK_BG[renk])}>
                {imageUrl ? (
                  <img src={imageUrl} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" alt={post.title} />
                ) : (
                  <div className="grid h-full place-items-center"><BookOpen className="h-10 w-10" /></div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between gap-4 p-6">
                <div className="space-y-2">
                  <p className="ust-baslik">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('tr-TR') : 'Yeni'}</p>
                  <h3 className="font-display text-xl font-extrabold leading-tight text-murekkep">{post.title}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-ana-yazi">
                  Devamını oku <ArrowRight className="h-4 w-4 transition-transform " />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Bolum>
  );
}

export function GalleryPreviewSection({ galleryItems = [] }: { galleryItems?: any[] }) {
  const items = (galleryItems || []).slice(0, 6).map((item) => {
    const media = item.media || item.image;
    const url = getMediaUrl(media);
    const isVideo = media?.mimeType?.startsWith('video/') || (typeof url === 'string' && url.endsWith('.mp4'));
    return { url, isVideo, title: item.title || '' };
  }).filter((item) => item.url);
  if (items.length === 0) return null;

  return (
    <Bolum ust="Galeri" baslik="Etkinliklerimizden">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {items.map((item, idx) => (
          <figure key={idx} style={{ rotate: `${idx % 2 ? 1.2 : -1.2}deg` }} className="kart relative aspect-[4/3] overflow-hidden">
            {item.isVideo ? (
              <video src={item.url} autoPlay loop muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={item.url} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            )}
            {item.title && (
              <figcaption className="absolute bottom-3 left-3 right-3 truncate rounded-xl border border-kenar bg-yuzey px-3 py-1.5 font-display text-sm font-bold text-murekkep">{item.title}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </Bolum>
  );
}

// "Hakkımızda" metni CMS → Site Ayarları → aboutUsText alanından gelir; boşsa kulup.config.json'daki açıklama.
export function ManifestoSection({ aboutText }: { aboutText?: string | null }) {
  const paragraphs = String(aboutText || KULUP.aciklama).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-kenar bg-ana px-6 py-12 text-white shadow-sert-lg sm:px-12 sm:py-16">
        <div className="absolute right-6 top-6 hidden md:block"><Cikartma renk="limon" aci={6}>Merhaba 👋</Cikartma></div>
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-white/80">Hakkımızda</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Biz kimiz?</h2>
        <div className="mt-6 max-w-3xl space-y-4 text-lg leading-relaxed text-white/90">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/basvuru/uye-ol" className="dugme dugme-limon dugme-buyuk group">
            Üye Ol <ArrowRight className="h-5 w-5 transition-transform " />
          </Link>
          <Link href="/basvuru/core-team" className="dugme dugme-yuzey dugme-buyuk">Yönetim Ekibine Katıl</Link>
        </div>
      </div>
    </section>
  );
}

// Başarılar şeridi hızı (px/sn): başarı sayısından ve ekran genişliğinden bağımsız sabit
const ACHIEVEMENT_SPEED = 45;

export function AchievementsPreviewSection({ achievements = [] }: { achievements?: any[] }) {
  // Ölçüme dayalı döngü: bir kopyanın genişliği ölçülür, ekranı dolduracak kadar kopya konur ve
  // şerit tam bir kopya kadar kaydırılır → dikişsiz, hız sabit.
  const boxRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ copyWidth: 0, copies: 2 });

  useEffect(() => {
    const box = boxRef.current;
    const copy = copyRef.current;
    if (!box || !copy) return;
    const measure = () => {
      const copyWidth = copy.getBoundingClientRect().width;
      if (!copyWidth) return;
      const copies = Math.max(2, Math.ceil(box.clientWidth / copyWidth) + 1);
      setMetrics((m) => (Math.abs(m.copyWidth - copyWidth) < 0.5 && m.copies === copies ? m : { copyWidth, copies }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [achievements.length]);

  const renderCard = (item: any, idx: number) => {
    const descText = item.summary ||
      (item.description && typeof item.description === 'string' ? item.description : '') ||
      '';
    const imageUrl = getMediaUrl(item.image || item.coverImage);
    const renk = RENK_SIRASI[idx % RENK_SIRASI.length];
    return (
      <Link key={idx} href={`/basarilar/${item.slug || item.id}`} className="kart kart-hover group flex h-[380px] w-[78vw] max-w-sm shrink-0 flex-col overflow-hidden md:w-80">
        <div className={cn('relative h-40 shrink-0 overflow-hidden border-b-2 border-kenar', RENK_BG[renk])}>
          {imageUrl ? (
            <img src={imageUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="grid h-full place-items-center"><Trophy className="h-12 w-12" /></div>
          )}
          {item.date && <span className="rozet absolute left-3 top-3 bg-yuzey text-murekkep">{new Date(item.date).getFullYear()}</span>}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className="line-clamp-2 font-display text-xl font-extrabold leading-tight text-murekkep">{item.title}</h3>
          {descText ? <p className="line-clamp-3 text-sm leading-relaxed text-soluk">{descText}</p> : null}
        </div>
      </Link>
    );
  };

  if (!achievements || achievements.length === 0) return null;

  const { copyWidth, copies } = metrics;
  const trackStyle = copyWidth
    ? ({ '--marquee-shift': `-${copyWidth}px`, animationDuration: `${copyWidth / ACHIEVEMENT_SPEED}s` } as React.CSSProperties)
    : undefined;

  return (
    <section className="overflow-hidden py-12 sm:py-16">
      <div className="mx-auto mb-8 flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          <p className="ust-baslik mb-2">Gurur tablomuz</p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">Başarılarımız</h2>
        </div>
        <TumuLink href="/basarilar" />
      </div>
      <div ref={boxRef} className="byt-marquee relative w-full overflow-hidden">
        <div className={copyWidth ? 'byt-marquee__track is-running' : 'byt-marquee__track'} style={trackStyle}>
          {Array.from({ length: copies }, (_, c) => (
            // Kopyalar arası boşluk (pr) ölçülen genişliğe dahil → döngü dikişsiz
            <div key={c} ref={c === 0 ? copyRef : undefined} aria-hidden={c > 0 || undefined} className="flex gap-6 py-3 pl-1 pr-6">
              {achievements.map((item, idx) => renderCard(item, idx))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQPreviewSection({ faqs = [] }: { faqs?: any[] }) {
  if (!faqs || faqs.length === 0) return null;

  // CMS'te "Anasayfada göster" işaretli sorular (liste sırasıyla); hiç yoksa ilk 4 soru.
  // (Rastgele seçim sunucu/tarayıcı farkından hydration hatası verir.)
  const preview = homepageFaqs(faqs);

  return (
    <Bolum ust="SSS" baslik="Merak edilenler" sag={<TumuLink href="/sss" />} icerikSinif="max-w-4xl">
      <div className="space-y-3">
        {preview.map((item: any, idx: number) => (
          <details key={idx} className="kart group overflow-hidden">
            <summary className="flex cursor-pointer select-none list-none items-center gap-4 p-5 [&::-webkit-details-marker]:hidden">
              <span className="flex-1 font-display text-lg font-bold text-murekkep">{item.question}</span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep transition-transform duration-200 group-open:rotate-45">
                <Plus className="h-5 w-5" />
              </span>
            </summary>
            <div className="border-t-2 border-kenar px-5 py-4 leading-relaxed text-soluk">{item.answer}</div>
          </details>
        ))}
      </div>
    </Bolum>
  );
}

type SocialSettings = {
  instagramUrl?: string | null;
  whatsappUrl?: string | null;
  linkedinUrl?: string | null;
  showLinkedin?: boolean | null;
};

// CMS'te boş bırakılan bağlantının butonu gösterilmez; LinkedIn ayrıca aç/kapa ile yönetilir
export function SocialSection({ settings }: { settings?: SocialSettings }) {
  const instagramUrl = (settings?.instagramUrl === undefined ? DEFAULT_INSTAGRAM : settings.instagramUrl)?.trim();
  const whatsappUrl = settings?.whatsappUrl?.trim();
  const linkedinUrl = settings?.showLinkedin ? settings?.linkedinUrl?.trim() : '';
  if (!instagramUrl && !whatsappUrl && !linkedinUrl) return null;

  const items = [
    instagramUrl && { href: instagramUrl, label: 'Instagram', Icon: Instagram, renk: 'pembe' as const },
    whatsappUrl && { href: whatsappUrl, label: 'WhatsApp', Icon: WhatsAppIcon, renk: 'nane' as const },
    linkedinUrl && { href: linkedinUrl, label: 'LinkedIn', Icon: Linkedin, renk: 'gok' as const },
  ].filter(Boolean) as { href: string; label: string; Icon: React.ComponentType<{ className?: string }>; renk: 'pembe' | 'nane' | 'gok' }[];

  return (
    <Bolum icerikSinif="text-center">
      <h2 className="font-display text-4xl font-extrabold tracking-tight text-murekkep sm:text-6xl">Bizi takip et!</h2>
      <p className="mx-auto mt-4 max-w-xl text-lg text-soluk">Etkinlik duyuruları ve topluluktan haberler için sosyal medya hesaplarımıza göz at.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {items.map(({ href, label, Icon, renk }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={cn('dugme dugme-buyuk', RENK_BG[renk])}>
            <Icon className="h-5 w-5" /> {label}
          </a>
        ))}
      </div>
    </Bolum>
  );
}
