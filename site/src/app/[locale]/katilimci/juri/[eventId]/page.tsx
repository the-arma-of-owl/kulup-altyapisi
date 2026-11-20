import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'
import { notFound } from 'next/navigation'
import JuryClient from './JuryClient'

export const metadata: Metadata = pageMetadata({ title: 'Jüri Paneli', description: `${KULUP.kisaAd} yarışma jüri paneli.`, noindex: true })

export default async function JuryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!/^[1-9]\d{0,9}$/.test(eventId)) notFound()
  return (
    <main className="min-h-screen bg-zemin px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-5xl"><JuryClient eventId={eventId} /></div>
    </main>
  )
}
