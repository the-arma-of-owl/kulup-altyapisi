import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

// Sayfa istemci bileşeni olduğundan bağlantı önizlemesi (metadata) bu sunucu layout'undan verilir.
export const metadata: Metadata = pageMetadata({
  title: 'Üye Ol',
  description: `${KULUP.tamAd}’na üye olun; etkinlik, eğitim, yarışma ve projelerden ilk siz haberdar olun.`,
  path: '/basvuru/uye-ol',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
