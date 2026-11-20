import { sendObservedEmail } from '../obs/mailLog'
import { esc } from '../obs/privacy'
import type { getObsStore } from '../obs/store'
import { KULUP } from '../kulup'

type PayloadLike = Parameters<typeof getObsStore>[0]

/**
 * Katılımcı kod mailleri. Geliştirme/test kilidi: canlı (production) dışında YALNIZ izin listesindeki adreslere
 * gönderilir (varsayılan: liste boşsa hiç kimse; Gmail "+etiket" adresleri aynı kutu sayılır). PARTICIPANT_MAIL_ALLOWLIST
 * tanımlıysa canlıda da uygulanır (yayın öncesi deneme için). Engellenen mail gönderilmez; kod günlüğe yazılmaz.
 */
export function participantMailAllowed(to: string, env: { NODE_ENV?: string; PARTICIPANT_MAIL_ALLOWLIST?: string } = {
  NODE_ENV: process.env.NODE_ENV, PARTICIPANT_MAIL_ALLOWLIST: process.env.PARTICIPANT_MAIL_ALLOWLIST,
}): boolean {
  const configured = (env.PARTICIPANT_MAIL_ALLOWLIST ?? '').trim()
  if (env.NODE_ENV === 'production' && !configured) return true
  const list = configured.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
  const address = to.trim().toLowerCase()
  const base = address.replace(/\+[^@]*@/, '@')
  return list.includes(address) || list.includes(base)
}

// Kod maili tasarımı (Canva taslağı): üst görsel, selam, kod kutusu, siyah alt bilgi + logolar.
// Görseller sitede barındırılır (site/public/mail); dosya değişirse adı da değişmeli (önbellek).
// Adresler ve alt bilgi kulup.config.json'dan gelir (adresler.site, yasal.epostaAltBilgisi).
const MAIL_ASSETS = `${KULUP.adresler.site.replace(/\/+$/, '')}/mail`
const SITE_URL = KULUP.adresler.site.replace(/\/+$/, '')
const FOOTER_TEXT = `${KULUP.yasal.epostaAltBilgisi} Sorularınız veya geri bildirimleriniz için bizimle iletişime geçebilirsiniz: `

/** "Merhaba Ali, 👋" — ad yoksa yalnız "Merhaba 👋". */
export function greeting(name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? ''
  return first ? `Merhaba ${esc(first)}, 👋` : 'Merhaba 👋'
}

export function codeMailHtml(input: { name: string; code: string; purpose: 'verify' | 'reset' }): string {
  const lead = input.purpose === 'verify' ? 'E-posta doğrulama kodun burada:' : 'Parola sıfırlama kodun burada:'
  const font = 'font-family:Arial,Helvetica,sans-serif'
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no, date=no, address=no, email=no"><style>body{margin:0;padding:0}@media (max-width:599px){.ecw{width:100%!important;min-width:0!important}}</style></head>
<body style="width:100%;margin:0;padding:0;background-color:#f0f1f5;-webkit-text-size-adjust:100%">
<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5"><tr><td>
<table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="ecw" style="max-width:600px;width:600px;min-width:600px;margin:0 auto;background-color:#ffffff">
<tr><td style="padding:24px 24px 16px"><img src="${MAIL_ASSETS}/kod-ust-1.png" width="552" alt="${esc(KULUP.kisaAd)}" style="display:block;width:552px;height:auto;max-width:100%;border:0"></td></tr>
<tr><td style="${font};color:#0e1b10;font-size:19px;font-weight:700;letter-spacing:-0.04em;text-align:center;padding:0 24px 16px;line-height:1.2">${greeting(input.name)}</td></tr>
<tr><td style="${font};color:#0e1b10;font-size:16px;letter-spacing:-0.04em;text-align:center;padding:0 24px 12px;line-height:1.3">${lead}</td></tr>
<tr><td align="center" style="padding:0 24px 8px">
<div style="${font};display:inline-block;font-size:36px;font-weight:700;letter-spacing:10px;color:#0e1b10;background-color:#f0f1f5;border:1px solid #bfc3c8;border-radius:12px;padding:14px 18px 14px 28px;-webkit-user-select:all;user-select:all">${esc(input.code)}</div>
</td></tr>
<tr><td style="${font};color:#5b6168;font-size:12px;text-align:center;padding:0 24px 24px;line-height:1.4">Kopyalamak için koda basılı tut. Kod 15 dakika geçerlidir ve en fazla 5 kez denenebilir.</td></tr>
<tr><td style="padding:0 24px 24px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:#bfc3c8">&nbsp;</td></tr></table></td></tr>
<tr><td style="background-color:#000000;padding:7px 46px">
<p style="${font};color:#f6f5f1;font-size:13px;letter-spacing:-0.01em;line-height:18px;margin:0;padding:16px 0">${FOOTER_TEXT}<a href="${SITE_URL}/iletisim" target="_blank" rel="noopener" style="color:#f6f5f1;text-decoration:underline">${SITE_URL}/iletisim</a></p>
<img src="${MAIL_ASSETS}/logolar-1.png" width="204" alt="${esc(KULUP.universite)} ve ${esc(KULUP.kisaAd)}" style="display:block;width:204px;height:auto;max-width:100%;margin:0 auto 16px;border:0">
</td></tr>
</table></td></tr></table></body></html>`
}

export async function sendCodeMail(payload: PayloadLike, input: { to: string; name: string; code: string; purpose: 'verify' | 'reset' }): Promise<'sent' | 'blocked' | 'failed'> {
  if (!participantMailAllowed(input.to)) {
    console.warn('[takim] izin listesi dışı adrese kod maili gönderilmedi (geliştirme kilidi)')
    return 'blocked'
  }
  const title = input.purpose === 'verify' ? 'E-posta doğrulama kodun' : 'Parola sıfırlama kodun'
  const html = codeMailHtml(input)
  try {
    await sendObservedEmail(payload, { to: input.to, subject: `${KULUP.kisaAd} ${title}`, html },
      { purpose: 'account', recipientName: input.name, silentSuccess: true })
    return 'sent'
  } catch {
    return 'failed' // ayrıntı sendObservedEmail'de günlüğe/Telegram'a düştü
  }
}

/** Takımla ilgili kısa bilgi maili (ör. kaptanlık devri). Kod maillerindeki izin listesi kilidi burada da geçerli. */
export async function sendTeamNoticeMail(payload: PayloadLike, input: { to: string; name: string; subject: string; lines: string[] }): Promise<'sent' | 'blocked' | 'failed'> {
  if (!participantMailAllowed(input.to)) return 'blocked'
  const font = 'font-family:Arial,Helvetica,sans-serif'
  const body = input.lines.map((line) => `<p style="${font};color:#0e1b10;font-size:15px;line-height:1.5;margin:0 0 12px">${esc(line)}</p>`).join('')
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px;background-color:#f0f1f5"><table align="center" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px"><tr><td style="padding:28px">
<p style="${font};color:#0e1b10;font-size:19px;font-weight:700;margin:0 0 16px">${greeting(input.name)}</p>${body}
<p style="${font};color:#5b6168;font-size:12px;line-height:1.4;margin:20px 0 0">${esc(KULUP.tamAd)} · <a href="${SITE_URL}/katilimci" style="color:#5b6168">Katılımcı paneli</a></p>
</td></tr></table></body></html>`
  try {
    await sendObservedEmail(payload, { to: input.to, subject: input.subject, html }, { purpose: 'account', recipientName: input.name, silentSuccess: true })
    return 'sent'
  } catch {
    return 'failed'
  }
}
