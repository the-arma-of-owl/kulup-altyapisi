"use client";

import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import CesiumMap from '@/components/guide/CesiumMap';

interface EventMapProps {
  coords: { lat: number; lng: number } | null;
  locationName?: string;
  locationLink?: string;
  eventTitle: string;
  /** Yan sütun için küçük kart (başlık küçük, harita kısa). */
  compact?: boolean;
  /** Küçük kartın başlığı (iletişim sayfasında topluluğun konumu için de kullanılır) */
  heading?: string;
}

export default function EventMap({ coords, locationName, locationLink, eventTitle, compact = false, heading = 'Etkinlik Konumu' }: EventMapProps) {
  const [isMapActive, setIsMapActive] = useState(false);

  useEffect(() => {
    // Detect mobile device
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    // Heuristics for device performance
    const ram = (navigator as any).deviceMemory || 4; // RAM in GB
    const cores = navigator.hardwareConcurrency || 4; // CPU cores
    
    // We consider a phone "high-end" if it has at least 4GB of RAM and 6 CPU cores
    const isHighEndMobile = isMobile && (ram >= 4 && cores >= 6);
    
    if (!isMobile) {
      // Desktop - Auto load map
      setIsMapActive(true);
    } else if (isHighEndMobile) {
      // High-end mobile - Auto load map
      setIsMapActive(true);
    } else {
      // Low-end mobile - Ask to load to prevent lagging
      setIsMapActive(false);
    }
  }, []);

  if (!coords) return null;

  return (
    <div className={compact ? 'kart overflow-hidden' : 'kart space-y-6 p-6 sm:p-8'}>
      {compact ? (
        <h2 className="border-b-2 border-kenar bg-zemin-2 px-6 py-3.5 font-display text-lg font-extrabold tracking-tight text-murekkep">{heading}</h2>
      ) : (
      <div>
        <p className="ust-baslik">Konum</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">
          Etkinlik Alanı
        </h2>
        {locationName && (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-soluk">
            <MapPin className="h-4 w-4 shrink-0 text-ana-yazi" />
            {locationName}
          </p>
        )}
      </div>
      )}

      <div className={compact ? 'space-y-5 p-6' : 'space-y-6'}>
      <div className="relative overflow-hidden rounded-2xl border border-kenar">
        {!isMapActive ? (
          <div className={`${compact ? 'h-56' : 'h-64'} relative flex flex-col items-center justify-center overflow-hidden bg-gok p-6 text-center text-murekkep`}>
            {/* Nokta deseni */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(currentColor 1.4px, transparent 1.6px)', backgroundSize: '18px 18px' }} />
            <div className="relative z-10 flex flex-col items-center">
              <button 
                onClick={() => setIsMapActive(true)}
                className="dugme bg-yuzey"
              >
                <MapPin className="h-4 w-4" /> Haritayı Yükle
              </button>
              <p className="mt-3 max-w-[320px] text-xs font-semibold">
                3D uydu görünümünü açmak için tıklayın.
              </p>
            </div>
          </div>
        ) : (
          <div className={`${compact ? 'h-64' : 'h-80'} w-full relative`}>
            <CesiumMap lat={coords.lat} lng={coords.lng} label={eventTitle} />
          </div>
        )}
      </div>

      {locationLink && (
        <a 
          href={locationLink}
          target="_blank"
          rel="noreferrer"
          className="dugme dugme-limon group w-full py-3"
        >
          <MapPin size={16} className="transition-transform group-hover:scale-110" />
          {compact ? 'Yol Tarifi Al' : 'Yol Tarifi Al (Google Haritalar)'}
        </a>
      )}
      </div>
    </div>
  );
}
