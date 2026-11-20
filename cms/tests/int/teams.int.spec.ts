import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  acceptMemberState, acceptOverflow, applicationState, approvalRequestState, canEditTeam, canScore, captainTransferState, disbandState, transferNameMatches, criteriaOf, hasActiveMembership, isNameLocked, isPubliclyVisible,
  isRosterLocked, isSeekingMembers, joinRequestState, leaveState, memberLimits, pendingToCloseWhenFull, removeMemberState, submissionState,
  suggestRanking, teamRegistrationState, validateScores, visibleResults, weightedTotal,
  type EventLite, type MembershipLite, type TeamLite,
} from '../../src/lib/teams/rules'
import { looksLikePhone, validateContact } from '../../src/lib/teams/contact'
import { CODE_MAX_ATTEMPTS, checkCode, generateCode, hashCode } from '../../src/lib/teams/codes'
import { cleanName, cleanText, cleanUrl, normalizeEmail, randomInviteCode, teamSlug, validPassword } from '../../src/lib/teams/validate'
import { participantMailAllowed } from '../../src/lib/teams/mail'
import { validateTeamDesign } from '../../src/lib/teams/design'
import { publicMediaUrl, publicSiteMediaUrl } from '../../src/endpoints/teams'
import { KULUP } from '../../src/lib/kulup'
import { Participants } from '../../src/collections/Participants'
import { Teams } from '../../src/collections/Teams'
import { Events } from '../../src/collections/Events'
import { TeamMemberships } from '../../src/collections/TeamMemberships'
import { registrationTarget, syncMemberRegistration, syncTeamRegistrations } from '../../src/lib/teams/registrations'

beforeAll(() => { process.env.PAYLOAD_SECRET ||= 'test-secret-takim' })

const event: EventLite = {
  id: 10, teamMode: true, status: 'active', mode: 'live',
  teamSettings: { minMembers: 2, maxMembers: 4, registrationOpen: true, submissionOpen: true },
  judges: [{ id: 7 }, 8],
  judgingCriteria: [{ id: 'a', name: 'Yenilik', weight: 2, max: 10 }, { id: 'b', name: 'Sunum', weight: 1, max: 5 }],
}
// Teslim ve jüri yalnız kabul edilen (accepted) takımlar için
const team: TeamLite = { id: 1, status: 'accepted', captain: 3, event: 10 }
const members: MembershipLite[] = [
  { participant: 3, role: 'captain', status: 'accepted' },
  { participant: 4, role: 'member', status: 'accepted' },
  { participant: 8, role: 'member', status: 'pending' },
]

const CDN = KULUP.adresler.cdn.replace(/\/+$/, '')

describe('takım yetkileri', () => {
  it('kaptan olmayan takımı düzenleyemez', () => {
    expect(canEditTeam(team, 3)).toBe(true)
    expect(canEditTeam(team, '3')).toBe(true)
    expect(canEditTeam(team, 4)).toBe(false)
    expect(canEditTeam(team, undefined)).toBe(false)
    expect(canEditTeam({ ...team, captain: { id: 3 } as never }, 3)).toBe(true)
  })

  it('onaysız takım herkese açık görünmez', () => {
    expect(isPubliclyVisible({ status: 'approved' })).toBe(true)
    expect(isPubliclyVisible({ status: 'accepted' })).toBe(true)
    for (const status of ['draft', 'pending', 'rejected', undefined, null]) expect(isPubliclyVisible({ status })).toBe(false)
  })

  it('jüri kendi takımına (üye ya da bekleyen başvuru) puan veremez', () => {
    expect(canScore(event, team, 7, members)).toEqual({ ok: true })
    expect(canScore(event, team, 8, members).ok).toBe(false) // bekleyen başvurusu var
    expect(canScore(event, { ...team, captain: 7 }, 7, members).ok).toBe(false)
    expect(canScore(event, team, 4, members).ok).toBe(false) // jüri değil
    expect(canScore(event, { ...team, status: 'pending' }, 7, members).ok).toBe(false)
    expect(canScore(event, { ...team, event: 99 }, 7, members).ok).toBe(false)
  })

  it('aynı etkinlikte ikinci etkin üyelik yok', () => {
    expect(hasActiveMembership(members, 8)).toBe(true)
    expect(hasActiveMembership([{ participant: 5, role: 'member', status: 'rejected' }], 5)).toBe(false)
  })

  it('üye sınırları güvenli varsayılanlarla', () => {
    expect(memberLimits(event)).toEqual({ min: 2, max: 4 })
    expect(memberLimits({ id: 1, teamSettings: { minMembers: 6, maxMembers: 3 } })).toEqual({ min: 6, max: 6 })
    expect(memberLimits({ id: 1, teamSettings: { minMembers: -1, maxMembers: 999 } })).toEqual({ min: 2, max: 5 })
  })

  it('başvuru ve teslim pencereleri', () => {
    expect(teamRegistrationState({ ...event, teamMode: false }).ok).toBe(false)
    expect(teamRegistrationState({ ...event, status: 'completed' }).ok).toBe(false)
    expect(teamRegistrationState({ ...event, teamSettings: { registrationDeadline: '2000-01-01T00:00:00Z' } }).ok).toBe(false)
    expect(teamRegistrationState(event).ok).toBe(true)
    expect(submissionState(event, team).ok).toBe(true)
    expect(submissionState(event, { ...team, status: 'pending' }).ok).toBe(false)
    expect(submissionState({ ...event, teamSettings: { submissionOpen: true, submissionDeadline: '2000-01-01T00:00:00Z' } }, team).ok).toBe(false)
  })
})

describe('puanlama', () => {
  const criteria = criteriaOf(event)
  it('eksik, aralık dışı ve sayı olmayan puanlar reddedilir; kriter dışı anahtar atılır', () => {
    expect(validateScores({ a: 8, b: 4 }, criteria)).toEqual({ ok: true, scores: { a: 8, b: 4 } })
    expect(validateScores({ a: 8 }, criteria).ok).toBe(false)
    expect(validateScores({ a: 11, b: 4 }, criteria).ok).toBe(false)
    expect(validateScores({ a: 8, b: 6 }, criteria).ok).toBe(false)
    expect(validateScores({ a: -1, b: 4 }, criteria).ok).toBe(false)
    expect(validateScores({ a: '8', b: 4 }, criteria).ok).toBe(false)
    expect(validateScores({ a: Number.NaN, b: 4 }, criteria).ok).toBe(false)
    expect(validateScores({ a: 8, b: 4, x: 1 }, criteria)).toEqual({ ok: true, scores: { a: 8, b: 4 } })
    expect(validateScores([8, 4], criteria).ok).toBe(false)
  })
  it('ağırlıklı toplam 0-100 (jüri paneliyle aynı formül)', () => {
    expect(weightedTotal({ a: 10, b: 5 }, criteria)).toBe(100)
    expect(weightedTotal({ a: 5, b: 5 }, criteria)).toBeCloseTo(((2 * 0.5 + 1) / 3) * 100, 2)
  })
  it('sunucu tasarım doğrulaması sitedeki editörün birebir kopyası', () => {
    const site = readFileSync(resolve(__dirname, '../../../site/src/lib/teams/design.ts'), 'utf8')
    const cms = readFileSync(resolve(__dirname, '../../src/lib/teams/teamDesign.ts'), 'utf8')
    expect(cms.split('\n').slice(2).join('\n')).toBe(site)
  })
  it('tasarımda yalnız takımın kendi görselleri kalır; yabancı köken atılır', () => {
    const owned = new Set([`${CDN}/takim/team-a.webp`, '/api/team-media/file/team-b.webp'])
    const design = validateTeamDesign({
      logoUrl: `${CDN}/takim/team-baska.webp`, coverUrl: '/api/team-media/file/team-b.webp',
      gifs: [{ url: `${CDN}/takim/team-a.webp` }, { url: 'https://evil.example/x.gif' }, { url: '/api/team-media/file/team-c.webp' }],
      stickers: [{ sticker: 'kalp', x: 500, y: -3, size: 999 }, { sticker: '<script>' }], colors: { background: 'red', accent: '#ABCDEF' },
      evil: '<img onerror=alert(1)>', manifesto: '<script>alert(1)</script>**merhaba** [x](javascript:alert(1))',
    }, owned)
    expect(design.logoUrl).toBeNull()
    expect(design.coverUrl).toBe('/api/team-media/file/team-b.webp')
    expect(design.gifs.map((g) => g.url)).toEqual([`${CDN}/takim/team-a.webp`])
    expect(design.stickers).toHaveLength(1)
    expect(design.stickers[0]).toMatchObject({ x: 100, y: 0, size: 40 })
    expect(design.colors.background).toMatch(/^#[0-9a-f]{6}$/i)
    expect(JSON.stringify(design)).not.toMatch(/script|onerror|javascript/i)
  })
  it('CMS dosya ucu adresi site-içi yola çevrilir', () => {
    expect(publicMediaUrl('http://localhost:3001/api/team-media/file/team-ab12.webp')).toBe('/api/team-media/file/team-ab12.webp')
    expect(publicMediaUrl(`${CDN}/takim/team-ab12.webp`)).toBe(`${CDN}/takim/team-ab12.webp`)
    expect(publicMediaUrl(null)).toBeNull()
  })
  it('sunucu puan modülü sitedeki jüri modülünün birebir kopyası', () => {
    const site = readFileSync(resolve(__dirname, '../../../site/src/lib/jury/score.ts'), 'utf8')
    const cms = readFileSync(resolve(__dirname, '../../src/lib/teams/score.ts'), 'utf8')
    expect(cms.split('\n').slice(2).join('\n')).toBe(site)
  })
  it('öneri sıralaması ortalama ile, eşitlik aynı sıra', () => {
    const ranking = suggestRanking([{ team: '1', total: 8 }, { team: '1', total: 6 }, { team: '2', total: 7 }, { team: '3', total: 9 }])
    expect(ranking.map((r) => [r.team, r.rank])).toEqual([['3', 1], ['1', 2], ['2', 2]])
  })
  it('gösterim seçenekleri', () => {
    const rows = [{ rank: 3 }, { rank: 1 }, { rank: 2 }, { rank: 4 }]
    expect(visibleResults(rows, 'first')).toEqual([{ rank: 1 }])
    expect(visibleResults(rows, 'top3').map((r) => r.rank)).toEqual([1, 2, 3])
    expect(visibleResults(rows, 'full')).toHaveLength(4)
  })
})

describe('doğrulama kodu', () => {
  const email = 'test+etiket@example.invalid'
  const fresh = (code: string, attempts = 0) => ({ hash: hashCode('verify', email, code), expires: new Date(Date.now() + 60_000), attempts })

  it('6 haneli kod üretilir ve doğru kod kabul edilir', () => {
    const code = generateCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(checkCode(fresh(code), 'verify', email, code)).toEqual({ ok: true })
  })
  it('amaç ve e-posta özete dahil (sıfırlama kodu doğrulamada geçmez)', () => {
    const stored = { ...fresh('123456'), hash: hashCode('reset', email, '123456') }
    expect(checkCode(stored, 'verify', email, '123456').ok).toBe(false)
    expect(checkCode(fresh('123456'), 'verify', 'baska@gmail.com', '123456').ok).toBe(false)
  })
  it('hatalı denemeler sayılır; sınırdan sonra doğru kod da reddedilir', () => {
    let attempts = 0
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
      const result = checkCode(fresh('111111', attempts), 'verify', email, '222222')
      expect(result).toMatchObject({ ok: false, reason: 'wrong', attempts: attempts + 1 })
      attempts = (result as { attempts: number }).attempts
    }
    expect(checkCode(fresh('111111', attempts), 'verify', email, '111111')).toMatchObject({ ok: false, reason: 'too_many' })
  })
  it('süresi dolan ve biçimsiz kod reddedilir', () => {
    expect(checkCode({ ...fresh('123456'), expires: new Date(Date.now() - 1) }, 'verify', email, '123456')).toMatchObject({ reason: 'expired' })
    expect(checkCode(fresh('123456'), 'verify', email, '12345a')).toMatchObject({ reason: 'wrong' })
    expect(checkCode(fresh('123456'), 'verify', email, 123456 as never)).toMatchObject({ reason: 'wrong' })
    expect(checkCode({}, 'verify', email, '123456')).toMatchObject({ reason: 'missing' })
  })
})

describe('girdi doğrulama', () => {
  it('URL yalnız http/https', () => {
    expect(cleanUrl('https://github.com/byt/proje')).toBe('https://github.com/byt/proje')
    expect(cleanUrl('')).toBe('')
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'https://user:pw@evil.com', 'ftp://x.com', 'http://localhost', 'x'.repeat(301)]) {
      expect(cleanUrl(bad)).toBeNull()
    }
  })
  it('isim, metin, e-posta, parola', () => {
    expect(cleanName('  Kod   Kurtları ')).toBe('Kod Kurtları')
    expect(cleanName('a')).toBeNull()
    expect(cleanText('a‮b', 10)).toBe('ab')
    expect(cleanText('x'.repeat(11), 10)).toBeNull()
    expect(normalizeEmail(' Efe@Gmail.COM ')).toBe('efe@gmail.com')
    expect(normalizeEmail('a@b')).toBeNull()
    expect(validPassword('kisa1')).toBe(false)
    expect(validPassword('sadeceharf')).toBe(false)
    expect(validPassword('guclu123')).toBe(true)
  })
  it('davet kodu ve slug', () => {
    expect(randomInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(teamSlug('Çılgın Şövalyeler!')).toMatch(/^cilgin-sovalyeler-[0-9a-f]{6}$/)
  })
})

describe('mail kilidi (geliştirmede yalnız izin listesi)', () => {
  it('geliştirmede yalnız izin listesi (+etiketler dahil)', () => {
    const env = { NODE_ENV: 'development', PARTICIPANT_MAIL_ALLOWLIST: 'test@example.invalid' }
    expect(participantMailAllowed('test@example.invalid', env)).toBe(true)
    expect(participantMailAllowed('Test+kaptan@example.invalid', env)).toBe(true)
    expect(participantMailAllowed('gercek.kisi@gmail.com', env)).toBe(false)
    expect(participantMailAllowed('test@example.invalid.evil.com', env)).toBe(false)
  })
  it('canlıda izin listesi tanımlıysa uygulanır, yoksa herkese', () => {
    expect(participantMailAllowed('kisi@x.com', { NODE_ENV: 'production' })).toBe(true)
    expect(participantMailAllowed('kisi@x.com', { NODE_ENV: 'production', PARTICIPANT_MAIL_ALLOWLIST: 'a@b.com' })).toBe(false)
  })
})

describe('koleksiyon yapılandırması', () => {
  const req = (user: unknown) => ({ req: { user, headers: new Headers() } }) as never
  it('katılımcı panele giremez, REST erişimi yalnız yönetici', async () => {
    expect(await (Participants.access!.admin as (a: unknown) => unknown)(req({ id: 1, collection: 'participants' }))).toBe(false)
    for (const op of ['read', 'create', 'update', 'delete'] as const) {
      expect(await (Participants.access![op] as (a: unknown) => unknown)(req({ id: 1, collection: 'participants' }))).toBe(false)
      expect(await (Teams.access![op] as (a: unknown) => unknown)(req({ id: 1, collection: 'participants' }))).toBe(false)
      expect(await (Teams.access![op] as (a: unknown) => unknown)(req({ id: 1, roles: ['admin'] }))).toBe(true)
    }
  })
  it('kod özetleri API çıktısında gizli', () => {
    const hidden = Participants.fields.filter((f) => 'hidden' in f && f.hidden).map((f) => ('name' in f ? f.name : ''))
    expect(hidden).toEqual(expect.arrayContaining(['verifyCodeHash', 'verifyCodeExpires', 'verifyAttempts', 'resetCodeHash', 'resetCodeExpires', 'resetAttempts']))
  })
  it('doğrulanmamış hesap giriş yapamaz', () => {
    const hook = Participants.hooks!.beforeLogin![0] as (a: unknown) => unknown
    expect(() => hook({ user: { emailVerified: false } })).toThrow()
    expect(hook({ user: { emailVerified: true } })).toBeTruthy()
  })
  it('takım modu varsayılan kapalı; jüri ve ham sonuçlar herkese açık okunmaz', async () => {
    const flat = (fields: any[]): any[] => fields.flatMap((f) => [f, ...(f.fields ? flat(f.fields) : [])])
    const all = flat(Events.fields as any[])
    expect(all.find((f) => f.name === 'teamMode')?.defaultValue).toBe(false)
    for (const name of ['judges', 'results']) {
      const read = all.find((f) => f.name === name)?.access?.read
      expect(await read({ req: { user: null, headers: new Headers() } })).toBe(false)
      expect(await read({ req: { user: { id: 1, collection: 'participants' }, headers: new Headers() } })).toBe(false)
    }
  })
})

describe('takım modu 2: başvuru sırası, erken onay, iletişim', () => {
  it('takım işlemleri için etkinlik başvurusu (hesap e-postasıyla) şart; reddedilen başvuru geçmez', () => {
    expect(applicationState([], 'a@b.co')).toBe('none')
    expect(applicationState([{ email: ' A@B.co ', status: 'pending' }], 'a@b.co')).toBe('applied')
    expect(applicationState([{ email: 'x@b.co', status: 'accepted' }], 'a@b.co')).toBe('none')
    expect(applicationState([{ email: 'a@b.co', status: 'rejected' }], 'a@b.co')).toBe('rejected')
    expect(applicationState([{ email: 'a@b.co', status: 'rejected' }, { email: 'a@b.co', status: 'waitlist' }], 'a@b.co')).toBe('applied')
  })

  it('erken onay: takım dolmadan onaya gönderilir; onaylı ve dolmamış takım "üye arıyor"', () => {
    expect(approvalRequestState({ status: 'draft' }, 1, 5).ok).toBe(true)
    expect(approvalRequestState({ status: 'rejected' }, 3, 5).ok).toBe(true)
    expect(approvalRequestState({ status: 'draft' }, 6, 5).ok).toBe(false)
    expect(approvalRequestState({ status: 'pending' }, 2, 5).ok).toBe(false)
    expect(isSeekingMembers({ status: 'approved' }, 3, 5)).toBe(true)
    expect(isSeekingMembers({ status: 'approved' }, 5, 5)).toBe(false)
    for (const status of ['draft', 'pending', 'rejected']) expect(isSeekingMembers({ status }, 1, 5)).toBe(false)
  })

  it('onaylı takım dolana kadar üye kabul eder; dolu ya da reddedilen takım etmez', () => {
    for (const status of ['draft', 'pending', 'approved']) expect(acceptMemberState({ status }, 2, 5).ok).toBe(true)
    expect(acceptMemberState({ status: 'approved' }, 5, 5).ok).toBe(false)
    expect(acceptMemberState({ status: 'rejected' }, 1, 5).ok).toBe(false)
  })

  it('proje teslimi için alt sınır (erken onaylanmış eksik takım teslim edemez)', () => {
    expect(submissionState(event, team, new Date(), 1).ok).toBe(false)
    expect(submissionState(event, team, new Date(), 2).ok).toBe(true)
    expect(submissionState(event, team).ok).toBe(true)
  })

  it('telefon numarası benzeri değerler reddedilir', () => {
    for (const value of ['05321234567', '0532 123 45 67', '+90 532 123 4567', '0090 532', '+90532', '532-123-45-67', '0 (532) 123',
      '١٢٣٤٥٦٧٨', '５３２１２３４５６７', 'tel 0532 12', '1234ab', '05xx 0532']) {
      expect(looksLikePhone(value), value).toBe(true)
    }
    for (const value of ['@kulubum', 'ali_veli', 'takim.2026', 'ahmet@gmail.com', 'deniz.k']) expect(looksLikePhone(value), value).toBe(false)
  })

  it('iletişim doğrulaması: tür beyaz listede, e-posta biçimi, kullanıcı adı kuralları, telefon yok', () => {
    expect(validateContact({ type: 'telegram', value: '@kulup_takim' })).toEqual({ ok: true, contact: { type: 'telegram', value: '@kulup_takim' } })
    expect(validateContact({ type: 'telegram', value: 'https://t.me/kulup_takim' })).toEqual({ ok: true, contact: { type: 'telegram', value: '@kulup_takim' } })
    expect(validateContact({ type: 'instagram', value: 'instagram.com/kulup.ornek/' })).toEqual({ ok: true, contact: { type: 'instagram', value: '@kulup.ornek' } })
    expect(validateContact({ type: 'email', value: ' Takim@Gmail.com ' })).toEqual({ ok: true, contact: { type: 'email', value: 'takim@gmail.com' } })
    expect(validateContact({ type: 'whatsapp', value: 'kulup.takim' })).toEqual({ ok: true, contact: { type: 'whatsapp', value: '@kulup.takim' } })
    expect(validateContact({ type: 'email', value: 'gecersiz' }).ok).toBe(false)
    expect(validateContact({ type: 'whatsapp', value: '+90 532 123 45 67' }).ok).toBe(false)
    expect(validateContact({ type: 'whatsapp', value: '05321234567' }).ok).toBe(false)
    expect(validateContact({ type: 'email', value: '05321234567@gmail.com' }).ok).toBe(false)
    expect(validateContact({ type: 'telegram', value: '<script>' }).ok).toBe(false)
    expect(validateContact({ type: 'telefon', value: 'abc' }).ok).toBe(false)
    expect(validateContact(null)).toEqual({ ok: true, contact: null })
    expect(validateContact({ type: 'telegram', value: '  ' })).toEqual({ ok: true, contact: null })
    expect(validateContact('x').ok).toBe(false)
  })

  it('iletişim modülü sitedekinin birebir kopyası', () => {
    const site = readFileSync(resolve(__dirname, '../../../site/src/lib/teams/contact.ts'), 'utf8')
    const cms = readFileSync(resolve(__dirname, '../../src/lib/teams/contact.ts'), 'utf8')
    expect(cms).toBe(site)
  })

  it('ödül görseli: media yükleme alanı; CMS dosya ucu site-içi yola çevrilir', () => {
    const flat = (fields: any[]): any[] => fields.flatMap((f) => [f, ...(f.fields ? flat(f.fields) : [])])
    const prizes = flat(Events.fields as any[]).find((f) => f.name === 'prizes')
    const image = flat(prizes.fields).find((f: any) => f.name === 'image')
    expect(image).toMatchObject({ type: 'upload', relationTo: 'media' })
    expect(publicSiteMediaUrl('http://127.0.0.1:3001/api/media/file/odul.png')).toBe('/api/media/file/odul.png')
    expect(publicSiteMediaUrl(`${CDN}/media/odul.png`)).toBe(`${CDN}/media/odul.png`)
  })

  it('takım iletişim alanı panelden de telefonla kaydedilemez', () => {
    const hook = Teams.hooks!.beforeChange![0] as (a: unknown) => any
    expect(() => hook({ data: { contact: { type: 'whatsapp', value: '0532 123 45 67' } }, originalDoc: {} })).toThrow()
    expect(hook({ data: { contact: { type: 'telegram', value: 'kulup_takim' } }, originalDoc: {} }).contact).toEqual({ type: 'telegram', value: '@kulup_takim' })
    // Değer gönderilmeyen kısmi güncelleme alanı değiştirmez
    expect(hook({ data: { status: 'approved' }, originalDoc: { status: 'pending' } }).contact).toBeUndefined()
  })
})

describe('takım kabul: başvuran/kabul edilen, dolu takım, ayrılma/çıkarma', () => {
  const max = 3
  const roster = (statuses: Array<MembershipLite['status']>): Array<MembershipLite & { id: number }> =>
    statuses.map((status, i) => ({ id: i + 1, participant: 100 + i, role: i === 0 ? 'captain' : 'member', status }))

  it('onaylı = başvuran, kabul edilen ayrı; reddedilen gizli', () => {
    expect(isPubliclyVisible({ status: 'approved' })).toBe(true)
    expect(isPubliclyVisible({ status: 'accepted' })).toBe(true)
    expect(isPubliclyVisible({ status: 'rejected' })).toBe(false)
    expect(isNameLocked({ status: 'accepted' })).toBe(true)
    expect(isNameLocked({ status: 'rejected' })).toBe(false)
  })

  it('teslim ve jüri yalnız kabul edilen takım için; onaylı (başvuran) takım teslim edemez, puanlanmaz', () => {
    const applied: TeamLite = { ...team, status: 'approved' }
    expect(submissionState(event, applied, new Date(), 3).ok).toBe(false)
    expect(submissionState(event, team, new Date(), 3).ok).toBe(true)
    expect(canScore(event, applied, 7, members).ok).toBe(false)
    expect(canScore(event, team, 7, members).ok).toBe(true)
  })

  it('dolu takım katılma isteklerine kapalı, "üye arıyor" kalkar; biri çıkınca yeniden açılır', () => {
    expect(joinRequestState({ status: 'approved' }, 3, max)).toEqual({ ok: false, reason: 'Takım dolu; katılma isteklerine kapalı.' })
    expect(isSeekingMembers({ status: 'approved' }, 3, max)).toBe(false)
    expect(joinRequestState({ status: 'approved' }, 2, max).ok).toBe(true)
    expect(isSeekingMembers({ status: 'approved' }, 2, max)).toBe(true)
    expect(isSeekingMembers({ status: 'accepted' }, 2, max)).toBe(false) // kabul edilince kadro kilitli
    expect(joinRequestState({ status: 'draft' }, 1, max).ok).toBe(true) // davet koduyla onay öncesi
    expect(joinRequestState({ status: 'rejected' }, 1, max).ok).toBe(false)
  })

  it('takım dolunca bekleyen istekler kapatılır; dolmadıysa dokunulmaz', () => {
    expect(pendingToCloseWhenFull(roster(['accepted', 'accepted', 'accepted', 'pending', 'pending']), max).map((m) => m.id)).toEqual([4, 5])
    expect(pendingToCloseWhenFull(roster(['accepted', 'accepted', 'pending']), max)).toEqual([])
  })

  it('üye onaylı takımdan ayrılabilir, kabul edilmişten ayrılamaz; kaptan ayrılamaz', () => {
    expect(leaveState({ status: 'accepted', captain: 100 }, { participant: 101, role: 'member', status: 'accepted' }, 101).ok).toBe(false)
    for (const status of ['draft', 'pending', 'approved', 'rejected'] as const) {
      expect(leaveState({ status, captain: 100 }, { participant: 101, role: 'member', status: 'accepted' }, 101).ok).toBe(true)
    }
    const captain = leaveState({ status: 'accepted', captain: 100 }, { participant: 100, role: 'captain', status: 'accepted' }, 100)
    expect(captain.ok).toBe(false)
    expect(captain.ok === false && captain.reason).toMatch(/Kaptan/)
    expect(leaveState({ status: 'accepted', captain: 100 }, { participant: 101, role: 'member', status: 'pending' }, 101).ok).toBe(true)
  })

  it('aynı anda iki kabul sınırı aşarsa yalnız en son kabul edilen fazla sayılır; kaptan hep kalır', () => {
    const m = (id: number, role: 'captain' | 'member', status: MembershipLite['status'], decidedAt: string | null) =>
      ({ id, participant: 100 + id, role, status, decidedAt, createdAt: '2026-10-18T10:00:00.000Z' })
    const roster = [m(1, 'captain', 'accepted', null), m(2, 'member', 'accepted', '2026-10-18T11:00:00.000Z'),
      m(3, 'member', 'accepted', '2026-10-18T11:05:00.000Z'), m(4, 'member', 'accepted', '2026-10-18T11:10:00.500Z'),
      m(5, 'member', 'accepted', '2026-10-18T11:10:00.100Z'), m(6, 'member', 'pending', null)]
    expect(acceptOverflow(roster, 4).map((x) => x.id)).toEqual([4])
    expect(acceptOverflow(roster.filter((x) => x.id !== 4), 4)).toEqual([])
    // Aynı an: kayıt numarası büyük olan fazla
    const tie = roster.map((x) => (x.id === 4 ? { ...x, decidedAt: '2026-10-18T11:10:00.100Z' } : x))
    expect(acceptOverflow(tie, 4).map((x) => x.id)).toEqual([5])
  })

  it('kaptan yalnız kendisi kalmışken ve kadro kilitli değilken takımı dağıtabilir', () => {
    const solo: MembershipLite[] = [{ participant: 100, role: 'captain', status: 'accepted' }, { participant: 102, role: 'member', status: 'pending' }]
    for (const status of ['draft', 'pending', 'approved', 'rejected'] as const) expect(disbandState({ status, captain: 100 }, solo, 100).ok).toBe(true)
    expect(disbandState({ status: 'accepted', captain: 100 }, solo, 100).ok).toBe(false)
    expect(disbandState({ status: 'approved', captain: 100, submission: { submittedAt: '2026-10-18' } }, solo, 100).ok).toBe(false)
    expect(disbandState({ status: 'approved', captain: 100 }, solo, 102).ok).toBe(false)
    const withMember = [...solo, { participant: 101, role: 'member', status: 'accepted' } as MembershipLite]
    const blocked = disbandState({ status: 'approved', captain: 100 }, withMember, 100)
    expect(blocked.ok === false && blocked.reason).toMatch(/başka üyeler/)
  })

  it('kaptan onaylı takımdan üye çıkarabilir, kabul edilmişten çıkaramaz; kaptan ve bekleyen istek çıkarılamaz', () => {
    expect(removeMemberState({ status: 'accepted' }, { participant: 101, role: 'member', status: 'accepted' }).ok).toBe(false)
    expect(removeMemberState({ status: 'approved' }, { participant: 101, role: 'member', status: 'accepted' }).ok).toBe(true)
    expect(removeMemberState({ status: 'accepted' }, { participant: 100, role: 'captain', status: 'accepted' }).ok).toBe(false)
    expect(removeMemberState({ status: 'accepted' }, { participant: 101, role: 'member', status: 'pending' }).ok).toBe(false)
  })

  it('kabul ya da teslimden sonra kadro kilitli: ayrılma, çıkarma, yeni üye ve "üye arıyor" yok', () => {
    const locked = { status: 'approved', captain: 100, submission: { submittedAt: '2026-10-16T10:00:00Z' } }
    expect(isRosterLocked(locked)).toBe(true)
    expect(isRosterLocked({ status: 'accepted', submission: { submittedAt: null } })).toBe(true)
    expect(isRosterLocked({ status: 'approved', submission: { submittedAt: null } })).toBe(false)
    expect(acceptMemberState({ status: 'accepted' }, 2, max).ok).toBe(false)
    expect(joinRequestState({ status: 'accepted' }, 2, max).ok).toBe(false)
    expect(leaveState(locked, { participant: 101, role: 'member', status: 'accepted' }, 101).ok).toBe(false)
    expect(removeMemberState(locked, { participant: 101, role: 'member', status: 'accepted' }).ok).toBe(false)
    expect(acceptMemberState(locked, 2, max).ok).toBe(false)
    expect(joinRequestState(locked, 2, max).ok).toBe(false)
    expect(isSeekingMembers(locked, 2, max)).toBe(false)
  })

  it('ayrılan/çıkarılan kişi yeniden katılabilir (eski kayıt etkin üyelik sayılmaz)', () => {
    for (const status of ['left', 'removed', 'rejected'] as const) {
      expect(hasActiveMembership([{ participant: 5, role: 'member', status }], 5)).toBe(false)
    }
  })

  it('panel: "Kabul edildi" durumu var; görünür olunca approvedAt, yeni retle ret maili işareti sıfırlanır', () => {
    const status = (Teams.fields as any[]).flatMap((f) => f.fields ?? [f]).find((f: any) => f.name === 'status')
    expect(status.options.map((o: any) => o.value)).toEqual(['draft', 'pending', 'approved', 'accepted', 'rejected'])
    expect(status.options.find((o: any) => o.value === 'accepted').label).toMatch(/Kabul edildi/)
    const hook = Teams.hooks!.beforeChange![0] as (a: unknown) => any
    expect(hook({ data: { status: 'accepted' }, originalDoc: { status: 'pending' } }).approvedAt).toBeTruthy()
    expect(hook({ data: { status: 'accepted' }, originalDoc: { status: 'approved' } }).approvedAt).toBeUndefined()
    expect(hook({ data: { status: 'rejected' }, originalDoc: { status: 'accepted' } }).rejectionMailSentAt).toBeNull()
    expect(hook({ data: { rejectionMailSentAt: 'x' }, originalDoc: { status: 'rejected' } }).rejectionMailSentAt).toBe('x')
  })
})

describe('kaptanlık devri', () => {
  const ms: MembershipLite[] = [
    { participant: 1, role: 'captain', status: 'accepted' },
    { participant: 2, role: 'member', status: 'accepted' },
    { participant: 3, role: 'member', status: 'pending' },
    { participant: 4, role: 'member', status: 'removed' },
  ]
  it('yalnız kabul edilmiş üyeye devredilir', () => {
    expect(captainTransferState(ms, 1, 2).ok).toBe(true)
    expect(captainTransferState(ms, 1, 3).ok).toBe(false) // başvurusu bekleyen
    expect(captainTransferState(ms, 1, 4).ok).toBe(false) // çıkarılmış
    expect(captainTransferState(ms, 1, 99).ok).toBe(false) // takımda yok
    expect(captainTransferState(ms, 1, '1').ok).toBe(false) // zaten kaptan
  })
  it('onay için takım adı aynen yazılmalı (harf büyüklüğü/boşluk önemsiz)', () => {
    expect(transferNameMatches('  kilim kod ', 'Kilim Kod')).toBe(true)
    expect(transferNameMatches('İNCİ', 'inci')).toBe(true)
    expect(transferNameMatches('Kilim', 'Kilim Kod')).toBe(false)
    expect(transferNameMatches('', '')).toBe(false)
    expect(transferNameMatches(undefined, 'Kilim Kod')).toBe(false)
  })
})

describe('takım kabulü → üyelerin biletleri', () => {
  type Row = Record<string, unknown> & { id: number }
  const fakeReq = (db: Record<string, Row[]>) => {
    const updates: Array<{ collection: string; id: unknown; data: Record<string, unknown> }> = []
    const match = (row: Row, where: Record<string, { equals?: unknown; in?: unknown[] }>) =>
      Object.entries(where).every(([k, c]) => (c.in ? c.in.map(String).includes(String(row[k])) : String(row[k]) === String(c.equals)))
    const payload = {
      find: async ({ collection, where }: { collection: string; where: Record<string, { equals?: unknown; in?: unknown[] }> }) =>
        ({ docs: (db[collection] ?? []).filter((r) => match(r, where)) }),
      findByID: async ({ collection, id }: { collection: string; id: unknown }) => (db[collection] ?? []).find((r) => String(r.id) === String(id)) ?? null,
      update: async ({ collection, id, where, data }: { collection: string; id?: unknown; where?: Record<string, { equals?: unknown }>; data: Record<string, unknown> }) => {
        const rows = (db[collection] ?? []).filter((r) => (where ? match(r, where) : String(r.id) === String(id)))
        for (const row of rows) { updates.push({ collection, id: row.id, data }); Object.assign(row, data) }
      },
    }
    return { req: { payload, context: {} } as never, updates }
  }
  const db = () => ({
    participants: [{ id: 1, email: 'Ayse@x.com' }, { id: 2, email: 'mehmet@x.com' }, { id: 3, email: 'bekleyen@x.com' }],
    'team-memberships': [
      { id: 11, team: 5, event: 10, participant: 1, status: 'accepted' },
      { id: 12, team: 5, event: 10, participant: 2, status: 'accepted' },
      { id: 13, team: 5, event: 10, participant: 3, status: 'pending' },
    ],
    'event-registrations': [
      { id: 21, event: 10, email: ' ayse@x.com', status: 'pending', attended: false },
      { id: 22, event: 10, email: 'mehmet@x.com', status: 'rejected', attended: false },
      { id: 23, event: 10, email: 'bekleyen@x.com', status: 'pending', attended: false },
      { id: 24, event: 99, email: 'ayse@x.com', status: 'pending', attended: false },
    ],
    teams: [{ id: 5, event: 10, status: 'accepted' }],
  })

  it('kabul / geri alma kuralı', () => {
    expect(registrationTarget({ id: 1, status: 'pending' }, true)).toBe('accepted')
    expect(registrationTarget({ id: 1, status: 'rejected' }, true)).toBeNull()
    expect(registrationTarget({ id: 1, status: 'waitlist' }, true)).toBeNull()
    expect(registrationTarget({ id: 1, status: 'accepted' }, false)).toBe('pending')
    expect(registrationTarget({ id: 1, status: 'accepted', attended: true }, false)).toBeNull()
  })

  it('takım kabul edilince yalnız kabul edilmiş üyelerin bekleyen kaydı (aynı etkinlikte) kabul olur', async () => {
    const data = db()
    const { req, updates } = fakeReq(data)
    await syncTeamRegistrations({ doc: { id: 5, event: 10, status: 'accepted' }, previousDoc: { status: 'approved' }, operation: 'update', req } as never)
    expect(updates).toEqual([
      { collection: 'event-registrations', id: 21, data: { status: 'accepted' } },
      { collection: 'team-memberships', id: 13, data: { status: 'rejected' } }, // bekleyen katılma isteği kapanır
    ])
  })

  it('takım kabulden çıkınca kabul edilmiş kayıt beklemeye döner; durum değişmezse dokunulmaz', async () => {
    const data = db()
    data['event-registrations'][0].status = 'accepted'
    const { req, updates } = fakeReq(data)
    await syncTeamRegistrations({ doc: { id: 5, event: 10, status: 'accepted', name: 'x' }, previousDoc: { status: 'accepted' }, operation: 'update', req } as never)
    expect(updates).toEqual([])
    await syncTeamRegistrations({ doc: { id: 5, event: 10, status: 'rejected' }, previousDoc: { status: 'accepted' }, operation: 'update', req } as never)
    expect(updates).toEqual([{ collection: 'event-registrations', id: 21, data: { status: 'pending' } }])
  })

  it('kabul edilmiş takıma giren üye kabul, ayrılan beklemeye; kabul edilmemiş takımda dokunulmaz', async () => {
    const data = db()
    const { req, updates } = fakeReq(data)
    await syncMemberRegistration({ doc: { id: 13, team: 5, event: 10, participant: 3, status: 'accepted' }, previousDoc: { team: 5, status: 'pending' }, operation: 'update', req } as never)
    expect(updates.at(-1)).toEqual({ collection: 'event-registrations', id: 23, data: { status: 'accepted' } })
    await syncMemberRegistration({ doc: { id: 13, team: 5, event: 10, participant: 3, status: 'left' }, previousDoc: { team: 5, status: 'accepted' }, operation: 'update', req } as never)
    expect(updates.at(-1)).toEqual({ collection: 'event-registrations', id: 23, data: { status: 'pending' } })
    data.teams[0].status = 'approved'
    const before = updates.length
    await syncMemberRegistration({ doc: { id: 13, team: 5, event: 10, participant: 3, status: 'accepted' }, previousDoc: { team: 5, status: 'pending' }, operation: 'update', req } as never)
    expect(updates.length).toBe(before)
  })

  it('kancalar koleksiyonlara bağlı', () => {
    expect(Teams.hooks?.afterChange).toContain(syncTeamRegistrations)
    expect(TeamMemberships.hooks?.afterChange).toContain(syncMemberRegistration)
  })
})
