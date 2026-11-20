import { APIError } from 'payload'
import { describe, expect, it } from 'vitest'
import { cleanUpEventBeforeDelete, deleteBlockReason, describeCounts, type LinkCounts } from '../../src/lib/eventDelete'

// Payload yerine sayım ve silme çağrılarını kaydeden sahte istek
function fakeReq(mode: 'test' | 'live', counts: LinkCounts, options: { realRegistrations?: number; deleteError?: string } = {}) {
  const deleted: Array<{ collection: string; where: unknown }> = []
  const teamIds = Array.from({ length: counts.teams ?? 0 }, (_, i) => 100 + i)
  const payload = {
    findByID: async () => ({ id: 5, mode }),
    find: async () => ({ docs: teamIds.map((id) => ({ id })) }),
    count: async ({ collection, where }: { collection: keyof LinkCounts; where: { and?: unknown } }) =>
      ({ totalDocs: where.and ? (options.realRegistrations ?? 0) : (counts[collection] ?? 0) }),
    delete: async ({ collection, where }: { collection: string; where: unknown }) => {
      deleted.push({ collection, where })
      return { docs: [] as unknown[], errors: options.deleteError ? [{ id: 1, message: options.deleteError }] : [] }
    },
  }
  const run = () => cleanUpEventBeforeDelete({ id: 5, req: { payload } as never, collection: {} as never, context: {} })
  return { run, deleted }
}

describe('etkinlik silme: engel mesajı', () => {
  it('sayıları okunur biçimde birleştirir', () => {
    expect(describeCounts({})).toBe('')
    expect(describeCounts({ certificates: 3 })).toBe('3 sertifika')
    expect(describeCounts({ certificates: 3, 'event-registrations': 12 })).toBe('3 sertifika ve 12 kayıt')
    expect(describeCounts({ teams: 2, 'team-memberships': 5, certificates: 0, 'event-registrations': 1 }))
      .toBe('5 takım üyeliği, 2 takım ve 1 kayıt')
  })

  it('canlı etkinlikte bağlı kayıt varsa nedenini söyler, yoksa engel yok', () => {
    expect(deleteBlockReason('live', { certificates: 3 }, 0)).toContain('bağlı 3 sertifika var')
    expect(deleteBlockReason('live', {}, 0)).toBeNull()
    expect(deleteBlockReason('live', { certificates: 0 }, 0)).toBeNull()
  })

  it('test etkinliğinde yalnız gerçek kayıtlar engeldir', () => {
    expect(deleteBlockReason('test', { certificates: 3, teams: 2, 'event-registrations': 4 }, 0)).toBeNull()
    expect(deleteBlockReason('test', { 'event-registrations': 4 }, 1)).toContain('1 gerçek kayıt')
  })
})

describe('etkinlik silme: kanca', () => {
  it('canlı etkinlikte bağlı kayıt varsa hiçbir şey silmeden 400 ile durur', async () => {
    const { run, deleted } = fakeReq('live', { certificates: 3, 'event-registrations': 2 })
    const error = await run().then((): unknown => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toContain('3 sertifika ve 2 kayıt')
    expect(deleted).toHaveLength(0)
  })

  it('bağlantısız canlı etkinliğe dokunmaz', async () => {
    const { run, deleted } = fakeReq('live', {})
    await expect(run()).resolves.toBeUndefined()
    expect(deleted).toHaveLength(0)
  })

  it('test etkinliğinin bağlı kayıtlarını doğru sırayla siler, boş olanları atlar', async () => {
    const { run, deleted } = fakeReq('test', { 'team-scores': 1, 'team-memberships': 4, teams: 2, certificates: 3, 'event-registrations': 0 })
    await run()
    expect(deleted.map((d) => d.collection)).toEqual(['team-scores', 'team-memberships', 'teams', 'certificates'])
    // Puan ve üyelik, etkinliğe ya da etkinliğin takımlarına bağlı olanlar
    expect(deleted[0].where).toEqual({ or: [{ event: { equals: 5 } }, { team: { in: [100, 101] } }] })
    expect(deleted[2].where).toEqual({ event: { equals: 5 } })
  })

  it('test etkinliğinde gerçek kayıt varsa hiçbir şey silmez', async () => {
    const { run, deleted } = fakeReq('test', { teams: 1, 'event-registrations': 3 }, { realRegistrations: 1 })
    await expect(run()).rejects.toThrow('1 gerçek kayıt')
    expect(deleted).toHaveLength(0)
  })

  it('bağlı kayıt silinemezse etkinlik silinmesin diye hata verir', async () => {
    const { run } = fakeReq('test', { certificates: 1 }, { deleteError: 'kilitli' })
    await expect(run()).rejects.toThrow('sertifika kayıtları silinemedi: kilitli')
  })
})
