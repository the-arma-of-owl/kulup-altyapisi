/* eslint-disable @next/next/no-img-element -- ödül görselleri CMS/CDN adresinden gelir */
import { Award, Medal, Trophy } from 'lucide-react';
import { medalTone, normalizePrizes, type Prize } from './prizeStyles';

export type { Prize };

export function PrizeIcon({ rank, className = 'h-6 w-6' }: { rank: number; className?: string }) {
  if (rank === 1) return <Trophy className={className} aria-hidden />;
  if (rank <= 3) return <Medal className={className} aria-hidden />;
  return <Award className={className} aria-hidden />;
}

/** Ödül görseli yalnız https ya da site-içi yol ise gösterilir. */
function prizeImage(url: string | undefined): string | null {
  if (!url) return null;
  return /^https:\/\//.test(url) || /^\/(?!\/)/.test(url) ? url : null;
}

/** Etkinlik detayında ödüller: ilk üç özel kart (masaüstünde 2-1-3 dizilimi), kalanlar liste. Görsel varsa kartta gösterilir. */
export default function EventPrizes({
  prizes,
  heading = 'Ödüller',
  eyebrow = 'Kazananları neler bekliyor',
}: {
  prizes: Prize[];
  heading?: string;
  eyebrow?: string;
}) {
  const list = normalizePrizes(prizes);
  if (list.length === 0) return null;
  const top = list.filter((p) => p.rank <= 3);
  const rest = list.filter((p) => p.rank > 3);
  // masaüstü podyum dizilimi: 2 – 1 – 3
  const desktopOrder = (rank: number) => (rank === 1 ? 'md:order-2' : rank === 2 ? 'md:order-1' : 'md:order-3');

  return (
    <section aria-labelledby="event-prizes-heading" className="space-y-6">
      <div>
        <p className="ust-baslik">{eyebrow}</p>
        <h2 id="event-prizes-heading" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">
          {heading}
        </h2>
      </div>

      {top.length > 0 && (
        <ol className={`grid grid-cols-1 gap-5 ${top.length >= 3 ? 'md:grid-cols-3' : top.length === 2 ? 'md:grid-cols-2' : ''} md:items-end`}>
          {top.map((p) => {
            const tone = medalTone(p.rank);
            const first = p.rank === 1;
            const image = prizeImage(p.imageUrl);
            return (
              <li
                key={`${p.rank}-${p.title}`}
                className={`${desktopOrder(p.rank)} relative flex flex-col items-center rounded-kutu px-6 text-center ${tone.card} ${first ? 'py-9' : 'py-7'}`}
              >
                {image && (
                  <img src={image} alt={p.imageAlt || p.title} loading="lazy" decoding="async"
                    className="mb-5 aspect-[4/3] w-full rounded-2xl border border-kenar bg-white object-contain" />
                )}
                <span className={`flex items-center justify-center rounded-full ${tone.medal} ${first ? 'h-16 w-16' : 'h-12 w-12'}`}>
                  <PrizeIcon rank={p.rank} className={first ? 'h-8 w-8' : 'h-6 w-6'} />
                </span>
                <span className={`mt-4 font-display text-xs font-extrabold uppercase tracking-[0.2em] ${tone.accent}`}>{tone.label}</span>
                <p className={`mt-2 break-words font-display font-extrabold leading-tight tracking-tight ${first ? 'text-2xl' : 'text-xl'}`}>
                  {p.title}
                </p>
                {p.description && <p className="mt-2 text-sm leading-relaxed opacity-80">{p.description}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {rest.length > 0 && (
        <ol className="kart divide-y-2 divide-dashed divide-kenar/20 overflow-hidden">
          {rest.map((p) => (
            <li key={`${p.rank}-${p.title}`} className="flex items-start gap-4 px-5 py-4">
              {prizeImage(p.imageUrl) && (
                <img src={prizeImage(p.imageUrl)!} alt={p.imageAlt || p.title} loading="lazy" decoding="async"
                  className="h-14 w-14 shrink-0 rounded-xl border border-kenar bg-white object-cover" />
              )}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-kenar bg-ana-acik font-display text-sm font-extrabold text-ana-yazi">
                {p.rank}.
              </span>
              <div className="min-w-0">
                <p className="break-words font-display font-bold text-murekkep">{p.title}</p>
                {p.description && <p className="mt-0.5 text-sm text-soluk">{p.description}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
