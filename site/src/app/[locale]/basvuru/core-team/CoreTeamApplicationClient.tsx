"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { useFormTracking } from '@/components/Analytics';
import { submitCoreTeamApplication } from '@/lib/api';
import { phoneInputProps, phoneSchema } from '@/lib/phone';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Alan, Cikartma, SayfaBasligi } from '@/components/kit';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import HumanCheck from '@/components/ui/HumanCheck';

const formSchema = z.object({
  fullName: z.string().min(3, 'En az 3 karakter olmalı'),
  email: z.string().email('Geçersiz e-posta adresi'),
  phone: phoneSchema('Geçerli bir telefon numarası girin'),
  department: z.string().min(2, 'Bölüm alanı zorunludur'),
  grade: z.string().min(1, 'Sınıf alanı zorunludur'),
  hometown: z.string().min(2, 'Memleket alanı zorunludur'),
  area: z.string().min(2, 'Lütfen bir alan seçin'),
  portfolioUrl: z.string().url('Geçerli bir URL girin').optional().or(z.literal('')),
  githubUrl: z.string().url('Geçerli bir URL girin').optional().or(z.literal('')),
  motivationLetter: z.string().min(50, 'En az 50 karakterlik bir motivasyon mektubu yazmalısınız'),
  kvkk: z.boolean().refine(val => val === true, 'KVKK onaylanmalıdır'),
  privacyPolicy: z.boolean().refine(val => val === true, 'Gizlilik Sözleşmesi onaylanmalıdır'),
});

type FormValues = z.infer<typeof formSchema>;

interface CoreTeamApplicationClientProps {
  isOpen: boolean;
  areas: { area: string; id?: string }[];
}

export default function CoreTeamApplicationClient({ isOpen, areas }: CoreTeamApplicationClientProps) {
  const tracking = useFormTracking('core-team');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [error, setError] = React.useState('');
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  // Doğrulama jetonu tek kullanımlık: her denemeden sonra widget sıfırlanır (tekrar denemede eski jeton reddediliyordu)
  const turnstileRef = React.useRef<TurnstileInstance>(null);

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

    const payloadData = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      department: data.department,
      grade: data.grade,
      hometown: data.hometown,
      area: data.area,
      portfolioUrl: data.portfolioUrl || undefined,
      githubUrl: data.githubUrl || undefined,
      motivationLetter: data.motivationLetter,
      kvkkApproved: data.kvkk,
      privacyPolicyApproved: data.privacyPolicy
    };

    const result = await submitCoreTeamApplication(payloadData, turnstileToken);

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

  if (!isOpen) {
    return (
      <div className="pb-20">
        <SayfaBasligi
          renk="seftali"
          ust="Başvuru"
          baslik="Core Team Başvurusu"
          cikartma={<Cikartma renk="yuzey" aci={5}>Yönetim Ekibi</Cikartma>}
        />
        <div className="mx-auto mt-10 flex max-w-6xl justify-center px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="kart w-full max-w-lg space-y-6 px-6 py-10 text-center sm:px-10"
          >
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-kenar bg-pembe text-murekkep shadow-sert-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep">Alımlar Kapalı</h2>
              <p className="text-lg leading-relaxed text-soluk">
                Şu anda Core Team alımlarımız kapalıdır. Yeni dönem alımları için sosyal medya hesaplarımızı ve WhatsApp grubumuzu takipte kalın.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="kart relative w-full max-w-xl space-y-5 px-6 py-12 text-center sm:px-12"
        >
          <div className="absolute -right-3 -top-4"><Cikartma renk="limon" aci={8}>Harika!</Cikartma></div>
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-kenar bg-gok text-4xl shadow-sert-sm">🚀</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">Başvurunuz Alındı!</h2>
          <p className="text-soluk">Core Team başvurunuz incelemeye alınmıştır. Süreç hakkında e-posta ile bilgilendirileceksiniz.</p>
          <button onClick={() => setIsSuccess(false)} className="dugme dugme-yuzey mt-2">Yeni Başvuru Yap</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <SayfaBasligi
        renk="seftali"
        ust="Başvuru"
        baslik="Core Team Başvurusu"
        aciklama="Yönetim ekibimize katılmak için aşağıdaki formu doldurun. İlgili birim koordinatörümüz sizinle iletişime geçecektir."
        cikartma={<Cikartma renk="yuzey" aci={5}>Yönetim Ekibi</Cikartma>}
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
            <Alan etiket="Ad Soyad" htmlFor="ct-fullName" hata={errors.fullName?.message}>
              <input id="ct-fullName" {...register('fullName')} aria-invalid={!!errors.fullName} autoComplete="name" className="girdi" />
            </Alan>
            <Alan etiket="E-posta" htmlFor="ct-email" hata={errors.email?.message}>
              <input id="ct-email" {...register('email')} aria-invalid={!!errors.email} autoComplete="email" className="girdi" />
            </Alan>
            <Alan etiket="Telefon" htmlFor="ct-phone" hata={errors.phone?.message}>
              <input id="ct-phone" {...register('phone')} {...phoneInputProps} aria-invalid={!!errors.phone} className="girdi" />
            </Alan>
            <Alan etiket="Bölüm" htmlFor="ct-department" hata={errors.department?.message}>
              <input id="ct-department" {...register('department')} aria-invalid={!!errors.department} className="girdi" />
            </Alan>
            <Alan etiket="Sınıf" htmlFor="ct-grade" hata={errors.grade?.message}>
              <input id="ct-grade" {...register('grade')} aria-invalid={!!errors.grade} className="girdi" />
            </Alan>
            <Alan
              etiket={<>Memleket <span className="ml-1 font-sans text-xs font-semibold text-soluk">(Aktiflik durumu için)</span></>}
              htmlFor="ct-hometown"
              hata={errors.hometown?.message}
            >
              <input id="ct-hometown" {...register('hometown')} aria-invalid={!!errors.hometown} className="girdi" />
            </Alan>
            <Alan
              etiket={<>Portfolio URL <span className="font-sans text-xs font-semibold text-soluk">(opsiyonel)</span></>}
              htmlFor="ct-portfolioUrl"
              hata={errors.portfolioUrl?.message}
            >
              <input id="ct-portfolioUrl" {...register('portfolioUrl')} aria-invalid={!!errors.portfolioUrl} placeholder="https://" className="girdi" />
            </Alan>
            <Alan
              etiket={<>GitHub URL <span className="font-sans text-xs font-semibold text-soluk">(opsiyonel)</span></>}
              htmlFor="ct-githubUrl"
              hata={errors.githubUrl?.message}
            >
              <input id="ct-githubUrl" {...register('githubUrl')} aria-invalid={!!errors.githubUrl} placeholder="https://github.com/" className="girdi" />
            </Alan>
          </div>

          <Alan etiket="Ekibimize Katılmak İstediğiniz Alan" htmlFor="ct-area" hata={errors.area?.message}>
            <select id="ct-area" {...register('area')} aria-invalid={!!errors.area} className="girdi">
              <option value="">Seçiniz...</option>
              {areas.map((a, i) => (
                <option key={a.id || i} value={a.area}>{a.area}</option>
              ))}
            </select>
          </Alan>

          <Alan etiket="Kendinden Bahset" htmlFor="ct-motivationLetter" hata={errors.motivationLetter?.message}>
            <textarea id="ct-motivationLetter" {...register('motivationLetter')} aria-invalid={!!errors.motivationLetter} rows={6} placeholder="Neden yönetim ekibimize katılmak istiyorsunuz? Hangi alanlarda katkı sağlamak istersiniz?" className="girdi resize-none" />
          </Alan>

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
