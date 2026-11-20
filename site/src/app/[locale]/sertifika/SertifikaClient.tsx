'use client';

import { KULUP } from '@/lib/kulup';
import React, { useState } from 'react';
import { BadgeCheck, Search, Info } from 'lucide-react';
import { Cikartma, SayfaBasligi } from '@/components/kit';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeCertificateCode } from '@/lib/certificateShared';

// Kod girişi: doğrulama sunucuda /sertifika/<kod> sayfasında yapılır (Turnstile gerekmez; kod tahmin edilemez).
export default function SertifikaClient() {
  const router = useRouter();
  const legacyToken = useSearchParams().get('token');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeCertificateCode(code);
    if (!normalized) { setError(`Kod biçimi geçersiz. Örnek: ${KULUP.sertifika.onEk}-2026-KTLM-XXXXXXXXXXXXXXXXXXXX`); return; }
    setError('');
    router.push(`/sertifika/${normalized}`);
  };

  return (
    <div className="pb-20">
      <SayfaBasligi
        renk="nane"
        ust="Sertifika"
        baslik="Sertifika Doğrulama"
        aciklama={<>{KULUP.kisaAd} etkinliklerinden aldığınız sertifikanın üzerindeki kodu girerek gerçekliğini doğrulayın.</>}
        cikartma={<Cikartma renk="yuzey" aci={-5}><BadgeCheck className="mr-1 inline h-4 w-4" />Gerçek mi?</Cikartma>}
      />

      <div className="mx-auto mt-10 flex w-full max-w-2xl flex-col items-stretch px-4 sm:px-6">
        {legacyToken && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-kenar bg-limon p-4 text-sm text-murekkep shadow-sert-sm">
            <Info className="h-5 w-5 shrink-0" />
            <p>Bu eski biçimde bir doğrulama bağlantısı. Sertifikalar artık sertifika koduyla doğrulanıyor; kodu sertifikanın üzerinde veya size gönderilen mailde bulabilirsiniz.</p>
          </div>
        )}

        <form onSubmit={submit} className="kart p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Sertifika kodu"
              placeholder={`${KULUP.sertifika.onEk}-2026-KTLM-…`} autoCapitalize="characters" spellCheck={false}
              className="girdi h-14 min-w-0 flex-1 font-mono placeholder:font-sans" />
            <button type="submit" disabled={!code.trim()} className="dugme dugme-ana h-14 shrink-0 px-7 disabled:cursor-not-allowed">
              <Search className="h-4 w-4" /><span>Sorgula</span>
            </button>
          </div>
          {error && <p role="alert" className="mt-4 rounded-2xl border border-kenar bg-pembe px-4 py-3 text-center text-sm font-semibold text-murekkep">{error}</p>}
        </form>
      </div>
    </div>
  );
}
