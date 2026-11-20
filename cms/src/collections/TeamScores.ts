import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

/** Jüri puanı: bir jüri bir takıma bir kayıt. scores = { kriterId: 0..max }, total = ağırlıklı toplam (0..100, lib/teams/score.ts). */
export const TeamScores: CollectionConfig = {
  slug: 'team-scores',
  labels: { singular: '⚖️ Jüri puanı', plural: '⚖️ Jüri puanları' },
  admin: {
    group: '🏆 Takım Modu',
    defaultColumns: ['team', 'judge', 'total', 'updatedAt'],
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, index: true },
    { name: 'team', type: 'relationship', relationTo: 'teams', required: true, index: true },
    { name: 'judge', type: 'relationship', relationTo: 'participants', required: true, index: true },
    { name: 'scores', type: 'json', required: true },
    { name: 'total', type: 'number', label: 'Ağırlıklı puan (100 üzerinden)', admin: { readOnly: true } },
    { name: 'comment', type: 'textarea', maxLength: 1000 },
  ],
}
