import { KULUP } from '@/lib/kulup';
import { pageMetadata } from '@/lib/seo';
import { fetchSiteSettings } from '@/lib/api';
import CoreTeamApplicationClient from './CoreTeamApplicationClient';
import { Metadata } from 'next';

export const metadata: Metadata = pageMetadata({
  title: 'Core Team Başvurusu',
  description: `${KULUP.kisaAd} yönetim ekibi ekibine katılmak için başvurunuzu yapın: topluluğun etkinlik, yazılım, tasarım ve medya işlerini birlikte yürütelim.`,
  path: '/basvuru/core-team',
});

export default async function CoreTeamApplicationPage() {
  const settings = await fetchSiteSettings();
  const isOpen = settings?.coreTeamApplicationsOpen ?? true;
  const areas = settings?.coreTeamAreas || [];

  return <CoreTeamApplicationClient isOpen={isOpen} areas={areas} />;
}
