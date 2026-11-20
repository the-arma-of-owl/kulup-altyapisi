import type { CollectionConfig } from 'payload'

export const FAQCategories: CollectionConfig = {
  slug: 'faqCategories',
  labels: {
    singular: '📑 Kategori',
    plural: '📑 SSS Kategorileri',
  },
  // Kategorileri sürükle-bırak ile sıralama; SSS sayfasında bu sırayla görünür.
  orderable: true,
  admin: {
    group: '📝 İçerik Yönetimi',
    useAsTitle: 'name',
    description: 'Kategorileri listede sürükleyip bırakarak sıralayın.',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Kategori Adı',
    },
  ],
}
