import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'
import { normalizeSlugHook } from '../lib/slug'

export const Achievements: CollectionConfig = {
  slug: 'achievements',
  labels: {
    singular: '🏆 Başarı',
    plural: '🏆 Başarılarımız',
  },
  admin: {
    group: '📝 İçerik Yönetimi',
    useAsTitle: 'title',
  },
  access: {
    read: () => true,       // Başarılar herkese açık
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        description: 'Özel URL uzantısı (Örn: teknofest-2024)',
      },
      // Tam adres yapıştırılsa da kısa ada çevrilir (ör. "https://…/blog/yazi" → "yazi")
      hooks: { beforeValidate: [normalizeSlugHook] },
    },
    {
      name: 'date',
      type: 'date',
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Detaylı açıklama — zengin metin, resim eklenebilir',
      },
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: {
        description: 'Kısa özet (landing page kartında gösterilir)',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Kapak Görseli',
    },
    {
      name: 'gallery',
      type: 'array',
      label: 'Başarı Fotoğrafları',
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Yarışma', value: 'competition' },
        { label: 'Etkinlik', value: 'event' },
        { label: 'Proje', value: 'project' },
        { label: 'Diğer', value: 'other' },
      ],
      defaultValue: 'competition',
    },
  ],
}
