import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React, { Suspense } from 'react';
import SertifikaClient from './SertifikaClient';

export const metadata: Metadata = pageMetadata({
  title: 'Sertifika Doğrulama',
  description: `${KULUP.kisaAd} etkinliklerinden aldığınız katılım, başarı veya teşekkür sertifikalarının gerçekliğini doğrulayın.`,
  path: '/sertifika',
});

export default function SertifikaPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="animate-pulse text-center font-display font-bold text-soluk">Yükleniyor...</div>
      </div>
    }>
      <SertifikaClient />
    </Suspense>
  );
}
