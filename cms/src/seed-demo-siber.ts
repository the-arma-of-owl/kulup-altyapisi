// Yalnız YEREL tanıtım verisi: kurgusal "Kalkan Siber Güvenlik Kulübü".
// Kişiler, kurumlar, etkinlikler uydurmadır; e-postalar .invalid alan adındadır (hiçbir yere mail gitmez).
// Kullanım: npm run seed:demo   (CMS kapalıyken; yerel SQLite'ı TEMİZLER, Postgres'te çalışmaz)
// Görseller seed-gorseller/ klasöründen gelir (yoksa gri yer tutucu); başka klasör için SEED_GORSEL_DIR.
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from './payload.config'

if (process.env.NODE_ENV === 'production' || process.env.PAYLOAD_DB === 'postgres') {
  console.error('seed-demo-siber yalnız yerel SQLite içindir; veritabanını temizler. Durduruldu.')
  process.exit(1)
}

const p = (text: string) => ({ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }], direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 })
const h = (text: string, tag = 'h2') => ({ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }], direction: 'ltr', format: '', indent: 0, tag, type: 'heading', version: 1 })
const code = (text: string, language = 'bash') => ({ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }], direction: 'ltr', format: '', indent: 0, language, type: 'code', version: 1 })
const list = (items: string[]) => ({ children: items.map((t, i) => ({ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: t, type: 'text', version: 1 }], direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, value: i + 1 })), direction: 'ltr', format: '', indent: 0, listType: 'bullet', start: 1, tag: 'ul', type: 'list', version: 1 })
const rt = (...children: any[]) => ({ root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } }) as any
const gun = (n: number, saat = 10) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(saat, 0, 0, 0); return d.toISOString() }

// Sade yer tutucu görsel: açık gri zemin, ince ızgara, ortada etiket
async function gorsel(etiket: string, alt: string, koyu = false) {
  const zemin = koyu ? '#18181b' : '#f4f4f5', cizgi = koyu ? '#27272a' : '#e9e9ec', yazi = koyu ? '#d4d4d8' : '#71717a'
  const kare = Array.from({ length: 40 }, (_, i) => `<path d="M${i * 40} 0V900M0 ${i * 40}H1600" stroke="${cizgi}" stroke-width="1"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${zemin}"/>${kare}
    <text x="800" y="470" font-family="DejaVu Sans Mono, monospace" font-size="72" fill="${yazi}" text-anchor="middle">${etiket}</text></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer().then((data) => ({ data, alt }))
}

const seed = async () => {
  const payload = await getPayload({ config })
  const ctx = { context: { disableRevalidate: true } }

  console.log('Yerel veritabanı temizleniyor…')
  for (const slug of ['certificates', 'team-scores', 'jury-sessions', 'team-media', 'team-memberships', 'teams', 'participants', 'event-registrations', 'events', 'blog-posts', 'achievements',
    'faq', 'faqCategories', 'team-members', 'hall-of-fame', 'university-guide', 'members', 'media', 'users']) {
    try { await payload.delete({ collection: slug as any, where: { id: { exists: true } }, ...ctx }) } catch { /* koleksiyon yoksa geç */ }
  }

  await payload.create({ collection: 'users', data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@example.invalid', password: process.env.SEED_ADMIN_PASSWORD || 'degistir-beni-123', roles: ['admin'] } as never })

  // SEED_GORSEL_DIR verilirse <anahtar>.jpg dosyaları kullanılır (ör. üretilmiş fotoğraflar); yoksa yer tutucu
  const dizin = process.env.SEED_GORSEL_DIR || path.resolve(process.cwd(), 'seed-gorseller')
  const medya = async (etiket: string, alt: string, koyu = false, anahtar?: string) => {
    const dosya = dizin && anahtar ? path.join(dizin, `${anahtar}.jpg`) : ''
    const g = dosya && existsSync(dosya) ? { data: await sharp(readFileSync(dosya)).resize(1600, 900, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer(), alt } : await gorsel(etiket, alt, koyu)
    return payload.create({ collection: 'media', data: { alt: g.alt }, file: { data: g.data, mimetype: 'image/jpeg', name: `${etiket.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(3).toString('hex')}.jpg`, size: g.data.length }, ...ctx })
  }

  const medyaKare = async (etiket: string, alt: string, anahtar: string) => {
    const dosya = dizin ? path.join(dizin, `${anahtar}.jpg`) : ''
    if (!dosya || !existsSync(dosya)) return medya(etiket, alt)
    const data = await sharp(readFileSync(dosya)).resize(800, 800, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer()
    return payload.create({ collection: 'media', data: { alt }, file: { data, mimetype: 'image/jpeg', name: `${anahtar}.jpg`, size: data.length }, ...ctx })
  }

  console.log('Ekip…')
  const ekip = [['Deniz Arslan', 'Kulüp Başkanı'], ['Ece Korkmaz', 'Başkan Yardımcısı'], ['Mert Yalın', 'CTF Takım Kaptanı'], ['Zeynep Aydın', 'Web Güvenliği Eğitmeni'],
    ['Kaan Erdem', 'Tersine Mühendislik'], ['İrem Soylu', 'OSINT ve Araştırma'], ['Baran Uslu', 'Altyapı ve Lab'], ['Selin Tunç', 'İletişim ve Sponsorluk']]
  for (const [i, [name, role]] of ekip.entries()) {
    await payload.create({ collection: 'team-members', data: { name, role, order: i + 1, year: '2026-2027', isActiveTeam: true, photo: (await medyaKare(name.split(' ').map((s) => s[0]).join(''), name, `uye-${i + 1}`)).id } as never, ...ctx })
  }

  console.log('Etkinlikler…')
  const ctf = await payload.create({ collection: 'events', ...ctx, data: {
    title: 'Kalkan CTF 2026', slug: 'kalkan-ctf-2026', realSlug: 'kalkan-ctf-2026', mode: 'live', status: 'completed', registrationStage: 'closed', scannerActive: true,
    date: gun(16, 10), endDate: gun(16, 22), location: 'Mühendislik Fakültesi, Lab-1', capacity: 120,
    image: (await medya('$ ./kalkan-ctf', 'Kalkan CTF 2026', true, 'etkinlik-ctf')).id,
    description: rt(p('12 saatlik jeopardy tarzı CTF: web, kripto, forensics, tersine mühendislik ve OSINT kategorileri. 2–4 kişilik takımlar.'),
      h('Kategoriler'), list(['Web', 'Kriptografi', 'Adli bilişim', 'Tersine mühendislik', 'OSINT']),
      p('Bayraklar yalnız yarışma altyapısında aranır; altyapı dışındaki sistemlere saldırı diskalifiye sebebidir.')),
    teamMode: true, teamSettings: { minMembers: 2, maxMembers: 4, registrationOpen: true, registrationDeadline: gun(14, 23) },
    prizes: [{ rank: 1, title: 'Birincilik', description: 'Mekanik klavye seti' }, { rank: 2, title: 'İkincilik', description: 'Raspberry Pi kiti' }, { rank: 3, title: 'Üçüncülük', description: 'Kitap seti' }],
  } as never })
  const atolye = await payload.create({ collection: 'events', ...ctx, data: {
    title: 'Web Uygulama Güvenliği Atölyesi', slug: 'web-guvenligi-atolyesi', realSlug: 'web-guvenligi-atolyesi', mode: 'live', status: 'completed', registrationStage: 'closed',
    date: gun(-5, 14), endDate: gun(-5, 17), location: 'Bilgisayar Lab-3', capacity: 40, scannerActive: true,
    image: (await medya('GET /atolye HTTP/1.1', 'Web güvenliği atölyesi', false, 'etkinlik-web')).id,
    description: rt(p('OWASP Top 10 üzerinden uygulamalı atölye: kendi kurduğumuz kasıtlı açıklı uygulamada XSS, SQL enjeksiyonu ve erişim kontrolü hatalarını bulup düzeltiyoruz.'),
      list(['Kendi dizüstü bilgisayarını getir', 'Önceden Docker kurulu olsun', 'Temel HTTP bilgisi yeterli'])),
  } as never })
  await payload.create({ collection: 'events', ...ctx, data: {
    title: 'Tersine Mühendisliğe Giriş', slug: 'tersine-muhendislige-giris', realSlug: 'tersine-muhendislige-giris', mode: 'live', status: 'completed', registrationStage: 'closed',
    date: gun(-25, 15), location: 'Amfi-2', capacity: 60, image: (await medya('0x7f454c46', 'Tersine mühendislik', false, 'etkinlik-tersine')).id,
    description: rt(p('Ghidra ile ilk ikili dosya analizi: fonksiyonları okumak, string\'leri izlemek, basit bir crackme çözmek.')),
  } as never })
  await payload.create({ collection: 'events', ...ctx, data: {
    title: 'OSINT ile Açık Kaynak İstihbaratı', slug: 'osint-semineri', realSlug: 'osint-semineri', mode: 'live', status: 'completed', registrationStage: 'closed',
    date: gun(-12, 14), location: 'Konferans Salonu', capacity: 150, image: (await medya('whois kalkan.example', 'OSINT semineri', false, 'etkinlik-osint')).id,
    description: rt(p('Açık kaynaklardan etik ve yasal sınırlar içinde bilgi toplama: arama operatörleri, görsel doğrulama, meta veri.')),
  } as never })
  await payload.create({ collection: 'events', ...ctx, data: {
    title: 'Linux ve Ağ Temelleri Bootcamp', slug: 'linux-ag-bootcamp', realSlug: 'linux-ag-bootcamp', mode: 'live', status: 'completed', registrationStage: 'closed',
    date: gun(-40, 10), location: 'Bilgisayar Lab-1', capacity: 30, image: (await medya('$ ip a', 'Linux bootcamp', false, 'etkinlik-linux')).id,
    description: rt(p('Dört haftalık bootcamp: terminal, izinler, süreçler, TCP/IP, Wireshark ile paket okuma.')),
  } as never })

  // Tek aktif etkinlik kuralı (Events afterChange diğerlerini kapatır): CTF en son aktif yapılır
  await payload.update({ collection: 'events', id: ctf.id, data: { status: 'active', registrationStage: 'open' } as never, ...ctx })

  console.log('Atölye kayıtları (bilet QR için)…')
  const kisiler = [['Arda Çınar', 'Bilgisayar Mühendisliği'], ['Elif Koç', 'Yazılım Mühendisliği'], ['Onur Kılıç', 'Elektrik-Elektronik Müh.'],
    ['Nehir Güneş', 'Yönetim Bilişim Sistemleri'], ['Emir Sarı', 'Bilgisayar Mühendisliği'], ['Duru Ateş', 'Matematik']]
  for (const [i, [fullName, department]] of kisiler.entries()) {
    await payload.create({ collection: 'event-registrations', ...ctx, data: {
      event: atolye.id, status: 'accepted', attended: i < 4, fullName, department, email: `katilimci${i + 1}@ornek.invalid`, phone: `0500 000 00 ${String(i + 10)}`,
      kvkkApproved: true, privacyPolicyApproved: true, isTest: false,
    } as never })
  }

  console.log('CTF takımları…')
  const takimlar = [['Null Pointer', ['Arda Çınar', 'Elif Koç', 'Onur Kılıç']], ['Kırmızı Takım', ['Nehir Güneş', 'Emir Sarı']], ['Root Kökler', ['Duru Ateş', 'Can Polat', 'Ada Eren', 'Toprak Uz']], ['0xKalkan', ['Lara Bilge', 'Ege Tan']]] as const
  let n = 0
  for (const [ad, uyeler] of takimlar) {
    const katilimcilar = []
    for (const fullName of uyeler) {
      n++
      katilimcilar.push(await payload.create({ collection: 'participants', ...ctx, data: { fullName, email: `oyuncu${n}@ornek.invalid`, password: randomBytes(12).toString('hex'), emailVerified: true, kvkkApprovedAt: new Date().toISOString() } as never }))
    }
    const takim = await payload.create({ collection: 'teams', ...ctx, data: { name: ad, status: 'accepted', event: ctf.id, captain: katilimcilar[0].id, manifesto: 'Bayrak bizim, öğrendiklerimiz herkesin.' } as never })
    for (const [i, k] of katilimcilar.entries()) {
      await payload.create({ collection: 'team-memberships', ...ctx, data: { team: takim.id, event: ctf.id, participant: k.id, role: i === 0 ? 'captain' : 'member', status: 'accepted' } as never })
    }
  }

  console.log('Writeup ve yazılar…')
  const yazilar: [string, string, any][] = [
    ['Kalkan CTF 2025: "Eski Panel" Web Sorusu Çözümü', 'kalkan-ctf-2025-eski-panel', rt(p('Soru, giriş sayfası olan eski bir yönetim paneliydi. İpucu robots.txt dosyasındaydı.'), h('Keşif'), code('curl -s http://ctf.kalkan.example/robots.txt\n# Disallow: /yedek/'), h('Çözüm'), p('Yedek klasöründe unutulmuş yapılandırma dosyası yönetici parolasının özetini veriyordu. Özeti kırmak yerine sıfırlama akışındaki mantık hatasını kullandık.'), h('Ders'), p('Yedek dosyaları canlı sunucuda bırakmayın; parola sıfırlama akışlarını da en az giriş kadar test edin.'))],
    ['Burp Suite ile İlk Adımlar', 'burp-suite-ilk-adimlar', rt(p('Burp Suite\'in proxy, repeater ve intruder sekmelerini kendi lab uygulamamızda tanıyoruz.'), list(['Tarayıcıyı Burp proxy\'ye bağla', 'İsteği Repeater\'a gönder', 'Parametreleri tek tek değiştir ve yanıtı izle']))],
    ['Nmap Çıktısını Okumak', 'nmap-ciktisini-okumak', rt(p('Yalnız izinli olduğun sistemleri tara. Bu yazıda kendi lab ağımızdaki bir makinenin taramasını satır satır okuyoruz.'), code('nmap -sV -p- 10.10.0.5')) ],
    ['SQL Enjeksiyonunu Anlamak ve Önlemek', 'sql-enjeksiyonu', rt(p('Hazırlanmış sorgular neden işe yarar? Açıklı ve düzeltilmiş kodu yan yana görelim.'), code('cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))', 'python'))],
  ]
  for (const [i, [title, slug, content]] of yazilar.entries()) {
    await payload.create({ collection: 'blog-posts', ...ctx, data: { title, slug, locale: 'tr', status: 'published', publishedAt: gun(-3 - i * 6), coverImage: (await medya(['flag{eski_panel}', 'Burp > Repeater', 'nmap -sV', "' OR 1=1 --"][i], title, i === 0, ['blog-panel', 'blog-burp', 'blog-nmap', 'blog-sql'][i])).id, content } as never })
  }

  console.log('Başarılar ve onur listesi…')
  const basarilar = [['Kampüslerarası CTF Ligi 2026 Üçüncülüğü', 'ctf-ligi-2026', 'competition'], ['Açık Kaynak Güvenlik Haftası Konuşması', 'acik-kaynak-guvenlik-haftasi', 'event'], ['Kasıtlı Açıklı Eğitim Uygulaması Yayında', 'egitim-uygulamasi', 'project']]
  for (const [title, slug, category] of basarilar) {
    await payload.create({ collection: 'achievements', ...ctx, data: { title, slug, category, date: gun(-60), summary: 'Kulübümüzün bu dönemki çalışmalarından biri.', image: (await medya('#' + slug, title, false, { 'ctf-ligi-2026': 'basari-ctf-ligi', 'acik-kaynak-guvenlik-haftasi': 'basari-konusma', 'egitim-uygulamasi': 'basari-uygulama' }[slug])).id, description: rt(p('Haftalık lab çalışmaları ve takım içi CTF antrenmanlarının sonucu.')) } as never })
  }
  for (const [i, [name, title]] of [['Mert Yalın', 'Sorumlu bildirim: kampüs uygulamasında erişim kontrolü hatası'], ['Zeynep Aydın', 'Açık kaynak projeye XSS düzeltmesi'], ['Kaan Erdem', 'CTF ligi en çok soru çözen oyuncu']].entries()) {
    try { await payload.create({ collection: 'hall-of-fame', ...ctx, data: { year: '2026', name, title, description: 'Kulüp onur listesi.', order: i + 1 } as never }) } catch (e) { console.log('onur listesi atlandı:', (e as Error).message) }
  }

  console.log('SSS ve rehber…')
  const genel = await payload.create({ collection: 'faqCategories', ...ctx, data: { name: 'Genel' } as never })
  const etik = await payload.create({ collection: 'faqCategories', ...ctx, data: { name: 'Etik' } as never })
  for (const [question, answer, category] of [
    ['Siber güvenlik bilmeden katılabilir miyim?', 'Evet. Linux ve ağ bootcamp\'i sıfırdan başlar; her bölümden öğrenciye açığız.', genel.id],
    ['CTF nedir?', 'Capture The Flag: yarışma altyapısında gizlenmiş "bayrakları" bulmaya dayalı, takımlı bir güvenlik yarışması.', genel.id],
    ['Öğrendiklerimizi gerçek sistemlerde deneyebilir miyiz?', 'Hayır. Yalnız kendi lab ortamımızda ve yazılı izin alınmış sistemlerde çalışırız. İzinsiz test suçtur.', etik.id],
    ['Bir güvenlik açığı bulursam ne yapmalıyım?', 'Sorumlu bildirim: açığı yaymadan sistem sahibine bildir. Kulüp mentorları süreçte yardımcı olur.', etik.id],
  ] as const) await payload.create({ collection: 'faq', ...ctx, data: { question, answer, category } as never })
  for (const [i, [title, slug, category, excerpt]] of [['Kampüste ilk hafta', 'kampuste-ilk-hafta', 'kampus', 'Lab saatleri, kulüp odası ve iletişim kanalları.'], ['Güvenlik öğrenmeye nereden başlamalı?', 'nereden-baslamali', 'ders', 'Linux, ağ temelleri, sonra web güvenliği: önerilen sıra.']].entries()) {
    await payload.create({ collection: 'university-guide', ...ctx, data: { title, slug, category, excerpt, active: true, order: i + 1, content: rt(p(excerpt)) } as never })
  }

  await payload.updateGlobal({ slug: 'site-settings', data: { activeMembers: 184, marqueeText: 'Kalkan CTF 2026 kayıtları açık • Haftalık lab: çarşamba 18.00 • Writeup\'larını blogda paylaş •', aboutUsText: 'Kalkan, Örnek Teknik Üniversitesi\'nde siber güvenliği uygulamalı öğrenmek isteyen öğrencilerin kulübü. Her hafta kendi lab ortamımızda çalışıyor, CTF\'lere takım olarak katılıyor ve çözümlerimizi writeup olarak paylaşıyoruz.\n\nEtik kurallarımız net: yalnız izinli sistemlerde çalışırız, bulduğumuz açıkları sorumlu bildirimle iletiriz.' } as never, ...ctx })
  console.log('--- Kalkan Siber Güvenlik Kulübü tanıtım verisi hazır ---')
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
