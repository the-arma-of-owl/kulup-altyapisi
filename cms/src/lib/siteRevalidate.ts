import { primaryFrontendUrl } from './frontendUrl'

// CMS'te içerik değişince sitenin /api/revalidate ucuna haber verir (site yoklama yerine değişince yenilenir).
// Etiket = koleksiyon/global slug'ı; site tarafındaki liste: site/src/lib/revalidate.ts
export const SITE_REVALIDATE_SLUGS = new Set([
  'events', 'blog-posts', 'achievements', 'team-members', 'faq', 'hall-of-fame',
  'university-guide', 'site-settings', 'legal-docs', 'university-guide-settings', 'certificates', 'teams',
])

export async function notifySiteRevalidate(slug: string): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret || !process.env.NEXT_PUBLIC_FRONTEND_URL || !SITE_REVALIDATE_SLUGS.has(slug)) return
  try {
    const res = await fetch(`${primaryFrontendUrl()}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: [slug] }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.error(`[revalidate] ${slug}: site ${res.status} döndü`)
  } catch (error) {
    console.error(`[revalidate] ${slug}: siteye ulaşılamadı`, error)
  }
}

// Mevcut kancaları koruyarak afterChange/afterDelete'e site bildirimi ekler.
export function withSiteRevalidate<T extends { slug: string; hooks?: Record<string, any> }>(config: T, kind: 'collection' | 'global'): T {
  if (!SITE_REVALIDATE_SLUGS.has(config.slug)) return config
  const hook = async () => { await notifySiteRevalidate(config.slug) }
  const hooks = { ...(config.hooks || {}) }
  hooks.afterChange = [...(hooks.afterChange || []), async (args: any) => { await hook(); return args.doc }]
  if (kind === 'collection') hooks.afterDelete = [...(hooks.afterDelete || []), hook]
  return { ...config, hooks }
}
