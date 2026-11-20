import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertStagingTarget, LIVE_HOSTS, peopleSeedBlockers } from '../../src/seed/stagingGuard'
import { buildStagingSeed } from '../../src/seed/stagingData'

const safeEnv = {
  BYT_STAGING: '1', PAYLOAD_PUBLIC_SERVER_URL: 'https://staging-api.example.invalid',
  DATABASE_URL: 'postgres://seeduser:s3cret-pass@staging-db.example.invalid/staging_seed',
  STAGING_DATABASE_HOSTS: 'staging-db.example.invalid',
}
const argv = ['node', 'seed-staging.ts', '--yes-staging', '--db-host=staging-db.example.invalid']

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('staging guard', () => {
  it('kişi verisi için temiz ortamı kabul eder', () => {
    expect(peopleSeedBlockers({ BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: 'test@other.invalid' })).toEqual([])
  })

  it('Telegram token değerini açıklamadan engeller', () => {
    const blockers = peopleSeedBlockers({ BYT_STAGING: '1', TELEGRAM_BOT_TOKEN: 'secret-value' })
    expect(blockers).toContain('TELEGRAM_BOT_TOKEN tanımlı')
    expect(blockers.join(' ')).not.toContain('secret-value')
  })

  it('Telegram chat id tanımlıysa engeller', () => {
    const blockers = peopleSeedBlockers({ BYT_STAGING: '1', TELEGRAM_CHAT_ID: 'private-id' })
    expect(blockers).toContain('TELEGRAM_CHAT_ID tanımlı')
    expect(blockers.join(' ')).not.toContain('private-id')
    expect(peopleSeedBlockers({ BYT_STAGING: '1', TELEGRAM_BOT_TOKEN: ' ' }))
      .toContain('TELEGRAM_BOT_TOKEN tanımlı')
  })

  it('staging işareti yoksa kişi verisini engeller', () => {
    expect(peopleSeedBlockers({})).toContain('BYT_STAGING gerekli')
  })

  it('allowlist içinde example.invalid varsa harf duyarsız engeller', () => {
    expect(peopleSeedBlockers({ BYT_STAGING: '1', STAGING_MAIL_ALLOWLIST: 'a@x.com,EXAMPLE.INVALID' }))
      .toContain('STAGING_MAIL_ALLOWLIST example.invalid içeriyor')
  })

  it('ortam işareti ve onay bayrağını zorunlu tutar', () => {
    expect(() => assertStagingTarget({ ...safeEnv, BYT_STAGING: undefined }, argv)).toThrow()
    expect(() => assertStagingTarget(safeEnv, argv.slice(0, 2))).toThrow()
  })

  it.each(LIVE_HOSTS)('canlı hostu reddeder: %s', (host) => {
    expect(() => assertStagingTarget({ ...safeEnv, PAYLOAD_PUBLIC_SERVER_URL: `https://${host}` }, argv)).toThrow()
  })

  it('staging ve localhost hedefini kabul eder', () => {
    expect(() => assertStagingTarget(safeEnv, argv)).not.toThrow()
    expect(() => assertStagingTarget({ ...safeEnv, PAYLOAD_PUBLIC_SERVER_URL: 'http://localhost:3001' }, argv)).not.toThrow()
  })

  it('Postgres bağlantısında host onayını ve izin listesini doğrular', () => {
    expect(() => assertStagingTarget(safeEnv, argv)).not.toThrow()
    expect(() => assertStagingTarget({ ...safeEnv,
      STAGING_DATABASE_HOSTS: ' Staging-DB.example.invalid , x',
    }, argv)).not.toThrow()
    expect(() => assertStagingTarget({ ...safeEnv,
      DATABASE_URL: 'postgresql://seeduser:s3cret-pass@staging-db.example.invalid/staging_seed',
    }, argv)).not.toThrow()
  })

  it.each([
    { name: 'host argümanı yok', env: safeEnv, args: argv.slice(0, 3), message: '--db-host gerekli' },
    { name: 'host argümanı farklı', env: safeEnv, args: [...argv.slice(0, 3), '--db-host=other.example.invalid'],
      message: "DATABASE_URL host'u --db-host ile eşleşmiyor: staging-db.example.invalid" },
    { name: 'izin listesi yok', env: { ...safeEnv, STAGING_DATABASE_HOSTS: undefined }, args: argv,
      message: 'STAGING_DATABASE_HOSTS gerekli' },
    { name: 'izin listesi boş', env: { ...safeEnv, STAGING_DATABASE_HOSTS: '' }, args: argv,
      message: 'STAGING_DATABASE_HOSTS gerekli' },
    { name: 'izin listesinde yalnız virgül var', env: { ...safeEnv, STAGING_DATABASE_HOSTS: ' , ' }, args: argv,
      message: 'STAGING_DATABASE_HOSTS gerekli' },
    { name: 'host izin listesinde yok', env: { ...safeEnv, STAGING_DATABASE_HOSTS: 'other.example.invalid' },
      args: argv, message: "DATABASE_URL host'u STAGING_DATABASE_HOSTS listesinde değil: staging-db.example.invalid" },
    { name: 'veritabanı adresi ayrıştırılamaz', env: { ...safeEnv, DATABASE_URL: 'not a url' }, args: argv,
      message: 'DATABASE_URL geçersiz' },
    { name: 'veritabanı protokolü farklı', env: { ...safeEnv,
      DATABASE_URL: 'mysql://seeduser:s3cret-pass@staging-db.example.invalid/staging_seed' }, args: argv,
      message: 'DATABASE_URL geçersiz' },
  ])('$name durumunu gizli bilgi açıklamadan reddeder', ({ env, args, message }) => {
    let error: unknown
    try {
      assertStagingTarget(env, args)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(message)
    for (const secret of ['s3cret-pass', 'seeduser', 'staging_seed']) {
      expect((error as Error).message).not.toContain(secret)
    }
  })

  it('veritabanı adresini hata mesajına koymaz', () => {
    expect(() => assertStagingTarget({ ...safeEnv, DATABASE_URL: undefined }, argv)).toThrow('DATABASE_URL eksik')
    expect(() => assertStagingTarget({ ...safeEnv, PAYLOAD_PUBLIC_SERVER_URL: 'https://example.org' }, argv))
      .toThrowError('PAYLOAD_PUBLIC_SERVER_URL staging hedefi değil')
    try {
      assertStagingTarget({ ...safeEnv, PAYLOAD_PUBLIC_SERVER_URL: 'https://example.org' }, argv)
    } catch (error) {
      expect(String(error)).not.toContain(safeEnv.DATABASE_URL)
    }
  })
})

describe('Supabase staging proje kilidi', () => {
  const poolerHost = 'aws-0-eu-central-1.pooler.supabase.com'
  const directHost = 'db.stagingref123.supabase.co'
  const poolerEnv = {
    ...safeEnv,
    DATABASE_URL: `postgres://postgres.stagingref123:s3cret-pass@${poolerHost}/postgres`,
    STAGING_DATABASE_HOSTS: poolerHost,
    STAGING_DATABASE_PROJECTS: ' otherref , StagingRef123 ',
  }
  const poolerArgs = [...argv.slice(0, 3), `--db-host=${poolerHost}`, '--db-project=stagingref123']
  const directEnv = {
    ...poolerEnv,
    DATABASE_URL: `postgres://postgres:s3cret-pass@${directHost}/postgres`,
    STAGING_DATABASE_HOSTS: directHost,
  }
  const directArgs = [...argv.slice(0, 3), `--db-host=${directHost}`, '--db-project=stagingref123']

  it('pooler kullanıcı adını, proje argümanını ve kırpılmış izin listesini kabul eder', () => {
    expect(() => assertStagingTarget(poolerEnv, poolerArgs)).not.toThrow()
    expect(() => assertStagingTarget({ ...poolerEnv,
      DATABASE_URL: `postgres://postgres%2Estagingref123:s3cret-pass@${poolerHost}/postgres`,
    }, poolerArgs)).not.toThrow()
  })

  it('doğrudan bağlantıda host projesini kabul eder', () => {
    expect(() => assertStagingTarget(directEnv, directArgs)).not.toThrow()
  })

  it.each([
    { name: 'pooler proje argümanı yok', env: poolerEnv, args: poolerArgs.slice(0, -1),
      message: '--db-project gerekli' },
    { name: 'pooler proje argümanı farklı', env: poolerEnv,
      args: [...poolerArgs.slice(0, -1), '--db-project=liveref456'],
      message: 'DATABASE_URL projesi --db-project ile eşleşmiyor' },
    { name: 'pooler kullanıcı projesi farklı', env: { ...poolerEnv,
      DATABASE_URL: `postgres://postgres.liveref456:s3cret-pass@${poolerHost}/postgres`,
    }, args: poolerArgs, message: 'DATABASE_URL projesi --db-project ile eşleşmiyor' },
    { name: 'pooler kullanıcı projesi yok', env: { ...poolerEnv,
      DATABASE_URL: `postgres://postgres:s3cret-pass@${poolerHost}/postgres`,
    }, args: poolerArgs, message: 'DATABASE_URL projesi --db-project ile eşleşmiyor' },
    { name: 'pooler proje listesi yok', env: { ...poolerEnv, STAGING_DATABASE_PROJECTS: undefined },
      args: poolerArgs, message: 'STAGING_DATABASE_PROJECTS gerekli' },
    { name: 'pooler proje listesi boş', env: { ...poolerEnv, STAGING_DATABASE_PROJECTS: ' , ' },
      args: poolerArgs, message: 'STAGING_DATABASE_PROJECTS gerekli' },
    { name: 'pooler proje listesinde yok', env: { ...poolerEnv, STAGING_DATABASE_PROJECTS: 'liveref456' },
      args: poolerArgs, message: 'Supabase projesi STAGING_DATABASE_PROJECTS listesinde değil' },
    { name: 'doğrudan bağlantı host projesi farklı', env: { ...directEnv,
      DATABASE_URL: 'postgres://postgres:s3cret-pass@db.liveref456.supabase.co/postgres',
      STAGING_DATABASE_HOSTS: 'db.liveref456.supabase.co',
    }, args: [...argv.slice(0, 3), '--db-host=db.liveref456.supabase.co', '--db-project=stagingref123'],
    message: 'DATABASE_URL projesi --db-project ile eşleşmiyor' },
    { name: 'doğrudan bağlantı proje argümanı yok', env: directEnv, args: directArgs.slice(0, -1),
      message: '--db-project gerekli' },
    { name: 'doğrudan bağlantı proje listesi yok', env: { ...directEnv, STAGING_DATABASE_PROJECTS: undefined },
      args: directArgs, message: 'STAGING_DATABASE_PROJECTS gerekli' },
  ])('$name durumunu gizli bilgi açıklamadan reddeder', ({ env, args, message }) => {
    let error: unknown
    try {
      assertStagingTarget(env, args)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(message)
    for (const secret of ['s3cret-pass', 'liveref456']) {
      expect((error as Error).message).not.toContain(secret)
    }
    if (env.STAGING_DATABASE_HOSTS === poolerHost) {
      expect((error as Error).message).not.toContain('postgres.')
    }
  })
})

describe('saf staging verisi', () => {
  it('sayıları, sahte iletişim bilgilerini ve kapı alanlarını doğrular', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Beklenmeyen ağ isteği') }))
    vi.stubEnv('BYT_STAGING', '1')
    const data = buildStagingSeed()
    expect([data.events.length, data.registrations.length, data.memberApplications.length,
      data.coreTeamApplications.length]).toEqual([2, 20, 10, 10])
    const people = [...data.registrations, ...data.memberApplications, ...data.coreTeamApplications]
    expect(people.every((person) => /^kisi\d{2}@example\.invalid$/.test(person.email))).toBe(true)
    expect(people.every((person) => /^\+90500000\d{4}$/.test(person.phone ?? ''))).toBe(true)
    expect(data.registrations.some((registration) => registration.attended)).toBe(true)
    expect(data.events.some((event) => event.scannerActive && Array.isArray(event.gateFieldDefinitions)
      && event.gateFieldDefinitions.length > 0)).toBe(true)
    expect(data.events.every((event) => event.title.startsWith('[STAGING]'))).toBe(true)
    expect(data.emailTemplates).toHaveLength(8)
    expect(data.whatsAppTemplates).toHaveLength(8)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('her çağrıda aynı veriyi üretir', () => {
    expect(buildStagingSeed()).toEqual(buildStagingSeed())
  })
})
