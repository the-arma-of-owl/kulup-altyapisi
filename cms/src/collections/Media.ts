import type { CollectionConfig } from 'payload'
import { isAdmin, isLoggedIn } from '../lib/access'

/**
 * Media collection — dosya yüklemeleri.
 *
 * Güvenlik notları (OWASP A01):
 * - read: Herkese açık (resimler/videolar public içerik)
 * - create: Sadece oturum açmış kullanıcılar yükleyebilir
 * - update: Sadece admin metadata güncelleyebilir
 * - delete: Sadece admin silebilir
 *
 * NOT: Media'yı herkese açık yüklemeye bırakmak dosya sunucusunu
 * kötüye kullanım vektörüne dönüştürür (spam, CSAM, malware hosting).
 */
export const Media: CollectionConfig = {
  slug: 'media',

  labels: {
    singular: '🖼️ Medya',
    plural: '🖼️ Medyalar',
  },
  admin: {
    group: '⚙️ Sistem Ayarları',
  },
  access: {
    // Herkese açık okuma; oturumsuz ziyaretçi sertifika dosyalarını (certificate-*) listede göremez.
    // Not: Payload not_like değeri olduğu gibi NOT ILIKE'a gider, joker elle yazılır.
    read: ({ req }) => (req.user ? true : { filename: { not_like: 'certificate-%' } }),
    create: isLoggedIn,    // Sadece giriş yapmış kullanıcı yükleyebilir
    update: isAdmin,       // Sadece admin güncelleyebilir
    delete: isAdmin,       // Sadece admin silebilir
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],

  upload: {
    // Workers'ta sharp desteklenmiyor
    disableLocalStorage: false, staticDir: "media", // GEÇİCİ: yerel doğrulama
    crop: false,
    focalPoint: false,
    mimeTypes: ['image/*', 'video/mp4', 'audio/mpeg', 'audio/wav', 'application/pdf'],
  },
}
