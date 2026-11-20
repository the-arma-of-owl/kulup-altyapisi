import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrEditor } from '../lib/access'
import { hasVerifiedTotp } from '../lib/requireTotp'

/**
 * Members — Kulüp üye kayıtları.
 *
 * KRİTİK GÜVENLİK AÇIĞI (DÜZELTİLDİ):
 * Önceki hali: read: () => true (yorum: "Demo purpose")
 * Bu yapıyla tüm üye listesi (ad, email, telefon, bölüm) herkes tarafından
 * erişilebiliyordu. 10.000 kişilik CSV dump anonim olarak indirilebiliyordu.
 * Bu ciddi bir KVKK ihlali.
 *
 * Düzeltme (OWASP A01, KVKK):
 * - read: Sadece admin/editör
 * - create/update/delete: Sadece admin
 * - CSV export: Auth kontrolü eklendi
 */
export const Members: CollectionConfig = {
  slug: 'members',
  labels: {
    singular: '👨‍💻 Üye',
    plural: '👨‍💻 Aktif Üyeler',
  },
  admin: {
    group: '🤝 Topluluk',
    useAsTitle: 'fullName',
    components: {
      beforeListTable: [{ path: '@/components/ExportButton#ExportButton', clientProps: { collectionSlug: 'members' } }],
    },
  },
  endpoints: [
    {
      path: '/export-csv',
      method: 'get',
      handler: async (req) => {
        // KRİTİK FİX: Auth kontrolü — anonim CSV dump'ı önlüyor
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
          collection: 'members',
          limit: 10000,
        })
        const docs = result.docs
        const csvHeader = 'ID,Ad Soyad,E-Posta,Telefon,Bölüm,Sınıf,Durum\n'
        const csvRows = docs.map((doc: any) => {
          // CSV injection koruması
          const safe = (v: unknown) => String(v ?? '').replace(/[\r\n"]/g, ' ')
          return `"${doc.id}","${safe(doc.fullName)}","${safe(doc.email)}","${safe(doc.phone)}","${safe(doc.department)}","${safe(doc.year)}","${safe(doc.status)}"`
        }).join('\n')
        return new Response('\uFEFF' + csvHeader + csvRows, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="members.csv"',
          },
        })
      },
    },
  ],
  access: {
    read: isAdminOrEditor,   // KİŞİSEL VERİ — sadece admin/editör
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
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
      unique: true,
    },
    {
      name: 'phone',
      type: 'text',
      maxLength: 20,
    },
    {
      name: 'department',
      type: 'text',
      maxLength: 200,
    },
    {
      name: 'year',
      type: 'text',
      maxLength: 20,
    },
    {
      name: 'interests',
      type: 'array',
      fields: [
        {
          name: 'interest',
          type: 'text',
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Aktif', value: 'active' },
        { label: 'Pasif', value: 'inactive' },
        { label: 'Silinme Talep Edildi', value: 'deletion_requested' },
      ],
      defaultValue: 'active',
    },
  ],
}
