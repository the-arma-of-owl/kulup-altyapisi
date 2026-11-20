import { stagingBannerEnabled } from '@/lib/staging'

export function StagingBanner() {
  if (!stagingBannerEnabled(process.env)) return null
  return <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '8px 16px', background: '#facc15', color: '#000', fontWeight: 700, textAlign: 'center' }}>STAGING · test ortamı — gerçek kişilere gönderim yapılmaz</div>
}
