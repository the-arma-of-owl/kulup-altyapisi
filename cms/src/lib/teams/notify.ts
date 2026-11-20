import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { logEvent } from '../obs/notify'
import { esc, maskEmail } from '../obs/privacy'
import { idOf } from './rules'
import { kulupCmsUrl } from '../kulup'

/** Takım bildirimleri → Telegram "başvurular" konusu (gözlem katmanı, logEvent). */

async function eventTitle(req: PayloadRequest, event: unknown): Promise<string> {
  try {
    const doc = await req.payload.findByID({ collection: 'events', id: idOf(event), depth: 0, overrideAccess: true, req, select: { title: true } as never })
    return String((doc as { title?: string })?.title ?? '-')
  } catch { return '-' }
}

async function captainLine(req: PayloadRequest, captain: unknown): Promise<string> {
  try {
    const doc = await req.payload.findByID({ collection: 'participants', id: idOf(captain), depth: 0, overrideAccess: true, req }) as { fullName?: string; email?: string }
    return `${esc(doc.fullName ?? '-')} (${esc(maskEmail(doc.email))})`
  } catch { return '-' }
}

const adminLink = (id: unknown) => {
  const base = kulupCmsUrl()
  return `${base}/admin/collections/teams/${encodeURIComponent(idOf(id))}`
}

export const teamStatusHooks: CollectionAfterChangeHook[] = [
  async ({ doc, previousDoc, operation, req }) => {
    if (req.context?.restore === true) return doc
    try {
      const title = () => eventTitle(req, doc.event)
      if (operation === 'create') {
        await logEvent(req.payload, {
          kind: 'team_created', category: 'application', topic: 'applications',
          text: `🏁 <b>Yeni takım kuruldu</b> (taslak)\n🎪 ${esc(await title())}\n👥 <b>${esc(doc.name)}</b>\n🧑‍✈️ Kaptan: ${await captainLine(req, doc.captain)}`,
        })
        return doc
      }
      if (doc.status !== previousDoc?.status) {
        if (doc.status === 'pending') {
          await logEvent(req.payload, {
            kind: 'team_pending', category: 'application', topic: 'applications',
            text: `⏳ <b>Onay bekleyen takım</b>\n🎪 ${esc(await title())}\n👥 <b>${esc(doc.name)}</b>\n🧑‍✈️ Kaptan: ${await captainLine(req, doc.captain)}\n🔗 ${esc(adminLink(doc.id))}`,
          })
        } else if (doc.status === 'approved' || doc.status === 'accepted' || doc.status === 'rejected') {
          // Yalnız Telegram bildirimi; takıma otomatik mail GİTMEZ (ret maili worker'dan elle)
          const heading = { approved: '✅ <b>Takım onaylandı (başvuran)</b>', accepted: '🏆 <b>Takım kabul edildi</b>', rejected: '⛔ <b>Takım reddedildi</b>' }[doc.status as 'approved' | 'accepted' | 'rejected']
          await logEvent(req.payload, {
            kind: `team_${doc.status}`, category: 'application', topic: 'applications', notify: true,
            text: `${heading}\n🎪 ${esc(await title())}\n👥 <b>${esc(doc.name)}</b>${req.user ? `\n🛠️ ${esc((req.user as { email?: string }).email ?? '')}` : ''}`,
          })
        }
      }
      const submitted = doc.submission?.submittedAt
      if (submitted && submitted !== previousDoc?.submission?.submittedAt) {
        await logEvent(req.payload, {
          kind: 'team_submission', category: 'application', topic: 'applications',
          text: `📦 <b>Proje teslim edildi</b>\n🎪 ${esc(await title())}\n👥 <b>${esc(doc.name)}</b>\n💡 ${esc(doc.submission?.projectName ?? '-')}`,
        })
      }
    } catch (error) {
      console.error('[takim] bildirim gönderilemedi:', (error as Error)?.message)
    }
    return doc
  },
]
