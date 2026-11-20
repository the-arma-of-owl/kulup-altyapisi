import { APIError, type CollectionBeforeDeleteHook, type CollectionSlug, type Where } from 'payload'

// Etkinliği silmeyi engelleyen bağlı kayıtlar. Bu koleksiyonların etkinlik (puan ve üyelikte ayrıca takım)
// sütunu veritabanında boş olamaz: bağlı kayıt varken Postgres silmeyi reddeder, panelde belirsiz bir hata çıkar.
// Test etkinliğinde bunlar etkinlikle birlikte silinir; canlı etkinlikte hiçbir şey silinmez, engel açıkça yazılır.
// Sıra silme sırasıdır: puan ve üyelik takıma da bağlı olduğundan takımdan önce gider.
// Takım görselleri (team-media) silinmez: kayıtları takımsız kalır, R2'deki dosyalara dokunulmaz.
export const EVENT_LINKS = [
  { collection: 'jury-sessions', label: 'canlı jüri oturumu' },
  { collection: 'team-scores', label: 'takım puanı' },
  { collection: 'team-memberships', label: 'takım üyeliği' },
  { collection: 'teams', label: 'takım' },
  { collection: 'certificates', label: 'sertifika' },
  { collection: 'event-registrations', label: 'kayıt' },
] as const satisfies ReadonlyArray<{ collection: CollectionSlug; label: string }>

type LinkSlug = (typeof EVENT_LINKS)[number]['collection']
export type LinkCounts = Partial<Record<LinkSlug, number>>

/** "3 sertifika, 2 takım ve 5 kayıt" */
export function describeCounts(counts: LinkCounts): string {
  const parts = EVENT_LINKS.filter(({ collection }) => (counts[collection] ?? 0) > 0)
    .map(({ collection, label }) => `${counts[collection]} ${label}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ve ${parts.at(-1)}` : (parts[0] ?? '')
}

/**
 * Silmenin neden durduğu (panelde gösterilir); silinebiliyorsa null.
 * Test etkinliğinde yalnız etkinlik canlıyken alınmış gerçek kayıtlar engeldir: kişisel veri otomatik silinmez.
 */
export function deleteBlockReason(mode: unknown, counts: LinkCounts, realRegistrations: number): string | null {
  if (mode === 'test') {
    return realRegistrations > 0
      ? `Bu test etkinliğinde, etkinlik canlıyken alınmış ${realRegistrations} gerçek kayıt var. Bunlar otomatik silinmez; önce Etkinlik Kayıtları'ndan silin.`
      : null
  }
  const linked = describeCounts(counts)
  return linked
    ? `Bu etkinliğe bağlı ${linked} var, bu yüzden silinemiyor. Önce bunları silin. Etkinliği yalnızca sitede gizlemek istiyorsanız Yayın Modu'nu Test yapabilirsiniz.`
    : null
}

export const cleanUpEventBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { payload } = req
  const event = await payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true, req, select: { mode: true } })
  const byEvent: Where = { event: { equals: id } }
  const { docs: teams } = await payload.find({
    collection: 'teams', where: byEvent, depth: 0, pagination: false, overrideAccess: true, req, select: { event: true },
  })
  const byEventOrTeam: Where = teams.length ? { or: [byEvent, { team: { in: teams.map((team) => team.id) } }] } : byEvent
  const where: Record<LinkSlug, Where> = {
    'jury-sessions': byEvent, 'team-scores': byEventOrTeam, 'team-memberships': byEventOrTeam, teams: byEvent, certificates: byEvent, 'event-registrations': byEvent,
  }

  const counts: LinkCounts = {}
  for (const { collection } of EVENT_LINKS) {
    counts[collection] = (await payload.count({ collection, where: where[collection], overrideAccess: true, req })).totalDocs
  }
  const realRegistrations = event.mode === 'test' && counts['event-registrations']
    ? (await payload.count({
      collection: 'event-registrations', where: { and: [byEvent, { isTest: { not_equals: true } }] }, overrideAccess: true, req,
    })).totalDocs
    : 0
  const reason = deleteBlockReason(event.mode, counts, realRegistrations)
  if (reason) throw new APIError(reason, 400, undefined, true)
  if (event.mode !== 'test') return

  // Silmeler etkinliğin silinmesiyle aynı işlemde (req): etkinlik silinemezse bunlar da geri alınır
  for (const { collection, label } of EVENT_LINKS) {
    if (!counts[collection]) continue
    const { errors } = await payload.delete({ collection, where: where[collection], depth: 0, overrideAccess: true, req })
    if (errors.length) throw new APIError(`Test etkinliğine bağlı ${label} kayıtları silinemedi: ${errors[0].message}`, 500, undefined, true)
  }
}
