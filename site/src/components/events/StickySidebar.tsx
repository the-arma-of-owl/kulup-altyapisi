'use client';

/**
 * Yan sütun: normal kayar; sonu ekranın altına gelince orada durur, sol sütun kaymaya devam eder.
 * Ekrana sığıyorsa menünün altında (üstten) sabitlenir. Yalnız lg ve üstünde.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

const TOP_OFFSET = 96; // yapışkan menünün (72px) altı + boşluk
const BOTTOM_GAP = 24;

export default function StickySidebar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(TOP_OFFSET);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setTop(Math.min(TOP_OFFSET, window.innerHeight - el.offsetHeight - BOTTOM_GAP));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <aside ref={ref} className={`lg:sticky ${className}`} style={{ top }}>
      {children}
    </aside>
  );
}
