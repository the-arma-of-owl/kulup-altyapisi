"use client";

import { KULUP } from '@/lib/kulup';
import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { submitContactMessage } from '@/lib/api';
import { Loader2, Mail, MapPin, MessageSquare, Send } from 'lucide-react';
import { Alan, Cikartma, SayfaBasligi } from '@/components/kit';
import { useFormTracking } from '@/components/Analytics';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import HumanCheck from '@/components/ui/HumanCheck';
import EventMap from '@/app/[locale]/etkinlikler/[slug]/EventMap';

// Kulübün yeri: kulup.config.json → kampus (enlem/boylam)
const LOCATION = {
  name: `${KULUP.universite}, ${KULUP.sehir}`,
  coords: { lat: KULUP.kampus.enlem, lng: KULUP.kampus.boylam },
  link: `https://www.google.com/maps/search/?api=1&query=${KULUP.kampus.enlem},${KULUP.kampus.boylam}`,
};

const formSchema = z.object({
  fullName: z.string().min(3, 'En az 3 karakter olmalı'),
  email: z.string().email('Geçersiz e-posta adresi'),
  subject: z.string().min(3, 'Konu başlığı çok kısa'),
  message: z.string().min(10, 'Mesajınız çok kısa'),
});

type FormValues = z.infer<typeof formSchema>;

export default function ContactPage() {
  const tracking = useFormTracking('contact');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [contactEmail, setContactEmail] = useState('iletisim@fubyt.com');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Doğrulama jetonu tek kullanımlık: her denemeden sonra widget sıfırlanır (tekrar denemede eski jeton reddediliyordu)
  const turnstileRef = useRef<TurnstileInstance>(null);

  React.useEffect(() => {
    import('@/lib/api').then(({ fetchSiteSettings }) => {
      fetchSiteSettings().then(settings => {
        if (settings?.contactEmail) setContactEmail(settings.contactEmail);
      });
    });
  }, []);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormValues) => {
    if (!turnstileToken) {
      setError('Lütfen güvenlik doğrulamasını tamamlayın.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    
    const result = await submitContactMessage(data, turnstileToken);
    
    setIsSubmitting(false);

    const success = result.ok;
    turnstileRef.current?.reset();
    setTurnstileToken(null);
    if (success) {
      tracking.submitted();
      setIsSuccess(true);
      reset();
    } else {
      setError(result.error || 'Mesaj gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  return (
    <div className="pb-20">
      <SayfaBasligi
        renk="gok"
        ust="Bize yazın"
        baslik="İletişim"
        aciklama="Soru, öneri veya işbirlikleri için bize ulaşabilirsiniz. En kısa sürede dönüş yapacağız."
        cikartma={<Cikartma renk="limon" aci={-6}>Selam! 👋</Cikartma>}
      />

      <div className="mx-auto mt-10 grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-10">
        <div className="min-w-0 space-y-5">
          <div className="kart flex items-center gap-4 p-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-kenar bg-limon text-murekkep shadow-sert-sm">
              <Mail className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="ust-baslik mb-1">E-Posta</p>
              <p className="break-all font-display text-lg font-bold text-murekkep">{contactEmail}</p>
            </div>
          </div>

          <div className="kart flex items-center gap-4 p-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-kenar bg-pembe text-murekkep shadow-sert-sm">
              <MapPin className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="ust-baslik mb-1">Konum</p>
              <p className="font-display text-lg font-bold text-murekkep">{LOCATION.name}</p>
            </div>
          </div>

          <EventMap compact heading="Bizi bulun" coords={LOCATION.coords} locationLink={LOCATION.link} eventTitle={`${KULUP.kisaAd} · ${KULUP.universite}`} />
        </div>

        <div className="kart relative min-w-0 p-6 sm:p-10">
          {isSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5 py-14 text-center"
            >
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-kenar bg-nane text-murekkep shadow-sert-sm">
                <MessageSquare className="h-10 w-10" />
              </div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep">Mesajınız Alındı!</h2>
              <p className="text-soluk">Size en kısa sürede e-posta üzerinden dönüş yapacağız.</p>
              <button onClick={() => setIsSuccess(false)} className="dugme dugme-yuzey mt-2">Yeni Mesaj Gönder</button>
            </motion.div>
          ) : (
            <motion.form
              ref={tracking.ref}
              onFocusCapture={tracking.onFocusCapture}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <Alan etiket="Ad Soyad" htmlFor="iletisim-fullName" hata={errors.fullName?.message}>
                <input id="iletisim-fullName" {...register('fullName')} aria-invalid={!!errors.fullName} autoComplete="name" className="girdi" />
              </Alan>

              <Alan etiket="E-posta" htmlFor="iletisim-email" hata={errors.email?.message}>
                <input id="iletisim-email" {...register('email')} aria-invalid={!!errors.email} autoComplete="email" className="girdi" />
              </Alan>

              <Alan etiket="Konu" htmlFor="iletisim-subject" hata={errors.subject?.message}>
                <input id="iletisim-subject" {...register('subject')} aria-invalid={!!errors.subject} className="girdi" />
              </Alan>

              <Alan etiket="Mesajınız" htmlFor="iletisim-message" hata={errors.message?.message}>
                <textarea id="iletisim-message" {...register('message')} aria-invalid={!!errors.message} rows={5} className="girdi resize-none" />
              </Alan>

              {/* Turnstile Yeri */}
              <div className="flex justify-center">
                <HumanCheck
                  ref={turnstileRef}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
                  onSuccess={(token) => setTurnstileToken(token)}
                  options={{ theme: 'auto' }}
                />
              </div>

              <button disabled={isSubmitting || !turnstileToken} type="submit" className="dugme dugme-ana dugme-buyuk w-full">
                {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Gönderiliyor...</> : <>Mesajı Gönder <Send className="h-5 w-5" /></>}
              </button>

              {error && <p role="alert" className="rounded-2xl border border-kenar bg-pembe px-4 py-3 text-center text-sm font-bold text-murekkep">{error}</p>}
            </motion.form>
          )}
        </div>
      </div>
    </div>
  );
}
