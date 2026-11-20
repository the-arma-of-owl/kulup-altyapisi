import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAdminOrInternal, fieldIsAdmin } from '../lib/access'

/**
 * ContactMessages — İletişim formu mesajları.
 *
 * KRİTİK GÜVENLİK AÇIĞI (DÜZELTİLDİ):
 * Önceki hali: read: () => true — Gelen tüm mesajlar (ad, email, mesaj içeriği)
 * herkes tarafından okunabiliyordu. Bu hem gizlilik ihlali hem spam envanteri oluşturma riski.
 *
 * Düzeltme: read sadece admin/editör, create herkese açık (form için).
 */
export const ContactMessages: CollectionConfig = {
  slug: 'contact-messages',
  labels: {
    singular: '✉️ Mesaj',
    plural: '✉️ İletişim Mesajları',
  },
  admin: {
    group: '📨 Gelen Kutusu',
    useAsTitle: 'subject',
  },
  access: {
    read: isAdminOrEditor,   // Mesajlar gizli — sadece admin/editör görebilir
    create: isAdminOrInternal, // Sadece site sunucusu veya admin oluşturabilir
    update: isAdmin,         // Sadece admin durum değiştirebilir
    delete: isAdmin,
  },
  fields: [
    {
      name: 'fullName',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      maxLength: 300,
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      maxLength: 10000,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Okunmadı', value: 'unread' },
        { label: 'Okundu', value: 'read' },
        { label: 'Cevaplandı', value: 'replied' },
      ],
      defaultValue: 'unread',
      access: {
        update: fieldIsAdmin,
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // OWASP A04: Güvenli varsayılanlar. Dışarıdan form gönderildiğinde 
        // statü zorla 'unread' (Okunmadı) yapılır. Kullanıcı başka statü yollasa bile ezilir.
        if (operation === 'create') {
          data.status = 'unread';
        }
        return data;
      },
    ],
  },
}
