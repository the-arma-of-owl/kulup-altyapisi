import path from 'node:path'
import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

/**
 * Takım görselleri (logo, kapak, GIF). Yalnız /api/takim/upload ucu yazar: dosya imzası doğrulanır ve sharp ile
 * yeniden kodlanır; ham dosya hiçbir zaman saklanmaz/sunulmaz. Dosya adı rastgeledir. R2'de ayrı önek (takim/).
 * SVG ve diğer türler kabul edilmez (mimeTypes ikinci savunma hattı).
 */
export const TeamMedia: CollectionConfig = {
  slug: 'team-media',
  labels: { singular: '🖼️ Takım görseli', plural: '🖼️ Takım görselleri' },
  admin: { group: '🏆 Takım Modu', defaultColumns: ['filename', 'kind', 'team', 'createdAt'] },
  access: {
    // Görseller takım sayfasında herkese açık gösterilir (CDN adresi); liste/yazma yalnız yönetici.
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'kind', type: 'select', required: true,
      options: [{ label: 'Logo', value: 'logo' }, { label: 'Kapak', value: 'cover' }, { label: 'GIF', value: 'gif' }],
    },
    { name: 'team', type: 'relationship', relationTo: 'teams', index: true },
    { name: 'uploadedBy', type: 'relationship', relationTo: 'participants' },
  ],
  upload: {
    // Yerelde (R2 yokken) diske; canlıda s3Storage eklentisi yerel depolamayı kapatır ve R2'ye (takim/) yazar.
    staticDir: path.resolve(process.cwd(), 'media-takim'),
    crop: false,
    focalPoint: false,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  },
}
