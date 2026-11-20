import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type Criterion,
  ScoreValidationError,
  isCompleteScoreCard,
  rankSubmissions,
  weightedTotal,
} from '../src/lib/jury/score';
import { safeExternalUrl } from '../src/lib/jury/safeUrl';

const CRITERIA: Criterion[] = [
  { id: 'fikir', name: 'Fikir', weight: 2, max: 10 },
  { id: 'teknik', name: 'Teknik', weight: 3, max: 10 },
  { id: 'sunum', name: 'Sunum', weight: 1, max: 5 },
];

test('ağırlıklı toplam 0-100 ölçeğine normalize edilir', () => {
  assert.equal(weightedTotal({ fikir: 10, teknik: 10, sunum: 5 }, CRITERIA), 100);
  assert.equal(weightedTotal({ fikir: 0, teknik: 0, sunum: 0 }, CRITERIA), 0);
  // (2·0.8 + 3·0.5 + 1·0.4) / 6 · 100 = 3.5/6·100 = 58.33
  assert.equal(weightedTotal({ fikir: 8, teknik: 5, sunum: 2 }, CRITERIA), 58.33);
  // tanımsız ek anahtar yok sayılır
  assert.equal(weightedTotal({ fikir: 10, teknik: 10, sunum: 5, eski: 99 }, CRITERIA), 100);
  // sıfır ağırlıklı kriter toplamı etkilemez ama yine de girilmeli
  const withZero: Criterion[] = [...CRITERIA, { id: 'bonus', name: 'Bonus', weight: 0, max: 3 }];
  assert.equal(weightedTotal({ fikir: 10, teknik: 10, sunum: 5, bonus: 0 }, withZero), 100);
});

test('eksik kriter → hesaplanmaz (NaN), 0 sayılmaz', () => {
  assert.ok(Number.isNaN(weightedTotal({ fikir: 10, teknik: 10 }, CRITERIA)));
  assert.equal(isCompleteScoreCard({ fikir: 10, teknik: 10 }, CRITERIA), false);
  assert.equal(isCompleteScoreCard({ fikir: 1, teknik: 1, sunum: 1 }, CRITERIA), true);
  assert.equal(isCompleteScoreCard({}, []), false); // kriter yok → puanlanmış sayılmaz
});

test('aralık dışı / geçersiz puan reddedilir', () => {
  assert.throws(() => weightedTotal({ fikir: 11, teknik: 5, sunum: 2 }, CRITERIA), ScoreValidationError);
  assert.throws(() => weightedTotal({ fikir: -1, teknik: 5, sunum: 2 }, CRITERIA), ScoreValidationError);
  assert.throws(() => weightedTotal({ fikir: Number.NaN, teknik: 5, sunum: 2 }, CRITERIA), ScoreValidationError);
  assert.throws(
    () => weightedTotal({ fikir: '5' as unknown as number, teknik: 5, sunum: 2 }, CRITERIA),
    ScoreValidationError,
  );
  // aralık dışı puan eksik kartta da reddedilir
  assert.throws(() => weightedTotal({ sunum: 6 }, CRITERIA), ScoreValidationError);
  // sıralamada da
  assert.throws(
    () => rankSubmissions([{ id: 'a', juryScores: [{ fikir: 5, teknik: 5, sunum: 9 }] }], CRITERIA),
    ScoreValidationError,
  );
});

test('hatalı kriter yapılandırması reddedilir', () => {
  assert.throws(() => weightedTotal({}, []), ScoreValidationError);
  assert.throws(() => weightedTotal({ a: 1 }, [{ id: 'a', name: 'A', weight: 0, max: 5 }]), ScoreValidationError);
  assert.throws(() => weightedTotal({ a: 1 }, [{ id: 'a', name: 'A', weight: 1, max: 0 }]), ScoreValidationError);
  assert.throws(() => weightedTotal({ a: 1 }, [{ id: 'a', name: 'A', weight: -1, max: 5 }]), ScoreValidationError);
  assert.throws(
    () => weightedTotal({ a: 1 }, [{ id: 'a', name: 'A', weight: 1, max: 5 }, { id: 'a', name: 'A2', weight: 1, max: 5 }]),
    ScoreValidationError,
  );
});

test('jüri ortalaması ve eşitlikte "1, 1, 3" sıralaması', () => {
  const full = { fikir: 10, teknik: 10, sunum: 5 }; // 100
  const half = { fikir: 5, teknik: 5, sunum: 2.5 }; // 50
  const r = rankSubmissions(
    [
      { id: 'b', juryScores: [half, full] }, // 75
      { id: 'a', juryScores: [full, half] }, // 75
      { id: 'c', juryScores: [half] }, // 50
      { id: 'd', juryScores: [full] }, // 100
    ],
    CRITERIA,
  );
  assert.deepEqual(
    r.map((x) => [x.id, x.rank, x.average, x.juryCount]),
    [
      ['d', 1, 100, 1],
      ['b', 2, 75, 2],
      ['a', 2, 75, 2],
      ['c', 4, 50, 1],
    ],
  );

  const tie = rankSubmissions(
    [
      { id: 'x', juryScores: [full] },
      { id: 'y', juryScores: [full] },
      { id: 'z', juryScores: [half] },
    ],
    CRITERIA,
  );
  assert.deepEqual(tie.map((x) => x.rank), [1, 1, 3]);
});

test('jürisiz teslim ve eksik kart: sona, ortak sırayla; eksik kart sayılmaz', () => {
  const full = { fikir: 10, teknik: 10, sunum: 5 };
  const zero = { fikir: 0, teknik: 0, sunum: 0 };
  const r = rankSubmissions(
    [
      { id: 'bos', juryScores: [] },
      { id: 'eksik', juryScores: [{ fikir: 10 }] },
      { id: 'sifir', juryScores: [zero] },
      { id: 'tam', juryScores: [full, { teknik: 3 }] },
    ],
    CRITERIA,
  );
  assert.deepEqual(
    r.map((x) => [x.id, x.rank, x.average, x.juryCount]),
    [
      ['tam', 1, 100, 1],
      ['sifir', 2, 0, 1],
      ['bos', 3, 0, 0],
      ['eksik', 3, 0, 0],
    ],
  );
  assert.deepEqual(rankSubmissions([], CRITERIA), []);
});

test('dış bağlantılar yalnız http/https', () => {
  assert.equal(safeExternalUrl('https://github.com/byt'), 'https://github.com/byt');
  assert.equal(safeExternalUrl('http://ornek.com'), 'http://ornek.com/');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,hi'), null);
  assert.equal(safeExternalUrl('/goreli/yol'), null);
  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl(undefined), null);
});
