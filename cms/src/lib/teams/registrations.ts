import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { idOf, sameId } from './rules'

/**
 * Takım modunda bilet = üyenin etkinlik kaydı (event-registrations, hesabın e-postasıyla eşleşir). Bilet sayfası ve kapı
 * yalnız "kabul edildi" kaydı tanır; bu yüzden kabul edilen takımın üyelerinin kayıtları da kendiliğinden kabul olur:
 *  - takım "kabul edildi"ye geçince kabul edilmiş üyelerin bekleyen kayıtları kabul edilir;
 *  - takım kabulden çıkınca (ret, geri alma) üyelerin kabul edilmiş kayıtları beklemeye döner (kapıdan girmiş olan hariç);
 *  - kabul edilmiş takıma yönetim panelden üye eklerse/çıkarırsa kayıt da izler (sitede kadro kabulle kilitlenir);
 *  - takım kabul edilince bekleyen katılma istekleri reddedilir (kişi başka takıma katılabilsin).
 * Reddedilmiş / bekleme listesindeki kayda dokunulmaz. Hepsi aynı req (aynı veritabanı işlemi) içinde yapılır.
 */

type Registration = { id: number | string; email?: unknown; status?: unknown; attended?: unknown }

/** Kaydın yeni durumu; değişiklik yoksa null. */
export function registrationTarget(reg: Registration, ticketValid: boolean): 'accepted' | 'pending' | null {
  if (ticketValid) return reg.status === 'pending' ? 'accepted' : null
  return reg.status === 'accepted' && !reg.attended ? 'pending' : null
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()

async function syncParticipants(req: PayloadRequest, eventId: unknown, participantIds: unknown[], ticketValid: boolean): Promise<void> {
  if (!participantIds.length) return
  const { docs: people } = await req.payload.find({ collection: 'participants', where: { id: { in: participantIds.map(idOf) } } as never,
    depth: 0, limit: participantIds.length, overrideAccess: true, req, pagination: false, select: { email: true } as never })
  const emails = new Set((people as Array<{ email?: unknown }>).map((p) => norm(p.email)).filter(Boolean))
  if (!emails.size) return
  const { docs } = await req.payload.find({ collection: 'event-registrations', where: { event: { equals: idOf(eventId) } } as never,
    depth: 0, limit: 5000, overrideAccess: true, req, pagination: false, select: { email: true, status: true, attended: true } as never })
  for (const reg of docs as unknown as Registration[]) {
    if (!emails.has(norm(reg.email))) continue
    const status = registrationTarget(reg, ticketValid)
    if (status) await req.payload.update({ collection: 'event-registrations', id: reg.id, overrideAccess: true, req, data: { status } as never })
  }
}

/** Teams.afterChange: kabul edildi ↔ değil geçişinde tüm kabul edilmiş üyelerin kayıtları. */
export const syncTeamRegistrations: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.restore === true) return doc
  const was = operation === 'update' && previousDoc?.status === 'accepted'
  const is = doc.status === 'accepted'
  if (was === is) return doc
  const { docs } = await req.payload.find({ collection: 'team-memberships', where: { team: { equals: doc.id }, status: { equals: 'accepted' } } as never,
    depth: 0, limit: 100, overrideAccess: true, req, pagination: false })
  await syncParticipants(req, doc.event, (docs as Array<{ participant: unknown }>).map((m) => m.participant), is)
  if (is) {
    await req.payload.update({ collection: 'team-memberships', where: { team: { equals: doc.id }, status: { equals: 'pending' } } as never,
      data: { status: 'rejected' } as never, overrideAccess: true, req })
  }
  return doc
}

/** TeamMemberships.afterChange: kabul edilmiş takımda üyelik kabul edildi ↔ değil geçişi. */
export const syncMemberRegistration: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.restore === true) return doc
  const was = operation === 'update' && previousDoc?.status === 'accepted' && sameId(previousDoc.team, doc.team)
  const is = doc.status === 'accepted'
  if (was === is) return doc
  const team = await req.payload.findByID({ collection: 'teams', id: idOf(doc.team), depth: 0, overrideAccess: true, req }).catch((): null => null)
  if ((team as { status?: string } | null)?.status !== 'accepted') return doc
  await syncParticipants(req, doc.event, [doc.participant], is)
  return doc
}
