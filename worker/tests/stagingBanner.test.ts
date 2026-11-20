import { KULUP, hostOf } from '../shared/kulup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionLabel, stagingBannerText } from '../src/ui/stagingBanner.js'
import { healthResponse } from '../server/health.js'
import { CONFIG } from '../server/config.js'

test('canlı CMS için bant yok', () => {
  assert.equal(stagingBannerText({ cms: { live: true, host: 'example.invalid' } }), null)
})

test('staging CMS adını gösterir', () => {
  assert.equal(stagingBannerText({ cms: { live: false, host: 'cms.example.invalid:3001' } }), 'STAGING · CMS: cms.example.invalid:3001')
})

test('boş ve bozuk yanıtlar bant oluşturmaz', () => {
  for (const value of [null, {}, { cms: null }, { cms: {} }, { cms: { live: 'false', host: 'example.invalid' } }, { cms: { live: false, host: 1 } }]) {
    assert.equal(stagingBannerText(value), null)
  }
})

test('bağlantı etiketi canlı ve staging hostlarını gösterir', () => {
  assert.equal(connectionLabel({ cms: { live: true, host: 'cms.example.invalid' }, site: { host: 'site.example.invalid' } }), 'Canlı · CMS: cms.example.invalid')
  assert.equal(connectionLabel({ cms: { live: false, host: 'cms.example.invalid:3001' }, site: { host: 'site.example.invalid' } }), 'STAGING · CMS: cms.example.invalid:3001 · Site: site.example.invalid')
})

test('bağlantı etiketi bozuk yanıtları reddeder', () => {
  for (const value of [null, 'bozuk', {}, { cms: null }, { cms: { live: false, host: 123 }, site: { host: 'site.example.invalid' } },
    { cms: { live: 'false', host: 'cms.example.invalid' }, site: { host: 'site.example.invalid' } },
    { cms: { live: false, host: 'cms.example.invalid' } },
    { cms: { live: false, host: 'cms.example.invalid' }, site: { host: 123 } }]) {
    assert.equal(connectionLabel(value), null)
  }
})

test('staging CMS ve canlı site birlikteyken bilet bağlantısı uyarısı gösterir', () => {
  assert.equal(stagingBannerText({ cms: { live: false, host: 'cms.example.invalid' }, site: { host: hostOf(KULUP.adresler.site) } }),
    'STAGING · CMS: cms.example.invalid · UYARI: bilet bağlantıları canlı siteye')
  assert.equal(stagingBannerText({ cms: { live: false, host: 'cms.example.invalid' }, site: { host: 'site.example.invalid' } }),
    'STAGING · CMS: cms.example.invalid')
  assert.equal(stagingBannerText({ cms: { live: true, host: 'cms.example.invalid' }, site: { host: hostOf(KULUP.adresler.site) } }), null)
})

test('sağlık yanıtı CMS durumunu ve yalnız site hostunu içerir', () => {
  const response = healthResponse()
  assert.deepEqual(response, {
    ok: true,
    cms: { live: CONFIG.isLiveCms, host: new URL(CONFIG.payloadOrigin).host },
    site: { host: new URL(CONFIG.siteUrl).host },
  })
  assert.doesNotMatch(response.site.host, /http|\//)
})
