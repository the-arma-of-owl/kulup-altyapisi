import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'
import { normalizeSlugHook } from '../lib/slug'

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  labels: {
    singular: '✍️ Blog Yazısı',
    plural: '✍️ Blog Yazıları',
  },
  admin: {
    group: '📝 İçerik Yönetimi',
    useAsTitle: 'title',
  },
  access: {
    read: () => true,       // Blog yazıları herkese açık
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
        description: 'Özel URL uzantısı (Örn: siber-guvenlik-nedir)',
      },
      // Tam adres yapıştırılsa da kısa ada çevrilir (ör. "https://…/blog/yazi" → "yazi")
      hooks: { beforeValidate: [normalizeSlugHook] },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'group',
      label: 'Yazar Bilgileri',
      fields: [
        {
          name: 'profilePicture',
          type: 'upload',
          relationTo: 'media',
          label: 'Profil Fotoğrafı',
        },
        {
          name: 'name',
          type: 'text',
          label: 'Yazar Adı',
        },
        {
          name: 'role',
          type: 'text',
          label: 'Unvanı / Rolü',
        },
        {
          name: 'links',
          type: 'array',
          label: 'Yazar Bağlantıları',
          fields: [
            {
              name: 'url',
              type: 'text',
              label: 'Bağlantı URL',
            },
            {
              name: 'label',
              type: 'text',
              label: 'Bağlantı Metni (Örn: Twitter, GitHub)',
            },
          ],
        },
      ],
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'Türkçe', value: 'tr' },
        { label: 'English', value: 'en' },
      ],
      defaultValue: 'tr',
    },
    {
      name: 'publishedAt',
      type: 'date',
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Taslak', value: 'draft' },
        { label: 'Yayında', value: 'published' },
      ],
      defaultValue: 'draft',
    },
  ],
}
