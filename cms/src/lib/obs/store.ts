/**
 * Paylaşılan durum deposu: hız sınırı, IP engeli, güvenlik olayları, bildirim kutusu (outbox), anahtar-değer.
 *
 * Sunucusuz ortamda bellek içi Map her örnekte ayrıdır ve soğuk başlangıçta sıfırlanır; bu yüzden asıl depo
 * mevcut Supabase Postgres'teki `obs` şemasıdır (cms/sql/000_kurulum.sql). Tablolar yoksa veya
 * veritabanı SQLite ise (yerel geliştirme) bellek içi depoya düşülür — gözlem katmanı hiçbir isteği
 * kendi hatası yüzünden bozmaz (fail-open).
 */

export type SqlRunner = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }

export type SecurityEventInput = {
  kind: string
  ipHash?: string | null
  ip?: string | null
  device?: string | null
  actor?: string | null
  path?: string | null
  detail?: Record<string, unknown>
}

export type ObsEventInput = {
  level: 'info' | 'warn' | 'error'
  category: string
  kind: string
  topic: string
  text: string | null
  data?: Record<string, unknown>
  notify: boolean
}

export type PendingNotification = { id: number; topic: string; text: string; ts: Date }

export interface ObsStore {
  readonly durable: boolean
  /** Kayan pencere (yaklaşık) sayacı; bu isabet dahil tahmini sayıyı döner. */
  hit(bucket: string, keyHash: string, windowSec: number): Promise<number>
  peek(bucket: string, keyHash: string, windowSec: number): Promise<number>
  block(bucket: string, keyHash: string, seconds: number, reason: string): Promise<void>
  blockedUntil(bucket: string, keyHash: string): Promise<Date | null>
  unblock(bucket: string, keyHash: string): Promise<void>
  recordSecurity(event: SecurityEventInput): Promise<void>
  recordEvent(event: ObsEventInput): Promise<void>
  kvGet<T = unknown>(key: string): Promise<T | null>
  kvSet(key: string, value: unknown, ttlSec?: number): Promise<void>
  /** Anahtar yoksa (veya süresi dolduysa) yazar ve true döner — uyarı tekilleştirme için. */
  kvSetIfAbsent(key: string, value: unknown, ttlSec: number): Promise<boolean>
  kvIncr(key: string, ttlSec: number): Promise<number>
  /** Telegram gönderim aralığı için küresel yuva; alınamazsa kaç ms beklenmesi gerektiğini döner. */
  claimSendSlot(minIntervalMs: number): Promise<{ ok: true } | { ok: false; waitMs: number }>
  pushSendSlot(untilMs: number): Promise<void>
  claimPending(limit: number): Promise<PendingNotification[]>
  releasePending(ids: number[]): Promise<void>
  pendingCount(): Promise<number>
  cleanup(): Promise<Record<string, number>>
}

// ─── Postgres ───────────────────────────────────────────────────────────────────

export class PgObsStore implements ObsStore {
  readonly durable = true
  constructor(private readonly db: SqlRunner) {}

  async hit(bucket: string, keyHash: string, windowSec: number): Promise<number> {
    const { rows } = await this.db.query(
      `WITH cur AS (
         INSERT INTO obs.rate_limits (bucket, key_hash, window_start, count, expires_at)
         VALUES ($1, $2, date_bin(make_interval(secs => $3::int), now(), timestamptz '2000-01-01'), 1,
                 date_bin(make_interval(secs => $3::int), now(), timestamptz '2000-01-01') + make_interval(secs => $3::int * 2))
         ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET count = obs.rate_limits.count + 1
         RETURNING window_start, count
       )
       SELECT cur.count AS count,
              COALESCE(prev.count, 0) AS prev_count,
              extract(epoch FROM (now() - cur.window_start)) / $3::int AS elapsed
         FROM cur
         LEFT JOIN obs.rate_limits prev
           ON prev.bucket = $1 AND prev.key_hash = $2 AND prev.window_start = cur.window_start - make_interval(secs => $3::int)`,
      [bucket, keyHash, windowSec],
    )
    return estimate(rows[0])
  }

  async peek(bucket: string, keyHash: string, windowSec: number): Promise<number> {
    const { rows } = await this.db.query(
      `WITH w AS (SELECT date_bin(make_interval(secs => $3::int), now(), timestamptz '2000-01-01') AS start)
       SELECT COALESCE((SELECT count FROM obs.rate_limits WHERE bucket = $1 AND key_hash = $2 AND window_start = w.start), 0) AS count,
              COALESCE((SELECT count FROM obs.rate_limits WHERE bucket = $1 AND key_hash = $2
                         AND window_start = w.start - make_interval(secs => $3::int)), 0) AS prev_count,
              extract(epoch FROM (now() - w.start)) / $3::int AS elapsed
         FROM w`,
      [bucket, keyHash, windowSec],
    )
    return estimate(rows[0])
  }

  async block(bucket: string, keyHash: string, seconds: number, reason: string): Promise<void> {
    await this.db.query(
      `INSERT INTO obs.blocks (bucket, key_hash, until, reason) VALUES ($1, $2, now() + make_interval(secs => $3::int), $4)
       ON CONFLICT (bucket, key_hash) DO UPDATE SET until = GREATEST(obs.blocks.until, EXCLUDED.until), reason = EXCLUDED.reason`,
      [bucket, keyHash, seconds, reason.slice(0, 200)],
    )
  }

  async blockedUntil(bucket: string, keyHash: string): Promise<Date | null> {
    const { rows } = await this.db.query(
      'SELECT until FROM obs.blocks WHERE bucket = $1 AND key_hash = $2 AND until > now()', [bucket, keyHash])
    return rows[0]?.until ? new Date(rows[0].until) : null
  }

  async unblock(bucket: string, keyHash: string): Promise<void> {
    await this.db.query('DELETE FROM obs.blocks WHERE bucket = $1 AND key_hash = $2', [bucket, keyHash])
  }

  async recordSecurity(event: SecurityEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO obs.security_events (kind, ip_hash, ip, device, actor, path, detail) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [event.kind, event.ipHash ?? null, event.ip ?? null, event.device ?? null, event.actor ?? null,
        event.path ?? null, JSON.stringify(event.detail ?? {})],
    )
  }

  async recordEvent(event: ObsEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO obs.events (level, category, kind, topic, text, data, notify) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [event.level, event.category, event.kind, event.topic, event.text, JSON.stringify(event.data ?? {}), event.notify],
    )
  }

  async kvGet<T = unknown>(key: string): Promise<T | null> {
    const { rows } = await this.db.query(
      'SELECT value FROM obs.kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())', [key])
    return rows.length ? (rows[0].value as T) : null
  }

  async kvSet(key: string, value: unknown, ttlSec?: number): Promise<void> {
    await this.db.query(
      `INSERT INTO obs.kv (key, value, expires_at, updated_at)
       VALUES ($1, $2::jsonb, CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(secs => $3::int) END, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [key, JSON.stringify(value), ttlSec ?? null],
    )
  }

  async kvSetIfAbsent(key: string, value: unknown, ttlSec: number): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO obs.kv (key, value, expires_at, updated_at) VALUES ($1, $2::jsonb, now() + make_interval(secs => $3::int), now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()
         WHERE obs.kv.expires_at IS NOT NULL AND obs.kv.expires_at <= now()
       RETURNING key`,
      [key, JSON.stringify(value), ttlSec],
    )
    return rows.length > 0
  }

  async kvIncr(key: string, ttlSec: number): Promise<number> {
    const { rows } = await this.db.query(
      `INSERT INTO obs.kv (key, value, expires_at, updated_at) VALUES ($1, '1'::jsonb, now() + make_interval(secs => $2::int), now())
       ON CONFLICT (key) DO UPDATE SET
         value = CASE WHEN obs.kv.expires_at IS NOT NULL AND obs.kv.expires_at <= now() THEN '1'::jsonb
                      ELSE to_jsonb(COALESCE((obs.kv.value #>> '{}')::numeric, 0) + 1) END,
         expires_at = CASE WHEN obs.kv.expires_at IS NOT NULL AND obs.kv.expires_at <= now() THEN EXCLUDED.expires_at
                           ELSE obs.kv.expires_at END,
         updated_at = now()
       RETURNING value`,
      [key, ttlSec],
    )
    return Number(rows[0]?.value ?? 0)
  }

  async claimSendSlot(minIntervalMs: number): Promise<{ ok: true } | { ok: false; waitMs: number }> {
    const { rows } = await this.db.query(
      `INSERT INTO obs.kv (key, value, expires_at, updated_at)
       VALUES ('tg:slot', to_jsonb((extract(epoch FROM now()) * 1000)::bigint + $1::int), NULL, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
         WHERE (obs.kv.value #>> '{}')::bigint <= (extract(epoch FROM now()) * 1000)::bigint
       RETURNING key`,
      [minIntervalMs],
    )
    if (rows.length) return { ok: true }
    const { rows: current } = await this.db.query(
      `SELECT GREATEST(0, (value #>> '{}')::bigint - (extract(epoch FROM now()) * 1000)::bigint) AS wait FROM obs.kv WHERE key = 'tg:slot'`)
    return { ok: false, waitMs: Number(current[0]?.wait ?? minIntervalMs) }
  }

  async pushSendSlot(untilMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO obs.kv (key, value, updated_at) VALUES ('tg:slot', to_jsonb($1::bigint), now())
       ON CONFLICT (key) DO UPDATE SET value = to_jsonb(GREATEST((obs.kv.value #>> '{}')::bigint, $1::bigint)), updated_at = now()`,
      [Math.round(untilMs)],
    )
  }

  async claimPending(limit: number): Promise<PendingNotification[]> {
    const { rows } = await this.db.query(
      `UPDATE obs.events SET notified_at = now(), attempts = attempts + 1
        WHERE id IN (SELECT id FROM obs.events
                      WHERE notify AND notified_at IS NULL AND attempts < 5
                      ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING id, topic, text, ts`,
      [limit],
    )
    return rows.map((row) => ({ id: Number(row.id), topic: String(row.topic), text: String(row.text ?? ''), ts: new Date(row.ts) }))
      .sort((a, b) => a.id - b.id)
  }

  async releasePending(ids: number[]): Promise<void> {
    if (!ids.length) return
    await this.db.query('UPDATE obs.events SET notified_at = NULL WHERE id = ANY($1::bigint[])', [ids])
  }

  async pendingCount(): Promise<number> {
    const { rows } = await this.db.query(
      'SELECT count(*)::int AS n FROM obs.events WHERE notify AND notified_at IS NULL AND attempts < 5')
    return Number(rows[0]?.n ?? 0)
  }

  async cleanup(): Promise<Record<string, number>> {
    const run = async (sql: string) => (await this.db.query(sql)).rowCount ?? 0
    return {
      rateLimits: await run('DELETE FROM obs.rate_limits WHERE expires_at < now()'),
      blocks: await run('DELETE FROM obs.blocks WHERE until < now() - interval \'1 day\''),
      // KVKK: ham IP 7 gün, güvenlik olayları (yalnız IP özetiyle) 30 gün tutulur.
      rawIps: await run('UPDATE obs.security_events SET ip = NULL WHERE ip IS NOT NULL AND ts < now() - interval \'7 days\''),
      securityEvents: await run('DELETE FROM obs.security_events WHERE ts < now() - interval \'30 days\''),
      // Bildirim metinleri kişi adı içerebilir: 30 gün.
      events: await run('DELETE FROM obs.events WHERE ts < now() - interval \'30 days\''),
      kv: await run('DELETE FROM obs.kv WHERE expires_at IS NOT NULL AND expires_at < now()'),
    }
  }
}

function estimate(row: { count?: unknown; prev_count?: unknown; elapsed?: unknown } | undefined): number {
  if (!row) return 0
  const current = Number(row.count) || 0
  const previous = Number(row.prev_count) || 0
  const elapsed = Math.min(1, Math.max(0, Number(row.elapsed) || 0))
  return Math.ceil(previous * (1 - elapsed) + current)
}

// ─── Bellek içi (yerel geliştirme / tablo yok / test) ───────────────────────────

export class MemoryObsStore implements ObsStore {
  readonly durable = false
  private windows = new Map<string, number>()
  private blocks = new Map<string, { until: number; reason: string }>()
  private kv = new Map<string, { value: unknown; expiresAt: number | null }>()
  readonly security: Array<SecurityEventInput & { ts: number }> = []
  readonly events: Array<ObsEventInput & { ts: number }> = []
  private slot = 0
  constructor(private readonly now: () => number = Date.now) {}

  private prune(): void {
    if (this.windows.size > 20_000) this.windows.clear()
    if (this.security.length > 2000) this.security.splice(0, this.security.length - 2000)
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000)
  }

  private counts(bucket: string, keyHash: string, windowSec: number) {
    const size = windowSec * 1000
    const start = Math.floor(this.now() / size) * size
    return {
      key: `${bucket}|${keyHash}|${start}`,
      current: this.windows.get(`${bucket}|${keyHash}|${start}`) ?? 0,
      previous: this.windows.get(`${bucket}|${keyHash}|${start - size}`) ?? 0,
      elapsed: (this.now() - start) / size,
    }
  }

  async hit(bucket: string, keyHash: string, windowSec: number): Promise<number> {
    this.prune()
    const c = this.counts(bucket, keyHash, windowSec)
    this.windows.set(c.key, c.current + 1)
    return estimate({ count: c.current + 1, prev_count: c.previous, elapsed: c.elapsed })
  }

  async peek(bucket: string, keyHash: string, windowSec: number): Promise<number> {
    const c = this.counts(bucket, keyHash, windowSec)
    return estimate({ count: c.current, prev_count: c.previous, elapsed: c.elapsed })
  }

  async block(bucket: string, keyHash: string, seconds: number, reason: string): Promise<void> {
    const until = this.now() + seconds * 1000
    const existing = this.blocks.get(`${bucket}|${keyHash}`)
    this.blocks.set(`${bucket}|${keyHash}`, { until: Math.max(until, existing?.until ?? 0), reason })
  }

  async blockedUntil(bucket: string, keyHash: string): Promise<Date | null> {
    const entry = this.blocks.get(`${bucket}|${keyHash}`)
    return entry && entry.until > this.now() ? new Date(entry.until) : null
  }

  async unblock(bucket: string, keyHash: string): Promise<void> { this.blocks.delete(`${bucket}|${keyHash}`) }

  async recordSecurity(event: SecurityEventInput): Promise<void> { this.security.push({ ...event, ts: this.now() }); this.prune() }
  async recordEvent(event: ObsEventInput): Promise<void> { this.events.push({ ...event, ts: this.now() }); this.prune() }

  private live(key: string) {
    const entry = this.kv.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) { this.kv.delete(key); return null }
    return entry
  }

  async kvGet<T = unknown>(key: string): Promise<T | null> { return (this.live(key)?.value as T) ?? null }
  async kvSet(key: string, value: unknown, ttlSec?: number): Promise<void> {
    this.kv.set(key, { value, expiresAt: ttlSec ? this.now() + ttlSec * 1000 : null })
  }
  async kvSetIfAbsent(key: string, value: unknown, ttlSec: number): Promise<boolean> {
    if (this.live(key)) return false
    await this.kvSet(key, value, ttlSec)
    return true
  }
  async kvIncr(key: string, ttlSec: number): Promise<number> {
    const entry = this.live(key)
    const next = (Number(entry?.value) || 0) + 1
    this.kv.set(key, { value: next, expiresAt: entry?.expiresAt ?? this.now() + ttlSec * 1000 })
    return next
  }

  async claimSendSlot(minIntervalMs: number): Promise<{ ok: true } | { ok: false; waitMs: number }> {
    if (this.slot > this.now()) return { ok: false, waitMs: this.slot - this.now() }
    this.slot = this.now() + minIntervalMs
    return { ok: true }
  }
  async pushSendSlot(untilMs: number): Promise<void> { this.slot = Math.max(this.slot, untilMs) }
  // Bellek modunda bildirimler kutuya girmez, doğrudan gönderilir.
  async claimPending(): Promise<PendingNotification[]> { return [] }
  async releasePending(): Promise<void> {}
  async pendingCount(): Promise<number> { return 0 }
  async cleanup(): Promise<Record<string, number>> { return {} }
}

// ─── Seçim ──────────────────────────────────────────────────────────────────────

type PayloadLike = { db?: { name?: string; pool?: SqlRunner } } | null | undefined

const memoryStore = new MemoryObsStore()
const pgStores = new WeakMap<object, PgObsStore>()
let disabledUntil = 0
let testOverride: ObsStore | null = null

/** Test/araç kullanımı için depo değiştirme. */
export function setObsStoreForTests(store: ObsStore | null): void { testOverride = store }

export function getObsStore(payload?: PayloadLike): ObsStore {
  if (testOverride) return testOverride
  const pool = payload?.db?.pool
  if (!pool || typeof pool.query !== 'function' || Date.now() < disabledUntil) return memoryStore
  let store = pgStores.get(pool)
  if (!store) {
    store = new PgObsStore(guarded(pool))
    pgStores.set(pool, store)
  }
  return store
}

/** obs şeması/tabloları yoksa (SQL henüz uygulanmadı) 5 dk boyunca bellek moduna düşer. */
function guarded(pool: SqlRunner): SqlRunner {
  return {
    query: async (text, params) => {
      try {
        return await pool.query(text, params)
      } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === '42P01' || code === '3F000' || code === '42883') {
          disabledUntil = Date.now() + 5 * 60_000
          console.error('[obs] obs şeması/tablosu bulunamadı; cms/sql/000_kurulum.sql uygulanmalı. 5 dk bellek moduna geçildi.')
        }
        throw error
      }
    },
  }
}

export const memoryObsStore = memoryStore
