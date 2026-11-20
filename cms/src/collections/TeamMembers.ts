import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'

export const TeamMembers: CollectionConfig = {
  slug: 'team-members',
  labels: {
    singular: '👔 Ekip Üyesi',
    plural: '👔 Yönetim Ekibi',
  },
  admin: {
    group: '🤝 Topluluk',
    useAsTitle: 'name',
  },
  access: {
    read: () => true,       // Ekip üyeleri herkese açık
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'text',
      required: true,
    },
    {
      name: 'order',
      type: 'number',
      label: 'Sıralama (Örn: Başkan için 1, Üye için 10)',
      defaultValue: 99,
    },
    {
      name: 'year',
      type: 'text',
      required: true,
      defaultValue: '2025-2026',
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'linkedinUrl',
      type: 'text',
    },
    {
      name: 'githubUrl',
      type: 'text',
    },
    {
      name: 'isActiveTeam',
      type: 'checkbox',
      label: 'Aktif Ekip Üyesi',
      defaultValue: false,
      admin: {
        description: 'Bu üye şu anki aktif yönetim kurulunda ise işaretleyin.',
      }
    },
  ],
}
