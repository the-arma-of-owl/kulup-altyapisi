import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, Home } from 'lucide-react';
import { Cikartma } from '@/components/kit';

// 404 içeriği (app/global-not-found.tsx)
export default function NotFoundContent() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl text-center">
        <div className="relative inline-block">
          <p className="select-none font-display text-[7rem] font-extrabold leading-none tracking-tighter text-ana sm:text-[11rem] [-webkit-text-stroke:3px_var(--k-kenar)]">404</p>
          <div className="absolute -right-4 top-4"><Cikartma renk="limon" aci={10}>Hoppala!</Cikartma></div>
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold text-murekkep sm:text-4xl">Sayfa bulunamadı</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-soluk">Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className="dugme dugme-ana dugme-buyuk group">
            <Home className="h-5 w-5" /> Ana Sayfaya Dön <ArrowRight className="h-5 w-5 transition-transform " />
          </Link>
          <Link href="/etkinlikler" className="dugme dugme-yuzey dugme-buyuk">
            <Calendar className="h-5 w-5" /> Etkinliklere Göz At
          </Link>
        </div>
      </div>
    </main>
  );
}
