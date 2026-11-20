import 'dotenv/config'
import { getPayload } from 'payload'
import config from './payload.config'
import { KULUP } from './lib/kulup'

const createComplexRichText = (blocks: any[]) => {
  const children = blocks.map(block => {
    if (block.type === 'heading') {
      return {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: block.text, type: 'text', version: 1 }],
        direction: 'ltr', format: '', indent: 0, tag: block.tag || 'h2', type: 'heading', version: 1,
      }
    }
    if (block.type === 'image' && block.value) {
      return {
        format: '', type: 'upload', version: 1,
        value: { id: block.value, url: `/api/media/file/${block.filename || 'dummy.jpg'}`, alt: 'Image' }
      }
    }
    if (block.type === 'code') {
      return {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: block.text, type: 'text', version: 1 }],
        direction: 'ltr', format: '', indent: 0, language: block.lang || 'javascript', type: 'code', version: 1,
      }
    }
    if (block.type === 'quote') {
      return {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: block.text, type: 'text', version: 1 }],
        direction: 'ltr', format: '', indent: 0, type: 'quote', version: 1,
      }
    }
    if (block.type === 'list') {
      return {
        children: block.items.map((item: string, index: number) => ({
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: item, type: 'text', version: 1 }],
          direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, value: index + 1
        })),
        direction: 'ltr', format: '', indent: 0, listType: block.listType || 'bullet', start: 1, tag: block.listType === 'number' ? 'ol' : 'ul', type: 'list', version: 1,
      }
    }
    // Default paragraph
    return {
      children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: block.text || '', type: 'text', version: 1 }],
      direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1,
    }
  })

  return { root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } } as any
}

const seed = async () => {
  const payload = await getPayload({ config })

  console.log('--- Veritabanı Temizleniyor ---')
  const collectionsToClear = [
    'members', 'events', 'event-registrations', 'blog-posts', 
    'achievements', 'faq', 'faqCategories', 'team-members', 
    'media', 'users'
  ]
  for (const slug of collectionsToClear) {
    try {
      await payload.delete({ collection: slug as any, where: { id: { exists: true } } })
    } catch {}
  }

  console.log('Yönetici (Admin) hesabı oluşturuluyor...')
  try {
    await payload.create({
      collection: 'users',
      data: {
        email: process.env.SEED_ADMIN_EMAIL || 'admin@example.invalid',
        password: process.env.SEED_ADMIN_PASSWORD || 'degistir-beni-123',
        roles: ['admin'],
      }
    })
  } catch (e) {
    console.log('Admin oluşturulamadı veya zaten var.')
  }

  // 1. Medya
  console.log('Zengin medya kütüphanesi indiriliyor...')
  const imageUrls = [
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', // Cyber
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4', // Event
    'https://images.unsplash.com/photo-1531482615713-2afd69097998', // Team
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e', // Robot
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d', // Workspace
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c', // Dev
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c', // Code
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c', // Team2
    'https://images.unsplash.com/photo-1504164996022-09080787b6b3', // Hardware
    'https://images.unsplash.com/photo-1517048676732-d65bc937f952', // Meeting
    'https://images.unsplash.com/photo-1552664730-d307ca884978', // Presentation
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4', // Coding screen
    'https://images.unsplash.com/photo-1605379399642-870262d3d051', // Server room
    'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2', // Tech setup
    'https://images.unsplash.com/photo-1518770660439-4636190af475', // Microchip
  ]
  const mediaItems: any[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const res = await fetch(`${imageUrls[i]}?q=80&w=1200&auto=format&fit=crop`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const media = await payload.create({
        collection: 'media',
        data: { alt: `Örnek görsel ${i + 1}` },
        file: { data: buffer, mimetype: 'image/jpeg', name: `ornek-${i}.jpg`, size: buffer.length },
      })
      mediaItems.push(media)
    } catch {}
  }
  const getRandomMedia = () => mediaItems[Math.floor(Math.random() * mediaItems.length)]

  // =========================================
  // 2. TEAM MEMBERS
  // =========================================
  console.log('Takım Üyeleri oluşturuluyor...')
  const teamRoles = [
    { name: 'Emre Can', role: 'Topluluk Başkanı' },
    { name: 'Selin Yılmaz', role: 'Başkan Yardımcısı' },
    { name: 'Mert Demir', role: 'Yazılım Sorumlusu' },
    { name: 'Ece Kaya', role: 'Tasarım Sorumlusu' },
    { name: 'Burak Aras', role: 'Siber Güvenlik Sorumlusu' },
    { name: 'Deniz Şahin', role: 'PR & Sponsorluk Sorumlusu' },
    { name: 'Kaan Yıldız', role: 'Robotik Ekip Lideri' },
    { name: 'Zeynep Ak', role: 'Sosyal Medya Yönetimi' },
    { name: 'Yiğit Doğan', role: 'Mobil Geliştirici' },
    { name: 'İrem Bulut', role: 'Frontend Geliştirici' },
    { name: 'Alperen Kurt', role: 'Backend Geliştirici' },
    { name: 'Ömer Faruk', role: 'Veri Bilimi Sorumlusu' },
  ]
  for (const member of teamRoles) {
    await payload.create({
      collection: 'team-members',
      data: {
        ...member,
        year: '2025-2026',
        linkedinUrl: 'https://linkedin.com',
        githubUrl: 'https://github.com',
        photo: getRandomMedia().id,
      },
    })
  }

  // =========================================
  // 3. BLOG POSTS (Detailed & Rich)
  // =========================================
  console.log('Zengin Blog Yazıları oluşturuluyor...')
  const blogs = [
    { title: 'Next.js 15 ve App Router ile Modern Web Mimarisi', slug: 'nextjs-15-app-router', locale: 'tr' },
    { title: 'Yapay Zeka Modelleri Nasıl Eğitilir? Deep Learning 101', slug: 'deep-learning-101', locale: 'tr' },
    { title: 'Cyber Security: Tehdit Avcılığı ve Defansif Güvenlik', slug: 'cyber-security-defansif', locale: 'tr' },
    { title: 'Cloud Native Application Development', slug: 'cloud-native-dev', locale: 'en' },
  ]

  for (const b of blogs) {
    const img1 = getRandomMedia()
    const img2 = getRandomMedia()
    await payload.create({
      collection: 'blog-posts',
      data: {
        title: b.title,
        slug: b.slug,
        locale: b.locale as any,
        status: 'published',
        publishedAt: new Date().toISOString(),
        coverImage: img1.id,
        content: createComplexRichText([
          { type: 'paragraph', text: 'Teknoloji dünyası her geçen gün inanılmaz bir hızla evriliyor. Bu yazımızda, sektördeki en son gelişmeleri ve en iyi uygulamaları derinlemesine inceliyoruz.' },
          { type: 'heading', tag: 'h2', text: 'Konuya Giriş' },
          { type: 'paragraph', text: 'Yazılım geliştirme süreçlerinde doğru mimariyi kurmak, projenin geleceği için kritik bir rol oynar. Peki neden bu teknolojiyi seçmeliyiz?' },
          { type: 'list', listType: 'bullet', items: [
            'Yüksek performans ve optimize edilmiş derleme süreleri',
            'Geniş ekosistem ve topluluk desteği',
            'Kolay entegrasyon ve ölçeklenebilirlik'
          ]},
          { type: 'image', value: img2.id, filename: img2.filename },
          { type: 'heading', tag: 'h3', text: 'Uygulamalı Bir Örnek' },
          { type: 'paragraph', text: 'Aşağıdaki kod parçacığında temel bir implementasyon görebilirsiniz:' },
          { type: 'code', lang: 'typescript', text: 'export const merhabaKulup = (): string => {\n  const message = "Merhaba kampüs!";\n  console.log(message);\n  return message;\n}' },
          { type: 'quote', text: '"İyi yazılım, karmaşık şeyleri basit gösterme sanatıdır." - Topluluk Mottosu' },
          { type: 'heading', tag: 'h2', text: 'Sonuç' },
          { type: 'paragraph', text: 'Araştırmalarımız ve deneyimlerimiz gösteriyor ki, modern teknolojileri doğru şekilde konumlandırmak projelerin başarı şansını %80 oranında artırıyor.' },
        ]),
      },
    })
  }

  // =========================================
  // 4. ACHIEVEMENTS
  // =========================================
  console.log('Başarılar oluşturuluyor...')
  const achievements = [
    { title: 'TEKNOFEST 2025 Siber Güvenlik Birinciliği', slug: 'teknofest-2025-siber-guvenlik', cat: 'competition' },
    { title: 'TÜBİTAK 2209-A Akıllı Kampüs Projesi Kabulü', slug: 'tubitak-akilli-kampus', cat: 'project' },
  ]
  for (const a of achievements) {
    const mainImg = getRandomMedia()
    await payload.create({
      collection: 'achievements',
      data: {
        title: a.title,
        slug: a.slug,
        date: '2025-05-15T00:00:00.000Z',
        category: a.cat as any,
        image: mainImg.id,
        summary: 'Topluluğumuzun bu alandaki büyük başarısı ve ekip ruhunun zaferi.',
        description: createComplexRichText([
          { type: 'heading', tag: 'h2', text: 'Zorlu Bir Süreç' },
          { type: 'paragraph', text: 'Aylarca süren hazırlıklar, uykusuz geceler ve binlerce satır kodun ardından bu ödülü üniversitemize getirdik.' },
        ]),
        gallery: [{ image: getRandomMedia().id }, { image: getRandomMedia().id }, { image: getRandomMedia().id }]
      }
    })
  }

  // =========================================
  // 5. EVENTS
  // =========================================
  console.log('Etkinlikler oluşturuluyor...')
  const events = [
    {
      title: 'Siber Güvenlik Zirvesi 2026',
      mode: 'live',
      status: 'active',
      registrationStage: 'open',
      realSlug: 'siber-guvenlik-zirvesi',
      slug: 'siber-guvenlik-zirvesi',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'FÜ Mühendislik Fakültesi Konferans Salonu',
      capacity: 150,
      description: createComplexRichText([
        { type: 'paragraph', text: 'Türkiye\'nin önde gelen siber güvenlik uzmanlarının katılımıyla gerçekleştirilecek olan zirvemizde sızma testi, zararlı yazılım analizi ve olay müdahale konuları ele alınacaktır.' },
        { type: 'list', listType: 'number', items: [
          'Açılış ve Keynote Konuşmaları',
          'Sızma Testi Atölyesi',
          'CTF (Capture The Flag) Yarışması'
        ]}
      ]),
      image: getRandomMedia().id,
    },
    {
      title: 'React.js Bootcamp: Sıfırdan İleri Seviyeye',
      mode: 'live',
      status: 'completed',
      registrationStage: 'closed',
      realSlug: 'reactjs-bootcamp',
      slug: 'reactjs-bootcamp',
      date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Bilgisayar Lab-3',
      capacity: 40,
      description: createComplexRichText([{ type: 'paragraph', text: 'Frontend dünyasına sağlam bir adım atın! React.js ile modern web uygulamaları geliştirmeyi uygulamalı olarak öğrenin.' }]),
      image: getRandomMedia().id,
    }
  ]
  for (const event of events) {
    await payload.create({ collection: 'events', data: event as never })
  }

  // =========================================
  // 6. FAQ & CATEGORIES
  // =========================================
  console.log('SSS ve Kategoriler oluşturuluyor...')
  const catGenel = await payload.create({ collection: 'faqCategories', data: { name: 'Genel' } })
  const catUyelik = await payload.create({ collection: 'faqCategories', data: { name: 'Üyelik' } })
  const faqs = [
    { question: `${KULUP.kisaAd} nedir?`, answer: `${KULUP.tamAd}; yazılım, siber güvenlik, robotik ve yapay zeka alanlarında etkinlikler düzenleyen bir öğrenci topluluğudur.`, category: catGenel.id },
    { question: 'Topluluğa nasıl üye olabilirim?', answer: 'Web sitemiz üzerinden "Üye Ol" formunu doldurarak başvuru yapabilirsiniz. Her bölümden öğrenciye açığız!', category: catUyelik.id },
  ]
  for (const faq of faqs) {
    await payload.create({ collection: 'faq', data: faq as never })
  }

  // =========================================
  // 7. GALLERY & ALBUMS (Kaldırıldı)
  // =========================================

  // =========================================
  // 8. UNIVERSITY GUIDE
  // =========================================
  console.log('Üniversitede Yeniyim rehber içerikleri oluşturuluyor...')
  const guideItems = [
    {
      title: 'Kampüste İlk Gün Neler Yapılmalı?',
      slug: 'kampuste-ilk-gun',
      category: 'kampus',
      active: true,
      order: 1,
      excerpt: 'Öğrenci işleri, yemekhane ve kampüs içi ulaşım hakkında temel bilgiler.',
      content: createComplexRichText([
        { type: 'paragraph', text: 'Üniversiteye geldiğiniz ilk gün kampüsü keşfetmek ve öğrenci kimliğinizi almak en önemli adımlardır.' },
      ]),
    },
    {
      title: 'Ders Seçimi Nasıl Yapılır?',
      slug: 'ders-secimi',
      category: 'ders',
      active: true,
      order: 2,
      excerpt: 'OBS (Öğrenci Bilgi Sistemi) üzerinden ders seçimi ve danışman onayı süreci.',
      content: createComplexRichText([
        { type: 'paragraph', text: 'Ders kayıtları OBS üzerinden yapılır. Akademik takvimi takip etmeyi unutmayın.' },
      ]),
    }
  ]
  for (const item of guideItems) {
    await payload.create({ collection: 'university-guide', data: item as never })
  }

  // =========================================
  // 9. MEMBERS (Active & Dummy)
  // =========================================
  console.log('Aktif üyeler oluşturuluyor...')
  const membersList = [
    { fullName: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@example.com', phone: '0555 000 0001', department: 'Yazılım Mühendisliği', year: '3. Sınıf', status: 'active' },
    { fullName: 'Elif Demir', email: 'elif.demir@example.com', phone: '0555 000 0002', department: 'Bilgisayar Mühendisliği', year: '2. Sınıf', status: 'active' },
  ]
  for (const member of membersList) {
    await payload.create({ collection: 'members', data: member as never })
  }

  // =========================================
  // 10. SITE SETTINGS
  // =========================================
  console.log('Site ayarları güncelleniyor...')
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      activeMembers: 250,
      contactEmail: KULUP.eposta.iletisim,
    },
  })

  console.log('--- LOKAL İÇİN DETAYLI SEED TAMAMLANDI! ---')
  process.exit(0)
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
