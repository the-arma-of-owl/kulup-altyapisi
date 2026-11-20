import { APIError, type CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'
import { CONTACT_LABELS, CONTACT_TYPES, validateContact } from '../lib/teams/contact'
import { teamStatusHooks } from '../lib/teams/notify'
import { syncCaptainRoles, validateCaptainChange } from '../lib/teams/captain'
import { validateTeamDesign } from '../lib/teams/design'
import { syncTeamRegistrations } from '../lib/teams/registrations'

/**
 * Takımlar (takım modu açık etkinlikler). Durum: taslak → onay bekliyor → onaylandı (başvuran) → kabul edildi / reddedildi.
 * Onaylandı: içerik uygun, takım sitede "Başvuran takımlar"da görünür. Kabul edildi: yönetim başvuranlar arasından seçti,
 * "Kabul edilen takımlar"da görünür; proje teslimi ve jüri yalnız bunlar için. Reddedilen/taslak/bekleyen sitede görünmez.
 * Kabul edilince üyelerin etkinlik kayıtları (bilet) da kabul olur (lib/teams/registrations). Kabul / ret maili otomatik GİTMEZ; yönetici masaüstü Worker'dan elle gönderir (acceptanceMailSentAt / rejectionMailSentAt işaretlenir).
 * Erken onay: takım dolmadan (taslakken de) onaylanabilir; onaylı ve dolmamış takım sitede "üye arıyor" listelenir.
 * Katılımcılar bu koleksiyona REST ile erişemez; düzenleme /api/takim/* uçlarından, alan beyaz listesiyle yapılır.
 */
export const Teams: CollectionConfig = {
  slug: 'teams',
  labels: { singular: '🏁 Takım', plural: '🏁 Takımlar' },
  admin: {
    group: '🏆 Takım Modu',
    useAsTitle: 'name',
    defaultColumns: ['name', 'event', 'status', 'memberSummary', 'captain', 'updatedAt'],
    listSearchableFields: ['name', 'slug'],
    description: '"Onaylandı" = başvuran takım, sitede "Başvuran takımlar"da görünür. "Kabul edildi" = seçilen takım, "Kabul edilen takımlar"da görünür; teslim ve jüri yalnız bunlar için. Reddedilen takım sitede gizlenir; kabul / ret maili Worker → "Takım kabul / ret"ten elle gönderilir. Dolmamış onaylı/kabul edilmiş takımlar "üye arıyor" listelenir.',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const visible = (status: unknown) => status === 'approved' || status === 'accepted'
        // Sitede ilk görünür olduğu an (onay ya da doğrudan kabul); onaylıdan kabule geçişte değişmez
        if (visible(data.status) && !visible(originalDoc?.status)) data.approvedAt = new Date().toISOString()
        // Yeni bir ret kararı: önceki ret mailinin işareti sıfırlanır (worker yeniden gönderebilsin)
        if (data.status === 'rejected' && originalDoc?.status && originalDoc.status !== 'rejected') data.rejectionMailSentAt = null
        // Yeni bir kabul kararı: önceki kabul mailinin işareti sıfırlanır
        if (data.status === 'accepted' && originalDoc?.status && originalDoc.status !== 'accepted') data.acceptanceMailSentAt = null
        // Panelden düzenlemede de aynı doğrulama (sahiplik denetimi katılımcı ucunda yapılır)
        if (data.design !== undefined && data.design !== null) data.design = validateTeamDesign(data.design)
        // İletişim: panelden düzenlemede de telefon numarası kabul edilmez
        // (değer gönderilmeyen kısmi güncellemelerde alan olduğu gibi kalır)
        const contact = data.contact as { type?: unknown; value?: unknown } | null | undefined
        if (contact && typeof contact.value === 'string' && contact.value.trim()) {
          const checked = validateContact(contact)
          if (checked.ok === false) throw new APIError(checked.reason, 400, undefined, true)
          data.contact = checked.contact
        } else if (contact && (contact.value === '' || contact.value === null) && contact.type) {
          data.contact = { type: null, value: null }
        }
        return data
      },
      // Kaptan değişikliği (devir ya da panel): yeni kaptan takımın kabul edilmiş üyesi olmalı
      validateCaptainChange,
    ],
    // Kabul edilen takımın üyelerinin etkinlik kayıtları (bilet) kendiliğinden kabul olur; kabulden çıkınca geri alınır
    afterChange: [syncCaptainRoles, syncTeamRegistrations, ...teamStatusHooks],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', label: 'Takım adı', required: true, maxLength: 60, admin: { width: '50%' } },
        {
          name: 'status', type: 'select', label: 'Durum', required: true, defaultValue: 'draft', index: true,
          options: [
            { label: '📝 Taslak', value: 'draft' },
            { label: '⏳ Onay bekliyor', value: 'pending' },
            { label: '✅ Onaylandı (başvuran)', value: 'approved' },
            { label: '🏆 Kabul edildi', value: 'accepted' },
            { label: '⛔ Reddedildi', value: 'rejected' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    {
      // Sanal alan (DB sütunu yok): yönetici listesinde kabul edilmiş üye sayısı / üst sınır
      name: 'memberSummary', type: 'text', label: 'Üyeler', virtual: true,
      admin: { readOnly: true, position: 'sidebar', description: 'Kabul edilmiş üye / etkinliğin üst sınırı' },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            // Yalnız panel (yönetici) okumasında hesaplanır; katılımcı uçları bu alanı kullanmaz
            if ((req.user as { collection?: string } | null)?.collection !== 'users' || !data?.id) return undefined
            const { totalDocs } = await req.payload.count({ collection: 'team-memberships', where: { team: { equals: data.id }, status: { equals: 'accepted' } }, overrideAccess: true, req })
            const eventId = typeof data.event === 'object' && data.event ? data.event.id : data.event
            const event = eventId ? await req.payload.findByID({ collection: 'events', id: eventId, depth: 0, overrideAccess: true, req }).catch((): null => null) : null
            const max = Number((event as { teamSettings?: { maxMembers?: number | null } } | null)?.teamSettings?.maxMembers) || 5
            return `${totalDocs}/${max}${totalDocs < max ? ' · üye arıyor' : ' · dolu'}`
          },
        ],
      },
    },
    { name: 'adminNote', type: 'textarea', label: 'Yönetici notu (ret nedeni, kaptana gösterilir)', maxLength: 500 },
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, index: true, label: 'Etkinlik' },
    {
      name: 'captain', type: 'relationship', relationTo: 'participants', required: true, label: 'Kaptan',
      admin: { description: 'Değiştirilebilir: yeni kaptan takımın kabul edilmiş üyesi olmalı; üyelik rolleri kendiliğinden güncellenir.' },
    },
    { name: 'slug', type: 'text', unique: true, index: true, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'inviteCode', type: 'text', unique: true, label: 'Davet kodu', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'approvedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'editCount', type: 'number', label: 'Sayfa düzenleme sayısı', defaultValue: 0, min: 0,
      admin: { position: 'sidebar', description: 'Kaptanın her kaydı (ad, tasarım, logo/kapak) 1 sayılır; 30\'a ulaşınca düzenleme kilitlenir ("yönetimle iletişime geçin"). Haklı bir nedenle açmak için 0 yapın.' },
    },
    {
      name: 'rejectionMailSentAt', type: 'date', label: 'Ret maili gönderildi',
      admin: { readOnly: true, position: 'sidebar', description: 'Worker → Takım kabul / ret ekranından ret maili gönderilince dolar. Yeni ret kararında sıfırlanır.' },
    },
    {
      name: 'acceptanceMailSentAt', type: 'date', label: 'Kabul maili gönderildi',
      admin: { readOnly: true, position: 'sidebar', description: 'Worker → Takım kabul / ret ekranından kabul maili gönderilince dolar. Yeni kabul kararında sıfırlanır.' },
    },
    {
      type: 'collapsible', label: '🎨 Takım sayfası', admin: { initCollapsed: true },
      fields: [
        { name: 'logo', type: 'upload', relationTo: 'team-media', label: 'Logo' },
        { name: 'cover', type: 'upload', relationTo: 'team-media', label: 'Kapak görseli' },
        { name: 'manifesto', type: 'textarea', label: 'Manifesto (sınırlı Markdown)', maxLength: 2000 },
        {
          name: 'design', type: 'json', label: 'Sayfa tasarımı',
          admin: { description: 'Renk, desen, sticker ve GIF yerleşimi. Kaydederken beyaz listeyle doğrulanır.' },
        },
      ],
    },
    {
      name: 'contact', type: 'group', label: '📮 İletişim adresi (kaptan bırakır)',
      admin: { description: 'Telefon numarası kabul edilmez. Sitede yalnız giriş yapmış katılımcılara gösterilir.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'type', type: 'select', label: 'Tür', admin: { width: '40%' },
              options: CONTACT_TYPES.map((value) => ({ label: CONTACT_LABELS[value], value })),
            },
            { name: 'value', type: 'text', label: 'Kullanıcı adı / e-posta', maxLength: 120, admin: { width: '60%' } },
          ],
        },
      ],
    },
    {
      name: 'submission', type: 'group', label: '📦 Proje teslimi',
      fields: [
        { name: 'projectName', type: 'text', label: 'Proje adı', maxLength: 100 },
        { name: 'summary', type: 'textarea', label: 'Amaç / açıklama', maxLength: 3000 },
        { name: 'githubUrl', type: 'text', label: 'GitHub', maxLength: 300 },
        { name: 'demoUrl', type: 'text', label: 'Demo', maxLength: 300 },
        { name: 'videoUrl', type: 'text', label: 'Video', maxLength: 300 },
        { name: 'submittedAt', type: 'date', label: 'Teslim zamanı', admin: { readOnly: true } },
      ],
    },
  ],
}
