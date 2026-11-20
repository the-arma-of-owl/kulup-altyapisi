import { CONFIG } from './config.js'

export function healthResponse() {
  return {
    ok: true,
    cms: { live: CONFIG.isLiveCms, host: new URL(CONFIG.payloadOrigin).host },
    site: { host: new URL(CONFIG.siteUrl).host },
  }
}
