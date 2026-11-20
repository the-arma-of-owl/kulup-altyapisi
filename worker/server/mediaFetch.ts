import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { CONFIG } from './config.js'

export const MEDIA_MAX_BYTES = 4_500_000
export const MEDIA_TIMEOUT_MS = 20_000
export const MEDIA_MAX_REDIRECTS = 3

export class MediaUrlError extends Error {
  constructor(message: string) { super(message); this.name = 'MediaUrlError' }
}

type LookupImpl = (hostname: string) => Promise<readonly { address: string }[]>
type FetchImpl = typeof fetch

const defaultLookup: LookupImpl = (hostname) => lookup(hostname, { all: true })
const allowedHosts = (): readonly string[] => [new URL(CONFIG.payloadOrigin).hostname, ...CONFIG.mediaHosts]
const label = (url: URL): string => `${url.host}${url.pathname}`
const hasExplicitPort = (value: string): boolean => {
  const authority = /^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/i.exec(value)?.[1] ?? ''
  return /:\d+$/.test(authority)
}

export function validateMediaUrl(value: string, hosts: readonly string[] = allowedHosts()): URL {
  let url: URL
  try { url = new URL(value) }
  catch { throw new MediaUrlError('Medya adresi geçerli bir URL değil.') }
  const address = label(url)
  if (url.protocol !== 'https:') throw new MediaUrlError(`Medya adresi HTTPS olmalı: ${address}`)
  if (url.port || hasExplicitPort(value)) throw new MediaUrlError(`Medya adresinde port belirtilmemeli: ${address}`)
  if (url.username || url.password) throw new MediaUrlError(`Medya adresinde kullanıcı bilgisi olamaz: ${address}`)
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new MediaUrlError(`Medya adresi IP olamaz: ${address}`)
  if (!hosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase())) {
    throw new MediaUrlError(`Medya sunucusuna izin verilmiyor: ${address}`)
  }
  return url
}

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4')
blocked.addAddress('::', 'ipv6')
blocked.addAddress('::1', 'ipv6')
for (const [address, prefix] of [['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  blocked.addSubnet(address, prefix, 'ipv6')
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blocked.check(address, 'ipv4')
  if (family === 6) {
    // BlockList, IPv4 kurallarını eşlemeli IPv6 gösterimine de uygular.
    return blocked.check(address, 'ipv6')
  }
  return true
}

async function readLimited(response: Response, url: URL): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks, size)
      size += value.byteLength
      if (size > MEDIA_MAX_BYTES) throw new MediaUrlError(`Medya 4,5 MB sınırını aşıyor: ${label(url)}`)
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (error instanceof MediaUrlError) throw error
    throw new MediaUrlError(`Medya okunamadı: ${label(url)}`)
  }
}

export async function fetchMedia(
  value: string,
  options: { fetchImpl?: FetchImpl; lookupImpl?: LookupImpl; hosts?: readonly string[] } = {},
): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
  const hosts = options.hosts ?? allowedHosts()
  const signal = AbortSignal.timeout(MEDIA_TIMEOUT_MS)
  let url = validateMediaUrl(value, hosts)
  for (let redirects = 0; ; redirects += 1) {
    let addresses: readonly { address: string }[]
    try { addresses = await (options.lookupImpl ?? defaultLookup)(url.hostname) }
    catch { throw new MediaUrlError(`Medya sunucusunun adresi çözülemedi: ${label(url)}`) }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new MediaUrlError(`Medya sunucusu özel ağ adresine çözülüyor: ${label(url)}`)
    }
    let response: Response
    try { response = await (options.fetchImpl ?? fetch)(url, { redirect: 'manual', signal }) }
    catch {
      throw new MediaUrlError(`${signal.aborted ? 'Medya indirme zaman aşımı' : 'Medya indirilemedi'}: ${label(url)}`)
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      const location = response.headers.get('location')
      if (!location) throw new MediaUrlError(`Medya yönlendirmesi hedefsiz: ${label(url)}`)
      if (redirects >= MEDIA_MAX_REDIRECTS) throw new MediaUrlError(`Medya çok fazla yönlendirildi: ${label(url)}`)
      if (hasExplicitPort(location)) {
        let target: URL
        try { target = new URL(location, url) }
        catch { throw new MediaUrlError(`Medya yönlendirmesi geçersiz: ${label(url)}`) }
        throw new MediaUrlError(`Medya adresinde port belirtilmemeli: ${label(target)}`)
      }
      let next: URL
      try { next = new URL(location, url) }
      catch { throw new MediaUrlError(`Medya yönlendirmesi geçersiz: ${label(url)}`) }
      url = validateMediaUrl(next.href, hosts)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new MediaUrlError(`Medya indirilemedi (${response.status}): ${label(url)}`)
    }
    const length = response.headers.get('content-length')
    if (length !== null && Number(length) > MEDIA_MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined)
      throw new MediaUrlError(`Medya 4,5 MB sınırını aşıyor: ${label(url)}`)
    }
    const bytes = await readLimited(response, url)
    return {
      bytes,
      contentType: response.headers.get('content-type')?.split(';', 1)[0].trim() || 'application/octet-stream',
      filename: url.pathname.split('/').pop() || 'media',
    }
  }
}
