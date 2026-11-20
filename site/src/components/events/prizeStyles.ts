// Ödül/sonuç bileşenlerinin ortak görsel dili: 1. limon, 2. gök, 3. şeftali, diğerleri yüzey + ana renk.
// Kartlar kalın kenarlı ve düz renkli; renkli zeminde yazı her temada koyu mürekkep (#1a1625).
// `card` metin rengini de verir: kart içindeki metinler rengi devralır (text-current / opacity).

export type Prize = { rank: number; title: string; description?: string; imageUrl?: string; imageAlt?: string };

export type MedalTone = {
  label: string;
  /** Kart çerçevesi + zemin */
  card: string;
  /** Madalya dairesi */
  medal: string;
  /** Vurgu metni */
  accent: string;
  /** Küçük sıra rozeti */
  chip: string;
  /** Podyum sütunu */
  pillar: string;
};

const TONES: Record<1 | 2 | 3, MedalTone> = {
  1: {
    label: 'Birincilik',
    card: 'border-2 border-kenar bg-limon text-[#1a1625] shadow-sert',
    medal: 'border-2 border-[#1a1625] bg-[#1a1625] text-limon',
    chip: 'border-2 border-kenar bg-limon text-[#1a1625]',
    accent: 'text-[#1a1625]/75',
    pillar: 'border-2 border-kenar bg-limon text-[#1a1625]',
  },
  2: {
    label: 'İkincilik',
    card: 'border-2 border-kenar bg-gok text-[#1a1625] shadow-sert',
    medal: 'border-2 border-[#1a1625] bg-[#1a1625] text-gok',
    chip: 'border-2 border-kenar bg-gok text-[#1a1625]',
    accent: 'text-[#1a1625]/75',
    pillar: 'border-2 border-kenar bg-gok text-[#1a1625]',
  },
  3: {
    label: 'Üçüncülük',
    card: 'border-2 border-kenar bg-seftali text-[#1a1625] shadow-sert',
    medal: 'border-2 border-[#1a1625] bg-[#1a1625] text-seftali',
    chip: 'border-2 border-kenar bg-seftali text-[#1a1625]',
    accent: 'text-[#1a1625]/75',
    pillar: 'border-2 border-kenar bg-seftali text-[#1a1625]',
  },
};

const OTHER: MedalTone = {
  label: '',
  card: 'border-2 border-kenar bg-yuzey text-murekkep shadow-sert-sm',
  medal: 'border-2 border-kenar bg-ana text-white',
  chip: 'border-2 border-kenar bg-ana text-white',
  accent: 'text-ana-yazi',
  pillar: 'border-2 border-kenar bg-ana text-white',
};

export function medalTone(rank: number): MedalTone {
  return rank === 1 || rank === 2 || rank === 3 ? TONES[rank] : { ...OTHER, label: `${rank}.` };
}

/** Geçerli (pozitif tam sayı sıralı, başlıklı) ödülleri sıraya göre döner. */
export function normalizePrizes(prizes: Prize[] | null | undefined): Prize[] {
  return (prizes ?? [])
    .filter((p) => p && Number.isInteger(p.rank) && p.rank > 0 && typeof p.title === 'string' && p.title.trim() !== '')
    .sort((a, b) => a.rank - b.rank);
}

export function formatScore(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}
