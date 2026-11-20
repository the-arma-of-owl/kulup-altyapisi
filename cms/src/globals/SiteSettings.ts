import { GlobalConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'
import { KULUP } from '../lib/kulup'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: '⚙️ Site Ayarları',
  admin: { group: '⚙️ Sistem Ayarları' },
  access: {
    read: () => true,       // Site istatistikleri herkese açık
    update: isAdmin,        // Sadece admin site ayarlarını değiştirebilir
  },
  fields: [
    {
      name: 'activeMembers',
      type: 'number',
      label: 'Aktif Üye Sayısı (Landing hero kısmındaki +92 gibi)',
      defaultValue: 92,
    },
    {
      name: 'contactEmail',
      type: 'text',
      label: 'İletişim E-Posta Adresi',
      defaultValue: KULUP.eposta.iletisim,
    },
    {
      name: 'footerEmails',
      label: 'Footer İletişim E-Postaları',
      type: 'array',
      admin: {
        description: 'Footer kısmındaki iletişim kutusunda listelenecek e-posta adresleri.',
      },
      fields: [
        {
          name: 'email',
          label: 'E-Posta Adresi',
          type: 'text',
          required: true,
        }
      ]
    },

    {
      type: 'collapsible',
      label: '📱 Sosyal Medya Bağlantıları',
      admin: {
        description: 'Boş bırakılan bağlantı sitede (footer ve kenardaki sabit kutular) hiç görünmez.',
      },
      fields: [
        {
          name: 'instagramUrl',
          type: 'text',
          label: 'Instagram Bağlantısı',
          defaultValue: KULUP.sosyal.instagram,
        },
        {
          name: 'whatsappUrl',
          type: 'text',
          label: 'WhatsApp Bağlantısı (grup/topluluk daveti veya wa.me)',
        },
        {
          name: 'linkedinUrl',
          type: 'text',
          label: 'LinkedIn Bağlantısı',
        },
        {
          name: 'showLinkedin',
          type: 'checkbox',
          label: 'LinkedIn sitede görünsün',
          defaultValue: false,
        },
        {
          name: 'showFloatingSocials',
          type: 'checkbox',
          label: 'Sol kenarda sabit WhatsApp / Instagram kutuları görünsün',
          defaultValue: true,
        },
      ],
    },
    {
      name: 'analyticsEnabled',
      type: 'checkbox',
      label: '📊 Ziyaretçi istatistikleri toplansın',
      defaultValue: true,
      admin: {
        description: 'Kapatılırsa site yeni ziyaret kaydı göndermez (çerezsiz, anonim). Toplanan veriler ve kaynak kullanımı: Yönetim → İstatistikler.',
      },
    },
    {
      name: 'marqueeText',
      type: 'text',
      label: 'Kayan Yazı (Marquee)',
      defaultValue: `${KULUP.tamAd} Etkinliklerine Katıl! • Yeni Dönem Kayıtları Başladı! •`,
      admin: {
        description: 'Ana sayfadaki üst kayan bantta görünecek metin.',
      },
    },
    {
      name: 'aboutUsText',
      type: 'textarea',
      label: 'Biz Kimiz Metni',
      defaultValue: `${KULUP.universite} öğrencilerinin kurduğu bir teknoloji topluluğuyuz. ${KULUP.slogan} Teorik eğitimlerin yanında güncel teknolojileri pratik projelerle deneyimleme fırsatı sunuyor; yazılımdan siber güvenliğe, yapay zekadan oyun geliştirmeye kadar geniş bir alanda birlikte öğreniyor ve üretiyoruz.`,
      admin: {
        description: 'Ana sayfadaki Biz Kimiz bölümünde görünecek metin.',
      },
    },
    {
      name: 'featuredEvent',
      type: 'relationship',
      relationTo: 'events',
      label: 'Ana Sayfada Öne Çıkan Etkinlik',
      hasMany: false,
      admin: {
        description: 'Ana sayfadaki kahraman (Hero) bölümünde sergilenecek etkinliği buradan seçin. Eğer boş bırakırsanız sistem en son eklenen "Canlı" etkinliği gösterir.',
      },
    },
    {
      name: 'instagramReels',
      label: 'Instagram Reels Videoları',
      type: 'array',
      fields: [
        {
          name: 'video',
          label: 'Reels Videosu (MP4 vb.)',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
    {
      name: 'landingGallery',
      label: 'Ana Sayfa Dairesel Galeri',
      type: 'array',
      maxRows: 15,
      admin: {
        description: 'Ana sayfadaki dairesel galeride görünecek medya ögeleri (Maksimum 15). MP4 veya Fotoğraf ekleyebilirsiniz.',
      },
      fields: [
        {
          name: 'media',
          label: 'Medya',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'title',
          label: 'Başlık (Opsiyonel)',
          type: 'text',
        },
      ],
    },
    {
      name: 'coreTeamApplicationsOpen',
      label: 'Core Team Başvuruları Açık Mı?',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Eğer kapalıysa, başvuru sayfasında alımların kapalı olduğuna dair mesaj görünür.',
      }
    },
    {
      name: 'coreTeamAreas',
      label: 'Core Team Başvuru Alanları',
      type: 'array',
      admin: {
        description: 'Örn: Etkinlik Koordinatörlüğü, Yazılım Ekibi vs.',
      },
      fields: [
        {
          name: 'area',
          label: 'Alan Adı',
          type: 'text',
          required: true,
        }
      ]
    },
    {
      name: 'linkPageLinks',
      label: '🔗 Link Sayfası (/link · yaka kartı QR)',
      labels: { singular: 'Bağlantı', plural: 'Bağlantılar' },
      type: 'array',
      admin: {
        description: 'Yaka kartındaki QR bu sayfayı açar; adres hiç değişmez, düğmeler buradan yönetilir. Sıra sürükleyerek değişir. İkon bağlantıdan otomatik seçilir (Instagram, WhatsApp, LinkedIn, GitHub, YouTube, site sayfaları). Liste boşsa sayfa varsayılan düğmeleri gösterir. Öne çıkan etkinlik (yukarıda) bitmemişse en üstte kendiliğinden görünür.',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', label: 'Düğme yazısı', type: 'text', required: true, maxLength: 60, admin: { width: '40%' } },
            {
              name: 'url', label: 'Bağlantı', type: 'text', required: true, maxLength: 500, admin: { width: '60%', description: 'https://… ya da site içi yol (örn. /etkinlikler)' },
              validate: (value: unknown) => typeof value === 'string' && /^(https:\/\/\S+|\/\S*)$/.test(value.trim()) ? true : 'https:// ile başlayan bir adres ya da / ile başlayan site yolu girin.',
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'highlight', label: 'Öne çıkar (renkli düğme)', type: 'checkbox', defaultValue: false },
            { name: 'active', label: 'Görünsün', type: 'checkbox', defaultValue: true },
          ],
        },
      ],
    },
  ],
}
