import type { CollectionConfig } from 'payload'

export const HallOfFame: CollectionConfig = {
  slug: 'hall-of-fame',
  labels: {
    singular: '🏆 Hall of Fame Kişisi',
    plural: '🏆 Hall of Fame',
  },
  admin: {
    useAsTitle: 'name',
    group: '📝 İçerik Yönetimi',
    defaultColumns: ['name', 'title', 'order'],
  },
  access: {
    read: () => true, // Herkese açık
  },
  fields: [
    {
      name: 'year',
      type: 'number',
      label: 'Yıl',
      required: true,
      defaultValue: new Date().getFullYear(),
      admin: {
        description: "Hall of Fame'e girdiği yıl (Örn: 2024)",
      }
    },
    {
      name: 'link',
      type: 'text',
      label: 'Bağlantı URL 1 (Opsiyonel)',
      required: false,
      admin: {
        description: 'LinkedIn, GitHub veya kişisel web sitesi linki',
      }
    },
    {
      name: 'link2',
      type: 'text',
      label: 'Bağlantı URL 2 (Opsiyonel)',
      required: false,
    },
    {
      name: 'link3',
      type: 'text',
      label: 'Bağlantı URL 3 (Opsiyonel)',
      required: false,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'İsim Soyisim',
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Unvan / Rol',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Kısa Açıklama',
      required: false,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Fotoğraf (Opsiyonel)',
    },
    {
      name: 'order',
      type: 'number',
      label: 'Sıra',
      defaultValue: 0,
      admin: {
        description: 'Sıralama önceliği (Küçük sayı önce çıkar)',
      }
    }
  ],
}
