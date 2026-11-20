import test from 'node:test'
import assert from 'node:assert/strict'
import { isReadingPage } from '../src/lib/readingPages'

test('blog ve rehber eskisi gibi okuma sayfası', () => {
  for (const path of ['/blog', '/blog/yazi', '/tr/blog/yazi', '/universitede-yeniyim', '/en/universitede-yeniyim/x']) {
    assert.equal(isReadingPage(path), true, path)
  }
})

test('takım modu sayfaları okuma modunda (robot kapalı, sosyal düğmeler yok)', () => {
  for (const path of ['/katilimci', '/katilimci/takim/12', '/katilimci/juri/3', '/tr/katilimci',
    '/etkinlikler/hackathon/takim/kod-kurtlari-a1b2c3', '/etkinlikler/hackathon/takimlar', '/etkinlikler/hackathon/takimlar/x',
    '/etkinlikler/hackathon/juri', '/tr/etkinlikler/hackathon/juri?x=1']) {
    assert.equal(isReadingPage(path), true, path)
  }
})

test('diğer sayfalar etkilenmez (etkinlik detay sayfası dahil)', () => {
  for (const path of ['/', '/etkinlikler', '/etkinlikler/hackathon', '/etkinlikler/takim', '/takim', '/sss', '/blogger', '/katilimcilar', null, undefined, '']) {
    assert.equal(isReadingPage(path), false, String(path))
  }
})
