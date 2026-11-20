import React from 'react';
import type { Metadata } from 'next';
import { fetchBlogPostBySlug, getMediaUrl } from '@/lib/api';
import { DEFAULT_DESCRIPTION, lexicalToPlainText, ogImageFromMedia, pageMetadata } from '@/lib/seo';
import { ArrowLeft, User, Calendar } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { serializeLexicalToHtml } from '@/lib/lexical-html';
import { ZoomImage } from '@/components/ui/ZoomImage';
import { ZoomableHtml } from '@/components/ui/ZoomableHtml';

// Slug'lar ilk ziyarette üretilip önbelleğe alınır (ISR)
export function generateStaticParams() {
  return [];
}

// Bağlantı önizlemesi: kapak görseli, açıklama = yazının ilk cümleleri (CMS'te özet alanı yok).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) return pageMetadata({ title: 'Yazı bulunamadı', description: DEFAULT_DESCRIPTION, noindex: true });
  // Yazılar çoğunlukla başlığı tekrar eden bir başlıkla başlıyor; açıklamada tekrar etmesin
  const text = lexicalToPlainText(post.content);
  const summary = post.title && text.startsWith(post.title) ? text.slice(post.title.length).trim() : text;
  return pageMetadata({
    title: post.title,
    description: summary || DEFAULT_DESCRIPTION,
    path: `/blog/${post.slug || slug}`,
    image: ogImageFromMedia(post.coverImage, post.title),
    type: 'article',
    publishedTime: post.publishedAt || post.createdAt || undefined,
    modifiedTime: post.updatedAt || undefined,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const coverUrl = getMediaUrl(post.coverImage);
  const contentHtml = post.content ? serializeLexicalToHtml(post.content) : '';

  return (
    <main className="min-h-screen px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <article className="mx-auto max-w-3xl space-y-8 sm:space-y-10">
        <Link href="/blog" className="dugme dugme-yuzey">
          <ArrowLeft className="h-4 w-4" /> Tüm Yazılara Dön
        </Link>

        <header className="space-y-6">
          {post.publishedAt && (
            <span className="rozet bg-gok">
              <Calendar className="h-3 w-3" /> {new Date(post.publishedAt).toLocaleDateString('tr-TR')}
            </span>
          )}
          <h1 className="break-words font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-murekkep sm:text-5xl md:text-6xl">{post.title}</h1>

          {post.author && post.author.name && (
            <div className="kart flex items-start gap-4 p-4 sm:items-center sm:p-5">
              {post.author.profilePicture ? (
                <img
                  src={getMediaUrl(post.author.profilePicture)}
                  alt={post.author.name}
                  className="h-14 w-14 shrink-0 rounded-full border border-kenar object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep">
                  <User className="h-6 w-6" />
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-soluk">Yazar:</div>
                  <div className="font-display text-lg font-extrabold text-murekkep">{post.author.name}</div>
                  {post.author.role && (
                    <div className="text-sm text-soluk">{post.author.role}</div>
                  )}
                </div>

                {Array.isArray(post.author.links) && post.author.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.author.links.map((link: any, i: number) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-kenar bg-zemin-2 px-3 py-1 text-xs font-bold text-murekkep transition-colors hover:bg-limon hover:text-murekkep">
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {coverUrl && (
          <div className="kart relative aspect-video w-full overflow-hidden">
            <ZoomImage src={coverUrl} alt={post.title} className="h-full w-full object-cover" />
          </div>
        )}

        {contentHtml ? (
          <div className="kart px-5 py-8 sm:px-10 sm:py-12">
            <ZoomableHtml html={contentHtml} className="prose max-w-none" />
          </div>
        ) : (
          <div className="kart p-8 text-center">
            <p className="text-soluk">Bu yazının içeriği henüz mevcut değil.</p>
          </div>
        )}
      </article>
    </main>
  );
}
