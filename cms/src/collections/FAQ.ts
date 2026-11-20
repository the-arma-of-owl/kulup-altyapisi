import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'

export const FAQ: CollectionConfig = {
  slug: 'faq',
  labels: {
    singular: '❓ Soru',
    plural: '❓ Sıkça Sorulan Sorular',
  },
  // Listede satırları sürükle-bırak ile sıralama (_order alanı). Sitede bu sıra kullanılır.
  orderable: true,
  admin: {
    group: '📝 İçerik Yönetimi',
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'showOnHomepage'],
    description: 'Soruları listede sürükleyip bırakarak sıralayın; sitede aynı sırayla görünür.',
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'faqCategories',
      required: true,
    },
    {
      name: 'showOnHomepage',
      type: 'checkbox',
      label: 'Anasayfada göster',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'İşaretli sorular anasayfadaki SSS bölümünde (en fazla 4, liste sırasıyla) görünür. Hiçbiri işaretli değilse ilk 4 soru gösterilir.',
      },
    },
  ],
}
