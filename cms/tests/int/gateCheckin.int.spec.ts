import { describe, expect, it, vi } from 'vitest'
import { gateCheckinEndpoint, gateView, renderGateMessage, validateGateFields, variablesFor } from '../../src/endpoints/gateCheckin'

const definition = { key: 'masa', label: 'Masa', required: true }

describe('validateGateFields', () => {
  it('seçenekleri yalnız listeden kabul eder ve tanımsız anahtarı yok sayar', () => {
    const definitions = [{ ...definition, options: ['A', 'B'] }]
    expect(validateGateFields(definitions, { masa: 'A', unknown: 'secret' })).toEqual({ ok: true, fields: { masa: 'A' } })
    expect(validateGateFields(definitions, { masa: 'C' })).toMatchObject({ ok: false, code: 'invalid_value', error: 'Geçersiz değer: Masa' })
  })

  it('aralık sınırlarını kabul eder; ondalık, harf ve dış değerleri reddeder', () => {
    const definitions = [{ ...definition, min: 1, max: 10 }]
    for (const value of ['1', '10']) expect(validateGateFields(definitions, { masa: value })).toMatchObject({ ok: true })
    for (const value of ['0', '11', '1.5', 'abc']) {
      expect(validateGateFields(definitions, { masa: value })).toMatchObject({ ok: false, code: 'invalid_value' })
    }
  })

  it('zorunlu boş alanı reddeder, isteğe bağlı boş alanı kabul eder', () => {
    expect(validateGateFields([definition], {})).toMatchObject({ ok: false, code: 'missing_fields' })
    expect(validateGateFields([{ ...definition, required: false, min: 1, max: 2 }], {}))
      .toEqual({ ok: true, fields: { masa: '' } })
  })

  it('bozuk seçenek ve aralık tanımlarını reddeder', () => {
    for (const broken of [{ options: 'A' }, { options: [] as string[] }, { min: 4, max: 3 }, { min: 1.5 }]) {
      expect(validateGateFields([{ ...definition, ...broken } as never], { masa: 'A' }))
        .toMatchObject({ ok: false, code: 'invalid_definition' })
    }
  })
})

describe('gateView', () => {
  it('yalnız kapıda gerekli kişi alanlarını çıkarır', () => {
    const source = {
      id: 31, fullName: 'Örnek Kişi', checkedInAt: '2026-09-30T12:00:00.000Z',
      gateFields: { masa: 'A' }, email: 'test@example.invalid', phone: '+900000000001', ticketToken: '0123456789abcdef',
    }
    expect(gateView(source)).toEqual({ fullName: 'Örnek Kişi', checkedInAt: source.checkedInAt, gateFields: { masa: 'A' } })
  })
})

describe('gateCheckinEndpoint', () => {
  const registration = {
    id: 31, fullName: 'Örnek Kişi', email: 'test@example.invalid', phone: '+900000000001',
    ticketToken: '0123456789abcdef', status: 'accepted', attended: false, checkedInAt: null as string | null,
    gateFields: {},
  }

  const call = async (overrides: Record<string, unknown>, gateFields: Record<string, string> = {}) => {
    const record = { ...registration, ...overrides }
    const payload = {
      findByID: vi.fn().mockResolvedValue({ scannerActive: true, gateFieldDefinitions: [definition] }),
      find: vi.fn().mockResolvedValue({ docs: [record] }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...record, ...data })),
      create: vi.fn(),
    }
    const req = {
      user: { id: `gate-${Math.random()}`, roles: ['gate'] }, payload,
      json: vi.fn().mockResolvedValue({ eventId: 1, token: registration.ticketToken, gateFields }),
    }
    const response = await gateCheckinEndpoint.handler(req as never)
    return { response, body: await response.json() as Record<string, any>, payload }
  }

  it('okutulmuş bileti alanlar boşken already_in döndürür ve güncellemez', async () => {
    const checkedInAt = '2026-09-30T12:00:00.000Z'
    const { response, body, payload } = await call({ attended: true, checkedInAt })
    expect(response.status).toBe(409)
    expect(body).toMatchObject({ code: 'already_in', registration: { checkedInAt } })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('kabul edilmemiş bileti alanlar boşken not_accepted döndürür', async () => {
    const { response, body, payload } = await call({ status: 'pending' })
    expect(response.status).toBe(409)
    expect(body.code).toBe('not_accepted')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('başarılı girişte güvenli özeti döndürür', async () => {
    const { response, body, payload } = await call({}, { masa: 'A' })
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ code: 'ok', registration: { fullName: registration.fullName, gateFields: { masa: 'A' } } })
    expect(body.registration.checkedInAt).toEqual(expect.any(String))
    expect(JSON.stringify(body)).not.toContain('@')
    expect(JSON.stringify(body)).not.toContain(registration.phone)
    expect(payload.update).toHaveBeenCalledOnce()
  })
})

describe('kapı: takım adı, giriş saati, eşzamanlı okutma', () => {
  it('{{girisSaati}} okutma anı, {{takim}} verilen takım; {{saat}} etkinlik saati kalır', () => {
    const vars = variablesFor({ fullName: 'Ayşe Test' }, { title: 'Kodlama Maratonu', date: '2026-11-01T07:00:00.000Z' }, { masa: '5' },
      { team: 'Test Takımı', checkedInAt: new Date('2026-11-01T09:42:00.000Z') })
    expect(vars).toMatchObject({ ad: 'Ayşe', saat: '10:00', girisSaati: '12:42', takim: 'Test Takımı', masa: '5' })
    expect(renderGateMessage('Hoş geldin {{ad}}, {{girisSaati}} giriş. {{takim}} takımının masası {{masa}}', vars).text)
      .toBe('Hoş geldin Ayşe, 12:42 giriş. Test Takımı takımının masası 5')
  })

  it('aynı bilet iki telefonda aynı anda okutulursa yalnız biri girer, mesaj bir kez kuyruğa alınır', async () => {
    let claimed = false
    const pool = { query: vi.fn().mockImplementation(async () => { const first = !claimed; claimed = true; return { rowCount: first ? 1 : 0 } }) }
    const record = { id: 31, fullName: 'Örnek Kişi', phone: '+900000000001', ticketToken: '0123456789abcdef', status: 'accepted', attended: false, gateFields: {} }
    const payload = {
      db: { pool },
      findByID: vi.fn().mockImplementation(async ({ collection }) => (collection === 'events'
        ? { id: 1, scannerActive: true, gateFieldDefinitions: [] }
        : { id: 3, message: 'Hoş geldin {{ad}}' })),
      find: vi.fn().mockResolvedValue({ docs: [record] }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...record, ...data })),
      create: vi.fn(),
    }
    const scan = () => gateCheckinEndpoint.handler({
      user: { id: `gate-${Math.random()}`, roles: ['gate'] }, payload,
      json: vi.fn().mockResolvedValue({ eventId: 1, token: record.ticketToken, templateId: 3 }),
    } as never)
    const [a, b] = await Promise.all([scan(), scan()])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledTimes(1)
  })
})
