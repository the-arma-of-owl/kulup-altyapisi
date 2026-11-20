'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Menu, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import { CATEGORY_MAP } from '@/lib/categoryMap';
import { RENK_BG, RENK_SIRASI } from '@/components/kit';

interface GuideItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt?: string;
  renderedContent?: React.ReactNode;
  relatedPosts?: any[];
}

interface Props {
  items: GuideItem[];
}

export default function UniversityGuideClient({ items }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mevcut kategorileri topla
  const availableCategories = Array.from(new Set(items.map(item => item.category)));

  const filteredItems = activeCategory === 'all' 
    ? items 
    : items.filter(item => item.category === activeCategory);

  const kategoriSinif = (isActive: boolean) => cn(
    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left font-display font-bold transition-[transform,box-shadow,background-color] duration-150",
    isActive
      ? "border-kenar bg-limon text-murekkep shadow-sert-sm"
      : "border-transparent text-soluk hover:border-kenar hover:bg-yuzey hover:text-murekkep"
  );

  return (
    <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row lg:gap-10">

      {/* Mobile Category Toggle */}
      <div className="kart relative z-40 flex w-full items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2 font-display font-bold text-murekkep">
          {activeCategory === 'all' ? (
            <>
              <BookOpen className="shrink-0 text-ana-yazi" size={20} />
              Tüm Kategoriler
            </>
          ) : (
            <>
              {React.createElement(CATEGORY_MAP[activeCategory]?.icon || BookOpen, {
                className: 'shrink-0 text-ana-yazi',
                size: 20
              })}
              <span className="truncate">{CATEGORY_MAP[activeCategory]?.label}</span>
            </>
          )}
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep shadow-sert-sm transition-transform active:shadow-none">
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <div className={cn(
        "z-30 shrink-0 flex-col gap-1.5 lg:flex lg:w-64",
        mobileMenuOpen ? "kart -mt-3 flex p-3" : "hidden",
        "lg:sticky lg:top-28 lg:mt-0 lg:self-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
      )}>
        <h3 className="ust-baslik mb-3 hidden px-4 lg:block">İçerik Filtresi</h3>

        <button
          onClick={() => { setActiveCategory('all'); setMobileMenuOpen(false); }}
          className={kategoriSinif(activeCategory === 'all')}
        >
          <BookOpen size={20} />
          Tümünü Gör
        </button>

        {availableCategories.map(catKey => {
          const cat = CATEGORY_MAP[catKey];
          if (!cat) return null;
          const Icon = cat.icon;
          const isActive = activeCategory === catKey;

          return (
            <button
              key={catKey}
              onClick={() => { setActiveCategory(catKey); setMobileMenuOpen(false); }}
              className={kategoriSinif(isActive)}
            >
              <Icon size={20} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Content Feed / Cards */}
      <div className="min-w-0 flex-1">
        {filteredItems.length === 0 ? (
          <div className="kart flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-kenar bg-limon text-murekkep shadow-sert-sm">
              <BookOpen className="h-7 w-7" />
            </div>
            <h3 className="font-display text-xl font-extrabold text-murekkep">Bu kategoride henüz içerik bulunmuyor.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item, idx) => {
                const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP['ders'];
                const Icon = cat.icon;
                const renk = RENK_SIRASI[idx % RENK_SIRASI.length];

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link
                      href={`/universitede-yeniyim/${item.slug}`}
                      className="kart kart-hover group relative flex h-full flex-col gap-4 p-6"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-kenar shadow-sert-sm', RENK_BG[renk])}>
                          <Icon size={20} />
                        </div>
                        <span className="ust-baslik">
                          {cat.label}
                        </span>
                      </div>

                      <h3 className="font-display text-xl font-extrabold leading-tight text-murekkep">
                        {item.title}
                      </h3>

                      <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-soluk">
                        {item.excerpt}
                      </p>

                      <span className="mt-auto inline-flex items-center gap-1.5 font-display text-sm font-bold text-ana-yazi">
                        Devamını Oku <ArrowRight className="h-4 w-4 transition-transform " />
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

    </div>
  );
}
