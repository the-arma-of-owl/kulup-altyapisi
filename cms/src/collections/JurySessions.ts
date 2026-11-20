import type { CollectionConfig } from 'payload'
import { isAdmin } from '../lib/access'

/**
 * Canlı jüri oturumu (etkinlik başına bir). Yönetici burada etkinliği ve oturumu yönetecek "sunucu" katılımcı hesabını
 * seçer; sunucu sitedeki jüri panelinden oturumu başlatır, salon ekranı linkini alır, açılışı ve yayını yönetir.
 * Oturum durumu ayrı tabloda tutulur: etkinlik kaydına her ilerlemede yazılsaydı site önbelleği ve RAG gereksiz yenilenirdi.
 * Kurallar: lib/teams/jury.ts · uçlar: endpoints/juryLive.ts (katılımcılar bu koleksiyona REST ile erişemez).
 */
export const JurySessions: CollectionConfig = {
  slug: 'jury-sessions',
  labels: { singular: '🎤 Canlı jüri oturumu', plural: '🎤 Canlı jüri oturumları' },
  admin: {
    group: '🏆 Takım Modu',
    useAsTitle: 'id',
    defaultColumns: ['event', 'host', 'status', 'currentIndex', 'updatedAt'],
    description: 'Etkinlik + sunucu seçip kaydedin. Sunucu ve jüriler sitede Katılımcı paneli → Jüri paneli → "Canlı oturum"dan girer. Takılırsa "Durum"u "Bekliyor" yapıp oturumu sıfırlayabilirsiniz (verilen puanlar silinmez).',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, unique: true, index: true, label: 'Etkinlik',
      filterOptions: { teamMode: { equals: true } } },
    {
      name: 'host', type: 'relationship', relationTo: 'participants', label: 'Sunucu (oturumu yöneten katılımcı hesabı)',
      admin: { description: 'Başlatır, gerekirse takımı oy beklemeden geçer, açılışı ve yayını yönetir. Jüri üyelerinden biri de olabilir; oy gizliliği sunucu için de geçerlidir.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status', type: 'select', label: 'Durum', required: true, defaultValue: 'idle', admin: { width: '50%' },
          options: [
            { label: '⏸️ Bekliyor', value: 'idle' },
            { label: '🗳️ Oylama', value: 'voting' },
            { label: '🏁 Oylama bitti', value: 'finished' },
            { label: '🎉 Sahnede açılış', value: 'revealing' },
            { label: '✅ Sonuç yayınlandı', value: 'done' },
          ],
        },
        {
          name: 'revealMode', type: 'select', label: 'Açılış biçimi', required: true, defaultValue: 'stepwise', admin: { width: '50%' },
          options: [
            { label: 'Adım adım (ödül anı)', value: 'stepwise' },
            { label: 'İlk 3', value: 'top3' },
            { label: 'Yalnız birinci', value: 'first' },
            { label: 'Tam sıralama', value: 'full' },
          ],
        },
      ],
    },
    { name: 'currentIndex', type: 'number', label: 'Sıradaki takım (0 = ilk)', defaultValue: 0, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'revealStep', type: 'number', label: 'Açılan sıra sayısı', defaultValue: 0, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'version', type: 'number', defaultValue: 0, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'order', type: 'json', label: 'Sunum sırası (takım kimlikleri)', admin: { readOnly: true } },
    { name: 'judgeIds', type: 'json', label: 'Oturum jürisi (başlarken dondurulur)', admin: { readOnly: true } },
    { name: 'openedAt', type: 'json', label: 'Takım oylamalarının açıldığı anlar', admin: { readOnly: true } },
    { name: 'finalRanking', type: 'json', label: 'Dondurulmuş sıralama', admin: { readOnly: true } },
    { name: 'stageKey', type: 'text', label: 'Salon ekranı anahtarı', admin: { readOnly: true, position: 'sidebar', description: 'Oturum başlarken üretilir; sıfırlanınca yenilenir.' } },
  ],
}
