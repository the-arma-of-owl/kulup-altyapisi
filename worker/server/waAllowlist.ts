import { normalizePhoneNumber } from '../shared/phone.js'

export function parseWhatsAppAllowlist(value: string): readonly string[] {
  return value.split(',')
    .map((item) => normalizePhoneNumber(item))
    .filter((number) => /^90\d{10}$/.test(number))
}

export function assertWhatsAppAllowed(number: string, opts: {
  isLive: boolean
  allowlist: readonly string[]
}): void {
  // Test kilidi: liste doluysa canlı CMS'te de yalnız listedeki numaralara gönderilir (BYT_WORKER_WA_ALLOWLIST).
  const locked = !opts.isLive || opts.allowlist.length > 0
  if (locked && !opts.allowlist.includes(number)) {
    throw new Error('Test ortamı: numara izin listesinde değil')
  }
}

export function parseMailAllowlist(value: string): readonly string[] {
  return value.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((address) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(address))
}

/** Test kilidi: BYT_WORKER_MAIL_ALLOWLIST doluysa yalnız listedeki adreslere mail gider (canlıda da). */
export function assertMailAllowed(to: string, allowlist: readonly string[]): void {
  if (allowlist.length > 0 && !allowlist.includes(to.trim().toLowerCase())) {
    throw new Error('Test kilidi: e-posta adresi izin listesinde değil')
  }
}
