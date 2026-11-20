import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import {
  fieldIsAdmin, fieldIsAdminOrEditor, fieldIsAdminOrInternal,
  hasInternalKey, isAdmin, isAdminOrEditor, isAdminOrGate,
  isAdminOrInternal, isAdminOrInternalCheckin, readSelfOrAdmin,
} from '../../src/lib/access'
import { EventRegistrations } from '../../src/collections/EventRegistrations'
import { MemberApplications } from '../../src/collections/MemberApplications'
import { CoreTeamApplications } from '../../src/collections/CoreTeamApplications'
import { ContactMessages } from '../../src/collections/ContactMessages'
import { Events } from '../../src/collections/Events'
import { BlogPosts } from '../../src/collections/BlogPosts'
import { Users } from '../../src/collections/Users'
import { WhatsAppTemplates } from '../../src/collections/WhatsAppTemplates'
import { WhatsAppQueue } from '../../src/collections/WhatsAppQueue'
import { EmailTemplates } from '../../src/collections/EmailTemplates'
import { SiteSettings } from '../../src/globals/SiteSettings'

const admin = { id: 1, roles: ['admin'] }
const gate = { id: 2, roles: ['gate'] }
type TestUser = typeof admin | typeof gate

const req = ({ key, bearer, user }: { key?: string; bearer?: string; user?: TestUser } = {}) => {
  const headers = new Headers()
  if (key !== undefined) headers.set('x-internal-api-key', key)
  if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`)
  return { headers, user: user ?? null }
}

type Rule = Access | FieldAccess | undefined
const run = async (rule: Rule, request: ReturnType<typeof req>, data?: unknown) => {
  expect(rule).toBeTypeOf('function')
  return await (rule as (args: unknown) => unknown)({ req: request, data })
}

const findField = (fields: readonly any[], name: string): any | undefined => {
  for (const field of fields) {
    if (field.name === name) return field
    const nested = field.fields ?? field.tabs?.flatMap((tab: any) => tab.fields)
    if (nested) {
      const match = findField(nested, name)
      if (match) return match
    }
  }
  return undefined
}

const originalKey = process.env.INTERNAL_API_KEY
beforeEach(() => { process.env.INTERNAL_API_KEY = 'test-internal-key' })
afterEach(() => {
  if (originalKey === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = originalKey
})

describe('CMS iç anahtar erişimi', () => {
  it('yalnız doğru x-internal-api-key başlığını sabit zamanlı karşılaştırır', () => {
    expect(hasInternalKey(req({ key: 'test-internal-key' }).headers)).toBe(true)
    for (const key of ['wrong', '', 'test-internal-ke', 'test-internal-keyx']) {
      expect(hasInternalKey(req({ key }).headers)).toBe(false)
    }
    expect(hasInternalKey(req({ bearer: 'test-internal-key' }).headers)).toBe(false)
    expect(hasInternalKey({ 'x-internal-api-key': 'test-internal-key' })).toBe(true)
    expect(hasInternalKey({ 'x-internal-api-key': 42 })).toBe(false)
    delete process.env.INTERNAL_API_KEY
    expect(hasInternalKey(req({ key: 'test-internal-key' }).headers)).toBe(false)
    expect(hasInternalKey(undefined)).toBe(false)
  })

  it('iç anahtarı yönetici saymaz; oturum rolleri çalışır', async () => {
    const rules = [isAdmin, isAdminOrEditor, isAdminOrGate, readSelfOrAdmin, fieldIsAdmin, fieldIsAdminOrEditor]
    for (const rule of rules) {
      expect(await run(rule, req({ key: 'test-internal-key' }))).toBe(false)
      expect(await run(rule, req({ user: admin }))).toBe(true)
    }
    expect(await run(isAdminOrGate, req({ user: gate }))).toBe(true)
    expect(await run(readSelfOrAdmin, req({ user: gate }))).toEqual({ id: { equals: 2 } })
  })

  it('sınırlı iç anahtar ve yönetici için ayrık kurallar sağlar', async () => {
    for (const rule of [isAdminOrInternal, fieldIsAdminOrInternal]) {
      expect(await run(rule, req({ key: 'test-internal-key' }))).toBe(true)
      expect(await run(rule, req({ user: admin }))).toBe(true)
      expect(await run(rule, req())).toBe(false)
      expect(await run(rule, req({ key: 'wrong' }))).toBe(false)
    }
  })

  it('iç anahtarla yalnız tam attended güncellemesini kabul eder', async () => {
    const keyReq = req({ key: 'test-internal-key' })
    expect(await run(isAdminOrInternalCheckin, keyReq, { attended: true })).toBe(true)
    for (const data of [undefined, { attended: false }, { attended: true, status: 'accepted' }, { status: 'accepted' }, {}, []]) {
      expect(await run(isAdminOrInternalCheckin, keyReq, data)).toBe(false)
    }
    expect(await run(isAdminOrInternalCheckin, req({ user: admin }), { status: 'accepted' })).toBe(true)
    expect(await run(isAdminOrInternalCheckin, req(), { attended: true })).toBe(false)
  })

  it('koleksiyon ve alan bağlantıları iç anahtarı gereken işlerle sınırlar', async () => {
    const keyReq = req({ key: 'test-internal-key' })
    const anonymous = req()
    for (const collection of [EventRegistrations, MemberApplications, CoreTeamApplications, ContactMessages]) {
      expect(await run(collection.access?.create, keyReq)).toBe(true)
      expect(await run(collection.access?.delete, keyReq)).toBe(false)
    }
    for (const collection of [MemberApplications, CoreTeamApplications, ContactMessages]) {
      expect(await run(collection.access?.read, keyReq)).toBe(false)
      expect(await run(collection.access?.update, keyReq)).toBe(false)
    }
    expect(await run(EventRegistrations.access?.read, keyReq)).toBe(true)
    // Eski site okuyucusunun "attended" istisnası kaldırıldı: kapı girişi yalnız CMS okuyucusundan
    expect(await run(EventRegistrations.access?.update, keyReq, { attended: true })).toBe(false)
    expect(await run(EventRegistrations.access?.update, keyReq, { status: 'accepted' })).toBe(false)

    for (const rule of [
      Events.access?.create, BlogPosts.access?.create, Users.access?.read, Users.access?.create,
      WhatsAppTemplates.access?.read, WhatsAppQueue.access?.read, EmailTemplates.access?.read,
      SiteSettings.access?.update,
    ]) expect(await run(rule, keyReq)).toBe(false)

    for (const name of ['status', 'notes']) {
      const field = findField(EventRegistrations.fields, name)
      expect(field).toBeDefined()
      expect(await run(field.access.update, keyReq)).toBe(false)
    }
    const scannerPin = findField(Events.fields, 'scannerPin')
    expect(scannerPin).toBeDefined()
    expect(await run(scannerPin.access.read, keyReq)).toBe(false)
    expect(await run(scannerPin.access.read, anonymous)).toBe(false)
  })
})

describe('etkinlik kaydı oluşturma: iç anahtar durum/bilet alanlarını belirleyemez', () => {
  it('site isteğinde durum beklemede, bilet sunucuda üretilir, yoklama ve kapı alanları boş', async () => {
    const hook = EventRegistrations.hooks!.beforeChange![0] as (a: unknown) => Promise<Record<string, unknown>>
    const payload = { findByID: async () => ({ mode: 'live' }) }
    const data = await hook({ operation: 'create', req: { payload, user: null, headers: new Headers() },
      data: { event: 1, fullName: 'Test', status: 'accepted', attended: true, ticketToken: 'aaaaaaaaaaaaaaaa', isTest: true, gateFields: { masa: '1' }, checkedInAt: '2026-01-01' } })
    expect(data).toMatchObject({ status: 'pending', attended: false, isTest: false, gateFields: null, checkedInAt: null })
    expect(data.ticketToken).toMatch(/^[a-f0-9]{16}$/)
    expect(data.ticketToken).not.toBe('aaaaaaaaaaaaaaaa')
    const testEvent = await hook({ operation: 'create', req: { payload: { findByID: async () => ({ mode: 'test' }) }, user: null, headers: new Headers() }, data: { event: 1 } })
    expect(testEvent.isTest).toBe(true)
    const admin = await hook({ operation: 'create', req: { payload, user: { roles: ['admin'] }, headers: new Headers() }, data: { event: 1, status: 'accepted' } })
    expect(admin.status).toBe('accepted')
  })
})

describe('CSV dışa aktarım hücresi', () => {
  it('formül gibi başlayan hücre etkisizleşir, telefon olduğu gibi kalır', async () => {
    const { csvText } = await import('../../src/collections/EventRegistrations')
    expect(csvText('=HYPERLINK("x")', true)).toBe(`'=HYPERLINK(""x"")`)
    expect(csvText('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(csvText('-2+3')).toBe(`'-2+3`)
    expect(csvText('+90 533 000 00 00')).toBe('+90 533 000 00 00')
    expect(csvText('Ayşe\nTest')).toBe('Ayşe Test')
  })
})
