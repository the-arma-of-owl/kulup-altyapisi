import { rejectDuplicateSubmission } from '../lib/duplicateGuard'
import { sendAutoReply, autoReplyPurposes } from '../lib/autoReply'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrInternal, fieldIsAdmin, fieldIsAdminOrEditor } from '../lib/access'
import { randomBytes } from 'crypto'
import { hasVerifiedTotp } from '../lib/requireTotp'
import { KULUP } from '../lib/kulup'

/** CSV hücresi: tırnak/satır sonu temizliği + formül enjeksiyonu koruması (telefon gibi "+90…" sayılar olduğu gibi kalır). */
export function csvText(value: unknown, keepQuotes = false): string {
  let text = String(value ?? '').replace(/[\r\n]/g, ' ')
  text = keepQuotes ? text.replace(/"/g, '""') : text.replace(/"/g, ' ')
  if (/^[=+\-@\t]/.test(text) && !/^\+?\d[\d\s]*$/.test(text)) text = `'${text}`
  return text
}

export const EventRegistrations: CollectionConfig = {
  slug: 'event-registrations',
  labels: {
    singular: '🎟️ Kayıt',
    plural: '🎟️ Etkinlik Kayıtları',
  },
  hooks: {
    // Kayıt silinince ona bağlı sertifikalar iptal edilir (aksi halde bağ NULL olur ve sertifika "geçerli" görünmeye devam ederdi;
    // ör. test kayıtları canlıya geçişte silinir). Aynı işlemde: silme başarısız olursa iptal de geri alınır.
    beforeDelete: [async ({ id, req }) => {
      await req.payload.update({ collection: 'certificates', where: { registration: { equals: id } }, data: { revoked: true } as never,
        overrideAccess: true, req, depth: 0 })
    }],
    beforeValidate: [rejectDuplicateSubmission({ collection: 'event-registrations', checkPhone: false, message: 'Bu etkinliğe bu e-posta adresiyle zaten kayıt yapılmış. Kaydın onay mailini kontrol et; sorun varsa iletişim sayfasından bize yaz.' })],
    beforeChange: [
      async ({ data, req, operation }) => {
        // Eğer yeni kayıt oluşturuluyorsa ve etkinlik test modundaysa isTest bayrağını true yap
        if (operation === 'create' && !isAdmin({ req } as never)) data.isTest = false
        if (operation === 'create' && data.event) {
          try {
            const event = await req.payload.findByID({
              collection: 'events',
              id: data.event as string,
            });
            if (event && event.mode === 'test') {
              data.isTest = true;
            }
          } catch (err) {
            console.error('Etkinlik modu kontrol edilirken hata:', err);
          }
        }

        // Site (iç anahtar) yalnız başvuru alanlarını yazabilir: durum, bilet, yoklama ve test bayrağı sunucuda belirlenir.
        // Anahtar sızsa bile "kabul edilmiş" sahte kayıt / geçerli bilet üretilemez.
        if (operation === 'create' && !isAdmin({ req } as never)) {
          data.status = 'pending'
          data.attended = false
          data.checkedInAt = null
          data.gateFields = null
          data.ticketToken = randomBytes(8).toString('hex')
          if (data.isTest !== true) data.isTest = false
        }

        // Bilet token oluşturma (eğer yoksa)
        if (!data.ticketToken) {
          data.ticketToken = randomBytes(8).toString('hex');
        }

        return data;
      }
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create' || doc.isTest) return
        const eventId = typeof doc.event === 'object' ? doc.event?.id : doc.event
        const event = eventId
          ? await req.payload.findByID({ collection: 'events', id: eventId, depth: 0, overrideAccess: true, req }).catch((): null => null)
          : null
        await sendAutoReply(req, autoReplyPurposes.event, doc, event)
      },
      async ({ doc, previousDoc, operation, req }) => {
          // WAQueue geçici olarak devre dışı (DB Migration hatası nedeniyle post-mortem'e göre kapatıldı)
          /*
          if (doc.phone) {
            try {
              const eventId = typeof doc.event === 'object' ? doc.event?.id : doc.event;
              let eventTitle = '';
              let customTemplate = '';
              
              if (eventId) {
                const event = await req.payload.findByID({
                  collection: 'events',
                  id: eventId as string,
                });
                eventTitle = event?.title || '';
                customTemplate = (event as any)?.whatsappMessageTemplate || '';
              }

              let finalMessage = '';
              if (customTemplate) {
                finalMessage = customTemplate
                  .replace(/\[adSoyad\]|\{\{name\}\}/g, String(doc.fullName || ''))
                  .replace(/\[eposta\]/g, String(doc.email || ''))
                  .replace(/\[telefon\]/g, String(doc.phone || ''))
                  .replace(/\[bolum\]/g, String(doc.department || ''))
                  .replace(/\{\{event\}\}/g, String(eventTitle || ''));
              } else {
                finalMessage = `Merhaba ${doc.fullName}, ${KULUP.kisaAd} (${eventTitle}) etkinlik başvurunuz onaylanmıştır! Detaylı bilgilendirme için gruplarımızı takip etmeyi unutmayın.`;
              }

              await req.payload.create({
                collection: 'wa-queue' as any,
                data: {
                  to: doc.phone,
                  message: finalMessage,
                  status: 'pending',
                }
              })
            } catch (err) {
              console.error('WAQueue ekleme hatası:', err)
            }
          }
          */
      }
    ]
  },
  admin: {
    group: '🎓 Faaliyetler',
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'email', 'event', 'department', 'status', 'attended', 'createdAt'],
    description: 'Etkinlik katılım başvuruları.',
    components: {
      beforeListTable: [{ path: '@/components/ExportButton#ExportButton', clientProps: { collectionSlug: 'event-registrations' } }],
    },
  },
  endpoints: [
    {
      path: '/export-csv',
      method: 'get',
      handler: async (req) => {
        // KRİTİK FİX: CSV export artık auth kontrolü yapıyor
        if (!req.user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Sadece admin veya editör export yapabilir
        const roles = (req.user as any)?.roles ?? []
        if (!hasVerifiedTotp(req.user) || !roles.includes('admin')) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let queryWhere: any;
        try {
           // Payload 3.x: req.query query parametrelerini içerir (qs kütüphanesi formatında parse edilmiş)
           queryWhere = req.query?.where || undefined;
        } catch(e) {}

        const result = await req.payload.find({
          collection: 'event-registrations',
          limit: 10000,
          where: queryWhere,
        })
        const docs = result.docs

        // Dinamik soruların tümünü (unique) topla
        const dynamicQuestionsSet = new Set<string>();
        docs.forEach((doc: any) => {
          if (Array.isArray(doc.dynamicAnswers)) {
            doc.dynamicAnswers.forEach((item: any) => {
              if (item.question) dynamicQuestionsSet.add(item.question);
            });
          }
        });
        const dynamicQuestions = Array.from(dynamicQuestionsSet);

        const dynamicHeaders = dynamicQuestions.map(q => `"${csvText(q, true)}"`).join(',');
        const csvHeader = `ID,Ad Soyad,E-Posta,Telefon,Bölüm,Durum,Etkinlik_ID${dynamicHeaders ? ',' + dynamicHeaders : ''}\n`

        const csvRows = docs.map((doc: any) => {
          // CSV koruması: satır sonu/tırnak temizlenir; =, +, -, @ ile başlayan hücre formül sayılmasın diye ' ile başlar
          const safeName = csvText(doc.fullName)
          const safeEmail = csvText(doc.email)
          const safePhone = csvText(doc.phone)
          const safeDepartment = csvText(doc.department)
          const safeStatus = csvText(doc.status)
          const eventId = typeof doc.event === 'object' ? doc.event?.id : doc.event

          let row = `"${doc.id}","${safeName}","${safeEmail}","${safePhone}","${safeDepartment}","${safeStatus}","${eventId}"`;

          if (dynamicQuestions.length > 0) {
            const docAnswers = new Map<string, string>();
            if (Array.isArray(doc.dynamicAnswers)) {
              doc.dynamicAnswers.forEach((item: any) => {
                if (item.question) docAnswers.set(item.question, String(item.answer ?? ''));
              });
            }
            
            const dynamicRowData = dynamicQuestions.map(q => {
              const val = docAnswers.get(q) || '';
              return `"${csvText(val, true)}"`;
            }).join(',');
            
            row += `,${dynamicRowData}`;
          }

          return row;
        }).join('\n')
        return new Response('\uFEFF' + csvHeader + csvRows, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="event-registrations.csv"',
          },
        })
      },
    }
    // Eski /verify-certificate/:token ucu 2026-10-15'te kaldırıldı (S21: onaysız kayıtların adını dönüyordu;
    // bilet jetonunu sertifika bağlantısında açığa veriyordu). Doğrulama: certificates/verify?code=
  ],
  access: {
    read: isAdminOrInternal,
    create: isAdminOrInternal,
    // Kapı girişi CMS'teki okuyucudan (yönetici / kapı hesabı) yapılır; iç anahtarın güncelleme yetkisi yok
    update: isAdmin,
    delete: isAdmin,         // Sadece admin silebilir
  },
  fields: [
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: '⏳ Beklemede', value: 'pending' },
        { label: '✅ Kabul Edildi', value: 'accepted' },
        { label: '❌ Reddedildi', value: 'rejected' },
        { label: '📋 Bekleme Listesi', value: 'waitlist' },
      ],
      defaultValue: 'pending',
      admin: { position: 'sidebar' },
      // Durum değişikliğini sadece admin yapabilir
      access: {
        update: fieldIsAdmin,
      },
    },
    {
      name: 'attended',
      type: 'checkbox',
      label: 'Katıldı (Yoklama)',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'checkedInAt',
      type: 'date',
      label: 'Kapı giriş zamanı',
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'gateFields',
      type: 'json',
      label: 'Kapıda girilen alanlar',
      admin: { position: 'sidebar', readOnly: true },
      access: {
        update: fieldIsAdmin,
      },
    },
    {
      name: 'certificateType',
      type: 'select',
      label: 'Sertifika Türü',
      options: [
        { label: 'Katılım', value: 'participation' },
        { label: 'Başarı', value: 'achievement' },
        { label: 'Teşekkür', value: 'appreciation' },
      ],
      defaultValue: 'participation',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'isTest',
      type: 'checkbox',
      label: 'Test Kaydı',
      defaultValue: false,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'applicationStage',
      type: 'select',
      label: 'Başvuru Yapılan Aşama',
      options: [
        { label: '🟢 Normal Alım', value: 'normal' },
        { label: '🟡 Yedek/Geç Alım', value: 'late' },
      ],
      defaultValue: 'normal',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'ticketToken',
      type: 'text',
      admin: { position: 'sidebar', readOnly: true },
      unique: true,
      index: true,
    },
    // --- Kişisel Bilgiler ---
    {
      name: 'fullName',
      type: 'text',
      required: true,
      label: 'Ad Soyad',
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
      label: 'Telefon Numarası',
      maxLength: 20,
    },
    {
      name: 'department',
      type: 'text',
      label: 'Bölüm',
      maxLength: 200,
    },
    // --- Etkinliğe Özel Alanlar ---
    {
      name: 'dynamicAnswers',
      type: 'array',
      label: 'Dinamik Form Cevapları',
      admin: {
        description: 'Kullanıcının etkinliğe özel sorulara verdiği cevaplar.',
      },
      fields: [
        {
          name: 'question',
          type: 'text',
          label: 'Soru',
        },
        {
          name: 'answer',
          type: 'textarea',
          label: 'Cevap',
        }
      ]
    },
    {
      name: 'kvkkApproved',
      type: 'checkbox',
      required: false, // optional DB
      defaultValue: false,
    },
    {
      name: 'privacyPolicyApproved',
      type: 'checkbox',
      required: false, // optional DB
      defaultValue: false,
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Admin Notları',
      admin: { position: 'sidebar' },
      access: {
        create: fieldIsAdmin,
        update: fieldIsAdmin,
        read: fieldIsAdminOrEditor,
      },
    },
  ],
}
