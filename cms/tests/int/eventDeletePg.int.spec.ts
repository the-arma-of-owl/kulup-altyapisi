// @vitest-environment node
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// İsteğe bağlı: canlı şemanın veri içermeyen kopyası (supabase db dump -s public,obs) yüklenmiş yerel bir Postgres'te
//   EVENT_DELETE_TEST_DATABASE_URL=postgres://...@127.0.0.1:<port>/<db> npx pnpm@10 exec vitest run tests/int/eventDeletePg.int.spec.ts
// Canlı veritabanında ÇALIŞTIRMA (kayıt oluşturur, siler, tetikleyici ekler); yalnız localhost adresi kabul edilir.
const url = process.env.EVENT_DELETE_TEST_DATABASE_URL

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }

describe.skipIf(!url)('etkinlik silme: Postgres uçtan uca', () => {
  let payload: Payload
  let pool: Pool
  let image: number
  let seq = 0
  const run = Date.now().toString(36)
  const mail = () => `deneme-${run}-${++seq}@example.invalid`

  beforeAll(async () => {
    if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url!)) throw new Error('Yalnız yerel Postgres')
    // config Postgres bağdaştırıcısını seçsin; üretim modunda şema itilmez
    Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: url })
    process.env.PAYLOAD_SECRET ||= 'yerel-test'
    const { getPayload } = await import('payload')
    const config = (await import('../../src/payload.config')).default
    payload = await getPayload({ config: await config })
    pool = (payload.db as unknown as { pool: Pool }).pool
    // Etkinlik görseli zorunlu; dosya yüklemeden tek medya satırı
    image = Number((await pool.query(`INSERT INTO media (alt) VALUES ('silme denemesi') RETURNING id`)).rows[0].id)
  }, 120_000)

  afterAll(async () => {
    await pool?.query('DROP TRIGGER IF EXISTS etkinlik_silme_engeli ON events')
    await payload?.db.destroy?.()
  })

  const createEvent = (mode: 'test' | 'live', title: string) => payload.create({
    collection: 'events', data: { title, mode, status: 'completed', date: new Date().toISOString(), image },
  })
  const participant = () => payload.create({ collection: 'participants', data: { fullName: 'Deneme Katılımcı', email: mail(), password: 'yerel-Deneme-1234' } })
  const certificate = (event: number) => payload.create({
    collection: 'certificates', data: { event, fullName: 'Deneme Sertifika', type: 'participation', issueDate: new Date().toISOString() },
  })
  const registration = (event: number) => payload.create({ collection: 'event-registrations', data: { event, fullName: 'Deneme Kayıt', email: mail(), certificateType: 'participation' } })
  const count = async (table: string, column: string, id: number) =>
    Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE ${column} = $1`, [id])).rows[0].n)
  const exists = async (id: number) => (await count('events', 'id', id)) === 1
  const deleteError = (id: number) => payload.delete({ collection: 'events', id }).then((): null => null, (e: Error & { status?: number }) => e)

  // Takım, iki üye, bir jüri puanı ve takıma bağlı (dosyasız) bir görsel
  async function teamFor(event: number) {
    const [captain, member, judge] = [await participant(), await participant(), await participant()]
    const team = await payload.create({ collection: 'teams', data: { name: `Takım ${++seq}`, status: 'draft', event, captain: captain.id } })
    for (const [person, role] of [[captain, 'captain'], [member, 'member']] as const) {
      await payload.create({ collection: 'team-memberships', data: { team: team.id, event, participant: person.id, role, status: 'accepted' } })
    }
    await payload.create({ collection: 'team-scores', data: { event, team: team.id, judge: judge.id, scores: { a: 5 } } })
    const media = Number((await pool.query(`INSERT INTO team_media (kind, team_id) VALUES ('logo', $1) RETURNING id`, [team.id])).rows[0].id)
    return { team: team.id, media, captain: captain.id }
  }

  it('kök neden: bağlı sertifika varken Postgres etkinlik silmeyi reddeder', async () => {
    const event = await createEvent('test', 'Kök neden')
    await certificate(event.id)
    await expect(pool.query('DELETE FROM events WHERE id = $1', [event.id])).rejects.toMatchObject({ code: '23502' })
    expect(await exists(event.id)).toBe(true)
  })

  it('test etkinliği takımları, puanları, sertifikaları ve test kayıtlarıyla birlikte silinir', async () => {
    const event = await createEvent('test', 'Tam test')
    const a = await teamFor(event.id)
    await teamFor(event.id)
    await certificate(event.id)
    await certificate(event.id)
    const reg = await registration(event.id)
    expect(reg.isTest).toBe(true)

    await payload.delete({ collection: 'events', id: event.id })

    expect(await exists(event.id)).toBe(false)
    for (const table of ['teams', 'team_memberships', 'team_scores', 'certificates', 'event_registrations']) {
      expect(await count(table, 'event_id', event.id)).toBe(0)
    }
    // Katılımcı hesapları ve takım görseli kalır (görsel takımsız)
    expect(await count('participants', 'id', a.captain)).toBe(1)
    expect((await pool.query('SELECT team_id FROM team_media WHERE id = $1', [a.media])).rows[0].team_id).toBeNull()
  })

  it('canlı etkinlikte bağlı kayıt varsa açık mesajla durur, hiçbir şey silinmez', async () => {
    const event = await createEvent('live', 'Canlı bağlı')
    await certificate(event.id)
    await teamFor(event.id)
    const error = await deleteError(event.id)
    expect(error?.status).toBe(400)
    expect(error?.message).toBe("Bu etkinliğe bağlı 1 takım puanı, 2 takım üyeliği, 1 takım ve 1 sertifika var, bu yüzden silinemiyor. Önce bunları silin. Etkinliği yalnızca sitede gizlemek istiyorsanız Yayın Modu'nu Test yapabilirsiniz.")
    expect(await exists(event.id)).toBe(true)
    expect(await count('certificates', 'event_id', event.id)).toBe(1)
    expect(await count('team_memberships', 'event_id', event.id)).toBe(2)
  })

  it('test etkinliğinde gerçek kayıt varsa hiçbir şey silinmez', async () => {
    const event = await createEvent('test', 'Gerçek kayıtlı test')
    await teamFor(event.id)
    const reg = await registration(event.id)
    await payload.update({ collection: 'event-registrations', id: reg.id, data: { isTest: false } })
    const error = await deleteError(event.id)
    expect(error?.status).toBe(400)
    expect(error?.message).toContain('1 gerçek kayıt')
    expect(await exists(event.id)).toBe(true)
    expect(await count('teams', 'event_id', event.id)).toBe(1)
  })

  it('bağlantısız canlı etkinlik silinir', async () => {
    const event = await createEvent('live', 'Canlı boş')
    await payload.delete({ collection: 'events', id: event.id })
    expect(await exists(event.id)).toBe(false)
  })

  it('panelde listeden toplu silme de çalışır', async () => {
    const event = await createEvent('test', 'Toplu silme')
    await certificate(event.id)
    const { docs, errors } = await payload.delete({ collection: 'events', where: { id: { equals: event.id } } })
    expect(errors).toEqual([])
    expect(docs).toHaveLength(1)
    expect(await exists(event.id)).toBe(false)
  })

  it('etkinlik silinemezse bağlı kayıtların silinmesi de geri alınır', async () => {
    const event = await createEvent('test', 'Geri alma denemesi')
    await teamFor(event.id)
    await certificate(event.id)
    await pool.query(`CREATE OR REPLACE FUNCTION etkinlik_silme_engeli() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'deneme engeli'; END $$ LANGUAGE plpgsql`)
    await pool.query(`CREATE TRIGGER etkinlik_silme_engeli BEFORE DELETE ON events FOR EACH ROW
      WHEN (OLD.title = 'Geri alma denemesi') EXECUTE FUNCTION etkinlik_silme_engeli()`)
    try {
      expect(await deleteError(event.id)).not.toBeNull()
    } finally {
      await pool.query('DROP TRIGGER etkinlik_silme_engeli ON events')
    }
    expect(await exists(event.id)).toBe(true)
    expect(await count('teams', 'event_id', event.id)).toBe(1)
    expect(await count('team_memberships', 'event_id', event.id)).toBe(2)
    expect(await count('certificates', 'event_id', event.id)).toBe(1)
  })
})
