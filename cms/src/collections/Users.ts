import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAdminOrSelf, fieldIsAdmin, fieldIsAdminOrEditor, fieldIsAdminOrSelf, readSelfOrAdmin } from '../lib/access'

/**
 * Users collection — Payload CMS admin panel kullanıcıları.
 *
 * Güvenlik notları (OWASP A01):
 * - read: Sadece admin veya editör görebilir (kullanıcı listesi public değil)
 * - create: Sadece admin yeni kullanıcı ekleyebilir
 * - update: Admin herkesi, kullanıcı sadece kendi kaydını güncelleyebilir
 * - delete: Sadece admin silebilir
 * - roles alanı: Sadece admin atayabilir/değiştirebilir (yetki yükseltme koruması)
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: '👤 Yönetici',
    plural: '👥 Yöneticiler',
  },
  admin: {
    group: '⚙️ Sistem Ayarları',
    useAsTitle: 'email',
  },
  auth: {
    // Brute-force koruması: 5 başarısız denemede 10 dakika kilit
    lockTime: 10 * 60 * 1000, // 10 dakika (ms)
    maxLoginAttempts: 5,
    // Token geçerlilik süresi: 2 saat
    tokenExpiration: 7200,
    // Cookie güvenlik ayarları
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
  },
  access: {
    read: readSelfOrAdmin,     // Liste public değil; admin olmayan hesap yalnızca kendini görür
    create: isAdmin,           // Sadece admin yeni kullanıcı ekler
    update: isAdminOrSelf,     // Admin herkesi, kullanıcı sadece kendini
    delete: isAdmin,           // Sadece admin silebilir
  },
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['admin'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Kapı görevlisi', value: 'gate' },
      ],
      // OWASP A01: Yetki yükseltme saldırısına karşı koruma
      // Kullanıcılar kendi rollerini değiştiremez
      access: {
        create: fieldIsAdmin,
        update: fieldIsAdmin,
        read: fieldIsAdminOrSelf,
      },
    },
  ],
}
