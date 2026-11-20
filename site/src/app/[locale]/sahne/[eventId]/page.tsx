import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import StageScreen from '@/components/jury/StageScreen'

export const metadata: Metadata = {
  ...pageMetadata({ title: 'Salon Ekranı', description: `${KULUP.kisaAd} canlı jüri salon ekranı.`, noindex: true }),
  referrer: 'no-referrer',
}

/** Canlı jüri salon / projeksiyon ekranı: /sahne/<etkinlik>#<anahtar> (anahtar sunucu panelinden). */
export default async function StagePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!/^[1-9]\d{0,9}$/.test(eventId)) notFound()
  return <StageScreen eventId={eventId} />
}
