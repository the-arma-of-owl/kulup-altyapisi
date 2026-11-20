import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrGate } from '../lib/access'

// Worker'daki Şablonlar → WhatsApp sekmesi: isimli mesaj şablonları. Karar ve kapı
// ekranlarında gönderim anında seçilir (ABT worker ile aynı mantık).
export const WhatsAppTemplates: CollectionConfig = {
  slug: 'whatsapp-templates',
  labels: { singular: '💬 WhatsApp Şablonu', plural: '💬 WhatsApp Şablonları' },
  admin: { group: '⚙️ Sistem Ayarları', useAsTitle: 'name' },
  // Kapı görevlisi okuyucuda hoş geldin mesajını seçebilsin diye okuyabilir; değiştiremez.
  access: { read: isAdminOrGate, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Ad' },
    { name: 'message', type: 'textarea', required: true, label: 'Mesaj',
      admin: { description: 'Değişkenler: {{adSoyad}} {{ad}} {{etkinlik}} {{tarih}} {{saat}} (etkinlik saati) {{konum}} {{konumLinki}} {{biletLinki}} {{masa}} · Kapıda ayrıca: {{girisSaati}} (okutma anı) {{takim}} (takım modunda kişinin takımı). Takım kabul ekranında: {{takim}} {{yoneticiNotu}}.' } },
  ],
}
