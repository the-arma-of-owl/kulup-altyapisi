import { KULUP, hostOf } from '../../shared/kulup'

export function connectionLabel(health: unknown): string | null {
  if (!health || typeof health !== 'object' || !('cms' in health)) return null
  const { cms } = health
  if (!cms || typeof cms !== 'object' || !('live' in cms) || !('host' in cms)) return null
  if (typeof cms.live !== 'boolean' || typeof cms.host !== 'string' || !cms.host) return null
  if (cms.live) return `Canlı · CMS: ${cms.host}`
  if (!('site' in health)) return null
  const { site } = health
  if (!site || typeof site !== 'object' || !('host' in site) || typeof site.host !== 'string' || !site.host) return null
  return `STAGING · CMS: ${cms.host} · Site: ${site.host}`
}

export function stagingBannerText(health: unknown): string | null {
  if (!health || typeof health !== 'object' || !('cms' in health)) return null
  const { cms } = health
  if (!cms || typeof cms !== 'object' || !('live' in cms) || !('host' in cms)) return null
  if (cms.live !== false || typeof cms.host !== 'string') return null
  const liveSite = 'site' in health && health.site && typeof health.site === 'object' &&
    'host' in health.site && health.site.host === hostOf(KULUP.adresler.site)
  return `STAGING · CMS: ${cms.host}${liveSite ? ' · UYARI: bilet bağlantıları canlı siteye' : ''}`
}
