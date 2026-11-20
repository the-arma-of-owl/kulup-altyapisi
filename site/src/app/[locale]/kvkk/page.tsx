import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Clock, ShieldCheck } from 'lucide-react';
import { fetchLegalDocs } from '@/lib/api';
import { serializeLexicalToHtml } from '@/lib/lexical-html';
import { SayfaBasligi } from '@/components/kit';

export const metadata: Metadata = pageMetadata({
  title: 'KVKK Aydınlatma Metni',
  description: `6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında ${KULUP.kisaAd} aydınlatma metni.`,
  path: '/kvkk',
});

function LegalIcon() {
  return (
    <span aria-hidden className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-kenar bg-yuzey text-murekkep shadow-sert-sm">
      <ShieldCheck className="h-7 w-7" strokeWidth={2} aria-hidden />
    </span>
  );
}

// Yasal metin (Lexical → HTML) biçimi: typography eklentisi yok, etiketler burada biçimlenir.
const HUKUK_METNI = [
  'prose max-w-none text-base leading-relaxed text-soluk',
  '[&_h1]:mb-3 [&_h1]:mt-8 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-murekkep',
  '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:text-murekkep',
  '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-murekkep',
  '[&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:font-display [&_h4]:text-lg [&_h4]:font-bold [&_h4]:text-murekkep',
  '[&>*:first-child]:mt-0 [&_p]:my-3 [&_strong]:text-murekkep [&_b]:text-murekkep',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li]:marker:text-ana',
  '[&_a]:font-semibold [&_a]:text-ana-yazi [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-2',
  '[&_blockquote]:my-4 [&_blockquote]:rounded-2xl [&_blockquote]:border [&_blockquote]:border-kenar [&_blockquote]:bg-zemin-2 [&_blockquote]:px-4 [&_blockquote]:py-3',
  '[&_hr]:my-8 [&_hr]:border-t-2 [&_hr]:border-dashed [&_hr]:border-kenar/30',
  '[&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-kenar [&_td]:p-2 [&_th]:border [&_th]:border-kenar [&_th]:bg-zemin-2 [&_th]:p-2',
].join(' ');

export default async function KVKKPage() {
  const legalDocs = await fetchLegalDocs();
  
  // Format the date if it exists
  const updatedAt = legalDocs?.updatedAt ? new Date(legalDocs.updatedAt).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : null;

  // Since we used fallbackData which might have raw lexicals, we check if it's an array or object.
  // In fallback it's just raw nodes, so we wrap it for serialization if needed, or if it's already LexicalRoot it's fine.
  const kvkkContent = legalDocs?.kvkk;
  
  // Serialize if we have content
  let htmlContent = '';
  if (kvkkContent) {
    // If it's a lexical root object with a root property
    if (kvkkContent.root) {
      htmlContent = serializeLexicalToHtml(kvkkContent);
    } else {
      // If it's just a raw array of nodes (like our fallback)
      htmlContent = serializeLexicalToHtml({ root: { children: Array.isArray(kvkkContent) ? kvkkContent : [kvkkContent] } } as any);
    }
  }

  return (
    <main className="pb-20">
      <SayfaBasligi
        renk="nane"
        baslik={<><LegalIcon />KVKK Aydınlatma Metni</>}
        aciklama="6698 Sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni."
      >
        {updatedAt && (
          <span className="rozet bg-yuzey text-murekkep">
            <Clock className="h-3.5 w-3.5" />
            Son Güncelleme: {updatedAt}
          </span>
        )}
      </SayfaBasligi>

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="kart mt-10 p-6 sm:p-10">
          <div className={HUKUK_METNI} dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </main>
  );
}
