import { GlobalConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'

export const UniversityGuideSettings: GlobalConfig = {
  slug: 'university-guide-settings',
  label: '🎓 Üniversitede Yeniyim Ayarları',
  admin: {
    group: '⚙️ Sistem Ayarları',
    description: 'Üniversitede yeniyim sayfası karşılama mesajı ve ayarları',
  },
  access: {
    read: () => true, // Public: frontend ihtiyacı
    update: isAdminOrEditor,
  },
  fields: [
    {
      name: 'welcomeTitle',
      type: 'text',
      defaultValue: 'Kampüse Hoş Geldin!',
      label: 'Karşılama Başlığı',
      required: false,
    },
    {
      name: 'welcomeMessage',
      type: 'richText',
      label: 'Karşılama Mesajı',
      required: false,
      admin: {
        description: 'Üniversitede yeniyim sayfasına ilk girenleri karşılayacak mesaj.',
      },
    },
    {
      name: 'startReadingLink',
      type: 'relationship',
      relationTo: 'university-guide',
      label: '"İlk Bunu Oku" Yönlendirmesi (İsteğe Bağlı)',
      admin: {
        description: 'Kullanıcının okumaya başlaması için önerilen ilk içerik.',
      },
    },
  ],
}
