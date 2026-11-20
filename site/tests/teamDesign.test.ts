import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_DESIGN, LIMITS, STICKERS, PATTERNS, contrastRatio, deriveTheme, patternBackground,
  safeMediaUrl, sanitizeManifesto, validateDesign,
} from '../src/lib/teams/design';
import { manifestoExcerpt, parseManifesto } from '../src/lib/teams/markdown';
import { Manifesto } from '../src/components/teams/Manifesto';
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const render = (src: string) => renderToStaticMarkup(createElement(Manifesto, { source: src }));

test('hazır setler: 24 sticker, 6 desen, benzersiz kimlik', () => {
  assert.equal(STICKERS.length, 24);
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, 24);
  assert.deepEqual(PATTERNS.map((p) => p.id), ['none', 'hearts', 'stars', 'code', 'dots', 'grid']);
});

test('boş/çöp girdi varsayılan tasarıma döner', () => {
  for (const bad of [null, undefined, 42, 'x', [], { colors: 'kırmızı' }]) {
    assert.deepEqual(validateDesign(bad), DEFAULT_DESIGN);
  }
  assert.deepEqual(validateDesign(DEFAULT_DESIGN), DEFAULT_DESIGN);
});

test('bilinmeyen alanlar atılır', () => {
  const d = validateDesign({
    hacked: true, __proto__: { polluted: 1 },
    colors: { background: '#fff', accent: '#000', extra: 'x' },
    stickers: [{ uid: 'a', sticker: 'kalp', x: 1, y: 2, size: 10, rotation: 0, onclick: 'alert(1)' }],
    gifs: [{ uid: 'g', url: `https://${CDN_HOST}/a.gif`, alt: 'kedi', x: 5, y: 5, size: 20, rotation: 0, style: 'x' }],
    pattern: { id: 'dots', color: '#123', opacity: 0.2, size: 30, js: 1 },
  });
  assert.deepEqual(Object.keys(d).sort(), ['colors', 'gifs', 'layout', 'logoUrl', 'coverUrl', 'manifesto', 'pattern', 'stickers', 'version'].sort());
  assert.deepEqual(Object.keys(d.colors).sort(), ['accent', 'background']);
  assert.deepEqual(Object.keys(d.stickers[0]).sort(), ['rotation', 'size', 'sticker', 'uid', 'x', 'y']);
  assert.deepEqual(Object.keys(d.gifs[0]).sort(), ['alt', 'rotation', 'size', 'uid', 'url', 'x', 'y']);
  assert.deepEqual(Object.keys(d.pattern).sort(), ['color', 'id', 'opacity', 'size']);
  assert.equal(d.colors.background, '#ffffff');
  assert.equal(d.pattern.color, '#112233');
  assert.equal((d as Record<string, unknown>).hacked, undefined);
});

test('fazla sticker/GIF kesilir, geçersiz sticker atılır, sayılar sınırlanır', () => {
  const stickers = Array.from({ length: 50 }, (_, i) => ({ uid: 'x', sticker: i % 7 === 0 ? 'kotu-svg' : 'roket', x: 500, y: -20, size: 999, rotation: 270 }));
  const gifs = Array.from({ length: 10 }, (_, i) => ({ url: `https://${CDN_HOST}/${i}.gif`, x: 'abc', size: 1 }));
  const d = validateDesign({ stickers, gifs });
  assert.equal(d.stickers.length, LIMITS.maxStickers);
  assert.ok(d.stickers.every((s) => s.sticker === 'roket'));
  assert.equal(new Set(d.stickers.map((s) => s.uid)).size, d.stickers.length, 'uid benzersiz');
  assert.equal(d.stickers[0].x, 100);
  assert.equal(d.stickers[0].y, 0);
  assert.equal(d.stickers[0].size, LIMITS.stickerSize.max);
  assert.equal(d.stickers[0].rotation, -90);
  assert.equal(d.gifs.length, LIMITS.maxGifs);
  assert.equal(d.gifs[0].x, 50);
  assert.equal(d.gifs[0].size, LIMITS.gifSize.min);
});

test('geçersiz renkler varsayılana döner, desen sınırları uygulanır', () => {
  const d = validateDesign({
    colors: { background: 'red; background-image:url(javascript:alert(1))', accent: '#12345g' },
    pattern: { id: 'skull', color: 'url(x)', opacity: 5, size: 1 },
  });
  assert.equal(d.colors.background, DEFAULT_DESIGN.colors.background);
  assert.equal(d.colors.accent, DEFAULT_DESIGN.colors.accent);
  assert.equal(d.pattern.id, 'none');
  assert.equal(d.pattern.color, DEFAULT_DESIGN.pattern.color);
  assert.equal(d.pattern.opacity, LIMITS.patternOpacity.max);
  assert.equal(d.pattern.size, LIMITS.patternSize.min);
});

test('adresler: yalnız https ve site-içi yol; javascript:/data:/blob: kayda girmez', () => {
  const d = validateDesign({
    logoUrl: 'javascript:alert(1)',
    coverUrl: 'data:image/svg+xml,<svg onload=alert(1)>',
    gifs: [
      { url: 'http://insecure.example.com/a.gif' },
      { url: '//evil.example.com/a.gif' },
      { url: 'blob:http://localhost:3008/1234-abcd' },
      { url: 'https://user:pw@cdn.example.com/a.gif' },
      { url: `https://${CDN_HOST}/ok.gif"onerror="alert(1)` },
      { url: '/api/media/file/ok.gif' },
    ],
  });
  assert.equal(d.logoUrl, null);
  assert.equal(d.coverUrl, null);
  assert.deepEqual(d.gifs.map((g) => g.url), ['/api/media/file/ok.gif']);
  assert.equal(safeMediaUrl('blob:http://localhost:3008/1234-abcd', { allowBlob: true }), 'blob:http://localhost:3008/1234-abcd');
  assert.equal(safeMediaUrl(`https://${CDN_HOST}/a.gif`), `https://${CDN_HOST}/a.gif`);
});

test('XSS denemeli manifesto temizlenir', () => {
  const evil =
    'Merhaba <script>alert(1)</script> <img src=x onerror=alert(2)> <a href="javascript:alert(3)">tıkla</a>\n' +
    `[kötü](javascript:alert(4)) [veri](data:text/html,<b>x</b>) [iyi](https://ornek.example.org) <3 ve a < b‮`;
  const d = validateDesign({ manifesto: evil });
  const m = d.manifesto!;
  assert.doesNotMatch(m, /<script|<img|<a |onerror|javascript:|data:text/i);
  assert.match(m, /\[iyi\]\(https:\/\/ornek\.example\.org\)/);
  assert.match(m, /<3 ve a < b$/);
  assert.equal(validateDesign({ manifesto: 'x'.repeat(5000) }).manifesto!.length, LIMITS.manifestoMax);
  assert.equal(validateDesign({}).manifesto, null);
  assert.equal(sanitizeManifesto(42), '');
});

test('markdown çizici script/HTML/tehlikeli bağlantı üretmez (temizlenmemiş girdide bile)', () => {
  const html = render(
    '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[a](javascript:alert(1)) [b](JAVASCRIPT:alert(1)) ' +
      '[c](vbscript:x) [d](data:text/html;base64,PHNjcmlwdD4=) **<b>kalın</b>** "><svg onload=alert(1)>',
  );
  assert.doesNotMatch(html, /<script|<img|<svg|<b>/i);
  assert.doesNotMatch(html, /<[^>]*\son\w+=/i, 'olay özniteliği yok');
  assert.doesNotMatch(html, /href="(?!https?:)/i);
  assert.doesNotMatch(html, /href="(javascript|vbscript|data):/i);
  assert.match(html, /&lt;script&gt;/);
});

test('markdown alt kümesi: kalın, italik, liste, bağlantı', () => {
  const html = render(`**Kalın** ve *italik* ve _alt_çizgi_ yok\n\n- bir\n- iki\n\n1. ilk\n2. ikinci\n\n[Site](https://ornek.example.org/a?b=1) ve https://example.com/x.`);
  assert.match(html, /<strong[^>]*>Kalın<\/strong>/);
  assert.match(html, /<em[^>]*>italik<\/em>/);
  assert.match(html, /<ul[^>]*><li>bir<\/li><li>iki<\/li><\/ul>/);
  assert.match(html, /<ol[^>]*><li>ilk<\/li><li>ikinci<\/li><\/ol>/);
  assert.match(html, /<a href="https:\/\/ornek\.example\.org\/a\?b=1" target="_blank" rel="noopener noreferrer nofollow ugc"/);
  assert.match(html, /href="https:\/\/example\.com\/x"/);
  assert.match(html, /_alt_çizgi_|alt_çizgi/);
  assert.deepEqual(parseManifesto(''), []);
});

test('özet düz metindir ve kısalır', () => {
  assert.equal(manifestoExcerpt('**Merhaba** [dünya](https://a.com)\n\n- x'), 'Merhaba dünya • x');
  const long = manifestoExcerpt('kelime '.repeat(100), 50);
  assert.ok(long.length <= 51 && long.endsWith('…'));
});

test('tema: her arka planda metin ≥4.5, vurgu ≥3 kontrast', () => {
  const bgs = ['#ffffff', '#000000', '#ffe4ef', '#0b1220', '#ff7a1a', '#808080', '#01477b', '#fef9c3', '#22c55e', '#7f7f7f'];
  const accents = ['#ffffff', '#000000', '#fef9c3', '#01477b', '#ff7a1a', '#808080'];
  for (const background of bgs) {
    for (const accent of accents) {
      const t = deriveTheme({ colors: { background, accent } });
      assert.ok(contrastRatio(t.text, t.bg) >= 4.5, `metin ${background}`);
      assert.ok(contrastRatio(t.muted, t.bg) >= 4.5, `soluk metin ${background}`);
      assert.ok(contrastRatio(t.surfaceText, t.surface) >= 4.5, `panel ${background}`);
      assert.ok(contrastRatio(t.surfaceMuted, t.surface) >= 4.5, `panel soluk ${background}`);
      assert.ok(contrastRatio(t.surfaceAccent, t.surface) >= 4.5, `panel bağlantı ${background}/${accent}`);
      assert.ok(contrastRatio(t.accent, t.bg) >= 3, `vurgu ${background}/${accent}`);
      assert.ok(contrastRatio(t.onAccent, t.accent) >= 4.5, `vurgu üstü ${background}/${accent}`);
    }
  }
});

test('desen arka planı yalnız doğrulanmış değerlerle üretilir', () => {
  assert.equal(patternBackground({ id: 'none', color: '#000000', opacity: 0.1, size: 40 }), null);
  const bg = patternBackground({ id: 'hearts', color: '#f472b6', opacity: 0.2, size: 48 })!;
  assert.match(bg, /^url\("data:image\/svg\+xml,[^"]+"\)$/);
  const evil = patternBackground({ id: 'dots', color: '"><script>' as string, opacity: 0.2, size: 48 })!;
  assert.doesNotMatch(decodeURIComponent(evil), /script/);
});

test('görsel adresleri yalnız kendi CDN/site kökenlerinden', () => {
  assert.equal(safeMediaUrl(`https://${CDN_HOST}/takim/a.webp`), `https://${CDN_HOST}/takim/a.webp`);
  assert.equal(safeMediaUrl(`https://${SITE_HOST}/x.png`), `https://${SITE_HOST}/x.png`);
  assert.equal(safeMediaUrl('/api/team-media/file/team-abc.webp'), '/api/team-media/file/team-abc.webp');
  for (const bad of ['https://evil.example/pixel.gif', `https://${CDN_HOST}.evil.example/a.gif`, `http://${CDN_HOST}/a.gif`,
    `https://${SITE_HOST}@evil.example/a.gif`, '//evil.example/a.gif', 'javascript:alert(1)', 'data:image/gif;base64,R0lGOD']) {
    assert.equal(safeMediaUrl(bad), null, bad);
  }
  const clean = validateDesign({ logoUrl: 'https://evil.example/l.png', gifs: [{ url: 'https://evil.example/a.gif' }, { url: `https://${CDN_HOST}/takim/b.webp` }] });
  assert.equal(clean.logoUrl, null);
  assert.deepEqual(clean.gifs.map((g) => g.url), [`https://${CDN_HOST}/takim/b.webp`]);
});

test('manifesto: betik içeriği ve iç içe parantezli kötü bağlantı iz bırakmaz', () => {
  const clean = sanitizeManifesto('a <script>alert(1)</script> b [kötü](javascript:alert(1)) c <STYLE>x{}</style> d <iframe src=x>y</iframe>');
  assert.equal(clean, 'a  b kötü c  d');
});
