import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'
import { logEvent } from '../obs/notify'
import { esc } from '../obs/privacy'
import { captainTransferState, idOf, sameId, type MembershipLite } from './rules'

/**
 * Kaptan iki yerde tutulur: teams.captain ve kaptanın üyeliğindeki role='captain'. Kaptanlık devri (katılımcı ucu)
 * ve panelden kaptan değişikliği aynı yoldan geçer: önce yeni kaptan doğrulanır, sonra roller aynı işlemde
 * (aynı req → aynı veritabanı transaction'ı) yer değiştirir. Hata olursa takım kaydı da geri alınır.
 */

type Membership = MembershipLite & { id: number | string; team: unknown }

async function membershipsOfTeam(req: PayloadRequest, teamId: unknown): Promise<Membership[]> {
  const { docs } = await req.payload.find({ collection: 'team-memberships', where: { team: { equals: idOf(teamId) } } as never,
    depth: 0, limit: 500, overrideAccess: true, req, pagination: false })
  return docs as unknown as Membership[]
}

export const validateCaptainChange: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc || data.captain === undefined) return data
  if (sameId(data.captain, originalDoc.captain)) return data
  const state = captainTransferState(await membershipsOfTeam(req, originalDoc.id), originalDoc.captain, data.captain)
  if (state.ok === false) throw new APIError(state.reason, 400, undefined, true)
  return data
}

export const syncCaptainRoles: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || !previousDoc || sameId(doc.captain, previousDoc.captain)) return doc
  const memberships = await membershipsOfTeam(req, doc.id)
  for (const m of memberships) {
    const role = sameId(m.participant, doc.captain) && m.status === 'accepted' ? 'captain' : 'member'
    if (m.role !== role) {
      await req.payload.update({ collection: 'team-memberships', id: m.id, overrideAccess: true, req, data: { role } as never })
    }
  }
  try {
    const names = await req.payload.find({ collection: 'participants', where: { id: { in: [idOf(previousDoc.captain), idOf(doc.captain)] } } as never,
      depth: 0, limit: 2, overrideAccess: true, req, pagination: false })
    const nameOf = (id: unknown) => String((names.docs as Array<{ id: unknown; fullName?: string }>).find((p) => sameId(p.id, id))?.fullName ?? '-')
    const by = (req.user as { collection?: string; email?: string } | null)?.collection === 'users' ? `\n🛠️ Panelden: ${esc((req.user as { email?: string }).email ?? '')}` : ''
    await logEvent(req.payload, {
      kind: 'team_captain_changed', category: 'application', topic: 'applications',
      text: `🔁 <b>Kaptanlık devredildi</b>\n👥 <b>${esc(doc.name)}</b>\n${esc(nameOf(previousDoc.captain))} → <b>${esc(nameOf(doc.captain))}</b>${by}`,
    })
  } catch { /* bildirim devri bozmaz */ }
  return doc
}
