#!/usr/bin/env node
/**
 * Kök dizindeki kulup.config.json'u doğrular ve site/, cms/ ve worker/ içine kopyalar.
 *
 *   node scripts/kulup-ayarla.mjs           → kopyalar
 *   node scripts/kulup-ayarla.mjs --kontrol → yalnız kopyaların güncel olup olmadığını denetler (CI için)
 *
 * Neden kopya? Vercel her projeyi kendi klasöründen derler; kök dizindeki dosyaya güvenmek yerine
 * her proje kendi kopyasını taşır. Kopyalar elle düzenlenmez.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HEDEFLER = ['site/src/kulup.json', 'cms/src/kulup.json', 'worker/shared/kulup.json']

const ZORUNLU = ['kisaAd', 'tamAd', 'universite', 'adresler.site', 'adresler.cms', 'eposta.gonderen', 'sertifika.onEk']

function al(obj, yol) {
  return yol.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

const kaynak = JSON.parse(readFileSync(join(root, 'kulup.config.json'), 'utf8'))
const eksik = ZORUNLU.filter((k) => {
  const v = al(kaynak, k)
  return typeof v !== 'string' || !v.trim()
})
if (eksik.length) {
  console.error(`kulup.config.json: eksik alanlar → ${eksik.join(', ')}`)
  process.exit(1)
}
for (const k of ['adresler.site', 'adresler.cms', 'adresler.cdn']) {
  const v = al(kaynak, k)
  if (v && !/^https?:\/\/[^/]+$/.test(v)) {
    console.error(`kulup.config.json: ${k} sonunda "/" olmadan tam adres olmalı (ör. https://ornek.com)`)
    process.exit(1)
  }
}
if (!/^[A-Z0-9]{2,8}$/.test(kaynak.sertifika.onEk)) {
  console.error('kulup.config.json: sertifika.onEk 2-8 büyük harf/rakam olmalı (ör. KLP)')
  process.exit(1)
}

const { $aciklama, ...temiz } = kaynak
const icerik = JSON.stringify(temiz, null, 2) + '\n'

const kontrol = process.argv.includes('--kontrol')
let eski = 0
for (const hedef of HEDEFLER) {
  const yol = join(root, hedef)
  const mevcut = existsSync(yol) ? readFileSync(yol, 'utf8') : null
  if (mevcut === icerik) continue
  if (kontrol) {
    console.error(`güncel değil: ${hedef}`)
    eski++
  } else {
    writeFileSync(yol, icerik)
    console.log(`yazıldı: ${hedef}`)
  }
}
if (kontrol && eski) {
  console.error('Çalıştır: node scripts/kulup-ayarla.mjs')
  process.exit(1)
}
if (!kontrol) console.log('Tamam. Değişikliği commit etmeyi unutma.')
