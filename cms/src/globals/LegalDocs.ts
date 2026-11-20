import { GlobalConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'

export const LegalDocs: GlobalConfig = {
  slug: 'legal-docs',
  label: '⚖️ Hukuki Metinler',
  admin: {
    group: '⚙️ Sistem Ayarları',
    description: 'Sitenin KVKK ve Gizlilik Politikası gibi yasal metinlerini buradan yönetebilirsiniz.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: '🛡️ KVKK Aydınlatma Metni',
          fields: [
            {
              name: 'kvkk',
              type: 'richText',
              label: 'KVKK Metin İçeriği',
              admin: {
                description: 'Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında kullanıcıları bilgilendirdiğiniz metin.',
              },
            },
          ],
        },
        {
          label: '🔒 Gizlilik & Sorumluluk Reddi',
          fields: [
            {
              name: 'gizlilik',
              type: 'richText',
              label: 'Gizlilik Metni İçeriği',
              admin: {
                description: 'Kullanıcı verilerinin nasıl işlendiğini ve etkinlik katılımlarındaki sorumluluk reddi (disclaimer) beyanlarını içeren metin.',
              },
            },
          ],
        },
      ],
    },
  ],
}
