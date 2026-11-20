import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

// Sayfa istemci bileşeni olduğundan bağlantı önizlemesi (metadata) bu sunucu layout'undan verilir.
export const metadata: Metadata = pageMetadata({
  title: 'İletişim',
  description: `${KULUP.kisaAd} ile iletişime geçin: soru, öneri, iş birliği ve sponsorluk teklifleriniz için bize yazın; en kısa sürede dönüş yapalım.`,
  path: '/iletisim',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
