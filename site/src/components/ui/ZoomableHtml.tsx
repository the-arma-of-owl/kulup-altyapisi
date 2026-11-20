'use client';

import React, { useEffect, useState } from 'react';

export function ZoomableHtml({ html, className }: { html: string, className?: string }) {
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  useEffect(() => {
    const handleImgClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const src = (target as HTMLImageElement).src;
        if (src) {
          setZoomedImg(src);
        }
      }
    };

    const container = document.getElementById('zoomable-html-container');
    if (container) {
      // resimlerin üzerine gelince mouse cursor'un büyüteç olmasını sağlayalım
      const images = container.querySelectorAll('img');
      images.forEach(img => {
        img.style.cursor = 'zoom-in';
      });
      container.addEventListener('click', handleImgClick);
    }
    
    return () => {
      if (container) {
        container.removeEventListener('click', handleImgClick);
      }
    };
  }, [html]);

  return (
    <>
      <div 
        id="zoomable-html-container"
        className={className} 
        dangerouslySetInnerHTML={{ __html: html }} 
      />
      
      {/* Zoom Modal */}
      {zoomedImg && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-zemin/95 cursor-zoom-out p-4 md:p-8"
          onClick={() => setZoomedImg(null)}
        >
          <img 
            src={zoomedImg} 
            alt="Zoomed" 
            className="max-w-full max-h-full object-contain cursor-zoom-out select-none rounded-2xl border border-kenar shadow-sert-lg"
            style={{ 
              animation: 'zoomIn 0.2s cubic-bezier(0.2, 0, 0.2, 1)',
            }}
          />
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes zoomIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          `}} />
        </div>
      )}
    </>
  );
}
