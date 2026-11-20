import { KULUP, SITE_ADRESI } from '@/lib/kulup';
import type { Metadata } from 'next';
import { Award, CheckCircle2, Download, FileText, Linkedin, Share2, XCircle } from 'lucide-react';
import { ogImageFromMedia, pageMetadata } from '@/lib/seo';
import { certificateTypeLabel, fetchCertificate, linkedInAddUrl, linkedInShareUrl, normalizeCertificateCode } from '@/lib/certificate';

// Paylaşılan sertifika bağlantısı (ABT modeli): sunucuda doğrulanır, gerçek sertifika görseli gösterilir.
// Turnstile yok: kodun 20 rastgele karakteri tahmin edilemez; CMS ucu ayrıca hız sınırlı.
const SITE_URL = SITE_ADRESI;

type Props = { params: Promise<{ code: string }> };

const pageUrl = (code: string) => `${SITE_URL}/sertifika/${code}`;
const dateText = (value?: string) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(date)
    : '';
};

// Önizleme yalnız sahibinin paylaştığı bağlantıda görünür (noindex): ad + sertifika türü + etkinlik ve
// sertifika görseli. CMS doğrulama ucu e-posta/telefon gibi alan döndürmez; burada da kullanılmaz.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = normalizeCertificateCode(safeDecode((await params).code));
  const cert = code ? await fetchCertificate(code) : null;
  if (!cert) return pageMetadata({ title: 'Sertifika Bulunamadı', description: `${KULUP.kisaAd} sertifika doğrulama.`, noindex: true });
  const title = `${cert.fullName} – ${certificateTypeLabel(cert.type)}`;
  const description = `${cert.event?.title ?? `${KULUP.kisaAd} etkinliği`} · ${KULUP.tamAd} tarafından verildi.`;
  return pageMetadata({
    title,
    description,
    path: `/sertifika/${cert.code}`,
    image: ogImageFromMedia(cert.imageUrl, `${title} sertifikası`),
    noindex: true,
  });
}

export default async function CertificatePage({ params }: Props) {
  const code = normalizeCertificateCode(safeDecode((await params).code));
  const cert = code ? await fetchCertificate(code) : null;

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
        <div className="mb-8 text-center">
          <p className="ust-baslik mb-2">Sertifika</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-murekkep sm:text-5xl">Sertifika Doğrulama</h1>
        </div>

        {!cert ? (
          <div className="kart w-full max-w-xl p-8 text-center sm:p-10">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-kenar bg-pembe text-murekkep shadow-sert-sm">
              <XCircle className="h-9 w-9" />
            </div>
            <h2 className="mb-2 font-display text-2xl font-extrabold text-murekkep">Sertifika Bulunamadı</h2>
            <p className="text-soluk">Bu kodla geçerli bir sertifika yok. Kodu kontrol edin veya sertifikayı aldığınız mail/WhatsApp mesajındaki bağlantıyı kullanın.</p>
            <a href="/sertifika" className="dugme dugme-ana mt-6">Kodla sorgula</a>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex items-start gap-2 rounded-2xl border border-kenar bg-nane px-4 py-2.5 text-sm font-bold text-murekkep shadow-sert-sm sm:items-center sm:rounded-full">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" /> Bu sertifika {KULUP.kisaAd} tarafından verilmiş ve geçerlidir.
            </div>

            {cert.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cert.imageUrl} alt={`${cert.fullName} – ${certificateTypeLabel(cert.type)}`}
                className="h-auto w-full rounded-kutu border border-kenar bg-white shadow-sert-lg" />
            ) : (
              <div className="kart w-full p-10 text-center">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-kenar bg-limon text-murekkep shadow-sert-sm">
                  <Award className="h-7 w-7" />
                </div>
                <p className="text-soluk">Sertifika görseli henüz yüklenmemiş.</p>
              </div>
            )}

            <dl className="grid w-full grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ['Ad Soyad', cert.fullName],
                ['Belge', certificateTypeLabel(cert.type)],
                ['Etkinlik', cert.event?.title ?? '—'],
                ['Veriliş tarihi', dateText(cert.issueDate) || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-kenar bg-yuzey px-4 py-3 shadow-sert-sm">
                  <dt className="ust-baslik text-[11px]">{label}</dt>
                  <dd className="mt-1 font-display text-base font-bold text-murekkep">{value}</dd>
                </div>
              ))}
              <div className="rounded-2xl border border-kenar bg-zemin-2 px-4 py-3 shadow-sert-sm sm:col-span-2">
                <dt className="ust-baslik text-[11px]">Sertifika kodu</dt>
                <dd className="mt-1 break-all font-mono text-murekkep">{cert.code}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap justify-center gap-3">
              {cert.pdfUrl && <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer" download
                className="dugme dugme-ana"><FileText className="h-4 w-4" /> PDF indir</a>}
              {cert.imageUrl && <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer" download
                className="dugme dugme-limon"><Download className="h-4 w-4" /> Görseli indir</a>}
              <a href={linkedInAddUrl(cert, pageUrl(cert.code))} target="_blank" rel="noopener noreferrer"
                className="dugme bg-[#0A66C2] text-white"><Linkedin className="h-4 w-4" /> LinkedIn profiline ekle</a>
              <a href={linkedInShareUrl(pageUrl(cert.code))} target="_blank" rel="noopener noreferrer"
                className="dugme dugme-yuzey"><Share2 className="h-4 w-4" /> LinkedIn&apos;de paylaş</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Bozuk % dizisi (ör. /sertifika/%E0) 500 yerine geçersiz kod sayılır. */
function safeDecode(value: string): string {
  try { return decodeURIComponent(value) } catch { return '' }
}
