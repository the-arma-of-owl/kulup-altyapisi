import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FROM, MailError, sendResendEmail, stagingMailGuard } from '../../src/lib/resend'
import { parseExtraOrigins } from '../../src/lib/origins'
import { stagingBannerEnabled } from '../../src/lib/staging'

const input = { to: 'alice@example.invalid', subject: 'Merhaba', html: '<p>Merhaba</p>' }

describe('stagingBannerEnabled', () => {
  it('değişken yokken kapalıdır', () => {
    expect(stagingBannerEnabled({})).toBe(false)
  })

  it('yalnız 1 değerinde açıktır', () => {
    expect(stagingBannerEnabled({ BYT_STAGING: '1' })).toBe(true)
    expect(stagingBannerEnabled({ BYT_STAGING: '0' })).toBe(false)
  })
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Beklenmeyen fetch çağrısı') }))
  vi.stubEnv('BYT_STAGING', '')
  vi.stubEnv('STAGING_MAIL_ALLOWLIST', '')
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('RESEND_API_URL', '')
  vi.stubEnv('RESEND_FROM', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('stagingMailGuard', () => {
  it('staging kapalıyken konuyu ve izni değiştirmez', () => {
    expect(stagingMailGuard(input.to, input.subject, {})).toEqual({ allowed: true, subject: input.subject })
  })

  it('adresleri kırpar ve harf farkını yok sayar', () => {
    expect(stagingMailGuard(' Alice@Example.Invalid ', 'Merhaba', {
      BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: ' , BOB@example.invalid,  alice@EXAMPLE.invalid  ,',
    })).toEqual({ allowed: true, subject: '[STAGING] Merhaba' })
  })

  it('izinsiz adresi ve boş listeyi reddeder', () => {
    expect(stagingMailGuard(input.to, 'Merhaba', {
      BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: 'bob@example.invalid',
    }).allowed).toBe(false)
    expect(stagingMailGuard(input.to, 'Merhaba', { BYT_STAGING: '1' }).allowed).toBe(false)
    expect(stagingMailGuard(input.to, 'Merhaba', {
      BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: ' ,  , ',
    }).allowed).toBe(false)
  })

  it('staging önekini yinelemez', () => {
    expect(stagingMailGuard(input.to, '[STAGING] Merhaba', {
      BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: input.to,
    }).subject).toBe('[STAGING] Merhaba')
  })
})

describe('sendResendEmail', () => {
  function successfulFetch() {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ id: 'fake-id' }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('staging kapalıyken önceki URL, gövde ve konu ile tek istek atar', async () => {
    const fetchMock = successfulFetch()
    expect(await sendResendEmail(input)).toEqual({ id: 'fake-id' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body as string)).toEqual({
      from: DEFAULT_FROM, to: [input.to], subject: input.subject, html: input.html,
    })
  })

  it('izinli adrese staging önekiyle tek istek atar ve öneki yinelemez', async () => {
    vi.stubEnv('BYT_STAGING', '1')
    vi.stubEnv('STAGING_MAIL_ALLOWLIST', ' ALICE@EXAMPLE.INVALID ')
    const fetchMock = successfulFetch()
    await sendResendEmail({ ...input, subject: '[STAGING] Merhaba' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).subject)
      .toBe('[STAGING] Merhaba')
    await sendResendEmail(input)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).subject)
      .toBe('[STAGING] Merhaba')
  })

  it.each(['bob@example.invalid', ''])('izinsiz veya boş listeyle fetch yapmaz (%s)', async (allowlist) => {
    vi.stubEnv('BYT_STAGING', '1')
    vi.stubEnv('STAGING_MAIL_ALLOWLIST', allowlist)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = await sendResendEmail(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MailError)
    expect(error).toMatchObject({ message: 'Staging: alıcı izin listesinde değil', status: 403 })
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls.flat().join(' ')).toContain('a***@example.invalid')
    expect(warn.mock.calls.flat().join(' ')).not.toContain(input.to)
  })
})

describe('parseExtraOrigins', () => {
  it('boş değerleri boş listeye çevirir', () => {
    expect(parseExtraOrigins()).toEqual([])
    expect(parseExtraOrigins(' ,  ')).toEqual([])
  })

  it('yalnız kırpılmış, geçerli HTTPS kökenlerini alır', () => {
    expect(parseExtraOrigins(' https://staging.example.invalid, http://plain.example.invalid, ' +
      'https://staging.example.invalid/path, https://staging.example.invalid?x=1, :bad, ' +
      'https://other.example.invalid:8443 ')).toEqual([
      'https://staging.example.invalid', 'https://other.example.invalid:8443',
    ])
  })
})
