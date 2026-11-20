import { rejectDuplicateSubmission } from '../lib/duplicateGuard'
import { sendAutoReply, autoReplyPurposes } from '../lib/autoReply'
import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor, isAdminOrInternal, fieldIsAdmin } from '../lib/access'
import { hasVerifiedTotp } from '../lib/requireTotp'

/**
 * CoreTeamApplications — Çekirdek ekip başvuruları.
 *
 * Kişisel veri: okuma yalnız admin; oluşturma site sunucusu (iç anahtar) veya admin.
 * CV alanı 2026-10-15'te kaldırıldı (site formu hiç göndermiyordu; canlıda 11 kaydın hiçbirinde CV yoktu).
 * Canlı DB'deki boş cv_id sütunu zararsız; istenirse ayrı SQL ile düşürülür.
 */
export const CoreTeamApplications: CollectionConfig = {
  slug: 'core-team-applications',
  labels: {
    singular: '⭐ Yönetim Başvurusu',
    plural: '⭐ Core Team Başvuruları',
  },
  admin: {
    group: '🤝 Topluluk',
    useAsTitle: 'fullName',
    components: {
      beforeListTable: [{ path: '@/components/ExportButton#ExportButton', clientProps: { collectionSlug: 'core-team-applications' } }],
    },
  },
  endpoints: [
    {
      path: '/export-csv',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const roles = (req.user as any)?.roles ?? []
        if (!hasVerifiedTotp(req.user) || !roles.includes('admin')) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const result = await req.payload.find({
          collection: 'core-team-applications',
          limit: 10000,
        })
        const docs = result.docs
        const csvHeader = 'ID,Ad Soyad,E-Posta,Telefon,Bölüm,Sınıf,Memleket,Alan,Durum\n'
        const csvRows = docs.map((doc: any) => {
          const safe = (v: unknown) => String(v ?? '').replace(/[\r\n"]/g, ' ')
          return `"${doc.id}","${safe(doc.fullName)}","${safe(doc.email)}","${safe(doc.phone)}","${safe(doc.department)}","${safe(doc.grade)}","${safe(doc.hometown)}","${safe(doc.area)}","${safe(doc.status)}"`
        }).join('\n')
        return new Response('\uFEFF' + csvHeader + csvRows, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="core-team-applications.csv"',
          },
        })
      },
    },
  ],
  access: {
    read: isAdminOrEditor,   // motivasyon mektupları ve iletişim bilgileri gizli
    create: isAdminOrInternal, // Sadece site sunucusu veya admin oluşturabilir
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [rejectDuplicateSubmission({ collection: 'core-team-applications', message: 'Bu e-posta veya telefonla son 24 saatte zaten Core Team başvurusu yapılmış. Başvurun alındı; tekrar göndermene gerek yok.' })],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === 'create') await sendAutoReply(req, autoReplyPurposes.coreTeam, doc)
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
      label: 'Telefon Numarası',
    },
    {
      name: 'department',
      type: 'text',
      required: false,
      label: 'Bölüm',
    },
    {
      name: 'grade',
      type: 'text',
      required: false,
      label: 'Sınıf',
    },
    {
      name: 'hometown',
      type: 'text',
      required: false,
      label: 'Memleket',
      admin: {
        description: 'Aktiflik değerlendirmesi için',
      },
    },
    {
      name: 'area',
      type: 'text',
      required: false,
      label: 'Katılmak İstenen Alan',
    },
    {
      name: 'portfolioUrl',
      type: 'text',
      maxLength: 500,
    },
    {
      name: 'githubUrl',
      type: 'text',
      maxLength: 500,
    },
    {
      name: 'motivationLetter',
      type: 'textarea',
      required: false,
      maxLength: 5000,
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
      name: 'status',
      type: 'select',
      options: [
        { label: 'Yeni', value: 'new' },
        { label: 'İnceleniyor', value: 'reviewing' },
        { label: 'Mülakat', value: 'interview' },
        { label: 'Kabul Edildi', value: 'accepted' },
        { label: 'Reddedildi', value: 'rejected' },
      ],
      defaultValue: 'new',
      access: {
        create: fieldIsAdmin,
        update: fieldIsAdmin,
      },
    },
  ],
}
