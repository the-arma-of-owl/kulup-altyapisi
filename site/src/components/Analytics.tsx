"use client";

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { disableAnalytics, flush, track, type AnalyticsEntity } from '@/lib/analytics';

// Layout'a bir kez eklenir: her sayfa görüntülemesini sayar, sekme gizlenince/kapanınca kuyruğu gönderir,
// `data-track-cta` işaretli bağlantı tıklamalarını sayar. Çerez kullanmaz.
export default function Analytics({ enabled = true }: { enabled?: boolean | null }) {
  const pathname = usePathname();
  // CMS → Site Ayarları → "Ziyaretçi istatistikleri toplansın" kapalıysa hiçbir şey gönderilmez.
  // Alt bileşenlerin (TrackView, form kancaları) efektleri bundan önce çalıştığı için render sırasında kapatılır.
  if (enabled === false) disableAnalytics();

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) track('pageview'); };
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.<HTMLElement>('[data-track-cta]');
      if (!el) return;
      const entityId = Number(el.dataset.entityId);
      track('cta_click', {
        entityType: el.dataset.entityType as AnalyticsEntity['entityType'],
        entityId: Number.isSafeInteger(entityId) && entityId > 0 ? entityId : undefined,
        meta: { cta: el.dataset.trackCta || 'cta' },
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  useEffect(() => {
    const send = () => track('pageview');
    // Tarayıcı sayfayı önceden işliyorsa (prerender) gerçekten açılana kadar sayma
    const doc = document as Document & { prerendering?: boolean };
    if (doc.prerendering) {
      document.addEventListener('prerenderingchange', send, { once: true });
      return () => document.removeEventListener('prerenderingchange', send);
    }
    send();
  }, [pathname]);

  return null;
}

/** Sunucu sayfalarına konur: o sayfanın varlığını (örn. etkinlik) bir kez sayar. */
export function TrackView({ entityType, entityId }: Required<AnalyticsEntity>) {
  useEffect(() => {
    if (entityId) track(entityType === 'event' ? 'event_view' : 'pageview', { entityType, entityId });
  }, [entityType, entityId]);
  return null;
}

/**
 * Form hunisi: form ekranda görünür olunca `form_open`, ilk alana odaklanınca `form_start`,
 * başarılı gönderimde `submitted()` → `form_submit` (hemen gönderilir).
 * Kullanım: const t = useFormTracking('event', { entityType: 'event', entityId });
 *           <form ref={t.ref} onFocusCapture={t.onFocusCapture}> ... t.submitted()
 */
export function useFormTracking(form: string, entity: AnalyticsEntity = {}) {
  const started = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const { entityType, entityId } = entity;

  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let opened = false;
    observer.current = new IntersectionObserver((entries) => {
      if (opened || !entries.some((e) => e.isIntersecting)) return;
      opened = true;
      track('form_open', { entityType, entityId, meta: { form } });
      observer.current?.disconnect();
    }, { threshold: 0.2 });
    observer.current.observe(node);
  }, [form, entityType, entityId]);

  const onFocusCapture = useCallback(() => {
    if (started.current) return;
    started.current = true;
    track('form_start', { entityType, entityId, meta: { form } });
  }, [form, entityType, entityId]);

  const submitted = useCallback(() => {
    started.current = false;
    track('form_submit', { entityType, entityId, meta: { form }, flush: true });
  }, [form, entityType, entityId]);

  return { ref, onFocusCapture, submitted };
}
