"use client";

import { KULUP } from '@/lib/kulup';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallState, promptInstall, IOS_HINT_EVENT } from '@/lib/installPrompt';
import { isLinkPage } from '@/lib/linkPage';

const DISMISS_KEY = 'byt-install-dismissed';
const DISMISS_DAYS = 14;
const SHOW_DELAY_MS = 8000;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

// Telefonda ilk ziyaretten birkaç saniye sonra alttan çıkan "uygulamayı yükle" kartı.
// Kapatılırsa 14 gün tekrar gösterilmez; footer'daki buton her zaman çalışır.
export default function InstallAppPrompt() {
  const { mode } = useInstallState();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const openHint = () => setIosHint(true);
    window.addEventListener(IOS_HINT_EVENT, openHint);
    return () => window.removeEventListener(IOS_HINT_EVENT, openHint);
  }, []);

  useEffect(() => {
    if (mode === 'none' || recentlyDismissed()) return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const hidden = pathname.includes('/ticket') || pathname.includes('/staff') || pathname.includes('/sahne/') || isLinkPage(pathname);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const install = async () => {
    if (mode === 'ios') {
      setVisible(false);
      setIosHint(true);
      return;
    }
    await promptInstall();
    setVisible(false);
  };

  return (
    <>
      {visible && !hidden && mode !== 'none' && (
        <div className="fixed inset-x-3 bottom-3 z-[95] lg:hidden print:hidden">
          <div className="kart flex items-center gap-3 p-3 pr-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pwa/icon-192.png" alt="" className="w-11 h-11 rounded-xl border border-kenar shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-extrabold leading-tight">{KULUP.kisaAd} uygulamasını yükle</p>
              <p className="text-xs text-soluk leading-snug">Etkinlikler ve biletlerin ana ekranında.</p>
            </div>
            <button onClick={install} className="dugme dugme-ana shrink-0 px-4 py-2 text-xs">
              Yükle
            </button>
            <button onClick={dismiss} aria-label="Kapat" className="shrink-0 p-2 text-soluk hover:text-murekkep">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {iosHint && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => setIosHint(false)}>
          <div
            className="kart w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-display font-extrabold">Ana ekrana ekle</p>
              <button onClick={() => setIosHint(false)} aria-label="Kapat" className="p-1 text-soluk"><X className="w-5 h-5" /></button>
            </div>
            <ol className="space-y-3 text-sm text-soluk">
              <li className="flex items-center gap-3">
                <Share className="w-5 h-5 text-ana-yazi shrink-0" /> Safari&apos;nin alt çubuğundaki <b>Paylaş</b> düğmesine dokun.
              </li>
              <li className="flex items-center gap-3">
                <SquarePlus className="w-5 h-5 text-ana-yazi shrink-0" /> Listeden <b>Ana Ekrana Ekle</b>&apos;yi seç.
              </li>
              <li className="flex items-center gap-3">
                <Download className="w-5 h-5 text-ana-yazi shrink-0" /> Sağ üstteki <b>Ekle</b>&apos;ye dokun.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
