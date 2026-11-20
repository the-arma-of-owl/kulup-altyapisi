import type { TeamPublic } from './types'

/**
 * Sunucu bileşenleri için herkese açık takım verisi (yalnız onaylı takımlar, yayınlanmış sonuçlar).
 * CMS'e iç anahtarla sunucudan gidilir; önbellek 'teams' ve 'events' etiketleriyle CMS kaydında yenilenir.
 */

const CMS_URL = process.env.CMS_URL || process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001'

export type Prize = { rank: number; title: string; description?: string; imageUrl?: string; imageAlt?: string }
export type ResultRow = { rank: number; name: string; teamSlug: string | null; score: number | null }
export type EventTeamData = {
  teamMode: boolean
  heading: string
  notice: string
  registration: { ok: boolean; reason?: string }
  limits: { min: number; max: number }
  teams: TeamPublic[]
  results: ResultRow[]
  resultsDisplay: 'top3' | 'first' | 'full'
  prizes: Prize[]
}

async function cmsGet<T>(path: string): Promise<T | null> {
  const key = process.env.INTERNAL_API_KEY
  if (!key) return null
  try {
    const response = await fetch(`${CMS_URL}/api/takim${path}`, {
      headers: { 'x-internal-api-key': key },
      next: { revalidate: 3600, tags: ['teams', 'events'] },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

/** designs: takım tasarımları da kalsın (ana sayfa kartları); yoksa atılır, istemci bileşenlerine boşuna gitmesin. */
export async function fetchEventTeamData(eventId: string | number, { designs = false } = {}): Promise<EventTeamData | null> {
  if (!/^[1-9]\d{0,9}$/.test(String(eventId))) return null
  const data = await cmsGet<EventTeamData & { ok?: boolean }>(`/public/event/${eventId}`)
  if (!data?.ok) return null
  return designs ? data : { ...data, teams: data.teams.map((team) => ({ ...team, design: undefined })) }
}

export async function fetchPublicTeam(slug: string): Promise<{ team: TeamPublic; design: unknown; event: { id: string; title: string; slug: string } } | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null
  const data = await cmsGet<{ ok?: boolean; team: TeamPublic; design: unknown; event: { id: string; title: string; slug: string } }>(`/public/team/${slug}`)
  return data?.ok ? data : null
}
