import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, fieldIsAdmin } from '../lib/access'
import { randomBytes } from 'crypto'
import { GATE_FIELD_DESCRIPTION } from '../components/gate/gatePrompt'
import { cleanUpEventBeforeDelete } from '../lib/eventDelete'
import { kulupCmsUrl } from '../lib/kulup'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: {
    singular: '📅 Etkinlik',
    plural: '📅 Etkinlikler',
  },
  admin: {
    group: '🎓 Faaliyetler',
    useAsTitle: 'title',
    defaultColumns: ['title', 'mode', 'status', 'registrationStage', 'date'],
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    // Bağlı kayıtlar: test etkinliğinde birlikte silinir, canlı etkinlikte silme açık bir mesajla durur
    beforeDelete: [cleanUpEventBeforeDelete],
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        // Tamamlanan etkinliğin alım kısmını otomatik kapat
        if (data.status === 'completed') {
          data.registrationStage = 'closed';
        }

        const mergedMode = data.mode || originalDoc?.mode;
        
        if (mergedMode === 'test') {
          // Eğer test modundaysa rastgele bir slug ata
          if (operation === 'create' || originalDoc?.mode !== 'test') {
            data.slug = 'test-' + randomBytes(4).toString('hex');
          }
        } else if (mergedMode === 'live') {
          // Testten canlıya geçiş varsa
          if (operation === 'update' && originalDoc?.mode === 'test') {
            try {
              // Sadece isTest=true olan test başvurularını sil
              const testRegistrations = await req.payload.find({
                collection: 'event-registrations',
                where: { 
                  and: [
                    { event: { equals: originalDoc.id } },
                    { isTest: { equals: true } }
                  ]
                },
                limit: 1000,
              });
              for (const reg of testRegistrations.docs) {
                await req.payload.delete({
                  collection: 'event-registrations',
                  id: reg.id,
                });
              }
            } catch (err) {
              console.error('Test kayıtları silinirken hata:', err);
            }
          }
          // Slug'ı gerçek slug yap
          const finalRealSlug = data.realSlug !== undefined ? data.realSlug : originalDoc?.realSlug;
          const finalTitle = data.title !== undefined ? data.title : originalDoc?.title;
          
          const trMap: Record<string, string> = {
            'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
            'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
          };
          const slugify = (text: string) => {
            return text.replace(/[çğıöşüÇĞİÖŞÜ]/g, (match) => trMap[match])
                       .toLowerCase()
                       .replace(/[^a-z0-9-]+/g, '-')
                       .replace(/^-+|-+$/g, '');
          };
          
          if (finalRealSlug) {
            data.slug = slugify(finalRealSlug);
          } else if (finalTitle) {
            data.slug = slugify(finalTitle);
            data.realSlug = data.slug;
          }
        }
        return data;
      }
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        // Eğer bu etkinlik "Canlı" ve "Aktif" ise, DİĞER tüm canlı ve aktif etkinlikleri kapat
        if (doc.mode === 'live' && doc.status === 'active') {
          try {
            const otherActiveEvents = await req.payload.find({
              collection: 'events',
              where: {
                and: [
                  { id: { not_equals: doc.id } },
                  { status: { equals: 'active' } },
                  { mode: { equals: 'live' } }
                ]
              },
              limit: 50,
            });

            for (const oldEvent of otherActiveEvents.docs) {
              await req.payload.update({
                collection: 'events',
                id: oldEvent.id,
                data: {
                  status: 'completed',
                  registrationStage: 'closed'
                }
              });
            }
          } catch (err) {
            console.error('Eski aktif etkinlikleri kapatırken hata oluştu:', err);
          }
        }
      }
    ]
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Etkinlik Adı',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'mode',
          type: 'select',
          label: 'Yayın Modu',
          options: [
            { label: '🧪 Test Modu (Gizli)', value: 'test' },
            { label: '🌍 Canlı (Yayında)', value: 'live' },
          ],
          defaultValue: 'test',
          required: true,
          admin: { width: '33%' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Etkinlik Durumu',
          options: [
            { label: '🚀 Aktif (Devam Ediyor)', value: 'active' },
            { label: '🏁 Tamamlandı (Geçmiş Etkinlik)', value: 'completed' },
          ],
          defaultValue: 'active',
          required: true,
          admin: { width: '33%' },
        },
        {
          name: 'registrationStage',
          type: 'select',
          label: 'Başvuru Aşaması',
          options: [
            { label: '🟢 Normal Alım (Açık)', value: 'open' },
            { label: '🟡 Yedek/Geç Alım', value: 'waitlist' },
            { label: '🔴 Alımlar Kapandı', value: 'closed' },
          ],
          defaultValue: 'open',
          required: true,
          admin: {
            width: '33%',
            condition: (data) => data.status === 'active',
          },
        },
      ]
    },
    {
      name: 'realSlug',
      type: 'text',
      label: 'URL Uzantısı (Slug)',
      admin: {
        description: 'Örn: siber-guvenlik-zirvesi. Test modunda bu alan dikkate alınmaz, sistem rastgele bir uzantı üretir.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          type: 'date',
          required: true,
          label: 'Başlangıç Tarihi',
          // Saatiyle: sitedeki geri sayım ve etkinlik sayfasındaki saat bundan okunur
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime', timeIntervals: 15, displayFormat: 'd MMMM yyyy HH:mm' } },
        },
        {
          name: 'endDate',
          type: 'date',
          label: 'Bitiş Tarihi (Opsiyonel)',
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime', timeIntervals: 15, displayFormat: 'd MMMM yyyy HH:mm' } },
        },
      ]
    },
    {
      type: 'row',
      fields: [
        {
          name: 'location',
          type: 'text',
          label: 'Lokasyon Adı',
          admin: { width: '50%' },
        },
        {
          name: 'locationLink',
          type: 'text',
          label: 'Harita Linki',
          admin: { width: '50%' },
        },
      ]
    },
    {
      name: 'capacity',
      type: 'number',
      label: 'Maksimum Katılımcı Sayısı',
      admin: { position: 'sidebar' },
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Etkinlik Açıklaması',
    },
    // --- Medya ve Linkler ---
    {
      name: 'externalLinks',
      type: 'array',
      label: 'Harici Bağlantılar (Tamamlanan Etkinlikler İçin)',
      admin: {
        description: 'Etkinlik için YouTube video kaydı, Instagram postu veya Drive klasörü gibi linkleri buradan ekleyebilirsiniz.',
      },
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Bağlantı Türü',
          options: [
            { label: 'YouTube Videosu', value: 'youtube' },
            { label: 'Instagram', value: 'instagram' },
            { label: 'Google Drive', value: 'drive' },
            { label: 'Diğer Link', value: 'other' },
          ],
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          label: 'URL / Link',
          required: true,
        },
        {
          name: 'label',
          type: 'text',
          label: 'Görünür İsim (Opsiyonel)',
          admin: { description: 'Örn: 1. Gün Yayını, Etkinlik Fotoğrafları vs.' },
        },
      ],
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Ana Görsel',
      required: true,
    },
    {
      name: 'gallery',
      type: 'array',
      label: 'Ek Medya (Görsel / Video / GIF)',
      admin: {
        description: 'Etkinlik "Tamamlandı" durumuna geçtiğinde, başvuru formunun yerini bu galeri ve medya dosyaları alacaktır.',
      },
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'caption',
          type: 'text',
        },
      ],
    },
    // --- Kapı Kontrol (QR Scanner) Ayarları ---
    {
      name: 'scannerActive',
      type: 'checkbox',
      label: 'QR Okuyucu (Kiosk) Aktif',
      defaultValue: false,
      admin: {
        description: 'Açıkken bu etkinlik CMS panelindeki "Kapı QR okuyucu" ekranında (<panel adresi>/admin/kapi) seçilebilir. Görevliler yönetici veya "Kapı görevlisi" hesabıyla girer.',
        condition: (data) => data.status === 'active',
      },
    },
    {
      name: 'scannerPin',
      type: 'text',
      // PIN herkese açık etkinlik API'sinde görünüyordu; yalnızca yönetici ve iç anahtar (eski site okuyucusu) okuyabilir.
      // Eski site okuyucusu kaldırıldı; iç anahtar artık okuyamaz (sütun veri kaybı olmasın diye duruyor)
      access: { read: fieldIsAdmin },
      label: 'Eski site okuyucusu PIN (kullanılmıyor)',
      admin: {
        description: 'Yalnızca eski herkese açık site okuyucusu içindir. Yeni okuyucu hesapla girildiği için PIN kullanmaz.',
        condition: (data) => data.scannerActive === true,
      },
    },
    {
      name: 'scannerUrl',
      type: 'text',
      label: 'Kapı okuyucu linki',
      admin: {
        readOnly: true,
        description: 'Görevliler bu linki telefonda açıp kendi hesaplarıyla giriş yapar.',
        condition: (data) => data.scannerActive === true,
      },
      hooks: {
        afterRead: [
          ({ originalDoc, siblingData, data }) => {
            const slug = siblingData?.slug || originalDoc?.slug || data?.slug;
            return slug ? `${kulupCmsUrl()}/admin/kapi` : '';
          }
        ]
      }
    },
    {
      name: 'gateFieldDefinitions',
      type: 'json',
      label: 'Kapı alanları',
      admin: {
        description: GATE_FIELD_DESCRIPTION,
        condition: (data) => data.scannerActive === true,
      },
    },
    // --- Başvuru Ayarları ---
    {
      name: 'registrationFields',
      type: 'array',
      label: 'Özel Başvuru Formu Alanları',
      admin: {
        condition: (data) => data.status === 'active',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          label: 'Soru (Örn: Sınıfınız, Motivasyonunuz)',
          required: true,
        },
        {
          name: 'type',
          type: 'select',
          label: 'Soru Tipi',
          options: [
            { label: '📝 Kısa Metin', value: 'text' },
            { label: '📄 Uzun Metin', value: 'textarea' },
            { label: '🔢 Sayı', value: 'number' },
            { label: '📧 E-Posta', value: 'email' },
            { label: '☑️ Onay Kutusu (Checkbox)', value: 'checkbox' },
            { label: '⭐ Puan (1-5 arası)', value: 'rating' },
            { label: '📋 Çoktan Seçmeli (Select)', value: 'select' },
            { label: '🖼️ Resimli Test Sorusu (tek seçim)', value: 'quiz' },
          ],
          defaultValue: 'text',
          required: true,
        },
        {
          name: 'options',
          type: 'text',
          label: 'Seçenekler (Çoktan seçmeli için virgülle ayır: Seçenek1, Seçenek2)',
          admin: {
            condition: (_, siblingData) => siblingData.type === 'select',
          },
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          label: 'Soru görseli (isteğe bağlı)',
          admin: {
            description: 'Şıkların üstünde gösterilir. Boş bırakılabilir.',
            condition: (_, siblingData) => siblingData.type === 'quiz',
          },
        },
        {
          name: 'choices',
          type: 'array',
          label: 'Resimli şıklar',
          labels: { singular: 'Şık', plural: 'Şıklar' },
          minRows: 2,
          maxRows: 8,
          admin: {
            description: 'Her şıkkın kendi resmi var; başvuran tek birini seçer. Şıklar sırayla A, B, C… diye gösterilir.',
            condition: (_, siblingData) => siblingData.type === 'quiz',
          },
          fields: [
            { name: 'image', type: 'upload', relationTo: 'media', required: true, label: 'Şık resmi' },
            { name: 'label', type: 'text', label: 'Şık yazısı (isteğe bağlı)' },
          ],
        },
        {
          name: 'required',
          type: 'checkbox',
          label: 'Zorunlu Mu?',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'registrationLink',
      type: 'text',
      label: 'Harici Kayıt Linki (opsiyonel — dolu ise kendi formumuz gizlenir)',
      admin: {
        condition: (data) => data.status === 'active',
      },
    },
    // --- Takım modu (hackathon / yarışma). Kapalıyken (varsayılan) etkinlik bugünkü gibi çalışır. ---
    {
      type: 'collapsible',
      label: '🏆 Takım modu (hackathon / yarışma)',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'teamMode',
          type: 'checkbox',
          label: 'Takım modu',
          defaultValue: false,
          admin: { description: 'Açıkken kayıt bölümünde "Takım oluştur / Takıma katıl" çıkar; katılımcılar hesapla girer. Kapalıyken hiçbir şey değişmez.' },
        },
        {
          name: 'teamSettings',
          type: 'group',
          label: 'Takım ayarları',
          admin: { condition: (data) => data?.teamMode === true },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'minMembers', type: 'number', label: 'En az üye (kaptan dahil)', defaultValue: 2, min: 1, max: 20, admin: { width: '50%' } },
                { name: 'maxMembers', type: 'number', label: 'En fazla üye (kaptan dahil)', defaultValue: 5, min: 1, max: 20, admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'registrationOpen', type: 'checkbox', label: 'Takım kurma / katılma açık', defaultValue: true, admin: { width: '50%' } },
                { name: 'registrationDeadline', type: 'date', label: 'Takım başvurusu son tarihi', admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } } },
              ],
            },
            { name: 'teamsHeading', type: 'text', label: 'Takımlar bölümü başlığı', defaultValue: 'Başvuran takımlar' },
            {
              name: 'teamsNotice', type: 'textarea', label: 'Takımlar bölümü uyarı metni',
              defaultValue: 'Başvuru aşamasında seçilen takımlar burada yayımlanacaktır.',
            },
            {
              type: 'row',
              fields: [
                { name: 'submissionOpen', type: 'checkbox', label: 'Proje teslimi açık', defaultValue: false, admin: { width: '50%' } },
                { name: 'submissionDeadline', type: 'date', label: 'Teslim son tarihi', admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } } },
              ],
            },
          ],
        },
        {
          name: 'judges',
          type: 'relationship',
          relationTo: 'participants',
          hasMany: true,
          label: 'Jüri üyeleri (katılımcı hesapları)',
          access: { read: fieldIsAdmin },
          admin: {
            condition: (data) => data?.teamMode === true,
            description: 'Jüri, siteye kendi katılımcı hesabıyla girer ve "Jüri paneli"nden teslimleri puanlar. Kendi takımına puan veremez.',
          },
        },
        {
          name: 'judgingCriteria',
          type: 'array',
          label: 'Puanlama kriterleri',
          labels: { singular: 'Kriter', plural: 'Kriterler' },
          maxRows: 10,
          admin: { condition: (data) => data?.teamMode === true, description: 'Ör. Yenilik, Teknik, Sunum. Puan 0..en yüksek; toplam ağırlıklı ortalamadır (100 üzerinden).' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'name', type: 'text', label: 'Kriter', required: true, maxLength: 60, admin: { width: '50%' } },
                { name: 'weight', type: 'number', label: 'Ağırlık', defaultValue: 1, min: 0.1, max: 10, required: true, admin: { width: '25%' } },
                { name: 'max', type: 'number', label: 'En yüksek puan', defaultValue: 10, min: 1, max: 100, required: true, admin: { width: '25%' } },
              ],
            },
          ],
        },
      ],
    },
    // --- Ödüller ve sonuçlar (takım modu olmadan da kullanılabilir) ---
    {
      type: 'collapsible',
      label: '🏅 Ödüller ve sonuçlar',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'prizes',
          type: 'array',
          label: 'Ödüller',
          labels: { singular: 'Ödül', plural: 'Ödüller' },
          maxRows: 20,
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'rank', type: 'number', label: 'Sıra', required: true, min: 1, max: 100, admin: { width: '20%' } },
                { name: 'title', type: 'text', label: 'Ödül', required: true, maxLength: 120, admin: { width: '40%' } },
                { name: 'description', type: 'text', label: 'Açıklama', maxLength: 300, admin: { width: '40%' } },
              ],
            },
            {
              name: 'image', type: 'upload', relationTo: 'media', label: 'Ödül görseli (isteğe bağlı)',
              filterOptions: { mimeType: { contains: 'image' } },
              admin: { description: 'Sitede ödül kartında gösterilir. Kare ya da yatay görsel önerilir.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'resultsPublished', type: 'checkbox', label: 'Sonuçlar yayında', defaultValue: false, admin: { width: '50%' } },
            {
              name: 'resultsDisplay', type: 'select', label: 'Gösterim', defaultValue: 'top3', admin: { width: '50%' },
              options: [
                { label: 'İlk 3', value: 'top3' },
                { label: 'Yalnız birinci', value: 'first' },
                { label: 'Tam sıralama', value: 'full' },
              ],
            },
          ],
        },
        {
          name: 'judgeRanking',
          type: 'ui',
          admin: { components: { Field: '@/components/teams/JudgeRankingField#JudgeRankingField' } },
        },
        {
          name: 'results',
          type: 'array',
          label: 'Sonuç sıralaması',
          labels: { singular: 'Sıra', plural: 'Sıralama' },
          maxRows: 100,
          access: { read: fieldIsAdmin },
          admin: { description: 'Takım seçin ya da serbest isim yazın. "Sonuçlar yayında" işaretlenmeden sitede görünmez.' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'rank', type: 'number', label: 'Sıra', required: true, min: 1, max: 1000, admin: { width: '15%' } },
                {
                  name: 'team', type: 'relationship', relationTo: 'teams', label: 'Takım', admin: { width: '35%' },
                  // Sıralamaya yalnız kabul edilen (seçilen) takımlar girer; teslim ve jüri de yalnız onlar için
                  filterOptions: ({ data }) => (data?.id ? { event: { equals: data.id }, status: { equals: 'accepted' } } : true),
                },
                { name: 'name', type: 'text', label: 'Serbest isim (takım yoksa)', maxLength: 120, admin: { width: '30%' } },
                { name: 'score', type: 'number', label: 'Puan (isteğe bağlı)', admin: { width: '20%' } },
              ],
            },
          ],
        },
      ],
    },
    // Ziyaretçi istatistikleri (yalnız yöneticiye görünür; DB sütunu yok)
    {
      type: 'collapsible',
      label: '📊 İstatistikler ve kaynak linki',
      admin: { initCollapsed: false },
      fields: [
        { name: 'analyticsSummary', type: 'ui', admin: { components: { Field: '@/components/analytics/EventStatsField#EventStatsField' } } },
      ],
    },
  ],
}
