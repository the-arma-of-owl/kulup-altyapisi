import { createHash, timingSafeEqual } from 'node:crypto'

// CMS'te kaydedilince sitede yenilenen veriler; etiket = CMS koleksiyon/global slug'ı (lib/api.ts fetch etiketleri)
export const REVALIDATE_TAGS = new Set([
  'events', 'blog-posts', 'achievements', 'team-members', 'faq', 'hall-of-fame',
  'university-guide', 'site-settings', 'legal-docs', 'university-guide-settings', 'certificates', 'teams',
])

export function secretMatches(expected: string | undefined, supplied: string | null): boolean {
  if (!expected || !supplied) return false
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(a, b)
}

/** Gövdeden yalnız izinli etiketleri seçer; geçerli etiket yoksa null. */
export function pickTags(body: unknown): string[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { tags?: unknown }).tags)) return null
  const tags = [...new Set((body as { tags: unknown[] }).tags
    .filter((tag): tag is string => typeof tag === 'string' && REVALIDATE_TAGS.has(tag)))]
  return tags.length ? tags : null
}
