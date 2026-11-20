import 'dotenv/config'
import { getPayload } from 'payload'
import config from './payload.config'
import { KULUP } from './lib/kulup'

const seed = async () => {
  const payload = await getPayload({ config })

  console.log('--- Production Seeding Başlıyor ---')
  console.log('Sadece gerekli sistem ayarları ve kategoriler oluşturulacak...')

  // =========================================
  // 1. FAQ CATEGORIES
  // =========================================
  console.log('SSS Kategorileri kontrol ediliyor...')
  const existingCategories = await payload.find({ collection: 'faqCategories', limit: 1 })
  
  if (existingCategories.totalDocs === 0) {
    const categories = ['Genel', 'Üyelik', 'Etkinlikler', 'Eğitimler', 'Teknik']
    for (const name of categories) {
      await payload.create({ collection: 'faqCategories', data: { name } })
    }
    console.log('Temel SSS kategorileri oluşturuldu.')
  } else {
    console.log('SSS Kategorileri zaten mevcut, atlanıyor.')
  }

  // =========================================
  // 2. SITE SETTINGS
  // =========================================
  console.log('Site ayarları kontrol ediliyor...')
  const settings = await payload.findGlobal({ slug: 'site-settings' })
  
  if (!settings.activeMembers) {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        activeMembers: 0,
        contactEmail: KULUP.eposta.iletisim,
      },
    })
    console.log('Varsayılan site ayarları oluşturuldu.')
  } else {
    console.log('Site ayarları zaten mevcut, atlanıyor.')
  }

  console.log('--- PRODUCTION SEED TAMAMLANDI! ---')
  process.exit(0)
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
