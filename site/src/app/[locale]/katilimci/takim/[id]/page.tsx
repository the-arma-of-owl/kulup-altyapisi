import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'
import { notFound } from 'next/navigation'
import TeamManager from './TeamManager'

export const metadata: Metadata = pageMetadata({ title: 'Takımım', description: `${KULUP.kisaAd} katılımcı hesabı: takım yönetimi.`, noindex: true })

export default async function TeamManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound()
  return (
    <main className="min-h-screen bg-zemin px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-3xl"><TeamManager id={id} /></div>
    </main>
  )
}
