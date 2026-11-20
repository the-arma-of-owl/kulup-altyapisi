import { KULUP } from '@/lib/kulup';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import React from 'react';
import { fetchBlogPosts, getMediaUrl } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen, Calendar, User } from 'lucide-react';
import { BosDurum, Cikartma, RENK_BG, RENK_SIRASI, SayfaBasligi } from '@/components/kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Blog',
  description: `${KULUP.kisaAd} üyelerinden yazılım, siber güvenlik, yapay zekâ ve kariyer üzerine yazılar ve rehberler.`,
  path: '/blog',
});

export default async function BlogPage() {
  const posts = await fetchBlogPosts(50);

  return (
    <main className="min-h-screen pb-20">
      <SayfaBasligi
        renk="gok"
        ust="Blog"
        baslik="Blog & Writeups"
        aciklama="Topluluğumuzun kaleminden çıkan teknik yazılar, siber güvenlik çözümleri ve daha fazlası."
        cikartma={<Cikartma renk="limon" aci={6}>✍️ yaz, paylaş</Cikartma>}
      />

      <section className="px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-6xl">
          {posts.length === 0 ? (
            <BosDurum simge={<BookOpen className="h-7 w-7" />} baslik="Henüz yayınlanmış bir yazı bulunmuyor." />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {posts.map((post: any, idx: number) => {
                const imageUrl = getMediaUrl(post.coverImage);
                const renk = RENK_SIRASI[idx % RENK_SIRASI.length];
                // slug varsa slug, yoksa id ile link
                const postHref = `/blog/${post.slug || post.id}`;
                return (
                  <Link
                    key={idx}
                    href={postHref}
                    className="kart kart-hover group flex flex-col overflow-hidden sm:flex-row"
                  >
                    <div className={cn('relative h-48 shrink-0 overflow-hidden border-b-2 border-kenar sm:h-auto sm:min-h-52 sm:w-52 sm:border-b-0 sm:border-r-2', RENK_BG[renk])}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          alt={post.title}
                        />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <span className="font-display text-6xl font-extrabold">{post.title?.[0] || 'B'}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-6">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          {post.publishedAt && (
                            <span className="rozet bg-limon">
                              <Calendar className="h-3 w-3" />
                              {new Date(post.publishedAt).toLocaleDateString('tr-TR')}
                            </span>
                          )}
                          {post.author && post.author.name && (
                            <div className="flex min-w-0 items-center gap-2">
                              {post.author.profilePicture ? (
                                <img
                                  src={getMediaUrl(post.author.profilePicture)}
                                  alt={post.author.name}
                                  className="h-8 w-8 shrink-0 rounded-full border border-kenar object-cover"
                                />
                              ) : (
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kenar bg-zemin-2 text-soluk">
                                  <User className="h-4 w-4" />
                                </div>
                              )}
                              <span className="truncate text-sm font-semibold text-soluk">
                                {post.author.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <h3 className="font-display text-xl font-extrabold leading-tight text-murekkep sm:text-2xl">{post.title}</h3>
                      </div>
                      <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-ana-yazi">
                        Devamını Oku <ArrowRight className="h-4 w-4 transition-transform " />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
