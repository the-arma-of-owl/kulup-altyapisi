'use client'

import { useState } from 'react'
import { KULUP } from '@/lib/kulup'

// Etkinlik düzenleme ekranında: kaynak adı yaz → paylaşılacak link (örn. .../etkinlikler/x?ref=mekatronik).
// Kurallar site ve CMS'teki normalizeRef ile aynı: küçük harf, Türkçe harf sadeleşir, [a-z0-9_-].

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' }
const normalize = (raw: string) => raw.replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c] ?? c)
  .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 40)

export const RefLinkBuilder = ({ pageUrl }: { pageUrl: string }) => {
  const [raw, setRaw] = useState('')
  const [copied, setCopied] = useState(false)
  const ref = normalize(raw)
  const link = ref ? `${pageUrl}?ref=${ref}` : pageUrl

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setCopied(false) }
  }

  return (
    <div className="byt-stats__ref">
      <strong>Kaynak linki oluşturucu</strong>
      <span className="byt-stats__hint">Her WhatsApp grubu / Instagram hikâyesi için ayrı bir ad yazın (örn. mekatronik, insta-hikaye). O linkten gelen ziyaret ve kayıtlar &quot;Kaynaklar&quot; tablosunda ayrı görünür.</span>
      <div className="byt-stats__ref-row">
        <input value={raw} onChange={(e) => { setRaw(e.target.value); setCopied(false) }} placeholder="kaynak adı, örn. mekatronik" aria-label="Kaynak adı" maxLength={60} />
        <button type="button" onClick={copy} disabled={!ref}>{copied ? 'Kopyalandı ✓' : 'Linki kopyala'}</button>
      </div>
      <output>{link}</output>
    </div>
  )
}

// İstatistikler sayfasında: herhangi bir site sayfası (blog yazısı, başvuru formu, ana sayfa…) için kaynak linki.
const QUICK_PAGES = [
  { label: 'Ana sayfa', path: '/' },
  { label: 'Etkinlikler', path: '/etkinlikler' },
  { label: 'Blog', path: '/blog' },
  { label: 'Üye ol formu', path: '/basvuru/uye-ol' },
  { label: 'Core Team başvurusu', path: '/basvuru/core-team' },
  { label: 'Üniversitede Yeniyim', path: '/universitede-yeniyim' },
]

/** Yapıştırılan tam adresten ya da yoldan site içi yolu çıkarır (sorgu/parça atılır). */
const toPath = (raw: string) => {
  const value = raw.trim()
  if (!value) return '/'
  try {
    const url = new URL(value, 'https://x.invalid')
    return url.pathname.replace(/^\/(tr|en)(?=\/|$)/, '') || '/'
  } catch {
    return '/'
  }
}

export const AnyPageRefLinkBuilder = ({ siteUrl }: { siteUrl: string }) => {
  const [page, setPage] = useState('')
  const path = toPath(page)
  return (
    <div className="byt-stats__ref">
      <strong>Herhangi bir sayfa için kaynak linki</strong>
      <span className="byt-stats__hint">
        Blog yazısı ya da başka bir sayfanın adresini yapıştırın (veya aşağıdan seçin), sonra kaynak adını yazın. Paylaşılan linkten gelenler
        &quot;Kaynaklar&quot; tablosunda o adla sayılır. Elle de yapılabilir: herhangi bir site adresinin sonuna <code>?mekatronik</code> eklemek yeterli.
      </span>
      <div className="byt-stats__ref-row">
        <input value={page} onChange={(e) => setPage(e.target.value)} placeholder={`Sayfa adresi, örn. ${KULUP.adresler.site.replace(/\/+$/, '')}/blog/ilk-yazimiz`} aria-label="Sayfa adresi" />
      </div>
      <div className="byt-stats__ref-row">
        {QUICK_PAGES.map((p) => (
          <button key={p.path} type="button" onClick={() => setPage(p.path)} aria-pressed={path === p.path}>{p.label}</button>
        ))}
      </div>
      <RefLinkBuilder pageUrl={`${siteUrl}${path === '/' ? '' : path}`} />
    </div>
  )
}
