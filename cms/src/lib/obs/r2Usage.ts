import { createHash, createHmac } from 'node:crypto'

/**
 * R2 doluluk ölçümü — YALNIZ OKUMA. Tek kullanılan istek S3 ListObjectsV2 (GET ?list-type=2).
 * Yazma/silme çağrısı yok; @aws-sdk eklememek için imza (SigV4) burada elle atılır.
 * Cloudflare R2 ücretsiz katmanı: 10 GB-ay depolama (aylık ortalama), 1M A sınıfı işlem (listeleme A sınıfıdır).
 */

export const R2_FREE_BYTES = 10 * 1000 ** 3 // Cloudflare GB = 10^9 bayt

export type R2Usage = { bytes: number; objects: number; certificateBytes: number; certificateObjects: number; truncated: boolean; pages: number }

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest()
const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function signListRequest(input: {
  endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string
  query: Record<string, string>; now?: Date
}): { url: string; headers: Record<string, string> } {
  const endpoint = new URL(input.endpoint)
  const region = input.region || 'auto'
  const now = input.now ?? new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const path = `${endpoint.pathname.replace(/\/$/, '')}/${rfc3986(input.bucket)}`
  const query = Object.keys(input.query).sort().map((key) => `${rfc3986(key)}=${rfc3986(input.query[key])}`).join('&')
  const payloadHash = sha256('')
  const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonical = ['GET', path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${date}/${region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return {
    url: `${endpoint.origin}${path}?${query}`,
    headers: {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

const decodeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export function parseListPage(xml: string): { items: Array<{ key: string; size: number }>; truncated: boolean; next: string | null } {
  const items: Array<{ key: string; size: number }> = []
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(match[1])?.[1] ?? ''
    const size = Number(/<Size>(\d+)<\/Size>/.exec(match[1])?.[1] ?? 0)
    items.push({ key: decodeXml(key), size })
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
  return { items, truncated, next: next ? decodeXml(next) : null }
}

export async function measureR2Usage(options: { fetcher?: typeof fetch; maxPages?: number } = {}): Promise<R2Usage | { error: string }> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return { error: 'R2 anahtarları tanımlı değil' }
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET
  if (!endpoint || !bucket) return { error: 'R2_ENDPOINT / R2_BUCKET tanımlı değil' }
  const fetcher = options.fetcher ?? fetch
  const usage: R2Usage = { bytes: 0, objects: 0, certificateBytes: 0, certificateObjects: 0, truncated: false, pages: 0 }
  let token: string | null = null
  for (let page = 0; page < (options.maxPages ?? 100); page++) {
    const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' }
    if (token) query['continuation-token'] = token
    const signed = signListRequest({ endpoint, bucket, accessKeyId, secretAccessKey, query })
    let response: Response
    try {
      response = await fetcher(signed.url, { method: 'GET', headers: signed.headers, signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      return { error: `R2'ye ulaşılamadı: ${(error as Error)?.message ?? error}` }
    }
    const body = await response.text()
    if (!response.ok) {
      const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1]
      return { error: `R2 listeleme ${response.status}${code ? ` (${code})` : ''}` }
    }
    const parsed = parseListPage(body)
    usage.pages++
    for (const item of parsed.items) {
      usage.bytes += item.size
      usage.objects++
      if (/(^|\/)certificate-/.test(item.key)) { usage.certificateBytes += item.size; usage.certificateObjects++ }
    }
    if (!parsed.truncated || !parsed.next) return usage
    token = parsed.next
  }
  usage.truncated = true
  return usage
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1000 ** 3) return `${(bytes / 1000 ** 3).toFixed(2)} GB`
  if (bytes >= 1000 ** 2) return `${(bytes / 1000 ** 2).toFixed(1)} MB`
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(0)} KB`
  return `${bytes} B`
}
