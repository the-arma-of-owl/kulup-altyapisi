'use client';

import React from 'react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

export function ZoomImage({ src, alt, className }: { src: string, alt?: string, className?: string }) {
  return (
    // Sarmalayıcılar tam yükseklik alır ki kapsayıcıdaki (ör. aspect-video) h-full görsel kutuyu doldursun
    <div className="h-full w-full [&_[data-rmiz-content]]:h-full [&_[data-rmiz]]:h-full">
      <Zoom>
        <img src={src} alt={alt} className={className} />
      </Zoom>
    </div>
  );
}
