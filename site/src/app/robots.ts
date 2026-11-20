import { SITE_ADRESI } from '@/lib/kulup'
import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_BYT_STAGING === '1') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/'],
    },
    sitemap: `${SITE_ADRESI}/sitemap.xml`,
  }
}
