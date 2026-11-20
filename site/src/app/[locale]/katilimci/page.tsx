import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next'
import ParticipantHome from './ParticipantHome'

export const metadata: Metadata = pageMetadata({
  title: 'Katılımcı Hesabı',
  description: 'Hackathon ve yarışma katılımcı hesabı: takımlar, başvurular ve jüri paneli.',
  path: '/katilimci',
  noindex: true,
});

export default function KatilimciPage() {
  return (
    <main className="min-h-screen bg-zemin px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-3xl">
        <ParticipantHome />
      </div>
    </main>
  )
}
