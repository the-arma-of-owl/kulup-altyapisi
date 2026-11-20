import { safeEqual } from './cronAuth'

export function checkWebhookAuth(
  header: string | null | undefined,
  secret: string | undefined,
): 200 | 401 | 503 {
  if (!secret?.trim()) return 503
  return safeEqual(header, secret) ? 200 : 401
}

export const RESTORE_COLLECTIONS = [
  'events', 'event-registrations', 'members', 'member-applications',
  'core-team-applications', 'blog-posts', 'team-members', 'faqCategories',
  'faq', 'contact-messages', 'achievements', 'university-guide', 'hall-of-fame',
] as const

const restorableCollections = new Set<string>(RESTORE_COLLECTIONS)

export function isRestorableCollection(slug: unknown): slug is string {
  return typeof slug === 'string' && restorableCollections.has(slug)
}

export function isRestorableDoc(doc: unknown): boolean {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return false
  const prototype = Object.getPrototypeOf(doc)
  if (prototype !== Object.prototype && prototype !== null) return false
  const id = (doc as Record<string, unknown>).id
  return (typeof id === 'number' && Number.isFinite(id)) ||
    (typeof id === 'string' && id.length >= 1 && id.length <= 64)
}
