/**
 * Jüri puanlama — saf (yan etkisiz) hesaplama.
 *
 * KURALLAR
 * 1. Kriter: `weight` ≥ 0 ve sonlu, `max` > 0 ve sonlu, `id` tekil olmalı; ağırlık toplamı > 0.
 *    Aksi halde `ScoreValidationError` fırlatılır (yapılandırma hatası, sessizce geçilmez).
 * 2. Puan: her kriter için 0 ≤ puan ≤ max, sonlu sayı. Aralık dışı / NaN / sayı olmayan puan
 *    → `ScoreValidationError` (reddedilir; kırpılmaz).
 * 3. Kriter listesinde olmayan anahtarlar yok sayılır (sonradan kaldırılmış kriter puanı
 *    tüm hesabı bozmasın diye).
 * 4. Ağırlıklı toplam (0–100):  Σ wᵢ·(sᵢ / maxᵢ) / Σ wᵢ × 100, 2 ondalığa yuvarlanır.
 * 5. Eksik kriter: bir jüri kartında herhangi bir kriter puanı yoksa o kart HESAPLANMAZ —
 *    `weightedTotal` `NaN` döner (0 sayılmaz; yarım kart düşük puan gibi görünmesin).
 *    Önce `isCompleteScoreCard` ile kontrol edilebilir. `rankSubmissions` eksik kartları
 *    atlar ve `juryCount`'a katmaz.
 * 6. Sıralama: teslimin puanı = tamamlanmış jüri kartlarının ağırlıklı toplamlarının
 *    aritmetik ortalaması (2 ondalık). Büyükten küçüğe; eşit ortalama aynı sırayı alır,
 *    sonraki sıra atlanır ("1, 1, 3" — standart yarışma sıralaması). Eşitlerde girdi sırası korunur.
 * 7. Jürisiz teslim (hiç tamamlanmış kartı olmayan): `juryCount: 0`, `average: 0` ve
 *    puanlanmış tüm teslimlerin ARKASINDA, kendi aralarında ortak sırayı alır
 *    (puanlanan sayısı + 1). Gerçek 0 puanlı teslimden `juryCount` ile ayrılır.
 */

export type Criterion = { id: string; name: string; weight: number; max: number };

export class ScoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreValidationError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Kriter listesini doğrular; hatalıysa ScoreValidationError fırlatır. */
export function assertValidCriteria(criteria: Criterion[]): void {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new ScoreValidationError('En az bir kriter gerekli.');
  }
  const seen = new Set<string>();
  let weightSum = 0;
  for (const c of criteria) {
    if (!c || typeof c.id !== 'string' || c.id === '') throw new ScoreValidationError('Kriter kimliği boş olamaz.');
    if (seen.has(c.id)) throw new ScoreValidationError(`Kriter kimliği tekrar ediyor: ${c.id}`);
    seen.add(c.id);
    if (typeof c.weight !== 'number' || !Number.isFinite(c.weight) || c.weight < 0) {
      throw new ScoreValidationError(`Geçersiz ağırlık (${c.id}): ${String(c.weight)}`);
    }
    if (typeof c.max !== 'number' || !Number.isFinite(c.max) || c.max <= 0) {
      throw new ScoreValidationError(`Geçersiz azami puan (${c.id}): ${String(c.max)}`);
    }
    weightSum += c.weight;
  }
  if (weightSum <= 0) throw new ScoreValidationError('Kriter ağırlıklarının toplamı sıfırdan büyük olmalı.');
}

/**
 * Tek bir puanı doğrular. Hata mesajı döner (geçerliyse null). UI'da alan bazlı uyarı için.
 * `undefined` (henüz girilmemiş) geçerli sayılır — eksiklik ayrı kontrol edilir.
 */
export function scoreError(value: unknown, criterion: Criterion): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Puan bir sayı olmalı.';
  if (value < 0 || value > criterion.max) return `Puan 0 ile ${criterion.max} arasında olmalı.`;
  return null;
}

/** Bir jüri kartındaki tüm puanları doğrular (aralık dışı → ScoreValidationError). */
export function assertValidScores(scores: Record<string, number>, criteria: Criterion[]): void {
  if (!scores || typeof scores !== 'object') throw new ScoreValidationError('Puan kartı nesne olmalı.');
  for (const c of criteria) {
    const err = scoreError(scores[c.id], c);
    if (err) throw new ScoreValidationError(`${c.name || c.id}: ${err}`);
  }
}

/** Kart tüm kriterler için puan içeriyor mu? */
export function isCompleteScoreCard(scores: Record<string, number>, criteria: Criterion[]): boolean {
  // Kriter yoksa kart "tamam" sayılmaz (yoksa boş etkinlikte her takım puanlanmış görünür)
  return criteria.length > 0 && criteria.every((c) => typeof scores?.[c.id] === 'number');
}

/**
 * Ağırlıklı toplam, 0–100 ölçeğinde (2 ondalık).
 * Aralık dışı puan / hatalı kriter → ScoreValidationError. Eksik kriter → NaN (hesaplanmaz).
 */
export function weightedTotal(scores: Record<string, number>, criteria: Criterion[]): number {
  assertValidCriteria(criteria);
  assertValidScores(scores, criteria);
  if (!isCompleteScoreCard(scores, criteria)) return NaN;
  let weightSum = 0;
  let acc = 0;
  for (const c of criteria) {
    weightSum += c.weight;
    acc += c.weight * (scores[c.id] / c.max);
  }
  return round2((acc / weightSum) * 100);
}

/** Teslimleri jüri ortalamasına göre sıralar (bkz. dosya başı kurallar 5–7). */
export function rankSubmissions(
  items: Array<{ id: string; juryScores: Array<Record<string, number>> }>,
  criteria: Criterion[],
): Array<{ id: string; average: number; juryCount: number; rank: number }> {
  assertValidCriteria(criteria);
  const scored: Array<{ id: string; average: number; juryCount: number; order: number }> = [];
  const unscored: Array<{ id: string; order: number }> = [];

  items.forEach((item, order) => {
    const totals: number[] = [];
    for (const card of item.juryScores ?? []) {
      const t = weightedTotal(card, criteria); // aralık dışı puan burada fırlatır
      if (!Number.isNaN(t)) totals.push(t);
    }
    if (totals.length === 0) unscored.push({ id: item.id, order });
    else scored.push({ id: item.id, average: round2(totals.reduce((a, b) => a + b, 0) / totals.length), juryCount: totals.length, order });
  });

  scored.sort((a, b) => b.average - a.average || a.order - b.order);

  const out: Array<{ id: string; average: number; juryCount: number; rank: number }> = [];
  scored.forEach((s, i) => {
    const rank = i > 0 && s.average === scored[i - 1].average ? out[i - 1].rank : i + 1;
    out.push({ id: s.id, average: s.average, juryCount: s.juryCount, rank });
  });
  const lastRank = scored.length + 1;
  for (const u of unscored) out.push({ id: u.id, average: 0, juryCount: 0, rank: lastRank });
  return out;
}
