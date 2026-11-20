import { describe, expect, it } from 'vitest'
import { ipLabel, maskIp, redactIps } from '../../src/lib/obs/privacy'
import { clientLine } from '../../src/lib/obs/security'

// KVKK: Telegram'a tam IP gitmemeli.
describe('IP maskeleme', () => {
  it('IPv4 ve IPv6 adreslerini maskeler', () => {
    expect(maskIp('85.105.12.34')).toBe('85.105.x.x')
    expect(maskIp('::ffff:85.105.12.34')).toBe('85.105.x.x')
    expect(maskIp('2a02:4780:1:2::abcd')).toBe('2a02:4780:…')
    expect(maskIp('unknown')).toBe('bilinmiyor')
    expect(maskIp('')).toBe('bilinmiyor')
  })

  it('etiket aynı IP için sabit, farklı IP için farklı; tam IP içermez', () => {
    const a = ipLabel('85.105.12.34')
    expect(a).toMatch(/^85\.105\.x\.x #[0-9a-f]{6}$/)
    expect(ipLabel('85.105.12.34')).toBe(a)
    expect(ipLabel('85.105.12.35')).not.toBe(a)
    expect(a).not.toContain('12.34')
  })

  it('clientLine tam IP yazmaz', () => {
    const line = clientLine('203.0.113.77', 'Mozilla/5.0')
    expect(line).not.toContain('203.0.113.77')
    expect(line).toContain('203.0.x.x')
  })

  it('metin içindeki IP adreslerini yakalar, saatlere ve sürümlere dokunmaz', () => {
    const text = 'Giriş 10.0.0.5 ve 2001:db8:85a3:0:0:8a2e:370:7334 ile; ayrıca fe80::1 — saat 20:30:00, tarih 2026-11-16T10:20:30Z, sürüm 1.2.3'
    const out = redactIps(text)
    expect(out).not.toContain('10.0.0.5')
    expect(out).toContain('10.0.x.x')
    expect(out).not.toContain('8a2e:370:7334')
    expect(out).toContain('2001:db8:…')
    expect(out).not.toContain('fe80::1')
    expect(out).toContain('20:30:00')
    expect(out).toContain('10:20:30')
    expect(out).toContain('sürüm 1.2.3')
  })

  it('HTML etiketlerinin içindeki IP de maskelenir', () => {
    expect(redactIps('<code>192.168.1.20</code>')).toBe('<code>192.168.x.x</code>')
  })
})
