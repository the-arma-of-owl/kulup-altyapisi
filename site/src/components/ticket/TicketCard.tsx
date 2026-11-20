"use client";

/**
 * Giriş bileti (ABT bilet tasarımı esas alındı): renkli başlıklı kalın kenarlı kart, etkinlik ve katılımcı bilgisi, geri sayım,
 * delikli ayırıcı, beyaz zeminde QR (dokununca tam ekran + ekran kararmaz), giriş yapıldıysa üstte onay,
 * "Bileti kaydet" (yazdır/PDF) ve altında konum haritası.
 * QR içeriği değişmedi (bilet kodu): kapı okuyucusu aynı değeri bekliyor.
 */
import { KULUP } from '@/lib/kulup';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, CheckCircle2, Clock, Download, MapPin, Maximize2, X } from 'lucide-react';
import CesiumMap from '@/components/guide/CesiumMap';

interface TicketCardProps {
  ticket: {
    fullName: string;
    department?: string;
    ticketToken: string;
    attended?: boolean;
  };
  event: {
    title: string;
    date: string;
    location?: string;
    locationLink?: string;
  };
  coords?: { lat: number; lng: number } | null;
}

const TIME_ZONE = 'Europe/Istanbul';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

type WakeLockSentinelLike = { release: () => Promise<void> };

function Detail({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-kenar bg-ana-acik text-ana-yazi"><Icon size={16} aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="font-display text-[11px] font-extrabold uppercase tracking-[0.15em] text-soluk">{label}</p>
        <p className="break-words text-sm font-bold text-murekkep">{value}</p>
      </div>
    </div>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-12 w-14 items-center justify-center overflow-hidden rounded-xl border border-kenar bg-limon text-murekkep shadow-sert-sm">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute font-display text-2xl font-extrabold tabular-nums"
          >
            {String(value).padStart(2, '0')}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="mt-2 font-display text-[10px] font-extrabold uppercase tracking-[0.15em] text-soluk">{label}</span>
    </div>
  );
}

function EventCountdown({ startDate }: { startDate: string }) {
  // Sunucu ve tarayıcı saatleri farklı olabilir: sayaç yalnız tarayıcıda çizilir.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  const start = new Date(startDate).getTime();
  if (Number.isNaN(start) || now === null) return null;
  if (now >= start) {
    return (
      <div className="mx-auto flex w-fit items-center justify-center gap-2 rounded-full border border-kenar bg-nane px-4 py-1.5 font-display text-sm font-bold text-murekkep">
        <span className="h-2.5 w-2.5 rounded-full bg-murekkep" />
        Etkinlik başladı
      </div>
    );
  }
  const remaining = start - now;
  const days = Math.floor(remaining / DAY);
  return (
    <div>
      <p className="mb-3 text-center font-display text-xs font-extrabold uppercase tracking-[0.18em] text-soluk">Etkinliğe kalan süre</p>
      <div className="flex items-start justify-center gap-2 sm:gap-3">
        {days > 0 ? <Unit value={days} label="Gün" /> : null}
        <Unit value={Math.floor((remaining % DAY) / HOUR)} label="Saat" />
        <Unit value={Math.floor((remaining % HOUR) / MINUTE)} label="Dakika" />
        <Unit value={Math.floor((remaining % MINUTE) / 1000)} label="Saniye" />
      </div>
    </div>
  );
}

export default function TicketCard({ ticket, event, coords }: TicketCardProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mapActive, setMapActive] = useState(false);
  const isCheckedIn = Boolean(ticket.attended);

  const start = event.date ? new Date(event.date) : null;
  const dateText = start ? start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: TIME_ZONE }) : 'Tarih belirtilmedi';
  const timeText = start ? start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }) : '—';
  const location = event.location || `${KULUP.universite}`;

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const openFullscreen = () => {
    if (isCheckedIn) return;
    setFullscreen(true);
    // Destekleyen tarayıcıda gerçek tam ekran; desteklemeyende (iPhone Safari) katman yine ekranı kaplar.
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    if (!fullscreen) return;
    let wakeLock: WakeLockSentinelLike | null = null;
    // Görevli okutana kadar ekran kararmasın.
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
    nav.wakeLock?.request('screen').then((lock) => { wakeLock = lock; }).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    const onFullscreenChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [closeFullscreen, fullscreen]);

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <article className="relative overflow-hidden rounded-[2rem] border border-kenar bg-yuzey text-murekkep shadow-sert-lg">
        <header className="relative overflow-hidden border-b-2 border-kenar bg-ana px-6 pb-6 pt-6 text-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(currentColor 1.4px, transparent 1.6px)', backgroundSize: '22px 22px' }} />
          <div className="relative flex items-center justify-between gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={KULUP.kisaAd} className="h-12 w-12 rounded-full border border-kenar bg-white object-contain" />
            <span style={{ rotate: '4deg' }} className="rounded-xl border border-kenar bg-limon px-3 py-1 font-display text-xs font-extrabold uppercase tracking-[0.15em] text-murekkep shadow-sert-sm">
              Giriş bileti
            </span>
          </div>
          <h1 className="relative mt-5 font-display text-3xl font-extrabold leading-[1.05] tracking-tight [overflow-wrap:anywhere]">{event.title}</h1>
        </header>

        <div className="space-y-5 px-6 py-6">
          <div>
            <p className="font-display text-[11px] font-extrabold uppercase tracking-[0.15em] text-soluk">Katılımcı</p>
            <p className="break-words font-display text-2xl font-extrabold leading-tight text-murekkep">{ticket.fullName}</p>
            {ticket.department ? <p className="text-sm font-semibold text-soluk">{ticket.department}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Detail icon={Calendar} label="Tarih" value={dateText} />
            <Detail icon={Clock} label="Saat" value={timeText} />
          </div>
          <Detail icon={MapPin} label="Konum" value={location} />
          {event.date ? <div className="border-t-2 border-dashed border-kenar/25 pt-5"><EventCountdown startDate={event.date} /></div> : null}
        </div>

        {/* Delikli ayırıcı: kenar yuvarlakları sayfa zeminiyle aynı renkte */}
        <div className="relative flex h-8 items-center px-6" aria-hidden="true">
          <div className="absolute -left-4 h-8 w-8 rounded-full border border-kenar bg-zemin" />
          <div className="absolute -right-4 h-8 w-8 rounded-full border border-kenar bg-zemin" />
          <div className="w-full border-t-2 border-dashed border-kenar/40" />
        </div>

        <div className="relative flex flex-col items-center px-6 pb-6 pt-4">
          {isCheckedIn && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-nane/95 text-murekkep">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-kenar bg-white shadow-sert-sm">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="mb-1 font-display text-3xl font-extrabold tracking-tight">Giriş yapıldı</h2>
              <p className="font-semibold">Etkinliğe hoş geldin!</p>
            </div>
          )}

          <button
            type="button"
            onClick={openFullscreen}
            aria-label="QR kodu tam ekran göster"
            className={`group relative rounded-2xl border border-kenar bg-white p-4 shadow-sert transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-ana/50 ${isCheckedIn ? 'scale-95 opacity-40 blur-sm' : 'active:scale-[0.98]'}`}
          >
            <QRCode value={ticket.ticketToken} size={208} level="H" fgColor="#000000" bgColor="#ffffff" />
            <span className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-kenar bg-limon px-3 py-1 font-display text-xs font-bold text-murekkep">
              <Maximize2 size={12} aria-hidden="true" /> Tam ekran
            </span>
          </button>

          <p className="mt-8 max-w-[260px] text-center text-sm font-semibold text-soluk">Girişte QR koda dokunup tam ekranda görevliye gösterin.</p>
          <p className="mt-2 break-all rounded-lg bg-zemin-2 px-2 py-1 font-mono text-xs tracking-wider text-murekkep">{ticket.ticketToken}</p>
        </div>

        <footer className="flex justify-center border-t-2 border-kenar bg-zemin-2 p-4 print:hidden">
          <button type="button" onClick={() => window.print()} className="dugme dugme-yuzey">
            <Download size={16} aria-hidden="true" /> Bileti kaydet
          </button>
        </footer>
      </article>

      {coords ? (
        <section className="kart p-6 print:hidden">
          <p className="ust-baslik">Etkinlik konumu</p>
          <p className="mt-1 font-display text-lg font-bold text-murekkep">{location}</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-kenar">
            {mapActive ? (
              <div className="h-64 w-full"><CesiumMap lat={coords.lat} lng={coords.lng} label={event.title} /></div>
            ) : (
              <button type="button" onClick={() => setMapActive(true)} className="flex h-40 w-full items-center justify-center bg-gok font-display text-base font-bold text-murekkep underline-offset-4 transition-colors hover:underline">
                Haritayı göster
              </button>
            )}
          </div>
          {event.locationLink ? (
            <a href={event.locationLink} target="_blank" rel="noreferrer" className="dugme dugme-limon mt-4 w-full py-3">
              <MapPin size={16} aria-hidden="true" /> Yol tarifi al
            </a>
          ) : null}
        </section>
      ) : null}

      {/* Navbar ve sayfa katmanlarının üstüne çıksın diye doğrudan body'ye çizilir */}
      {fullscreen ? createPortal(
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Tam ekran bilet QR kodu"
          className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white px-6 text-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          onClick={closeFullscreen}
        >
          <button type="button" onClick={closeFullscreen} aria-label="Tam ekranı kapat" className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-black bg-white text-black">
            <X size={22} />
          </button>
          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="w-[min(84vw,70vh)] max-w-[520px]">
            <QRCode value={ticket.ticketToken} size={520} level="H" fgColor="#000000" bgColor="#ffffff" style={{ width: '100%', height: 'auto' }} />
          </motion.div>
          <p className="mt-8 font-display text-2xl font-extrabold">{ticket.fullName}</p>
          <p className="mt-1 text-sm font-semibold text-[#3a3548]">{event.title}</p>
          <p className="mt-3 break-all font-mono text-xs tracking-wider text-[#3a3548]">{ticket.ticketToken}</p>
          <p className="absolute bottom-6 text-xs font-semibold text-[#5e5873]">Kapatmak için ekrana dokunun</p>
        </motion.div>,
        document.body,
      ) : null}
    </div>
  );
}
