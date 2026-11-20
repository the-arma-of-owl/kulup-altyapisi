import path from 'path'
import { lexicalEditor, BlocksFeature, CodeBlock } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { EventRegistrations } from './collections/EventRegistrations'
import { WhatsAppQueue } from './collections/WhatsAppQueue'
import { Certificates } from './collections/Certificates'
import { EmailTemplates } from './collections/EmailTemplates'
import { WhatsAppTemplates } from './collections/WhatsAppTemplates'

import { Members } from './collections/Members'
import { MemberApplications } from './collections/MemberApplications'
import { CoreTeamApplications } from './collections/CoreTeamApplications'
import { BlogPosts } from './collections/BlogPosts'
import { TeamMembers } from './collections/TeamMembers'
import { FAQ } from './collections/FAQ'
import { FAQCategories } from './collections/FAQCategories'
import { ContactMessages } from './collections/ContactMessages'
import { Achievements } from './collections/Achievements'
import { UniversityGuide } from './collections/UniversityGuide'
import { SiteSettings } from './globals/SiteSettings'
import { HallOfFame } from './collections/HallOfFame'
import { LegalDocs } from './globals/LegalDocs'
import { UniversityGuideSettings } from './globals/UniversityGuideSettings'
import { Participants } from './collections/Participants'
import { Teams } from './collections/Teams'
import { TeamMemberships } from './collections/TeamMemberships'
import { TeamScores } from './collections/TeamScores'
import { JurySessions } from './collections/JurySessions'
import { TeamMedia } from './collections/TeamMedia'
import { teamEndpoints } from './endpoints/teams'
import { juryLiveEndpoints } from './endpoints/juryLive'

import { s3Storage } from '@payloadcms/storage-s3'
import { payloadTotp } from 'payload-totp'
import { gateCheckinEndpoint } from './endpoints/gateCheckin'
import { withTotpAccess, withTotpGlobalAccess } from './lib/requireTotp'
import { sendWorkerEmail } from './lib/sendWorkerEmail'
import { parseExtraOrigins } from './lib/origins'
import { observabilityPlugin } from './lib/obs/plugin'
import { applicationOrdinalLine, eventRegistrationOrdinalLine, formClientLine } from './lib/obs/formatters'
import { KULUP, kokenVaryantlari, kulupCmsUrl } from './lib/kulup'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isProduction = process.env.NODE_ENV === 'production'

// ─── Güvenilir Origin Listesi ────────────────────────────────────────────────
// OWASP A02: Güvenlik Yapılandırma Hatası — CORS wildcard (*) kaldırıldı.
// Sadece bilinen frontend domain'leri listeye alındı.
const allowedOrigins = [
  ...(process.env.NEXT_PUBLIC_FRONTEND_URL ? process.env.NEXT_PUBLIC_FRONTEND_URL.split(',').map(u => u.trim()) : []),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
  // kulup.config.json'daki site ve panel adresleri (www'lu ve www'suz)
  ...kokenVaryantlari(KULUP.adresler.site),
  ...kokenVaryantlari(KULUP.adresler.cms),
  !isProduction ? 'http://localhost:3000' : undefined, // Local geliştirme (Frontend)
  !isProduction ? 'http://127.0.0.1:3000' : undefined, // Local geliştirme (Frontend)
  !isProduction ? 'http://localhost:3001' : undefined, // Local geliştirme (Backend Admin)
  !isProduction ? 'http://127.0.0.1:3001' : undefined, // Local geliştirme (Backend Admin)
  !isProduction ? 'http://localhost:5173' : undefined, // Local geliştirme (Desktop Worker Web)
  !isProduction ? 'http://localhost:1420' : undefined, // Local geliştirme (Desktop Worker Tauri)
  'http://localhost:4000', // Desktop Worker AppImage runtime
  ...parseExtraOrigins(process.env.EXTRA_ALLOWED_ORIGINS),
].filter(Boolean) as string[]

// --------------- Database Setup ---------------
// Canlıda her zaman Postgres. Yerelde varsayılan SQLite (data/dev.db); PAYLOAD_DB=postgres + DATABASE_URL ile
// yerelde de Postgres kullanılır.
// ⚠️ Şema "push"u (Payload'un veritabanını koda eşitlemesi) Postgres'te YALNIZ PAYLOAD_PUSH=1 ile açılır:
// push, Payload'un tanımadığı tabloları (ör. analytics_events) SİLER. Canlı veritabanında asla açma; şema
// cms/sql/ dosyalarıyla yönetilir. (Payload push'u NODE_ENV=production iken zaten çalıştırmaz.)
const usePostgres = isProduction || process.env.PAYLOAD_DB === 'postgres'
const allowPostgresPush = !isProduction && process.env.PAYLOAD_PUSH === '1'

async function getDbAdapter() {
  if (usePostgres) {
    const { postgresAdapter } = await import('@payloadcms/db-postgres')
    return postgresAdapter({
      pool: {
        connectionString: process.env.DATABASE_URL || '',
      },
      push: allowPostgresPush,
    })
  } else {
    const { sqliteAdapter } = await import('@payloadcms/db-sqlite')
    return sqliteAdapter({
      client: {
        url: `file:${path.resolve(dirname, '..', 'data', 'dev.db')}`,
      },
      push: true,
    })
  }
}

// --------------- Storage Setup ---------------
function getPlugins() {
  const list = []
  if ((isProduction || process.env.R2_ENDPOINT) && process.env.R2_ACCESS_KEY_ID) {
    list.push(
      s3Storage({
        collections: {
          // Takım görselleri: yalnız yeniden kodlanmış (sharp) çıktı, rastgele ad, ayrı önek
          'team-media': {
            prefix: 'takim',
            generateFileURL: process.env.NEXT_PUBLIC_CDN_URL
              ? ({ filename, prefix }) => `${process.env.NEXT_PUBLIC_CDN_URL!.replace(/\/+$/, '')}/${prefix ? prefix + '/' : ''}${filename}`
              : undefined,
          },
          media: {
            generateFileURL: process.env.NEXT_PUBLIC_CDN_URL
              ? ({ filename, prefix }) => {
                  const url = process.env.NEXT_PUBLIC_CDN_URL;
                  // URL'in sonunda '/' olup olmadığına dikkat edelim
                  const base = url?.endsWith('/') ? url.slice(0, -1) : url;
                  return `${base}/${prefix ? prefix + '/' : ''}${filename}`
                }
              : undefined,
          }
        },
        bucket: process.env.R2_BUCKET || '',
        config: {
          endpoint: process.env.R2_ENDPOINT || '',
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
          },
          region: 'us-east-1',
          forcePathStyle: true,
        },
      })
    )
  }
  list.push(
    payloadTotp({
      collection: 'users',
      disableAccessWrapper: true, // Önemli: Bu kapatılmazsa eklenti tüm public API erişimini (iletişim formu, etkinlikler vb.) engeller!
      forceSetup: true,
    })
  )
  // Gözlem + yönetim sertleştirme: payloadTotp'tan SONRA (TOTP uçlarını sarar)
  list.push(observabilityPlugin())
  return list
}

const db = await getDbAdapter()
const plugins = getPlugins()

const collectionsList = [
  Users,
  Media,
  Events,
  EventRegistrations,
  WhatsAppQueue,
  Certificates,
  EmailTemplates,
  WhatsAppTemplates,

  Members,
  MemberApplications,
  CoreTeamApplications,
  BlogPosts,
  TeamMembers,
  FAQCategories,
  FAQ,
  ContactMessages,
  Achievements,
  UniversityGuide,
  HallOfFame,
  // Takım modu (hackathon/yarışma)
  Participants,
  Teams,
  TeamMemberships,
  TeamScores,
  TeamMedia,
  JurySessions,
];

import { escapeTelegramHtml, sendTelegramMessage } from './lib/telegram';
import { withSiteRevalidate } from './lib/siteRevalidate';

collectionsList.forEach((collection: any) => {
  // certificates / wa-queue: toplu gönderimde her kayıt için genel log gitmesin (ayrıntılı bildirim lib/obs'te)
  if (collection.slug === 'media' || collection.slug === 'certificates' || collection.slug === 'wa-queue') return;
  // Takım modu: katılımcı işlemleri genel "Sistem Güncellemesi" üretmez; kendi bildirimleri lib/teams/notify.ts'te
  if (['participants', 'teams', 'team-memberships', 'team-scores', 'team-media', 'jury-sessions'].includes(collection.slug)) return;

  collection.hooks = collection.hooks || {};

  // ─── Özel Bildirimler: Üyelik Başvurusu ───────────────────────────────────
  if (collection.slug === 'member-applications') {
    collection.hooks.afterChange = [
      ...(collection.hooks.afterChange || []),
      async ({ doc, operation, req }: any) => {
        if (operation !== 'create') return doc;
        const msg = `🆕 <b>Yeni Üyelik Başvurusu!</b>${await applicationOrdinalLine(req, 'member-applications')}

👤 <b>Ad Soyad:</b> ${escapeTelegramHtml(doc.fullName || '-')}
📧 <b>E-posta:</b> ${escapeTelegramHtml(doc.email || '-')}
📞 <b>Telefon:</b> ${escapeTelegramHtml(doc.phone || '-')}
🏫 <b>Bölüm:</b> ${escapeTelegramHtml(doc.department || '-')}
📅 <b>Sınıf:</b> ${escapeTelegramHtml(doc.year || '-')}
✅ <b>KVKK:</b> ${doc.kvkkApproved ? 'Onaylandı' : 'Onaylanmadı'}
✅ <b>Gizlilik Sözleşmesi:</b> ${doc.privacyPolicyApproved ? 'Onaylandı' : 'Onaylanmadı'}${formClientLine(req)}`;
        await sendTelegramMessage(msg, { topic: 'applications' });
        return doc;
      }
    ];

    collection.hooks.afterDelete = [
      ...(collection.hooks.afterDelete || []),
      async ({ id }: any) => {
        await sendTelegramMessage(`🗑️ <b>Üyelik Başvurusu Silindi</b>\nID: ${id}`, { topic: 'system' });
      }
    ];
    return;
  }

  // ─── Özel Bildirimler: Etkinlik Kaydı ──────────────────────────────────────
  if (collection.slug === 'event-registrations') {
    // Etkinlik kayıtlarının afterChange hook'u zaten koleksiyonda tanımlı.
    // Sadece create işleminde bildirim ekle (mevcut hook'u bozmadan).
    const existingAfterChange = collection.hooks.afterChange || [];
    collection.hooks.afterChange = [
      ...existingAfterChange,
      async ({ doc, operation, req }: any) => {
        if (operation !== 'create') return doc;
        // Etkinlik adını çek
        let eventTitle = '-';
        try {
          if (doc.event) {
            const eventId = typeof doc.event === 'object' ? doc.event?.id : doc.event;
            const event = await req.payload.findByID({ collection: 'events', id: eventId });
            eventTitle = event?.title || '-';
          }
        } catch {}

        // Dinamik cevapları formatla
        let dynamicStr = '';
        if (Array.isArray(doc.dynamicAnswers)) {
          if (doc.dynamicAnswers.length > 0) {
            dynamicStr = '\n📋 <b>Form Cevapları:</b>\n' + doc.dynamicAnswers
              .filter((item: any) => item.question && item.answer)
              .map((item: any) => `  • ${escapeTelegramHtml(item.question)}: ${escapeTelegramHtml(item.answer)}`)
              .join('\n');
          }
        }

        const ordinal = await eventRegistrationOrdinalLine(req, typeof doc.event === 'object' ? doc.event?.id : doc.event);
        const msg = `🎟️ <b>Yeni Etkinlik Kaydı!</b>${ordinal}

🎪 <b>Etkinlik:</b> ${escapeTelegramHtml(eventTitle)}
👤 <b>Ad Soyad:</b> ${escapeTelegramHtml(doc.fullName || '-')}
📧 <b>E-posta:</b> ${escapeTelegramHtml(doc.email || '-')}
📞 <b>Telefon:</b> ${escapeTelegramHtml(doc.phone || '-')}
🏫 <b>Bölüm:</b> ${escapeTelegramHtml(doc.department || '-')}${dynamicStr}
✅ <b>KVKK:</b> ${doc.kvkkApproved ? 'Onaylandı' : 'Onaylanmadı'}
✅ <b>Gizlilik Sözleşmesi:</b> ${doc.privacyPolicyApproved ? 'Onaylandı' : 'Onaylanmadı'}${formClientLine(req)}`;
        await sendTelegramMessage(msg, { topic: 'applications' });
        return doc;
      }
    ];

    collection.hooks.afterDelete = [
      ...(collection.hooks.afterDelete || []),
      async ({ req, id }: any) => {
        if (req?.user) {
          await sendTelegramMessage(`🗑️ <b>Etkinlik Kaydı Silindi</b>\nKullanıcı: ${escapeTelegramHtml(req.user.email)}\nID: ${id}`, { topic: 'system' });
        }
      }
    ];
    return;
  }

  // ─── Özel Bildirimler: Core Team Başvurusu ─────────────────────────────────
  if (collection.slug === 'core-team-applications') {
    collection.hooks.afterChange = [
      ...(collection.hooks.afterChange || []),
      async ({ doc, operation, req }: any) => {
        if (operation !== 'create') return doc;
        const msg = `⭐ <b>Yeni Core Team Başvurusu!</b>${await applicationOrdinalLine(req, 'core-team-applications')}

👤 <b>Ad Soyad:</b> ${escapeTelegramHtml(doc.fullName || '-')}
📧 <b>E-posta:</b> ${escapeTelegramHtml(doc.email || '-')}
📞 <b>Telefon:</b> ${escapeTelegramHtml(doc.phone || '-')}
🏫 <b>Bölüm:</b> ${escapeTelegramHtml(doc.department || '-')}
🎓 <b>Sınıf:</b> ${escapeTelegramHtml(doc.grade || '-')}
🌍 <b>Memleket:</b> ${escapeTelegramHtml(doc.hometown || '-')}
🎯 <b>Alan:</b> ${escapeTelegramHtml(doc.area || '-')}
🔗 <b>LinkedIn / Portfolio:</b> ${escapeTelegramHtml(doc.portfolioUrl || '-')}
💻 <b>GitHub:</b> ${escapeTelegramHtml(doc.githubUrl || '-')}
📝 <b>Motivasyon:</b>
<i>${escapeTelegramHtml(doc.motivationLetter || '-')}</i>

✅ <b>KVKK:</b> ${doc.kvkkApproved ? 'Onaylandı' : 'Onaylanmadı'}
✅ <b>Gizlilik:</b> ${doc.privacyPolicyApproved ? 'Onaylandı' : 'Onaylanmadı'}${formClientLine(req)}`;
        await sendTelegramMessage(msg, { topic: 'applications' });
        return doc;
      }
    ];

    collection.hooks.afterDelete = [
      ...(collection.hooks.afterDelete || []),
      async ({ id }: any) => {
        await sendTelegramMessage(`🗑️ <b>Core Team Başvurusu Silindi</b>\nID: ${id}`, { topic: 'system' });
      }
    ];
    return;
  }

  // ─── Özel Bildirimler: İletişim Mesajı ─────────────────────────────────────
  // Siteden gelen mesajda req.user yok; genel log yalnız panel işlemlerini bildirdiği için ayrı kanca
  if (collection.slug === 'contact-messages') {
    collection.hooks.afterChange = [
      ...(collection.hooks.afterChange || []),
      async ({ doc, operation, req }: any) => {
        if (operation !== 'create' || req?.user) return doc;
        const msg = `✉️ <b>Yeni İletişim Mesajı</b>

👤 <b>Ad Soyad:</b> ${escapeTelegramHtml(doc.fullName || '-')}
📧 <b>E-posta:</b> ${escapeTelegramHtml(doc.email || '-')}
📌 <b>Konu:</b> ${escapeTelegramHtml(doc.subject || '-')}
💬 <b>Mesaj:</b>
<i>${escapeTelegramHtml(doc.message || '-')}</i>${formClientLine(req)}`;
        await sendTelegramMessage(msg, { topic: 'applications' });
        return doc;
      }
    ];

    collection.hooks.afterDelete = [
      ...(collection.hooks.afterDelete || []),
      async ({ id }: any) => {
        await sendTelegramMessage(`🗑️ <b>İletişim Mesajı Silindi</b>\nID: ${id}`, { topic: 'system' });
      }
    ];
    return;
  }

  // ─── Genel Log: Diğer Koleksiyonlar ────────────────────────────────────────
  collection.hooks.afterChange = [
    ...(collection.hooks.afterChange || []),
    async ({ doc, req, operation }: any) => {
      if (req?.user) {
        const action = operation === 'create' ? 'yeni bir kayıt ekledi' : 'bir kaydı güncelledi';
        const msg = `📝 <b>Sistem Güncellemesi</b>\nKullanıcı: ${escapeTelegramHtml(req.user.email || 'Admin')}\nKoleksiyon: ${collection.slug}\nİşlem: ${action}\nKayıt ID: ${doc.id}`;
        await sendTelegramMessage(msg, { topic: 'system' });
      }
      return doc;
    }
  ];

  collection.hooks.afterDelete = [
    ...(collection.hooks.afterDelete || []),
    async ({ req, id }: any) => {
      if (req?.user) {
        const msg = `🗑️ <b>Kayıt Silindi</b>\nKullanıcı: ${escapeTelegramHtml(req.user.email || 'Admin')}\nKoleksiyon: ${collection.slug}\nSilinen ID: ${id}`;
        await sendTelegramMessage(msg, { topic: 'system' });
      }
    }
  ];
});

import { Block } from 'payload'

const SpoilerBlock: Block = {
  slug: 'Spoiler',
  labels: {
    singular: 'Spoiler Kutusu',
    plural: 'Spoiler Kutuları',
  },
  fields: [
    {
      name: 'summary',
      type: 'text',
      label: 'Başlık / Özet (Tıklanabilir Kısım)',
      required: true,
      defaultValue: 'Detayları Göster',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Gizli İçerik',
      required: true,
      editor: lexicalEditor(),
    },
  ],
}

const customLanguages = {
  plaintext: 'Düz Metin (Plain Text)',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  bash: 'Bash / Shell',
  json: 'JSON',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  sql: 'SQL',
}

export default buildConfig({
  onInit: async (payload) => {
    try {
      const settings = await payload.findGlobal({ slug: 'site-settings' })
      if (!settings || !settings.contactEmail) {
        await payload.updateGlobal({
          slug: 'site-settings',
          data: {
            activeMembers: 0,
            contactEmail: KULUP.eposta.iletisim,
          }
        })
        payload.logger.info('Site settings initialized.')
      }
    } catch (err) {
      payload.logger.warn('Could not initialize site settings. It may not exist in DB yet.')
    }

    try {
      const legalDocs = await payload.findGlobal({ slug: 'legal-docs' })
      if (!legalDocs || !legalDocs.kvkk || !legalDocs.gizlilik) {
        await payload.updateGlobal({
          slug: 'legal-docs',
          data: {
            kvkk: {
              root: {
                type: "root",
                children: [
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "1. Veri Sorumlusu" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: `${KULUP.tamAd} (${KULUP.kisaAd}), 6698 sayılı Kişisel Verilerin Korunması Kanunu (\"KVKK\") kapsamında veri sorumlusu sıfatıyla hareket etmektedir.` }]
                  },
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "2. İşlenen Kişisel Veriler ve Amacı" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: "Topluluğumuz faaliyetleri kapsamında etkinliklerimizde isim, soyisim, iletişim bilgileri ile birlikte fotoğraf, video ve ses kayıtlarınız alınabilmektedir. Bu veriler etkinlik yönetimi ve topluluk faaliyetlerinin resmi sosyal medya hesaplarımızda (Instagram vb.) ve web sitemizde yayınlanması amacıyla işlenmektedir." }]
                  },
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "3. Görsel ve İşitsel Verilerin (Medya) Kullanımı" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: "Etkinliklerimize katılarak, etkinlik esnasında çekilen fotoğraf ve videolarınızın topluluğumuzun sosyal medya mecralarında ve web sitesinde paylaşılmasına açık rıza göstermiş sayılırsınız. Eğer paylaşılan herhangi bir görselinizden veya videonuzdan rahatsızlık duyarsanız, web sitemizin İletişim bölümü üzerinden bizimle irtibata geçerek ilgili içeriğin kaldırılmasını talep edebilirsiniz." }]
                  },
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "4. Haklarınız ve İletişim" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: "KVKK'nın 11. maddesi kapsamındaki haklarınızı kullanmak ve verilerinizin silinmesini talep etmek için web sitemizdeki İletişim sayfamızı kullanabilirsiniz." }]
                  }
                ]
              }
            },
            gizlilik: {
              root: {
                type: "root",
                children: [
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "1. Genel ve Etkinlik Medya İzni" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: `${KULUP.kisaAd} etkinliklerine katılım gösterdiğinizde, etkinlik sırasında alınan fotoğraf ve video kayıtlarının kulübümüzün sosyal medya hesaplarında ve web sitemizde yayınlanabileceğini kabul etmiş olursunuz. Medya içeriklerinde yer almak istemiyorsanız veya rahatsız olduğunuz bir içerik varsa, doğrudan sitemizin İletişim sayfasından talebinizi iletebilirsiniz.` }]
                  },
                  {
                    type: "heading",
                    tag: "h2",
                    children: [{ type: "text", text: "2. Toplanan Diğer Bilgiler" }]
                  },
                  {
                    type: "paragraph",
                    children: [{ type: "text", text: "Web sitemiz üzerinden yapılan başvurular sırasında sağladığınız kişisel bilgiler yalnızca topluluk süreçlerinin yönetimi için kullanılır ve 3. şahıslarla paylaşılmaz." }]
                  }
                ]
              }
            }
          }
        })
        payload.logger.info('Legal Docs initialized.')
      }
    } catch (err) {
      payload.logger.warn('Could not initialize legal docs.')
    }
  },
  serverURL: kulupCmsUrl(),
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ` - ${KULUP.kisaAd} Panel`,
      description: `${KULUP.tamAd} yönetim paneli`,
    },
    // Kapı QR okuyucu: menü linki + /admin/kapi ekranı
    components: {
      graphics: { Logo: '@/components/brand/Logo#Logo', Icon: '@/components/brand/Icon#Icon' },
      header: ['@/components/StagingBanner#StagingBanner'],
      afterNavLinks: ['@/components/gate/GateNavLink#GateNavLink', '@/components/analytics/StatsNavLink#StatsNavLink'],
      views: {
        gate: { Component: '@/components/gate/GateView#GateView', path: '/kapi' },
        stats: { Component: '@/components/analytics/StatsView#StatsView', path: '/istatistikler' },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: collectionsList.map((c: any) => withSiteRevalidate(c, 'collection')).map(withTotpAccess),
  endpoints: [sendWorkerEmail, gateCheckinEndpoint, ...teamEndpoints, ...juryLiveEndpoints],
  globals: [
    SiteSettings,
    LegalDocs,
    UniversityGuideSettings,
  ].map((g: any) => withSiteRevalidate(g, 'global')).map(withTotpGlobalAccess),
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      BlocksFeature({
        blocks: [
          CodeBlock({
            languages: customLanguages
          }),
          SpoilerBlock,
        ],
      }),
    ],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db,
  plugins,
  upload: (!isProduction || !process.env.R2_ACCESS_KEY_ID) ? {
    staticDir: path.resolve(dirname, '..', 'media'),
  } as any : undefined,

  // ─── CORS & CSRF Koruması ─────────────────────────────────────────────────
  // OWASP A02: Wildcard CORS kaldırıldı — sadece allowedOrigins'e izin verildi.
  // OWASP A05: CSRF token koruması aktif.
  cors: allowedOrigins,
  csrf: allowedOrigins,

  // ─── Rate Limiting ────────────────────────────────────────────────────────
  // NOT: Payload CMS v3'te rateLimit doğrudan buildConfig'de desteklenmiyor.
  // Rate limiting frontend middleware.ts'de (Next.js) uygulandı.
  // Production için Vercel'in yerleşik DDoS koruması + frontend middleware yeterli.
  // Daha gelişmiş koruma için: Cloudflare WAF veya nginx rate limiting önerilebilir.
})
