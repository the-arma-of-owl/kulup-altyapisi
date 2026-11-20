import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { pickTags, secretMatches } from '@/lib/revalidate'

// CMS kayıt kancaları buraya haber verir; sayfalar yoklama yerine değişiklik olunca yenilenir.
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return NextResponse.json({ error: 'Yapılandırılmamış' }, { status: 503 })
  if (!secretMatches(secret, req.headers.get('x-revalidate-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tags = pickTags(await req.json().catch(() => null))
  if (!tags) return NextResponse.json({ error: 'Geçersiz etiket' }, { status: 400 })
  for (const tag of tags) revalidateTag(tag, 'max')
  return NextResponse.json({ revalidated: tags })
}
