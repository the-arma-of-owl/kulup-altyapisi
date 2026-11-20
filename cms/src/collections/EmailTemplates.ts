import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

export const templateVariables = [
  'adSoyad', 'ad', 'etkinlik', 'tarih', 'saat', 'konum', 'konumLinki', 'biletLinki', 'masa',
] as const

export const EmailTemplates: CollectionConfig = {
  slug: 'email-templates',
  labels: { singular: '✉️ Mail Şablonu', plural: '✉️ Mail Şablonları' },
  admin: { group: '⚙️ Sistem Ayarları', useAsTitle: 'name' },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Ad' },
    { name: 'purpose', type: 'select', required: true,
      options: [
        { label: 'Etkinlik — kabul', value: 'event-accepted' },
        { label: 'Etkinlik — ret', value: 'event-rejected' },
        { label: 'Etkinlik — yedek liste', value: 'event-waitlist' },
        { label: 'Kapı — hoş geldin', value: 'gate-welcome' },
        { label: 'Genel', value: 'general' },
        { label: 'Otomatik — üyelik başvurusu alındı', value: 'member-application-received' },
        { label: 'Otomatik — etkinlik kaydı alındı', value: 'event-registration-received' },
        { label: 'Otomatik — Core Team başvurusu alındı', value: 'coreteam-application-received' },
      ],
      admin: { description: 'Otomatik türler form gönderilince başvurana kendiliğinden gider (aktifse). Etkinlik kaydında etkinliğe özel şablon varsa o, yoksa etkinliksiz genel şablon kullanılır.' } },
    { name: 'subject', type: 'text', required: true },
    { name: 'html', type: 'textarea', required: true,
      admin: { description: `Değişkenler: ${templateVariables.map((key) => `{{${key}}}`).join(' ')} · Takım kabul ekranında ayrıca {{takim}} {{yoneticiNotu}} (bilet linki olan maile QR eklenir).` } },
    { name: 'whatsappText', type: 'textarea' },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
    { name: 'relatedEvent', type: 'relationship', relationTo: 'events' },
  ],
}
