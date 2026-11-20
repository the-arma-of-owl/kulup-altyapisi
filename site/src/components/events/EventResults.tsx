import { ArrowUpRight, Crown } from 'lucide-react';
import { Link } from '@/i18n/routing';
import EventPrizes, { PrizeIcon } from './EventPrizes';
import { formatScore, medalTone, normalizePrizes, type Prize } from './prizeStyles';

export type ResultRow = { rank: number; name: string; teamSlug?: string | null; score?: number | null };
export type ResultsMode = 'top3' | 'first' | 'full';

/**
 * Geçmiş etkinlik sonuçları.
 * - `top3`: podyum (yalnız ilk üç sıra gösterilir/açıklanır)
 * - `first`: yalnız birinci(ler) vurgulanır
 * - `full`: tam sıralama tablosu
 * Mod, açıklanmayan sıraların adlarını ödül bölümünde de GİZLER.
 * Eşit sıralar ("1, 1, 3") aynı basamakta birlikte gösterilir.
 */
export default function EventResults({
  mode,
  results,
  prizes,
  eventSlug,
}: {
  mode: ResultsMode;
  results: ResultRow[];
  prizes: Prize[];
  eventSlug?: string;
}) {
  const all = (results ?? [])
    .filter((r) => r && Number.isInteger(r.rank) && r.rank > 0 && typeof r.name === 'string' && r.name.trim() !== '')
    .sort((a, b) => a.rank - b.rank);
  const visible = all.filter((r) => (mode === 'first' ? r.rank === 1 : mode === 'top3' ? r.rank <= 3 : true));
  const prizeList = normalizePrizes(prizes);

  const teamHref = (r: ResultRow) =>
    eventSlug && r.teamSlug
      ? `/etkinlikler/${encodeURIComponent(eventSlug)}/takimlar/${encodeURIComponent(r.teamSlug)}`
      : null;

  const name: NameFn = (r, className) => {
    const href = teamHref(r);
    if (!href) return <span className={className}>{r.name}</span>;
    return (
      <Link
        href={href}
        className={`${className} inline-flex items-center gap-1 decoration-2 underline-offset-4 hover:underline`}
      >
        <span className="min-w-0 break-words">{r.name}</span>
        <ArrowUpRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </Link>
    );
  };

  const groups = new Map<number, ResultRow[]>();
  for (const r of visible) groups.set(r.rank, [...(groups.get(r.rank) ?? []), r]);

  return (
    <section aria-labelledby="event-results-heading" className="space-y-12">
      <div className="space-y-6">
        <div>
          <p className="ust-baslik">Sonuçlar</p>
          <h2 id="event-results-heading" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-murekkep sm:text-4xl">
            {mode === 'first' ? 'Kazanan' : mode === 'top3' ? 'Dereceye girenler' : 'Sıralama'}
          </h2>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-kutu border border-dashed border-kenar/40 px-6 py-8 text-center text-sm font-semibold text-soluk">
            Sonuçlar henüz açıklanmadı.
          </p>
        ) : mode === 'first' ? (
          <FirstPlace rows={groups.get(1) ?? []} prize={prizeList.find((p) => p.rank === 1)} name={name} />
        ) : mode === 'top3' ? (
          <Podium groups={groups} name={name} />
        ) : (
          <FullTable rows={visible} prizes={prizeList} name={name} />
        )}
      </div>

      {prizeList.length > 0 &&
        (visible.length === 0 ? (
          <EventPrizes prizes={prizeList} heading="Beklenen ödüller" eyebrow="Ödüller" />
        ) : (
          <AwardedPrizes prizes={prizeList} groups={groups} />
        ))}
    </section>
  );
}

type NameFn = (r: ResultRow, className: string) => React.ReactNode;

function ScoreBadge({ score, className = '' }: { score?: number | null; className?: string }) {
  const s = formatScore(score);
  if (!s) return null;
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-full border border-current/60 px-2.5 py-0.5 font-mono text-xs font-bold ${className}`}>
      {s}
      <span className="text-[9px] font-black uppercase tracking-wider opacity-70">puan</span>
    </span>
  );
}

function FirstPlace({ rows, prize, name }: { rows: ResultRow[]; prize?: Prize; name: NameFn }) {
  const tone = medalTone(1);
  return (
    <div className={`relative overflow-hidden rounded-[2rem] px-6 py-10 text-center shadow-sert-lg sm:px-10 ${tone.card}`}>
      <span className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-full ${tone.medal}`}>
        <Crown className="h-10 w-10" aria-hidden />
      </span>
      <p className={`relative mt-5 font-display text-xs font-extrabold uppercase tracking-[0.2em] ${tone.accent}`}>
        {rows.length > 1 ? 'Ortak birinciler' : 'Birinci'}
      </p>
      <ul className="relative mt-3 space-y-3">
        {rows.map((r) => (
          <li key={`${r.rank}-${r.name}`} className="flex flex-col items-center gap-2">
            {name(r, "font-display text-3xl font-extrabold tracking-tight sm:text-5xl")}
            <ScoreBadge score={r.score} />
          </li>
        ))}
      </ul>
      {prize && (
        <p className="relative mx-auto mt-6 inline-flex max-w-full items-center gap-2 rounded-full border border-kenar bg-white px-4 py-2 text-sm font-bold text-murekkep">
          <PrizeIcon rank={1} className="h-4 w-4 shrink-0" />
          <span className="break-words">{prize.title}</span>
        </p>
      )}
    </div>
  );
}

function Podium({ groups, name }: { groups: Map<number, ResultRow[]>; name: NameFn }) {
  const ranks = [1, 2, 3].filter((r) => groups.has(r));
  const desktopOrder = (rank: number) => (rank === 1 ? 'md:order-2' : rank === 2 ? 'md:order-1' : 'md:order-3');
  const pillarHeight = (rank: number) => (rank === 1 ? 'md:h-40' : rank === 2 ? 'md:h-28' : 'md:h-20');
  const cols = ranks.length >= 3 ? 'md:grid-cols-3' : ranks.length === 2 ? 'md:grid-cols-2' : '';

  return (
    <ol className={`grid grid-cols-1 gap-4 md:items-end md:gap-3 ${cols}`}>
      {ranks.map((rank) => {
        const tone = medalTone(rank);
        const rows = groups.get(rank) ?? [];
        return (
          <li key={rank} className={`${desktopOrder(rank)} flex flex-col`}>
            <div className={`flex flex-col items-center rounded-kutu px-5 py-6 text-center md:rounded-b-none md:border-b-0 md:shadow-none ${tone.card}`}>
              <span className={`flex items-center justify-center rounded-full ${tone.medal} ${rank === 1 ? 'h-14 w-14' : 'h-11 w-11'}`}>
                <PrizeIcon rank={rank} className={rank === 1 ? 'h-7 w-7' : 'h-5 w-5'} />
              </span>
              <span className={`mt-3 font-display text-xs font-extrabold uppercase tracking-[0.2em] ${tone.accent}`}>{tone.label}</span>
              <ul className="mt-2 w-full space-y-2">
                {rows.map((r) => (
                  <li key={`${r.rank}-${r.name}`} className="flex flex-col items-center gap-1.5">
                    {name(r, `max-w-full font-display font-extrabold leading-tight tracking-tight ${rank === 1 ? 'text-2xl' : 'text-lg'}`)}
                    <ScoreBadge score={r.score} />
                  </li>
                ))}
              </ul>
            </div>
            <div
              aria-hidden
              className={`hidden items-start justify-center rounded-b-2xl pt-3 font-display text-5xl font-extrabold shadow-sert md:flex ${tone.pillar} ${pillarHeight(rank)}`}
            >
              {rank}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function FullTable({ rows, prizes, name }: { rows: ResultRow[]; prizes: Prize[]; name: NameFn }) {
  const prizeFor = (rank: number) => prizes.find((p) => p.rank === rank);
  const hasScore = rows.some((r) => formatScore(r.score) !== null);
  const hasPrize = rows.some((r) => prizeFor(r.rank));
  return (
    <div className="kart overflow-hidden">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="border-b-2 border-kenar bg-zemin-2 font-display text-xs font-extrabold uppercase tracking-[0.15em] text-soluk">
          <tr>
            <th scope="col" className="w-16 px-4 py-3 sm:w-20 sm:px-5">Sıra</th>
            <th scope="col" className="px-2 py-3">Takım</th>
            {hasPrize && <th scope="col" className="hidden px-2 py-3 md:table-cell">Ödül</th>}
            {hasScore && <th scope="col" className="w-24 px-4 py-3 text-right sm:w-28 sm:px-5">Puan</th>}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-dashed divide-kenar/15">
          {rows.map((r, i) => {
            const tone = medalTone(r.rank);
            const prize = prizeFor(r.rank);
            const podium = r.rank <= 3;
            return (
              <tr key={`${r.rank}-${r.name}-${i}`} className={podium ? 'bg-ana-acik/50' : ''}>
                <td className="px-4 py-3.5 align-middle sm:px-5">
                  <span
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 font-display text-sm font-extrabold ${
                      podium ? tone.chip : 'border border-kenar bg-zemin-2 text-murekkep'
                    }`}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="px-2 py-3.5 align-middle">
                  {name(r, `break-words font-display font-bold text-murekkep ${podium ? 'text-base' : ''}`)}
                  {prize && <p className="mt-0.5 break-words text-xs font-semibold text-ana-yazi md:hidden">{prize.title}</p>}
                </td>
                {hasPrize && (
                  <td className="hidden break-words px-2 py-3.5 align-middle text-xs font-semibold text-ana-yazi md:table-cell">
                    {prize?.title ?? <span className="text-soluk/50">—</span>}
                  </td>
                )}
                {hasScore && (
                  <td className="px-4 py-3.5 text-right align-middle font-mono font-bold tabular-nums text-murekkep sm:px-5">
                    {formatScore(r.score) ?? <span className="text-soluk/50">—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sonuçlar açıklandıysa: her ödül, aynı sıradaki (görünen) kazananlarla. */
function AwardedPrizes({ prizes, groups }: { prizes: Prize[]; groups: Map<number, ResultRow[]> }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="ust-baslik">Ödüller</p>
        <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-murekkep sm:text-3xl">Verilen ödüller</h3>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {prizes.map((p) => {
          const tone = medalTone(p.rank);
          const winners = groups.get(p.rank) ?? [];
          return (
            <li key={`${p.rank}-${p.title}`} className={`flex items-start gap-4 rounded-kutu p-5 ${tone.card}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.medal}`}>
                <PrizeIcon rank={p.rank} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className={`font-display text-xs font-extrabold uppercase tracking-[0.18em] ${tone.accent}`}>{p.rank}. sıra</p>
                <p className="mt-1 break-words font-display text-lg font-extrabold leading-tight">{p.title}</p>
                {p.description && <p className="mt-1 text-sm opacity-80">{p.description}</p>}
                <p className="mt-2 break-words text-sm font-bold">
                  {winners.length > 0 ? `→ ${winners.map((w) => w.name).join(', ')}` : <span className="opacity-50">—</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
