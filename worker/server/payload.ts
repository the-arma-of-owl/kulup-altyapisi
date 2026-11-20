import { Agent, fetch as undiciFetch } from 'undici'
import { CONFIG } from './config.js'

type ResponseLike = Pick<Response, 'ok' | 'status' | 'json'> & {
  headers: Pick<Headers, 'getSetCookie'>
}
type FetchInit = Pick<RequestInit, 'method' | 'headers' | 'body' | 'signal'>
export type Fetcher = (url: string, init: FetchInit) => Promise<ResponseLike>

const agent = new Agent({ keepAliveTimeout: 4_000, keepAliveMaxTimeout: 10_000 })
// Dosya yüklemesi (FormData) Node'un yerleşik fetch'iyle gider: npm undici paketinin fetch'i yerleşik
// FormData'yı tanımıyor ve dosya göndermiyor ("No files were uploaded"). Yerleşik fetch'e npm undici
// dispatcher'ı verilmez (sürüm uyuşmazlığı); bunun yerine yükleme istekleri `Connection: close` ile gider:
// Windows'ta sunucunun kapattığı bekleyen keep-alive soketi yeniden kullanılıp ECONNRESET alınıyordu.
export const UPLOAD_TIMEOUT_MS = 60_000
export const REQUEST_TIMEOUT_MS = 20_000
const defaultFetcher: Fetcher = (url, init) =>
  (typeof FormData !== 'undefined' && init.body instanceof FormData
    ? globalThis.fetch(url, init as RequestInit)
    : undiciFetch(url, { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1])) as Promise<ResponseLike>

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  return isTimeout(error.cause)
}

function errorCause(error: unknown): { code: string; message: string } {
  const outer = error instanceof Error ? error : new Error('Bilinmeyen ağ hatası')
  const cause = outer.cause
  if (cause && typeof cause === 'object') {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code :
      'name' in cause && typeof cause.name === 'string' ? cause.name : outer.name
    const message = 'message' in cause && typeof cause.message === 'string' ? cause.message : outer.message
    return { code, message }
  }
  return { code: outer.name, message: outer.message }
}

export type CookieJar = Record<string, string>

export class PayloadError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export function setCookies(headers: Pick<Headers, 'getSetCookie'>): CookieJar {
  const jar: CookieJar = {}
  for (const entry of headers.getSetCookie()) {
    const pair = entry.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    jar[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
  return jar
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ')
}

export class PayloadClient {
  private sessionCookies: () => CookieJar | null = () => null
  private unauthorized: () => void = () => undefined

  constructor(
    private readonly fetcher: Fetcher = defaultFetcher,
    private readonly retryDelayMs = 400,
  ) {}

  configure(getCookies: () => CookieJar | null, onUnauthorized: () => void): void {
    this.sessionCookies = getCookies
    this.unauthorized = onUnauthorized
  }

  async request<T>(path: string, options: {
    method?: string; body?: unknown; cookies?: CookieJar; skipSessionCheck?: boolean
  } = {}): Promise<{ data: T; response: ResponseLike }> {
    const cookies = options.cookies ?? this.sessionCookies()
    const headers: Record<string, string> = { Origin: CONFIG.payloadOrigin, Accept: 'application/json' }
    // FormData (dosya yükleme) gövdesinde Content-Type'ı fetch kendisi (boundary ile) koyar.
    const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
    if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
    if (cookies && Object.keys(cookies).length) headers.Cookie = cookieHeader(cookies)
    if (isForm) headers.Connection = 'close'
    const method = (options.method || 'GET').toUpperCase()
    let response: ResponseLike | undefined
    for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt++) {
      try {
        response = await this.fetcher(`${CONFIG.payloadUrl}${path}`, {
          method, headers,
          ...(options.body === undefined ? {} : { body: isForm ? options.body as FormData : JSON.stringify(options.body) }),
          signal: AbortSignal.timeout(isForm ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
        })
        break
      } catch (error) {
        const cause = errorCause(error)
        console.warn('[payload]', method, path.split('?')[0], cause.code, cause.message)
        if (method === 'GET' && attempt === 0 && error instanceof TypeError && !isTimeout(error)) {
          await wait(this.retryDelayMs)
          continue
        }
        throw new PayloadError('CMS bağlantısı kurulamadı.', 503)
      }
    }
    if (!response) throw new PayloadError('CMS bağlantısı kurulamadı.', 503)
    let data: T
    try { data = await response.json() as T }
    catch { throw new PayloadError('CMS geçersiz yanıt verdi.', 502) }
    if (!response.ok) {
      // Yalnız 401 oturumun bittiğini gösterir. 403 tek bir kaynağa yetki yok demektir; oturumu düşürüp
      // operatörü girişe atmaz (ABT ile aynı davranış).
      if (response.status === 401 && !options.skipSessionCheck) this.unauthorized()
      const message = response.status === 413 ? 'Dosya çok büyük.'
        : response.status >= 500 ? 'CMS geçici olarak kullanılamıyor.'
          : ((data as { message?: string }).message
            || (typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : '')
            || (data as { errors?: Array<{ message?: string; data?: { errors?: Array<{ path?: string; message?: string }> } }> }).errors?.map((e) =>
              [e.message, ...(e.data?.errors ?? []).map((f) => `${f.path}: ${f.message}`)].filter(Boolean).join(' · ')).join(' | ')
            || `CMS işlemi başarısız (${response.status}).`)
      throw new PayloadError(message, response.status)
    }
    return { data, response }
  }
}
