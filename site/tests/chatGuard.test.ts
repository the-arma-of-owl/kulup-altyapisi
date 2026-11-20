import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedChatOrigin, turnstileDecision, sanitizeHistory, escapeTelegramHtml } from '../src/lib/chatGuard';
import { KULUP } from '../src/lib/kulup';
const SITE_HOST = new URL(KULUP.adresler.site).hostname;
const CDN_HOST = new URL(KULUP.adresler.cdn).hostname;
const ONEK = KULUP.sertifika.onEk;


const base = { origin: null, referer: null, host: null, forwardedHost: null, siteUrl: undefined, production: true };

test('geçerli site, yönlendiren ve aynı köken adresleri kabul edilir', () => {
  for (const input of [
    { origin: `https://${SITE_HOST}` }, { origin: `https://${SITE_HOST}` },
    { referer: `https://${SITE_HOST}/tr/etkinlikler` },
    { origin: 'https://site.example.invalid', host: 'site.example.invalid' },
    { origin: 'https://site.example.invalid', forwardedHost: 'site.example.invalid' },
    { origin: 'https://alan.example.invalid', siteUrl: 'https://alan.example.invalid' },
  ]) assert.equal(isAllowedChatOrigin({ ...base, ...input }), true);
});

test('benzer alan adları, HTTP ve bozuk köken üretimde reddedilir', () => {
  const cases = [
    { origin: `https://${SITE_HOST}.ornek.invalid` },
    { origin: `https://ornek.invalid/?${SITE_HOST}` },
    { origin: 'https://x${SITE_HOST}' },
    { origin: 'http://localhost:3000' },
    { origin: 'http://localhost.ornek.invalid' },
    { origin: `http://${SITE_HOST}` },
    { origin: 'null' }, {}, { origin: '', referer: '' },
    { origin: '::::' },
    { origin: 'https://ornek.invalid', referer: `https://${SITE_HOST}/` },
    { origin: 'https://ornek.invalid', host: `${SITE_HOST}:443` },
  ];
  for (const input of cases) {
    assert.equal(isAllowedChatOrigin({ ...base, ...input }), false, JSON.stringify(input));
    assert.equal(isAllowedChatOrigin({ ...base, ...input, production: false }), true, JSON.stringify(input));
  }
});

test('Turnstile sırrı yalnız geliştirmede veya üretim dışı eksiklikte atlanır', () => {
  for (const secret of ['', undefined, 'XXXX']) assert.equal(turnstileDecision(secret, 'production'), 'reject');
  assert.equal(turnstileDecision('sir', 'production'), 'verify');
  assert.equal(turnstileDecision('sir', 'development'), 'skip');
  assert.equal(turnstileDecision(undefined, 'development'), 'skip');
  assert.equal(turnstileDecision(undefined, 'test'), 'skip');
  assert.equal(turnstileDecision(undefined, undefined), 'skip');
  assert.equal(turnstileDecision('sir', 'test'), 'verify');
});

test('geçmiş son beş geçerli öğeyle ve 1000 karakterle sınırlanır', () => {
  for (const input of [null, 'x', {}]) assert.deepEqual(sanitizeHistory(input), []);
  const seven = Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? 'bot' : 'user', content: String(i), x: 1 }));
  assert.deepEqual(sanitizeHistory(seven), seven.slice(-5).map(({ role, content }) => ({ role, content })));
  assert.deepEqual(sanitizeHistory([
    null, { role: 'system', content: 'x' }, { role: 'user', content: 5 },
    { role: 'bot', content: 'a'.repeat(1500), x: 1 },
  ]), [{ role: 'bot', content: 'a'.repeat(1000) }]);
});

test('Telegram HTML özel karakterleri kaçışlanır', () => {
  assert.equal(escapeTelegramHtml('<b>a&b</b>'), '&lt;b&gt;a&amp;b&lt;/b&gt;');
});
