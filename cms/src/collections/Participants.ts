import { APIError, type CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

/**
 * Katılımcı hesapları (takım modu: hackathon/yarışma). Yönetici hesaplarından (users) AYRIDIR:
 * - Panel girişi yok (admin.user = users; access.admin her zaman false).
 * - REST koleksiyon uçları yalnız yöneticiye açık; katılımcı işlemleri /api/takim/* uçlarından,
 *   yalnız site sunucusu üzerinden (iç anahtar + katılımcı JWT'si) yapılır.
 * - Giriş yalnız e-posta doğrulandıktan sonra (beforeLogin). Kod/sıfırlama özetleri gizli alanlarda.
 */
export const Participants: CollectionConfig = {
  slug: 'participants',
  labels: { singular: '🧑‍💻 Katılımcı', plural: '🧑‍💻 Katılımcılar' },
  admin: {
    group: '🏆 Takım Modu',
    useAsTitle: 'email',
    defaultColumns: ['email', 'fullName', 'emailVerified', 'createdAt'],
    description: 'Hackathon/yarışma katılımcı ve jüri hesapları. Bu hesaplar CMS paneline giremez.',
  },
  auth: {
    tokenExpiration: 3 * 24 * 3600, // 3 gün; site çerezi de aynı süre
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: {
    admin: () => false,
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeLogin: [
      ({ user }) => {
        if (!(user as { emailVerified?: boolean })?.emailVerified) {
          throw new APIError('E-posta adresi henüz doğrulanmadı.', 403, { code: 'not_verified' }, true)
        }
        return user
      },
    ],
  },
  fields: [
    { name: 'fullName', type: 'text', label: 'Ad Soyad', required: true, maxLength: 80 },
    { name: 'emailVerified', type: 'checkbox', label: 'E-posta doğrulandı', defaultValue: false },
    { name: 'kvkkApprovedAt', type: 'date', label: 'Aydınlatma metni / açık rıza onayı', admin: { readOnly: true } },
    // Doğrulama ve parola sıfırlama kodları: yalnız HMAC özeti tutulur; API çıktısında hiç görünmez.
    { name: 'verifyCodeHash', type: 'text', hidden: true },
    { name: 'verifyCodeExpires', type: 'date', hidden: true },
    { name: 'verifyAttempts', type: 'number', hidden: true, defaultValue: 0 },
    { name: 'resetCodeHash', type: 'text', hidden: true },
    { name: 'resetCodeExpires', type: 'date', hidden: true },
    { name: 'resetAttempts', type: 'number', hidden: true, defaultValue: 0 },
  ],
}
