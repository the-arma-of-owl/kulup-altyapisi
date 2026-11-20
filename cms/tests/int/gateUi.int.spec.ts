import { describe, expect, it } from 'vitest'
import { formatCheckinTime, pushRecent, resultTitle, shouldSkipDuplicate, templateMatchesFields, wheelValues } from '../../src/components/gate/gateUi'

describe('kapı arayüzü yardımcıları', () => {
  it('her sunucu kodunun başlığını seçer', () => {
    expect(resultTitle('ok', '')).toBe('Giriş onaylandı')
    expect(resultTitle('already_in', '')).toBe('Zaten içeride')
    expect(resultTitle('not_accepted', '')).toBe('Kabul edilmemiş')
    expect(resultTitle('not_found', '')).toBe('Bilet bulunamadı')
    for (const code of ['missing_fields', 'invalid_value']) expect(resultTitle(code, 'ayrıntı')).toBe('Eksik bilgi')
    for (const code of ['invalid_request', 'scanner_closed', 'event_not_found', 'rate_limited', 'unauthorized', 'forbidden', 'template_not_found', 'unknown']) {
      expect(resultTitle(code, 'Sunucu hatası')).toBe('Sunucu hatası')
    }
  })

  it('ilk giriş saatini İstanbul saatine çevirir', () => {
    expect(formatCheckinTime('2026-09-30T12:00:00.000Z')).toBe('15:00')
    expect(formatCheckinTime('bozuk')).toBe('')
  })

  it('aynı bileti 10 saniye içinde atlar, farklı bileti gönderir', () => {
    const seen = new Map<string, number>()
    expect(shouldSkipDuplicate(seen, 'bilet-a', 100_000)).toBe(false)
    expect(shouldSkipDuplicate(seen, 'bilet-a', 109_900)).toBe(true)
    expect(shouldSkipDuplicate(seen, 'bilet-a', 110_000)).toBe(false)
    expect(shouldSkipDuplicate(seen, 'bilet-b', 109_900)).toBe(false)
  })

  it('son sekiz okutmayı yenisi başta olacak biçimde tutar', () => {
    const list = Array.from({ length: 8 }, (_, index) => index)
    expect(pushRecent(list, 8)).toEqual([8, 0, 1, 2, 3, 4, 5, 6])
    expect(list).toHaveLength(8)
  })

  it('seçenekleri ve sınırlar dahil tamsayı aralığını üretir', () => {
    expect(wheelValues({ options: ['A', 'B'] })).toEqual(['A', 'B'])
    expect(wheelValues({ min: -1, max: 1 })).toEqual(['-1', '0', '1'])
    expect(wheelValues({ min: 4, max: 3 })).toBeNull()
    expect(wheelValues({ min: 1, max: 501 })).toBeNull()
    expect(wheelValues({})).toBeNull()
  })

  it('şablon alan anahtarlarını tam eşleştirir', () => {
    expect(templateMatchesFields('Masa {{masa}}', ['masa'])).toBe(true)
    expect(templateMatchesFields('Masa {{ masa }}', ['masa'])).toBe(true)
    expect(templateMatchesFields('Masa {{masaNo}}', ['masa'])).toBe(false)
  })
})
