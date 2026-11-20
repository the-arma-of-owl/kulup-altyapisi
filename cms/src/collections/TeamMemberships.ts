import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'
import { syncMemberRegistration } from '../lib/teams/registrations'

/** Takım üyeliği ve katılma başvurusu (kaptan kabul/ret eder). Bir katılımcının bir etkinlikte tek etkin üyeliği olur. */
export const TeamMemberships: CollectionConfig = {
  slug: 'team-memberships',
  labels: { singular: '🤝 Takım üyeliği', plural: '🤝 Takım üyelikleri' },
  admin: {
    group: '🏆 Takım Modu',
    defaultColumns: ['team', 'participant', 'role', 'status', 'createdAt'],
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  // Kabul edilmiş takıma giren/çıkan üyenin bileti (etkinlik kaydı) buna göre kabul / beklemeye alınır
  hooks: { afterChange: [syncMemberRegistration] },
  fields: [
    { name: 'team', type: 'relationship', relationTo: 'teams', required: true, index: true },
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, index: true },
    { name: 'participant', type: 'relationship', relationTo: 'participants', required: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'role', type: 'select', required: true, defaultValue: 'member',
          options: [{ label: 'Kaptan', value: 'captain' }, { label: 'Üye', value: 'member' }],
        },
        {
          name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true,
          options: [
            { label: '⏳ Başvuru', value: 'pending' },
            { label: '✅ Üye', value: 'accepted' },
            { label: '⛔ Reddedildi', value: 'rejected' },
            { label: '🚪 Ayrıldı', value: 'left' },
            { label: '➖ Çıkarıldı', value: 'removed' },
          ],
        },
      ],
    },
    { name: 'message', type: 'textarea', label: 'Başvuru mesajı', maxLength: 500 },
    { name: 'decidedAt', type: 'date', admin: { readOnly: true } },
  ],
}
