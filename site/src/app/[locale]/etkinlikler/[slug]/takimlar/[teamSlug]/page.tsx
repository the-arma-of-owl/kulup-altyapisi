import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { fetchPublicTeam } from '@/lib/teams/api'
import { fetchEventBySlug } from '@/lib/api'
import { DEFAULT_DESCRIPTION, clampText, ogImageFromMedia, pageMetadata } from '@/lib/seo'
import { validateDesign } from '@/lib/teams/design'
import TeamPage from '@/components/teams/TeamPage'
import TeamJoinPanel from '@/components/teams/TeamJoinPanel'

// Yalnız onaylı (başvuran) ve kabul edilen takımlar (CMS herkese açık ucu diğerlerini döndürmez → 404).
export function generateStaticParams() { return [] }

// Bağlantı önizlemesi: takım kapağı/logosu → yoksa etkinlik kapağı → yoksa sitenin varsayılan görseli.
// Etkinlik yalnız takım görseli yoksa çekilir (etkinlik sayfasıyla aynı, önbellekli istek).
export async function generateMetadata({ params }: { params: Promise<{ slug: string; teamSlug: string }> }): Promise<Metadata> {
  const { slug, teamSlug } = await params
  const data = await fetchPublicTeam(teamSlug)
  if (!data || data.event.slug !== slug) return pageMetadata({ title: 'Takım bulunamadı', description: DEFAULT_DESCRIPTION, noindex: true })
  const { team, event } = data
  const title = `${team.name} · ${event.title}`
  let image = ogImageFromMedia(team.coverUrl || team.logoUrl, team.name)
  if (!image) {
    const fullEvent = await fetchEventBySlug(slug)
    image = fullEvent?.slug === slug ? ogImageFromMedia(fullEvent.image, event.title) : null
  }
  const manifesto = clampText((team.manifesto || '').replace(/[#*_`>[\]()]/g, ' '), 160)
  return pageMetadata({
    title,
    description: [`${event.title} takımı · ${team.memberCount}/${team.maxMembers} üye`, manifesto].filter(Boolean).join(' · '),
    path: `/etkinlikler/${slug}/takimlar/${team.slug}`,
    image,
  })
}

export default async function PublicTeamPage({ params }: { params: Promise<{ slug: string; teamSlug: string }> }) {
  const { slug, teamSlug } = await params
  const data = await fetchPublicTeam(teamSlug)
  if (!data || data.event.slug !== slug) notFound()
  return (
    <main className="min-h-screen bg-zemin px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href={`/etkinlikler/${slug}`} className="dugme dugme-yuzey max-w-full">
          <ArrowLeft className="w-4 h-4 shrink-0" /> <span className="truncate">{data.event.title}</span>
        </Link>
        <TeamPage team={data.team} design={validateDesign(data.design)} />
        {/* Üye arıyorsa katılma isteği; kaptan iletişim bıraktıysa (yalnız giriş yapmış katılımcıya) iletişim */}
        <TeamJoinPanel teamId={data.team.id} teamName={data.team.name} eventSlug={slug} seeking={data.team.seeking === true} hasContact={data.team.hasContact === true} />
      </div>
    </main>
  )
}
