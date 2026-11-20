'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getMediaUrl } from '@/lib/api';
import { Youtube, Instagram, Cloud, Maximize2, Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type MediaItemProps = {
  media: any;
  caption?: string;
  onClick: () => void;
};

function GalleryItem({ media, caption, onClick }: MediaItemProps) {
  const url = getMediaUrl(media);
  if (!url) return null;
  const mimeType = typeof media === 'object' ? media?.mimeType : '';
  const isVideo = mimeType?.startsWith('video/') || url.match(/\.(mp4|webm|mov)(\?|$)/i);

  return (
    <div 
      className="kart kart-hover group relative aspect-[4/3] w-[260px] flex-none cursor-pointer snap-center overflow-hidden bg-zemin-2 md:w-[400px]"
      onClick={onClick}
    >
      {isVideo ? (
        <>
          <video src={`${url}#t=0.001`} preload="metadata" muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-kenar bg-limon text-murekkep shadow-sert-sm transition-transform group-hover:scale-110">
              <Play className="ml-1 h-6 w-6 fill-current" />
            </div>
          </div>
        </>
      ) : (
        <>
          <img src={url} alt={caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute right-3 top-3 rounded-xl border border-kenar bg-yuzey p-2 text-murekkep opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" />
          </div>
        </>
      )}
      {caption && (
        <div className="absolute bottom-3 left-3 right-3">
          <p className="truncate rounded-xl border border-kenar bg-yuzey px-3 py-1.5 font-display text-sm font-bold text-murekkep">{caption}</p>
        </div>
      )}
    </div>
  );
}

export default function EventMediaSection({ event }: { event: any }) {
  const { gallery, externalLinks } = event;
  const hasExternalLinks = externalLinks && externalLinks.length > 0;
  const hasGallery = gallery && gallery.length > 0;
  
  const sliderRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Klavye ok tuşları ve ESC ile kontrol
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight' && hasGallery) {
        setCurrentIndex((prev) => (prev + 1) % gallery.length);
      }
      if (e.key === 'ArrowLeft' && hasGallery) {
        setCurrentIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, hasGallery, gallery]);

  // Otomatik kaydırma (Auto-scroll)
  useEffect(() => {
    if (!hasGallery || lightboxOpen) return;
    
    const interval = setInterval(() => {
      if (sliderRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
        // Sona geldiysek başa dön
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          sliderRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          sliderRef.current.scrollBy({ left: 300, behavior: 'smooth' });
        }
      }
    }, 4000); // 4 saniyede bir kaydır

    return () => clearInterval(interval);
  }, [hasGallery, lightboxOpen]);

  if (!hasExternalLinks && !hasGallery) return null;

  const scrollLeft = () => {
    if (sliderRef.current) sliderRef.current.scrollBy({ left: -300, behavior: 'smooth' });
  };
  const scrollRight = () => {
    if (sliderRef.current) sliderRef.current.scrollBy({ left: 300, behavior: 'smooth' });
  };

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  // Lightbox içinde gösterilecek anlık medya
  const currentMedia = hasGallery ? gallery[currentIndex] : null;
  const currentUrl = currentMedia ? getMediaUrl(currentMedia.media) : null;
  const currentMimeType = typeof currentMedia?.media === 'object' ? currentMedia.media?.mimeType : '';
  const currentIsVideo = currentMimeType?.startsWith('video/') || currentUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // YouTube Thumbnail Çıkarma
  const getYoutubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const youtubeLinks = externalLinks?.filter((l: any) => l.type === 'youtube') || [];
  const otherLinks = externalLinks?.filter((l: any) => l.type !== 'youtube') || [];

  const DriveIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.71 3.5L1.15 15l3.43 6L11.14 9.5h.01L7.71 3.5zM9.73 15L13.17 9h6.86l-3.44 6H9.73zM15.43 21l3.43-6-6.86-12h-3.43l6.86 12z"/>
    </svg>
  );

  return (
    <div className="space-y-8 border-t-2 border-dashed border-kenar/25 pt-12">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">Medya & Bağlantılar</h2>
      </div>

      {/* Harici Linkler */}
      {hasExternalLinks && (
        <div className="flex flex-wrap gap-3">
          {otherLinks.map((link: any, idx: number) => (
            <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" 
               className={`dugme ${
                 link.type === 'instagram' ? 'bg-pembe text-murekkep' :
                 link.type === 'drive' ? 'bg-nane text-murekkep' :
                 'bg-yuzey'
               }`}>
              {link.type === 'instagram' && <Instagram className="w-5 h-5" />}
              {link.type === 'drive' && <img src="/google-drive.png" alt="Google Drive" className="h-5 w-5 object-contain" />}
              {link.label || (link.type === 'instagram' ? 'Instagram' : link.type === 'drive' ? 'Google Drive' : 'Bağlantı')}
            </a>
          ))}
          {/* YouTube linkleri (buton olarak gösterilecekler - iframe olmayanlar için) */}
          {youtubeLinks.map((link: any, idx: number) => {
            if (!getYoutubeVideoId(link.url)) {
              return (
                <a key={`yt-${idx}`} href={link.url} target="_blank" rel="noopener noreferrer" className="dugme bg-seftali text-murekkep">
                  <Youtube className="w-5 h-5" /> {link.label || 'YouTube Videosu'}
                </a>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* YouTube Embedleri */}
      {youtubeLinks.map((link: any, idx: number) => {
        const videoId = getYoutubeVideoId(link.url);
        if (!videoId) return null;
        return (
          <div key={`embed-${idx}`} className="flex flex-col gap-3">
            {link.label && (
              <h3 className="font-display text-xl font-extrabold text-murekkep">
                {link.label}
              </h3>
            )}
            <div className="kart aspect-video w-full overflow-hidden bg-murekkep shadow-sert-lg">
              <iframe 
                src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`} 
                title={link.label || "YouTube video player"}
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            </div>
          </div>
        );
      })}

      {/* Galeri Carousel */}
      {hasGallery && (
        <div className="relative group/slider">
          <div 
            ref={sliderRef}
            className="hide-scrollbar -mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-1 pb-4 pt-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {gallery.map((item: any, idx: number) => (
              <GalleryItem key={idx} media={item.media} caption={item.caption} onClick={() => openLightbox(idx)} />
            ))}
          </div>

          {/* Slider Kontrolleri (Hover olunca çıkar) */}
          <button onClick={scrollLeft} className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-kenar bg-limon text-murekkep opacity-0 shadow-sert-sm transition-opacity group-hover/slider:opacity-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={scrollRight} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-kenar bg-limon text-murekkep opacity-0 shadow-sert-sm transition-opacity group-hover/slider:opacity-100">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Lightbox Overlay */}
      <AnimatePresence>
        {lightboxOpen && currentUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          >
            {/* Üst bar (Kapatma tuşu ve Sayaç) */}
            <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-50">
              <span className="rounded-full border border-kenar bg-limon px-3 py-1 font-mono text-sm font-bold text-murekkep">
                {currentIndex + 1} / {gallery.length}
              </span>
              <button onClick={() => setLightboxOpen(false)} className="flex h-12 w-12 items-center justify-center rounded-full border border-kenar bg-yuzey text-murekkep transition-transform hover:rotate-90">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Sol ve Sağ Oklar */}
            <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev - 1 + gallery.length) % gallery.length); }} className="absolute left-2 top-1/2 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-kenar bg-yuzey text-murekkep transition-colors hover:bg-limon md:left-6 md:h-14 md:w-14">
              <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev + 1) % gallery.length); }} className="absolute right-2 top-1/2 z-50 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-kenar bg-yuzey text-murekkep transition-colors hover:bg-limon md:right-6 md:h-14 md:w-14">
              <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
            </button>

            {/* Medya Gösterimi */}
            <div className="w-full h-full p-4 md:p-20 flex items-center justify-center" onClick={() => setLightboxOpen(false)}>
              <motion.div 
                key={currentUrl}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              >
                {currentIsVideo ? (
                  <video src={currentUrl} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-2xl border border-white" />
                ) : (
                  <img src={currentUrl} alt={currentMedia.caption || ''} className="max-h-[85vh] max-w-full rounded-2xl border border-white object-contain" />
                )}
                {currentMedia.caption && (
                  <p className="absolute -bottom-10 left-0 right-0 text-center font-display text-sm font-bold text-white">
                    {currentMedia.caption}
                  </p>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
