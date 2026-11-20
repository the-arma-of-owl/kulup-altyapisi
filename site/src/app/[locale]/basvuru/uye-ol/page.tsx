"use client";

import { KULUP } from '@/lib/kulup';
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { useFormTracking } from '@/components/Analytics';
import { submitMemberApplication } from '@/lib/api';
import { phoneInputProps, phoneSchema } from '@/lib/phone';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Alan, Cikartma, SayfaBasligi } from '@/components/kit';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import HumanCheck from '@/components/ui/HumanCheck';

const formSchema = z.object({
  fullName: z.string().min(3, 'En az 3 karakter olmalı'),
  email: z.string().email('Geçersiz e-posta adresi'),
  phone: phoneSchema('Geçerli bir telefon numarası girin'),
  department: z.string().min(1, 'Bölüm seçiniz'),
  customDepartment: z.string().optional(),
  year: z.string().min(1, 'Sınıf seçiniz'),
  kvkk: z.boolean().refine(val => val === true, 'KVKK onaylanmalıdır'),
  privacyPolicy: z.boolean().refine(val => val === true, 'Gizlilik Sözleşmesi onaylanmalıdır'),
});

type FormValues = z.infer<typeof formSchema>;

export default function MemberApplicationPage() {
  const tracking = useFormTracking('member');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [error, setError] = React.useState('');
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  // Doğrulama jetonu tek kullanımlık: her denemeden sonra widget sıfırlanır (tekrar denemede eski jeton reddediliyordu)
  const turnstileRef = React.useRef<TurnstileInstance>(null);

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const selectedDepartment = watch('department');

  const onSubmit = async (data: FormValues) => {
    if (!turnstileToken) {
      setError('Lütfen güvenlik doğrulamasını tamamlayın.');
      return;
    }
    
    let finalDepartment = data.department;
    if (data.department === 'Diğer') {
      if (data.customDepartment && data.customDepartment.trim() !== '') {
        finalDepartment = data.customDepartment;
      }
    }

    setIsSubmitting(true);
    setError('');
    
    // We send data to CMS
    const payloadData = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      department: finalDepartment,
      year: data.year,
      kvkkApproved: data.kvkk,
      privacyPolicyApproved: data.privacyPolicy
    };
    
    const result = await submitMemberApplication(payloadData, turnstileToken);
    
    setIsSubmitting(false);

    const success = result.ok;
    turnstileRef.current?.reset();
    setTurnstileToken(null);
    if (success) {
      tracking.submitted();
      setIsSuccess(true);
      reset();
    } else {
      setError(result.error || 'Başvuru gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="kart relative w-full max-w-xl space-y-5 px-6 py-12 text-center sm:px-12"
        >
          <div className="absolute -right-3 -top-4"><Cikartma renk="pembe" aci={8}>Yaşasın!</Cikartma></div>
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-kenar bg-nane text-4xl shadow-sert-sm">🎉</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">Başvurunuz Alındı!</h2>
          <p className="text-soluk">Aramıza katılmak için ilk adımı attınız. En kısa sürede sizinle iletişime geçeceğiz.</p>
          <button onClick={() => setIsSuccess(false)} className="dugme dugme-yuzey mt-2">Yeni Başvuru Yap</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <SayfaBasligi
        renk="ana"
        ust="Başvuru"
        baslik="Topluluk Üyeliği"
        aciklama={<>{KULUP.tamAd} ailesine katılın, etkinliklerimizle kendinizi geliştirin ve iyi vakit geçirin!</>}
        cikartma={<Cikartma renk="limon" aci={6}>Üye Ol</Cikartma>}
      />

      <div className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
        <motion.form
          ref={tracking.ref}
          onFocusCapture={tracking.onFocusCapture}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit(onSubmit)}
          className="kart space-y-8 p-6 sm:p-10"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Alan etiket="Ad Soyad" htmlFor="uye-fullName" hata={errors.fullName?.message}>
              <input id="uye-fullName" {...register('fullName')} aria-invalid={!!errors.fullName} autoComplete="name" className="girdi" />
            </Alan>
            <Alan etiket="E-posta" htmlFor="uye-email" hata={errors.email?.message}>
              <input id="uye-email" {...register('email')} aria-invalid={!!errors.email} autoComplete="email" className="girdi" />
            </Alan>
            <Alan etiket="Telefon" htmlFor="uye-phone" hata={errors.phone?.message}>
              <input id="uye-phone" {...register('phone')} {...phoneInputProps} aria-invalid={!!errors.phone} className="girdi" />
            </Alan>
            <Alan etiket="Bölüm" htmlFor="uye-department" hata={errors.department?.message}>
              <select id="uye-department" {...register('department')} aria-invalid={!!errors.department} className="girdi">
                <option value="">Seçiniz</option>
                <option value="Yazılım Mühendisliği">Yazılım Mühendisliği</option>
                <option value="Bilgisayar Mühendisliği">Bilgisayar Mühendisliği</option>
                <option value="Adli Bilişim Mühendisliği">Adli Bilişim Mühendisliği</option>
                <option value="Elektrik-Elektronik Mühendisliği">Elektrik-Elektronik Mühendisliği</option>
                <option value="Diğer">Diğer</option>
              </select>
              {selectedDepartment === 'Diğer' && (
                <input
                  {...register('customDepartment')}
                  aria-label="Bölümünüz"
                  placeholder="Lütfen bölümünüzü yazınız (isteğe bağlı)"
                  className="girdi mt-2"
                />
              )}
            </Alan>
            <Alan etiket="Sınıf" htmlFor="uye-year" hata={errors.year?.message}>
              <select id="uye-year" {...register('year')} aria-invalid={!!errors.year} className="girdi">
                <option value="">Seçiniz</option>
                <option value="Hazırlık">Hazırlık</option>
                <option value="1">1. Sınıf</option>
                <option value="2">2. Sınıf</option>
                <option value="3">3. Sınıf</option>
                <option value="4">4. Sınıf</option>
                <option value="YL">Yüksek Lisans</option>
                <option value="DR">Doktora</option>
              </select>
            </Alan>
          </div>

          <div className="space-y-3 rounded-2xl border border-kenar bg-zemin-2 p-4 sm:p-5">
            <div>
              <label className="group flex cursor-pointer items-start gap-3">
                <input type="checkbox" {...register('kvkk')} aria-invalid={!!errors.kvkk} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ana" />
                <span className="text-sm leading-snug text-murekkep">
                  <a href="/kvkk" target="_blank" rel="noreferrer" className="font-bold text-ana-yazi underline decoration-2 underline-offset-2 hover:decoration-wavy">KVKK Aydınlatma Metni</a>&apos;ni Okudum ve Onaylıyorum
                </span>
              </label>
              {errors.kvkk && <p className="ml-8 mt-1 text-sm font-semibold text-hata">{errors.kvkk.message}</p>}
            </div>

            <div>
              <label className="group flex cursor-pointer items-start gap-3">
                <input type="checkbox" {...register('privacyPolicy')} aria-invalid={!!errors.privacyPolicy} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ana" />
                <span className="text-sm leading-snug text-murekkep">
                  <a href="/gizlilik" target="_blank" rel="noreferrer" className="font-bold text-ana-yazi underline decoration-2 underline-offset-2 hover:decoration-wavy">Gizlilik Sözleşmesi</a>&apos;ni Okudum ve Kabul Ediyorum
                </span>
              </label>
              {errors.privacyPolicy && <p className="ml-8 mt-1 text-sm font-semibold text-hata">{errors.privacyPolicy.message}</p>}
            </div>
          </div>

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
            {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Gönderiliyor...</> : <>Başvuruyu Gönder <ArrowRight className="h-5 w-5" /></>}
          </button>

          {error && <p role="alert" className="rounded-2xl border border-kenar bg-pembe px-4 py-3 text-center text-sm font-bold text-murekkep">{error}</p>}
        </motion.form>
      </div>
    </div>
  );
}
