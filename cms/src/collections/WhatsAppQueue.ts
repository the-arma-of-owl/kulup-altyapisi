import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

export const WhatsAppQueue: CollectionConfig = {
  slug: 'wa-queue',
  labels: { singular: '📱 WhatsApp Kuyruğu', plural: '📱 WhatsApp Kuyruğu' },
  admin: { group: '⚙️ Sistem Ayarları', useAsTitle: 'to' },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'to', type: 'text', required: true },
    { name: 'message', type: 'textarea', required: true },
    { name: 'mediaUrl', type: 'text' },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true,
      options: ['pending', 'sent', 'failed', 'cancelled'] },
    { name: 'source', type: 'select', required: true,
      options: ['gate', 'decision', 'bulk', 'system'] },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0, min: 0 },
    { name: 'error', type: 'text' },
    { name: 'sentAt', type: 'date' },
    { name: 'relatedEvent', type: 'relationship', relationTo: 'events' },
    { name: 'relatedRegistration', type: 'relationship', relationTo: 'event-registrations' },
  ],
}
