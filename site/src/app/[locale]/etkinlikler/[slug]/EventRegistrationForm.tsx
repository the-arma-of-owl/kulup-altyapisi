"use client";

import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { submitEventRegistration } from '@/lib/api';
import { phoneInputProps, phoneSchema } from '@/lib/phone';
import { Loader2, CheckCircle, User, Mail, AlertCircle, Star, KeyRound } from 'lucide-react';
import { useFormTracking } from '@/components/Analytics';

const formSchema = z.object({
  fullName: z.string().min(3, 'En az 3 karakter olmalı'),
  email: z.string().email('Geçersiz e-posta adresi'),
  phone: phoneSchema('Geçerli bir telefon numarası giriniz'),
  department: z.string().min(2, 'Bölüm adını giriniz'),
  kvkkApproved: z.boolean().refine(val => val === true, { message: 'KVKK onayı zorunludur' }),
  privacyPolicy: z.boolean().refine(val => val === true, { message: 'Gizlilik Sözleşmesi onayı zorunludur' }),
});

type FormValues = z.infer<typeof formSchema>;

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import HumanCheck from '@/components/ui/HumanCheck';

export interface RegistrationField {
  id?: string;
  name: string;   // soru başlığı (label)
  type: string;   // text | textarea | number | email | checkbox | rating | select | quiz
  required?: boolean;
  options?: string; // comma-separated for select / quiz
  imageUrl?: string; // quiz: isteğe bağlı soru görseli
  choices?: { label: string; imageUrl: string }[]; // quiz: her şıkkın kendi resmi
}

function InputField({ label, error, children }: { label: string; icon?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="etiket mb-0 flex items-center gap-1.5">
        {label}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-hata">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ana/40"
        >
          <Star
            className={`h-8 w-8 transition-colors ${star <= (hovered || value) ? 'fill-limon text-murekkep' : 'text-soluk/50'}`}
          />
        </button>
      ))}
      {value > 0 && <span className="ml-2 self-center rounded-full border border-kenar bg-limon px-2.5 py-0.5 font-display text-sm font-bold text-murekkep">{value}/5</span>}
    </div>
  );
}

export default function EventRegistrationForm({
  eventId,
  registrationFields = [],
  registrationStage = 'open',
  defaultValues,
  onSuccess,
  withAccount = false,
}: {
  eventId: number | string;
  registrationFields?: RegistrationField[];
  registrationStage?: 'open' | 'waitlist' | 'closed';
  /** Takım modu: katılımcı hesabındaki ad/e-posta ile önceden doldurma */
  defaultValues?: { fullName?: string; email?: string };
  /** Takım modu: başarılı başvurudan sonra bir sonraki adıma geçilir (teşekkür ekranı gösterilmez) */
  onSuccess?: (data: { fullName: string; email: string; password?: string }) => void;
  /** Takım modu (girişsiz): aynı formda katılımcı hesabı şifresi de alınır; ayrı "hesap oluştur" adımı yok */
  withAccount?: boolean;
}) {
  const tracking = useFormTracking('event', { entityType: 'event', entityId: Number(eventId) || undefined });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Doğrulama jetonu tek kullanımlık: her denemeden sonra widget sıfırlanır (tekrar denemede eski jeton reddediliyordu)
  const turnstileRef = useRef<TurnstileInstance>(null);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { kvkkApproved: undefined, privacyPolicy: undefined, fullName: defaultValues?.fullName ?? '', email: defaultValues?.email ?? '' },
  });

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [teamConsent, setTeamConsent] = useState(false);
  const [teamConsentError, setTeamConsentError] = useState('');

  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, string | number | boolean>>({});

  const handleDynamic = (name: string, value: string | number | boolean) => {
    setDynamicAnswers(prev => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (data: FormValues) => {
    if (withAccount) {
      // CMS kuralıyla aynı: en az 8 karakter, harf ve rakam
      if (password.length < 8 || password.length > 128 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
        setPasswordError('Şifre en az 8 karakter olmalı; harf ve rakam içermeli.');
        return;
      }
      if (password !== password2) {
        setPasswordError('Şifreler aynı değil.');
        return;
      }
      setPasswordError('');
      if (!teamConsent) {
        setTeamConsentError('Takım bilgilerinin işlenmesine onay vermen gerekiyor.');
        return;
      }
      setTeamConsentError('');
    }
    if (!turnstileToken) {
      setError('Lütfen güvenlik doğrulamasını tamamlayın.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    const dynamicAnswersArray = Object.entries(dynamicAnswers).map(([q, a]) => ({
      question: q,
      answer: String(a)
    }));

    const result = await submitEventRegistration({
      // Takım modunda kimlik metin olarak gelir; CMS ilişki alanı sayı bekler ("12" → geçersiz Event)
      event: Number(eventId) || eventId,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      department: data.department,
      kvkkApproved: data.kvkkApproved,
      privacyPolicyApproved: data.privacyPolicy,
      dynamicAnswers: dynamicAnswersArray,
      status: 'pending',
      applicationStage: registrationStage === 'waitlist' ? 'late' : 'normal',
    }, turnstileToken);

    setIsSubmitting(false);
      const success = result.ok;
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      if (success) {
        tracking.submitted();
        if (onSuccess) {
          onSuccess({ fullName: data.fullName, email: data.email, ...(withAccount ? { password } : {}) });
          return;
        }
        setIsSuccess(true);
        reset();
        setDynamicAnswers({});
      } else {
        setError(result.error || 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
      }
  };

  if (registrationStage === 'closed') {
    return (
      <div className="space-y-3 rounded-kutu border border-kenar bg-pembe p-8 text-center text-murekkep shadow-sert">
        <AlertCircle className="mx-auto h-10 w-10" />
        <p className="font-display text-lg font-extrabold">Bu etkinlik için alımlar kapanmıştır.</p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative space-y-5 rounded-kutu border border-kenar bg-nane p-10 text-center text-murekkep shadow-sert-lg"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-kenar bg-white shadow-sert-sm"><CheckCircle className="h-9 w-9" /></span>
        <div>
          <h3 className="font-display text-3xl font-extrabold tracking-tight">Başvurunuz Alındı!</h3>
          <p className="mt-2 text-base opacity-85">Değerlendirme sonucu e-posta ile bildirilecektir.</p>
        </div>
        <button onClick={() => setIsSuccess(false)} className="dugme border-kenar bg-yuzey text-murekkep">
          Tekrar Başvur
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      ref={tracking.ref}
      onFocusCapture={tracking.onFocusCapture}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit(onSubmit)}
      className="kart space-y-8 p-5 shadow-sert-lg sm:p-8"
    >
      <div>
        <p className="mb-5 flex items-center gap-3 font-display text-lg font-extrabold text-murekkep">Kişisel Bilgiler</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InputField label="Ad Soyad *" icon={<User className="w-3.5 h-3.5" />} error={errors.fullName?.message}>
            <input {...register('fullName')}
              placeholder="Örn: Ahmet Yılmaz"
              className="girdi" />
          </InputField>
          <InputField label="E-posta *" icon={<Mail className="w-3.5 h-3.5" />} error={errors.email?.message}>
            <input {...register('email')} type="email" autoComplete="email"
              placeholder="ornek@gmail.com"
              className="girdi" />
            {/* Okul maili yazılınca kabul/bilet mailleri çoğu zaman görülmüyor */}
            <p className="text-sm text-soluk">Sık kullandığın kişisel e-postanı yaz (Gmail vb.). Kabul ve bilet bilgisi buraya gelir.</p>
          </InputField>
          <InputField label="Telefon Numarası *" icon={<User className="w-3.5 h-3.5" />} error={errors.phone?.message}>
            <input {...register('phone')} {...phoneInputProps}
              placeholder="0555 555 55 55"
              className="girdi" />
          </InputField>
          <InputField label="Bölüm *" icon={<User className="w-3.5 h-3.5" />} error={errors.department?.message}>
            <input {...register('department')} type="text"
              placeholder="Örn: Yazılım Mühendisliği"
              className="girdi" />
          </InputField>
        </div>
      </div>

      {withAccount && (
        <div>
          <p className="mb-1 flex items-center gap-3 font-display text-lg font-extrabold text-murekkep">Katılımcı Hesabı</p>
          <p className="mb-5 text-sm text-soluk">Takımını kurmak ve yönetmek için. Gönderince e-postana tek seferlik 6 haneli bir kod gelir.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Şifre *" icon={<KeyRound className="w-3.5 h-3.5" />}>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter, harf ve rakam"
                className="girdi" />
            </InputField>
            <InputField label="Şifre (tekrar) *" icon={<KeyRound className="w-3.5 h-3.5" />} error={passwordError || undefined}>
              <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)}
                className="girdi" />
            </InputField>
          </div>
        </div>
      )}

      {registrationFields.length > 0 && (
        <div>
          <p className="mb-5 flex items-center gap-3 font-display text-lg font-extrabold text-murekkep">Etkinlik Soruları</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {registrationFields.map((field, idx) => {
              const fieldKey = field.name || `field_${idx}`;
              const isFullWidth = field.type === 'textarea' || field.type === 'rating' || field.type === 'checkbox' || field.type === 'quiz';

              return (
                <div key={idx} className={isFullWidth ? 'md:col-span-2' : ''}>
                  <InputField label={`${field.name}${field.required ? ' *' : ''}`}>
                    {field.type === 'textarea' && (
                      <textarea
                        required={field.required}
                        rows={4}
                        placeholder={`${field.name} girin...`}
                        onChange={(e) => handleDynamic(fieldKey, e.target.value)}
                        className="girdi resize-none"
                      />
                    )}
                    {field.type === 'checkbox' && (
                      <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl border border-kenar bg-zemin-2 px-4 py-3">
                        <input
                          type="checkbox"
                          onChange={(e) => handleDynamic(fieldKey, e.target.checked)}
                          className="h-5 w-5 shrink-0 cursor-pointer rounded"
                          style={{ accentColor: 'var(--kulup-ana, #7c3aed)' }}
                        />
                        <span className="text-sm font-semibold text-murekkep">{field.name}</span>
                      </label>
                    )}
                    {field.type === 'rating' && (
                      <RatingInput
                        value={(dynamicAnswers[fieldKey] as number) || 0}
                        onChange={(v) => handleDynamic(fieldKey, v)}
                      />
                    )}
                    {field.type === 'select' && (
                      <select
                        required={field.required}
                        onChange={(e) => handleDynamic(fieldKey, e.target.value)}
                        className="girdi cursor-pointer"
                      >
                        <option value="">Seçiniz...</option>
                        {(field.options || '').split(',').map((opt, i) => (
                          <option key={i} value={opt.trim()}>{opt.trim()}</option>
                        ))}
                      </select>
                    )}
                    {field.type === 'quiz' && (
                      <div className="space-y-3">
                        {field.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={field.imageUrl} alt={field.name} loading="lazy"
                            className="max-h-72 w-full rounded-2xl border border-kenar bg-white object-contain" />
                        )}
                        <div role="radiogroup" aria-label={field.name} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(field.choices || []).map((choice, i) => {
                            const letter = String.fromCharCode(65 + i);
                            // Kayda "A — yazı" (yazı yoksa yalnızca harf) olarak geçer; CSV'de okunur kalır
                            const value = choice.label ? `${letter} — ${choice.label}` : letter;
                            const checked = dynamicAnswers[fieldKey] === value;
                            return (
                              <label key={i} className={`relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-kenar transition-[transform,box-shadow,background-color] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ana/40 ${checked
                                ? 'bg-ana-acik shadow-sert -translate-x-0.5 -translate-y-0.5'
                                : 'bg-yuzey shadow-sert-sm hover:shadow-sert'}`}>
                                <input type="radio" name={`quiz_${idx}`} value={value} required={field.required} checked={checked}
                                  onChange={() => handleDynamic(fieldKey, value)} className="sr-only" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {/* Resim kendi oranında (yatay yatay, dikey dikey); çok uzun dikeyler ekranla sınırlı */}
                                <img src={choice.imageUrl} alt={choice.label || `Şık ${letter}`} loading="lazy"
                                  className="block h-auto max-h-[70vh] w-full border-b-2 border-kenar bg-white object-contain" />
                                <span className="flex items-start gap-2.5 px-3.5 py-3 text-[15px] font-semibold leading-snug text-murekkep">
                                  <b className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-kenar font-display text-sm font-extrabold ${checked ? 'bg-ana text-white' : 'bg-zemin-2'}`}>{letter}</b>
                                  <span className="pt-0.5 break-words">{choice.label}</span>
                                </span>
                                {checked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-kenar bg-limon text-sm font-black text-murekkep">✓</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(field.type === 'text' || field.type === 'number' || field.type === 'email') && (
                      <input
                        type={field.type}
                        required={field.required}
                        placeholder={`${field.name} girin...`}
                        onChange={(e) => handleDynamic(fieldKey, e.target.value)}
                        className="girdi"
                      />
                    )}
                  </InputField>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KVKK ve Gizlilik */}
      <div className="space-y-4 border-t-2 border-dashed border-kenar/25 pt-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" {...register('kvkkApproved')}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded" style={{ accentColor: 'var(--kulup-ana, #7c3aed)' }} />
          <span className="text-sm leading-relaxed text-murekkep">
            <a href="/kvkk" target="_blank" rel="noreferrer" className="font-bold text-ana-yazi underline decoration-2 underline-offset-2">KVKK Aydınlatma Metni</a>&apos;ni okudum ve kabul ediyorum *
          </span>
        </label>
        {errors.kvkkApproved && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-hata">
            <AlertCircle className="h-4 w-4 shrink-0" /> {errors.kvkkApproved.message}
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" {...register('privacyPolicy')}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded" style={{ accentColor: 'var(--kulup-ana, #7c3aed)' }} />
          <span className="text-sm leading-relaxed text-murekkep">
            <a href="/gizlilik" target="_blank" rel="noreferrer" className="font-bold text-ana-yazi underline decoration-2 underline-offset-2">Gizlilik Sözleşmesi</a>&apos;ni okudum ve kabul ediyorum *
          </span>
        </label>
        {errors.privacyPolicy && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-hata">
            <AlertCircle className="h-4 w-4 shrink-0" /> {errors.privacyPolicy.message}
          </p>
        )}
        {withAccount && (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={teamConsent} onChange={(e) => setTeamConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded" style={{ accentColor: 'var(--kulup-ana, #7c3aed)' }} />
              <span className="text-sm leading-relaxed text-murekkep">
                Hesap ve takım bilgilerimin etkinlik yönetimi için işlenmesine; takımım onaylanırsa adımın ve takım bilgilerinin sitede yayımlanmasına açık rıza veriyorum *
              </span>
            </label>
            {teamConsentError && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-hata">
                <AlertCircle className="h-4 w-4 shrink-0" /> {teamConsentError}
              </p>
            )}
          </>
        )}
      </div>

      {/* Turnstile Yeri */}
      <div className="my-4 flex justify-center">
        <HumanCheck
          ref={turnstileRef}
          onExpire={() => setTurnstileToken(null)}
          onError={() => setTurnstileToken(null)}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''} 
          onSuccess={(token) => setTurnstileToken(token)}
          options={{ theme: 'auto' }}
        />
      </div>

      <button
        disabled={isSubmitting || !turnstileToken}
        type="submit"
        className="dugme dugme-ana dugme-buyuk w-full py-4 text-lg"
      >
        {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Gönderiliyor...</> : withAccount ? 'Başvur ve Devam Et' : 'Başvuruyu Gönder'}
      </button>

      {error && (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-kenar bg-pembe px-4 py-3 text-sm font-bold text-murekkep">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <p className="text-center text-xs font-semibold text-soluk">
        Başvurular değerlendirmeye alınır — kabul e-posta ile bildirilir
      </p>
    </motion.form>
  );
}
