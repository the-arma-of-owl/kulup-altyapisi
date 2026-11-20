"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sayfa geçişi göstergesi — iç bir linke tıklandığı anda üstte ince bir çubuk başlar,
 * yeni sayfa gelince tamamlanır. Sunucu yavaş yanıt verdiğinde tıklamanın "boşa gittiği"
 * hissini önler.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return;
      setState('loading');
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      safetyTimer.current = setTimeout(() => setState('idle'), 15000);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setState((s) => (s === 'loading' ? 'done' : s));
    const t = setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 400);
    return () => clearTimeout(t);
  }, [pathname]);

  if (state === 'idle') return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-[200] pointer-events-none" aria-hidden>
      <div
        className="h-full bg-ana"
        style={
          state === 'loading'
            ? { width: '0%', animation: 'byt-navprog 8s cubic-bezier(0.1, 0.7, 0.2, 1) forwards' }
            : { width: '100%', opacity: 0, transition: 'width 150ms ease-out, opacity 300ms ease 150ms' }
        }
      />
      <style>{`@keyframes byt-navprog { from { width: 0% } 10% { width: 30% } to { width: 85% } }`}</style>
    </div>
  );
}
