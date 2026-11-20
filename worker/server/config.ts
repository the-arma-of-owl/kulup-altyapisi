import { KULUP, hostOf } from '../shared/kulup.js'
import { parseMailAllowlist, parseWhatsAppAllowlist } from './waAllowlist.js'

export const LOCAL_ENV = { apiToken: 'BYT_WORKER_API_TOKEN', sessionKey: 'BYT_WORKER_SESSION_KEY' } as const
export const LOCAL_SESSION_COOKIE = 'byt_worker_session'

const LIVE_CMS_ORIGIN = KULUP.adresler.cms.replace(/\/+$/, '')
// Yerel test için: BYT_WORKER_CMS_ORIGIN=http://127.0.0.1:3001 (varsayılan canlı CMS)
const cmsOrigin = (process.env.BYT_WORKER_CMS_ORIGIN || LIVE_CMS_ORIGIN).replace(/\/+$/, '')
const siteUrl = (process.env.BYT_WORKER_SITE_URL || KULUP.adresler.site).replace(/\/$/, '')
const isLiveCms = cmsOrigin === LIVE_CMS_ORIGIN
const waAllowlist = parseWhatsAppAllowlist(process.env.BYT_WORKER_WA_ALLOWLIST || '')
const mailAllowlist = parseMailAllowlist(process.env.BYT_WORKER_MAIL_ALLOWLIST || '')
const mediaHosts: readonly string[] = process.env.BYT_WORKER_MEDIA_HOSTS === undefined
  ? [hostOf(KULUP.adresler.cdn)].filter(Boolean)
  : process.env.BYT_WORKER_MEDIA_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)

if (!isLiveCms) console.warn(`[whatsapp] test ortamı: izin listesinde ${waAllowlist.length} numara`)
if (isLiveCms && waAllowlist.length > 0) console.warn(`[test kilidi] canlı CMS: WhatsApp yalnız ${waAllowlist.length} izinli numaraya`)
if (mailAllowlist.length > 0) console.warn(`[test kilidi] mail yalnız ${mailAllowlist.length} izinli adrese`)

export const CONFIG = {
  payloadUrl: `${cmsOrigin}/api`,
  payloadOrigin: cmsOrigin,
  isLiveCms,
  waAllowlist,
  mailAllowlist,
  mediaHosts,
  siteUrl,
  ticketUrl: (token: string) => `${siteUrl}/ticket/${token}`,
  clubName: KULUP.tamAd,
  serverHost: '127.0.0.1',
  serverPort: 4100,
} as const
