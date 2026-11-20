"use client";

import { useEffect, useRef, useState } from 'react';

const SPEED_PX_PER_SEC = 60;

// Ölçüme dayalı kayan yazı: tek kopyanın genişliği ölçülür, ekranı dolduracak kadar kopya konur ve
// şerit tam bir kopya genişliği kadar kaydırılır → döngü dikişsiz, hız metin uzunluğundan bağımsız.
// Yalnız transform (GPU) animasyonu; hareket azaltma tercihinde durur, üstüne gelince duraklar.
export default function Marquee({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
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
    // Yazı tipi geç yüklenirse genişlik değişir
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [text]);

  const { copyWidth, copies } = metrics;
  const style = copyWidth
    ? ({
        '--marquee-shift': `-${copyWidth}px`,
        animationDuration: `${copyWidth / SPEED_PX_PER_SEC}s`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div ref={boxRef} className="byt-marquee" aria-label={text} role="marquee">
      <div className={copyWidth ? 'byt-marquee__track is-running' : 'byt-marquee__track'} style={style} aria-hidden="true">
        {Array.from({ length: copies }, (_, i) => (
          <span key={i} ref={i === 0 ? copyRef : undefined} className="byt-marquee__copy">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
