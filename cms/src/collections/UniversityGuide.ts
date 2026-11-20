import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'

export const UniversityGuide: CollectionConfig = {
  slug: 'university-guide',
  labels: {
    singular: '🎓 Rehber İçeriği',
    plural: '🎓 Üniversitede Yeniyim',
  },
  admin: {
    useAsTitle: 'title',
    group: '🤝 Topluluk',
    defaultColumns: ['title', 'category', 'order', 'active'],
    description: 'Üniversiteye yeni başlayanlar için rehber içerikleri',
  },
  access: {
    read: () => true, // Public
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data }: any) => {
        if (data && data.title && !data.slug) {
          data.slug = data.title
            .toLowerCase()
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ı/g, 'i')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Başlık',
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      label: 'Slug',
      admin: {
        description: 'Boş bırakılırsa başlıktan otomatik üretilir',
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      label: 'Kategori',
      options: [
        { label: '🏛️ Kampüs', value: 'kampus' },
        { label: '📍 Konum', value: 'konum' },
        { label: '📚 Ders & Sınav', value: 'ders' },
        { label: '💻 Yazılım', value: 'yazilim' },
        { label: '👥 Kulüp & Etkinlik', value: 'kulup' },
        { label: '📖 Kaynak & Tavsiye', value: 'kaynak' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'Kısa Açıklama (Özet)',
      admin: {
        description: 'Rehber kartında görünecek kısa özet.',
      },
    },
    {
      name: 'locationMapUrl',
      type: 'text',
      label: 'Harita Linki (Google Maps)',
      admin: {
        description: 'Mekan konumları için (İsteğe Bağlı). Google Maps konum linki.',
      },
    },
    {
      name: 'content',
      type: 'richText',
      label: 'İçerik',
    },
    {
      name: 'relatedPosts',
      type: 'relationship',
      relationTo: 'blog-posts',
      hasMany: true,
      label: 'İlgili Blog Yazıları',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Sıralama',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Aktif',
      admin: {
        position: 'sidebar',
      },
    },
  ],
  timestamps: true,
}
