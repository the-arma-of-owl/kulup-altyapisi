import type { Pool } from 'pg'

// İstatistik tablosu Payload koleksiyonu değil; CMS kendi küçük havuzuyla (1 bağlantı) erişir.
// Toplama uç noktası Payload'u hiç başlatmaz → soğuk başlangıç ve CPU maliyeti düşük kalır.
// Yerelde (SQLite, DATABASE_URL yok) devre dışıdır: uç nokta 204 döner, panel "veri yok" der.

let pool: Pool | null = null
let poolPromise: Promise<Pool | null> | null = null

export function analyticsEnabled(): boolean {
  return /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || '')
}

export async function analyticsPool(): Promise<Pool | null> {
  if (pool) return pool
  if (!analyticsEnabled()) return null
  poolPromise ??= import('pg').then((mod) => {
    // pg CommonJS: ESM'de adlandırılmış dışa aktarım her ortamda çözülmeyebilir
    const PoolClass = mod.Pool ?? (mod as unknown as { default: typeof mod }).default.Pool
    pool = new PoolClass({ connectionString: process.env.DATABASE_URL, max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 })
    pool.on('error', () => { /* boşta kopan bağlantı; sonraki sorguda yeniden açılır */ })
    return pool
  }).catch((): null => null)
  return poolPromise
}
