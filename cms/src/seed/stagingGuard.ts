import { KULUP, hostVaryantlari } from '../lib/kulup'

// Canlı kökenler: kulup.config.json'daki site ve panel adresleri (www'lu ve www'suz).
export const LIVE_HOSTS: readonly string[] = [
  ...hostVaryantlari(KULUP.adresler.site),
  ...hostVaryantlari(KULUP.adresler.cms),
].map((host) => host.toLowerCase())

export function peopleSeedBlockers(env: Record<string, string | undefined>): string[] {
  const blockers: string[] = []
  if (env.BYT_STAGING !== '1') blockers.push('BYT_STAGING gerekli')
  if (env.TELEGRAM_BOT_TOKEN) blockers.push('TELEGRAM_BOT_TOKEN tanımlı')
  if (env.TELEGRAM_CHAT_ID) blockers.push('TELEGRAM_CHAT_ID tanımlı')
  if (/example\.invalid/i.test(env.STAGING_MAIL_ALLOWLIST ?? '')) {
    blockers.push('STAGING_MAIL_ALLOWLIST example.invalid içeriyor')
  }
  return blockers
}

export function assertStagingTarget(env: Record<string, string | undefined>, argv: readonly string[]): void {
  if (env.BYT_STAGING !== '1') throw new Error('BYT_STAGING=1 gerekli')
  if (!argv.includes('--yes-staging')) throw new Error('--yes-staging gerekli')

  const origin = env.PAYLOAD_PUBLIC_SERVER_URL
  if (!origin) throw new Error('PAYLOAD_PUBLIC_SERVER_URL eksik')
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new Error('PAYLOAD_PUBLIC_SERVER_URL geçersiz')
  }
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1'
  const staging = host.startsWith('staging')
  if (LIVE_HOSTS.some((live) => host === live) || (!local && !staging) ||
      (local && url.protocol !== 'http:') || (staging && url.protocol !== 'https:') ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PAYLOAD_PUBLIC_SERVER_URL staging hedefi değil')
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL eksik')
  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL geçersiz')
  }
  if ((databaseUrl.protocol !== 'postgres:' && databaseUrl.protocol !== 'postgresql:') ||
      !databaseUrl.hostname) {
    throw new Error('DATABASE_URL geçersiz')
  }
  const databaseHost = databaseUrl.hostname.toLowerCase()
  const expectedHost = argv.find((arg) => arg.startsWith('--db-host='))?.slice('--db-host='.length)
  if (expectedHost === undefined) throw new Error('--db-host gerekli')
  if (expectedHost.toLowerCase() !== databaseHost) {
    throw new Error(`DATABASE_URL host'u --db-host ile eşleşmiyor: ${databaseHost}`)
  }
  const allowedHosts = env.STAGING_DATABASE_HOSTS?.split(',').map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!allowedHosts?.length) throw new Error('STAGING_DATABASE_HOSTS gerekli')
  if (!allowedHosts.includes(databaseHost)) {
    throw new Error(`DATABASE_URL host'u STAGING_DATABASE_HOSTS listesinde değil: ${databaseHost}`)
  }

  const pooler = databaseHost.endsWith('.pooler.supabase.com')
  const directProject = /^db\.([^.]+)\.supabase\.co$/.exec(databaseHost)?.[1]
  if (!pooler && !directProject) return

  const expectedProject = argv.find((arg) => arg.startsWith('--db-project='))?.slice('--db-project='.length)
  if (!expectedProject) throw new Error('--db-project gerekli')

  let databaseUser: string | undefined
  if (pooler) {
    try {
      databaseUser = decodeURIComponent(databaseUrl.username)
    } catch {
      throw new Error('DATABASE_URL projesi --db-project ile eşleşmiyor')
    }
  }
  if ((pooler && databaseUser !== `postgres.${expectedProject}`) ||
      (directProject && directProject !== expectedProject)) {
    throw new Error('DATABASE_URL projesi --db-project ile eşleşmiyor')
  }

  const allowedProjects = env.STAGING_DATABASE_PROJECTS?.split(',')
    .map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  if (!allowedProjects?.length) throw new Error('STAGING_DATABASE_PROJECTS gerekli')
  if (!allowedProjects.includes(expectedProject.toLowerCase())) {
    throw new Error('Supabase projesi STAGING_DATABASE_PROJECTS listesinde değil')
  }
}
