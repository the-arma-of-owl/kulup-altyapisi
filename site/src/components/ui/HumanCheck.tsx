"use client";

import React, { forwardRef, useEffect, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';

// Formlardaki Cloudflare Turnstile doğrulamasının ortak, mobil dostu sarmalayıcısı:
// - Kutucuk yalnız gerekirse görünür (çoğu kişi hiçbir şey görmeden geçer)
// - Süresi dolan/başarısız doğrulama kendiliğinden yenilenir
// - 7 sn'de bitmezse "Sorun mu yaşıyorsunuz?" ile tek dokunuşta baştan başlatılır
// - Instagram/WhatsApp gibi uygulama içi tarayıcılarda (Turnstile'ın sık takıldığı yer)
//   "tarayıcıda aç" önerisi gösterilir
// Eski <Turnstile> ile aynı props'u alır; ref yine TurnstileInstance'a gider (reset için).

const TIMEOUT_MS = 7000;
const IN_APP_UA = /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|TikTok|Snapchat|; wv\)/i;

type Props = {
  siteKey?: string;
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  options?: Record<string, unknown>;
  className?: string;
};

const HumanCheck = forwardRef<TurnstileInstance, Props>(function HumanCheck(
  { siteKey, onSuccess, onExpire, onError, className },
  ref,
) {
  const key = siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const [attempt, setAttempt] = useState(0);
  const [solved, setSolved] = useState(false);
  const [slow, setSlow] = useState<number | null>(null);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(IN_APP_UA.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (solved) return;
    const timer = setTimeout(() => setSlow(attempt), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt, solved]);

  const restart = () => {
    setSolved(false);
    setSlow(null);
    setAttempt((n) => n + 1);
    onExpire?.();
  };

  if (!key) return null;
  const showHelp = !solved && slow === attempt;

  return (
    <div className={className ?? 'flex flex-col items-center gap-2 my-4'}>
      <Turnstile
        key={attempt}
        ref={ref}
        siteKey={key}
        onSuccess={(token) => {
          setSolved(true);
          onSuccess(token);
        }}
        onExpire={() => {
          setSolved(false);
          onExpire?.();
        }}
        onError={() => {
          setSolved(false);
          onError?.();
        }}
        options={{
          theme: 'auto',
          size: 'flexible',
          appearance: 'interaction-only',
          refreshExpired: 'auto',
          retry: 'auto',
          retryInterval: 2000,
          language: 'tr',
        }}
      />

      {!solved && !showHelp && (
        <p className="flex items-center gap-2 text-xs font-semibold text-soluk">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Güvenlik doğrulaması yapılıyor…
        </p>
      )}

      {showHelp && (
        <div className="w-full space-y-2 rounded-2xl border border-kenar bg-limon px-4 py-3 text-xs text-murekkep shadow-sert-sm">
          <button type="button" onClick={restart} className="flex items-center gap-2 text-left font-display text-sm font-bold underline decoration-2 underline-offset-2">
            <RefreshCw className="h-4 w-4 shrink-0" /> Sorun mu yaşıyorsunuz? Doğrulamayı yenilemek için dokunun.
          </button>
          {inApp && (
            <p className="flex items-start gap-2 leading-relaxed">
              <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Uygulama içi tarayıcıda (Instagram, WhatsApp…) doğrulama takılabiliyor. Sağ üstteki menüden
              <b className="mx-1">&quot;Tarayıcıda aç&quot;</b> deyip formu Chrome/Safari&apos;de doldurun.
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export default HumanCheck;
