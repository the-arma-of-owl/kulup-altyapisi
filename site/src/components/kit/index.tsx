// Ortak arayüz parçaları. Tüm sayfalar bunları (ya da globals.css'teki .kart/.dugme/.girdi sınıflarını) kullanır.
// Tasarım dili: krem zemin, 2px mürekkep kenar, sert gölge, renkli bloklar, Bricolage Grotesque başlıklar.
import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export type Renk = 'ana' | 'limon' | 'seftali' | 'pembe' | 'gok' | 'nane' | 'yuzey';

/** Zemin rengine göre arka plan sınıfı. 'ana' beyaz yazı ister, diğerleri koyu mürekkep. */
export const RENK_BG: Record<Renk, string> = {
  ana: 'bg-ana text-white',
  limon: 'bg-limon text-murekkep',
  seftali: 'bg-seftali text-murekkep',
  pembe: 'bg-pembe text-murekkep',
  gok: 'bg-gok text-murekkep',
  nane: 'bg-nane text-murekkep',
  yuzey: 'bg-yuzey text-murekkep',
};

/** Listelerde sırayla renk vermek için: RENK_SIRASI[i % RENK_SIRASI.length] */
export const RENK_SIRASI: Renk[] = ['limon', 'pembe', 'gok', 'seftali', 'nane'];

type DugmeTur = 'ana' | 'limon' | 'yuzey';
type DugmeOrtak = { tur?: DugmeTur; buyuk?: boolean; className?: string; children: ReactNode };

function dugmeSinif(tur: DugmeTur = 'ana', buyuk?: boolean, className?: string) {
  return cn('dugme', tur === 'ana' && 'dugme-ana', tur === 'limon' && 'dugme-limon', tur === 'yuzey' && 'dugme-yuzey', buyuk && 'dugme-buyuk', className);
}

/** Buton. `href` verilirse site içi bağlantı (i18n Link), `dis` ile harici bağlantı olur. */
export function Dugme(props: DugmeOrtak & (
  | ({ href: string; dis?: boolean } & Omit<ComponentProps<'a'>, 'href' | 'className' | 'children'>)
  | ({ href?: undefined } & Omit<ComponentProps<'button'>, 'className' | 'children'>)
)) {
  const { tur, buyuk, className, children, ...rest } = props;
  const sinif = dugmeSinif(tur, buyuk, className);
  if ('href' in rest && rest.href !== undefined) {
    const { href, dis, ...a } = rest as { href: string; dis?: boolean } & ComponentProps<'a'>;
    if (dis) return <a href={href} target="_blank" rel="noopener noreferrer" className={sinif} {...a}>{children}</a>;
    return <Link href={href} className={sinif} {...(a as object)}>{children}</Link>;
  }
  const b = rest as ComponentProps<'button'>;
  return <button type={b.type ?? 'button'} className={sinif} {...b}>{children}</button>;
}

/** Kart: beyaz (ya da renkli) kutu, kalın kenar, sert gölge. `hover` ile tıklanabilir his. */
export function Kart({ renk = 'yuzey', hover, className, children, ...rest }: { renk?: Renk; hover?: boolean } & ComponentProps<'div'>) {
  return <div className={cn('kart', RENK_BG[renk], hover && 'kart-hover', className)} {...rest}>{children}</div>;
}

/** Küçük etiket/rozet. */
export function Rozet({ renk = 'limon', className, children }: { renk?: Renk; className?: string; children: ReactNode }) {
  return <span className={cn('rozet', RENK_BG[renk], renk === 'ana' && 'text-white', className)}>{children}</span>;
}

/** Eğik çıkartma (sticker) — başlık yanlarında süs olarak. */
// Sade tasarımda eğik çıkartmalar gösterilmiyor; bileşen geriye uyum için duruyor.
export function Cikartma(_: { renk?: Renk; aci?: number; className?: string; children: ReactNode }) {
  return null;
}
export function CikartmaEski({ renk = 'limon', aci = -4, className, children }: { renk?: Renk; aci?: number; className?: string; children: ReactNode }) {
  return (
    <span style={{ rotate: `${aci}deg` }} className={cn('inline-block rounded-xl border border-kenar px-3 py-1 font-display text-sm font-extrabold shadow-sert-sm', RENK_BG[renk], className)}>
      {children}
    </span>
  );
}

/**
 * Sayfa başlığı: renkli büyük blok. Her sayfanın en üstünde kullanılır.
 * Navbar akış içinde (sticky) olduğundan sayfalarda ekstra üst boşluk gerekmez.
 */
export function SayfaBasligi({
  ust, baslik, aciklama, renk = 'ana', cikartma, children, className,
}: { ust?: ReactNode; baslik: ReactNode; aciklama?: ReactNode; renk?: Renk; cikartma?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('px-4 pt-6 sm:px-6', className)}>
      <div className={cn('relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-kenar px-6 py-10 shadow-sert-lg sm:px-10 sm:py-14', RENK_BG[renk])}>
        <Desen />
        <div className="relative">
          {ust && <p className="mb-3 font-display text-xs font-extrabold uppercase tracking-[0.2em] opacity-80">{ust}</p>}
          <h1 className="max-w-4xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">{baslik}</h1>
          {aciklama && <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-85 sm:text-lg">{aciklama}</p>}
          {children && <div className="mt-6">{children}</div>}
        </div>
        {cikartma && <div className="absolute right-6 top-6 hidden sm:block">{cikartma}</div>}
      </div>
    </header>
  );
}

/** Başlık bloklarının içindeki hafif nokta deseni. */
export function Desen({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 opacity-[0.18]', className)}
      style={{ backgroundImage: 'radial-gradient(currentColor 1.4px, transparent 1.6px)', backgroundSize: '22px 22px' }} />
  );
}

/** Sayfa bölümü: ortalanmış içerik + isteğe bağlı başlık satırı. */
export function Bolum({ ust, baslik, sag, className, icerikSinif, children, id }: {
  ust?: ReactNode; baslik?: ReactNode; sag?: ReactNode; className?: string; icerikSinif?: string; children: ReactNode; id?: string;
}) {
  return (
    <section id={id} className={cn('px-4 py-12 sm:px-6 sm:py-16', className)}>
      <div className={cn('mx-auto max-w-6xl', icerikSinif)}>
        {(baslik || ust) && (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              {ust && <p className="ust-baslik mb-2">{ust}</p>}
              {baslik && <h2 className="font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">{baslik}</h2>}
            </div>
            {sag}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Form alanı sarmalayıcı: etiket + içerik + yardım/hata metni. Girdiye `className="girdi"` ver. */
export function Alan({ etiket, htmlFor, zorunlu, yardim, hata, className, children }: {
  etiket?: ReactNode; htmlFor?: string; zorunlu?: boolean; yardim?: ReactNode; hata?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <div className={className}>
      {etiket && <label htmlFor={htmlFor} className="etiket">{etiket}{zorunlu && <span className="ml-0.5 text-hata">*</span>}</label>}
      {children}
      {hata ? <p className="mt-1.5 text-sm font-semibold text-hata">{hata}</p> : yardim ? <p className="mt-1.5 text-sm text-soluk">{yardim}</p> : null}
    </div>
  );
}

/** Boş liste / içerik yok durumu. */
export function BosDurum({ simge, baslik, aciklama, children, className }: { simge?: ReactNode; baslik: ReactNode; aciklama?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('kart flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      {simge && <div className="grid h-14 w-14 place-items-center rounded-2xl border border-kenar bg-limon text-murekkep shadow-sert-sm">{simge}</div>}
      <p className="font-display text-xl font-extrabold">{baslik}</p>
      {aciklama && <p className="max-w-md text-soluk">{aciklama}</p>}
      {children}
    </div>
  );
}

/** Bilgi / uyarı kutusu. */
export function Bilgi({ tur = 'bilgi', baslik, children, className }: { tur?: 'bilgi' | 'uyari' | 'hata' | 'basari'; baslik?: ReactNode; children: ReactNode; className?: string }) {
  const renk = { bilgi: 'bg-gok', uyari: 'bg-limon', hata: 'bg-pembe', basari: 'bg-nane' }[tur];
  return (
    <div role={tur === 'hata' ? 'alert' : undefined} className={cn('rounded-2xl border border-kenar p-4 text-murekkep shadow-sert-sm', renk, className)}>
      {baslik && <p className="mb-1 font-display font-extrabold">{baslik}</p>}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
