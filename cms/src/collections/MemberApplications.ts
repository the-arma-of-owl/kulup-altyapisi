import { rejectDuplicateSubmission } from '../lib/duplicateGuard'
import { sendAutoReply, autoReplyPurposes } from '../lib/autoReply'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAdminOrInternal, fieldIsAdmin } from '../lib/access'

/**
 * MemberApplications — Üyelik başvuruları.
 *
 * GÜVENLİK AÇIĞI (DÜZELTİLDİ):
 * Önceki hali: read: () => true — Tüm başvurular (ad, email, telefon vb.) herkese açıktı.
 * Başvuran kişilerin kişisel verileri herkes tarafından okunabiliyordu.
 *
 * Düzeltme: read sadece admin/editör, create herkese açık (form için).
 */
export const MemberApplications: CollectionConfig = {
  slug: 'member-applications',
  labels: {
    singular: '📝 Başvuru',
    plural: '📝 Üyelik Başvuruları',
  },
  admin: {
    group: '🤝 Topluluk',
    useAsTitle: 'fullName',
  },
  access: {
    read: isAdminOrEditor,   // KİŞİSEL VERİ — sadece admin/editör
    create: isAdminOrInternal, // Sadece site sunucusu veya admin oluşturabilir
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [rejectDuplicateSubmission({ collection: 'member-applications', message: 'Bu e-posta veya telefonla son 24 saatte zaten üyelik başvurusu yapılmış. Başvurun alındı; tekrar göndermene gerek yok.' })],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === 'create') await sendAutoReply(req, autoReplyPurposes.member, doc)
      },
      async ({ doc, req, previousDoc, operation }) => {
        // Eğer statü 'approved' olarak güncellendiyse (veya doğrudan approved oluşturulduysa)
        const isNowApproved = doc.status === 'approved';
        const wasApproved = previousDoc?.status === 'approved';
        
        if (isNowApproved && !wasApproved) {
          try {
            // E-posta ile daha önce üye eklenmiş mi kontrol et
            const existingMember = await req.payload.find({
              collection: 'members',
              where: { email: { equals: doc.email } },
              limit: 1,
            });

            if (existingMember.totalDocs === 0) {
              // Üye yoksa oluştur
              await req.payload.create({
                collection: 'members',
                data: {
                  fullName: doc.fullName,
                  email: doc.email,
                  phone: doc.phone || undefined,
                  department: doc.department || undefined,
                  year: doc.year || undefined,
                  status: 'active',
                },
              });
            }
          } catch (error) {
            req.payload.logger.error(`Üye oluşturulurken hata: ${error}`);
          }
        }
        return doc;
      },
    ],
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
      name: 'phone',
      type: 'text',
      required: false,
      maxLength: 20,
    },
    {
      name: 'department',
      type: 'text',
      required: false,
      maxLength: 200,
    },
    {
      name: 'year',
      type: 'text',
      required: false,
      maxLength: 20,
    },
    {
      name: 'kvkkApproved',
      type: 'checkbox',
      required: true,
      defaultValue: false,
    },
    {
      name: 'privacyPolicyApproved',
      type: 'checkbox',
      required: false, // optional at DB level to prevent migration crash
      defaultValue: false,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Bekliyor', value: 'pending' },
        { label: 'Onaylandı', value: 'approved' },
        { label: 'Reddedildi', value: 'rejected' },
      ],
      defaultValue: 'pending',
      // Kullanıcılar kendi başvurularının durumunu değiştiremez
      access: {
        create: fieldIsAdmin,
        update: fieldIsAdmin,
      },
    },
  ],
}
