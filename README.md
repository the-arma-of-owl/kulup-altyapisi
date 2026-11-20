# Kulüp Altyapısı

Üniversite öğrenci kulüpleri için hazır web altyapısı: tanıtım sitesi, içerik yönetim paneli (CMS) ve
yöneticilerin masaüstü aracı. Etkinlik kaydı, QR'lı bilet ve kapı kontrolü, takımlı yarışmalar ve canlı jüri,
doğrulanabilir sertifikalar, üyelik ve yönetim ekibi başvuruları, blog, SSS ve "üniversitede yeniyim" rehberi
hazır gelir.

Her kulüp bu repoyu **kendi hesaplarıyla, kendi başına** kurar ve işletir. Verisi kendi veritabanında durur.
Site bilerek sade ve nötr tasarlandı: akışlar çalışır, görünümü her kulüp kendine göre değiştirir.

https://github.com/user-attachments/assets/d0f2b649-9995-4920-b7f5-1e1ac282c646

**Demo videosu (2.5 dk, [indir](docs/demo/kalkan-demo.mp4)):** depoyu klonla, `kulup.config.json`'u doldur, panel,
site, bağlantı (`/link`) sayfası, QR'lı bilet, kapıda okutma ve worker.

> Depodaki örnek kulüp **Kalkan Siber Güvenlik Kulübü** ve "Örnek Teknik Üniversitesi" **kurgusaldır**. Logo,
> etkinlik/blog görselleri ve üye portreleri yapay zekâyla üretildi; kişiler uydurmadır. Kendi kulübünüz için
> `kulup.config.json`'u, logoları (`site/public/logo.png`, `cms/public/logo.png`, `worker/assets/`) ve
> içerikleri değiştirin. Aynı örnek veriyi yerelde görmek için CMS kapalıyken `cd cms && npm run seed:demo`
> (yerel SQLite'ı temizler; Postgres'te çalışmaz).

| Parça | Klasör | Teknoloji | Nerede çalışır |
|---|---|---|---|
| Site | `site/` | Next.js 16 (App Router), React 19, Tailwind 4, next-intl | Vercel (proje 1) |
| CMS | `cms/` | Payload CMS 3.90 (Next.js 15), Postgres | Vercel (proje 2), panel: `/admin` |
| Worker | `worker/` | Electron + Vite + React, whatsapp-web.js | Yöneticilerin bilgisayarı (isteğe bağlı) |
| Kulüp bilgileri | `kulup.config.json` | — | Tek kaynak; `scripts/kulup-ayarla.mjs` projelere kopyalar |

Dış servisler (hepsinin ücretsiz katmanı yeterli): **Supabase** (Postgres), **Cloudflare R2** (dosyalar) ve
**Turnstile** (form bot koruması), **Resend** (e-posta), isteğe bağlı **Telegram** botu (bildirim, gece yedeği,
gün sonu raporu).

---

## 1. Kulübünü tanıt: `kulup.config.json`

Kulübün adı, üniversitesi, adresleri, e-postaları, sosyal medya hesapları, renkleri, sertifika kod öneki ve
kampüs konumu bu dosyada. Düzenle, sonra:

```bash
node scripts/kulup-ayarla.mjs      # doğrular ve site/src, cms/src, worker/shared içine kopyalar
```

Kopyalar (`*/kulup.json`) elle düzenlenmez ve commit edilir (Vercel her projeyi kendi klasöründen derler).
`node scripts/kulup-ayarla.mjs --kontrol` kopyaların güncel olup olmadığını denetler.

| Alan | Nerede görünür |
|---|---|
| `kisaAd`, `tamAd`, `universite`, `sehir`, `slogan`, `aciklama` | Başlıklar, alt bilgi, SEO, e-postalar, panel başlığı, worker |
| `adresler.site/cms/cdn` | Bağlantılar, CORS, güvenlik başlıkları (CSP), izinli görsel kökenleri. Ortam değişkeni verilirse o geçerli olur |
| `eposta.*` | Gönderen adı/adresi (Resend'de doğrulanmış alan adı olmalı), iletişim adresi |
| `sosyal.*` | Boş bırakılan hesaplar gösterilmez |
| `tema.anaRenk` | Sitenin ana rengi (`--kulup-ana`): düğmeler, başlık blokları, vurgular; açık/koyu tonlar bundan türetilir |
| `tema.ikinciRenk` | Paylaşım önizleme görselinin alt şeridi |
| `sertifika.onEk` | Sertifika kodları: `<ÖNEK>-2026-KTLM-…` (2-8 büyük harf/rakam). **Sertifika verdikten sonra değiştirme** |
| `kampus` | İletişim sayfasındaki harita |

Görseller (dosya adlarını koru, içeriği değiştir). Şablonda hepsi gri yer tutucudur;
`bash scripts/gorsel-uret.sh` (ImageMagick gerekir) bunları config'teki ad ve renkle yeniden üretir:

- `site/public/logo.png`: logo (navbar, alt bilgi, bilet)
- `site/public/og/varsayilan.jpg`: bağlantı önizleme görseli (1200×630, 300 KB altı)
- `site/src/app/icon.png`, `apple-icon.png`, `site/public/favicon.ico`, `site/public/pwa/*`: simgeler
- `site/public/mail/*`: e-posta üst/alt görselleri
- `worker/assets/icon.png`, `worker/src/assets/*`: worker simgesi ve giriş görselleri

Arayüz: renk ve yazı tipleri `site/src/app/globals.css` (en üstteki tasarım tokenları) ve
`site/src/app/fonts.ts`'te; ortak parçalar (`Dugme`, `Kart`, `SayfaBasligi`, `Alan`…) `site/src/components/kit`'te.

---

## 2. Yerelde çalıştır

Gerekenler: Node.js 22+, Docker (yalnız şema üretmek için).
- Site ve worker **npm** kullanır (`package-lock.json`).
- CMS **pnpm 10** kullanır (`pnpm-lock.yaml`; Vercel de bunu kullanır).

```bash
# CMS: http://localhost:3001/admin (yerelde SQLite: cms/data/dev.db)
cd cms
cp .env.example .env            # en az PAYLOAD_SECRET doldur
npx pnpm@10 install
npx pnpm@10 dev
npx pnpm@10 seed:local          # isteğe bağlı örnek veri

# Site: http://localhost:3000 (127.0.0.1 değil)
cd site
cp .env.example .env.local      # NEXT_PUBLIC_CMS_URL=http://127.0.0.1:3001
npm ci
npm run dev
```

Yerelde iki projede `INTERNAL_API_KEY` ve `REVALIDATE_SECRET` aynı değer olmalı. Formlar için Turnstile test
anahtarlarını kullan (`site/.env.example` içinde).

Worker için: `worker/README.md`.

---

## 3. Canlıya kurulum (bir kez)

Sıra önemli; her adım bir öncekinin çıktısını kullanır.

1. **Repo:** GitHub'da bu şablondan kendi reponu oluştur (özel olabilir). `kulup.config.json`'u doldur,
   `node scripts/kulup-ayarla.mjs` çalıştır, commit et.
2. **Veritabanı (Supabase):** yeni proje aç. Ardından:
   - **SQL Editor**'de `cms/sql/000_kurulum.sql` dosyasının tamamını bir kez çalıştır. Bütün tablolar kurulur.
   - **Project Settings → Database** altından *Transaction pooler* bağlantı adresini al. Bu `DATABASE_URL`'dir.
3. **Dosyalar (Cloudflare R2):**
   - Bucket aç (ör. `kulup-medya`).
   - Yalnız bu bucket'a yetkili bir API anahtarı oluştur. Buradan `R2_ACCESS_KEY_ID` ve `R2_SECRET_ACCESS_KEY` gelir.
   - S3 uç noktası `R2_ENDPOINT` olur: `https://<hesap-kimliği>.r2.cloudflarestorage.com`.
   - Bucket'a özel alan adı bağla (ör. `cdn.kulubum.com`). Bu `NEXT_PUBLIC_CDN_URL` ve `adresler.cdn` olur.
4. **Bot koruması (Cloudflare Turnstile):** site alan adın için bir widget oluştur. Site anahtarını ve gizli anahtarı al.
5. **E-posta (Resend):** alan adını doğrula ve API anahtarı al. Gönderen adres (`eposta.gonderen`) bu alan adında olmalı.
6. **Gizli anahtarlar:** her biri için `openssl rand -hex 32` çalıştır.
   - `PAYLOAD_SECRET`
   - `ENCRYPTION_KEY`
   - `INTERNAL_API_KEY` (iki projede aynı)
   - `REVALIDATE_SECRET` (iki projede aynı)
   - `CRON_SECRET`
   - `ANALYTICS_SALT_SECRET`
   - `OBS_HASH_SECRET`
   - `PARTICIPANT_CODE_SECRET`
   - `PARTICIPANT_SESSION_SECRET`
7. **CMS (Vercel projesi 1):**
   - GitHub reposunu içe aktar. **Root Directory** `cms` olmalı. Vercel `pnpm-lock.yaml`'ı görünce pnpm kullanır.
   - Ortam değişkenlerini `cms/.env.example`'a göre gir. `NODE_ENV`'i elle verme.
   - Alan adı bağla (ör. `panel.kulubum.com`).
   - Cron'lar `cms/vercel.json`'da tanımlı: gece yedeği ve gün sonu raporu. Her biri `CRON_SECRET` ister.
8. **Site (Vercel projesi 2):**
   - Aynı repoyu içe aktar, **Root Directory** `site` olmalı.
   - Ortam değişkenlerini `site/.env.example`'a göre gir. `NEXT_PUBLIC_*` değişkenleri derleme anında koda
     gömülür; değiştirince yeniden deploy et.
   - Alan adı bağla.
9. **İlk yönetici:**
   - `https://<panel>/admin` adresini aç ve ilk hesabı oluştur.
   - İki adımlı doğrulama (TOTP) zorunludur, telefonundaki doğrulayıcı uygulamasıyla kur.
   - Ardından **Site Ayarları**'nı doldur: üye sayısı, "Biz Kimiz" metni, sosyal medya, KVKK/gizlilik metinleri.
10. **Telegram (isteğe bağlı):**
    - Bot oluştur ve gruba ekle. `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` değerlerini gir.
    - Komutlar (`/ping`, `/yedekle`) için webhook'u `secret_token=$TELEGRAM_WEBHOOK_SECRET` ile kur.

Kontrol: sitede bir etkinlik sayfası açılıyor mu, CMS'te bir kaydı değiştirince site birkaç saniyede güncelleniyor
mu (`REVALIDATE_SECRET`), iletişim formu bir test adresine gidiyor mu.

---

## Kurallar (önce bunu oku)

Bu kurallar canlı sistemi ve üyelerin verisini korur.

1. **`main`'e push = canlıya yayın.** Vercel'deki iki proje `main`'e her push'ta yeniden derlenir. Ücretsiz
   kotayı korumak için değişiklikleri dalda biriktir, toplu push et.
2. **Canlı veritabanında Payload şema "push"u ya da `payload migrate` ASLA çalıştırılmaz.** Push, Payload'un
   tanımadığı tabloları (`analytics_events`, `obs.*`) siler. Şema `cms/sql/` dosyalarıyla yönetilir
   (bkz. [Veritabanı şeması](#veritabanı-şeması)). Yerelde Postgres'e bağlanırken push yalnız `PAYLOAD_PUSH=1`
   ile açılır; canlı adrese asla.
3. **Medya deposunda silme, taşıma ya da `sync` yok.** Yalnız yeni adla eklenir; dosya değişince yeni ad ver
   (CDN eski adı önbellekte tutar).
4. **Sırlar repoya girmez.** `.env*` (`.env.example` hariç) git dışıdır. Anahtarlar Vercel'de durur.
5. **Gerçek kişilere test mesajı gitmez.** Testte e-posta/WhatsApp yalnız izin listelerine gider:
   `PARTICIPANT_MAIL_ALLOWLIST`, `STAGING_MAIL_ALLOWLIST`, `BYT_WORKER_WA_ALLOWLIST`, `BYT_WORKER_MAIL_ALLOWLIST`.
   (`BYT_` önekli adlar iç sözleşmedir; değiştirme.)
6. **KVKK:** üyelerin adı, telefonu, e-postası yalnız CMS'te durur; dışa aktarılan listeleri repoya koyma.
   Analitik çerezsizdir, ham IP saklanmaz; eski gözlem kayıtları gün sonu cron'unda silinir.
7. **Next.js 16** eğitim verisindeki Next.js'ten farklı olabilir (ör. `middleware` artık "proxy"). Site kodu
   yazmadan önce `site/node_modules/next/dist/docs/` içindeki ilgili rehberi oku (`site/AGENTS.md`).

---

## Mimari

```
Ziyaretçi ──► Site (Vercel) ──► CMS REST API (Vercel) ──► Postgres (Supabase: public + obs şemaları)
                 │  ISR + etiketli önbellek  │  Payload koleksiyonları
                 │  /api/cms/*  (izinli vekil)├─► R2 ──► CDN alan adı
                 │  /api/takim/* (takım modu) ├─► Resend (e-posta)
                 │                            ├─► Telegram (bildirim, gece yedeği, gün sonu raporu)
                 │                            └─► Vercel cron: yedek, rapor
Yönetici ─► CMS paneli (/admin, 2FA zorunlu)
Yönetici ─► Worker (masaüstü) ─► CMS API (kendi oturumu) + WhatsApp Web + yerel PDF/e-posta
```

- **Veri okuma:** Site, CMS'in REST API'sini sunucuda çağırır (`site/src/lib/api.ts`). CMS'e ulaşılamazsa
  `site/src/lib/fallbackData.ts` kullanılır (`node scripts/export-fallback.mjs` ile üretilir).
- **Önbellek yenileme:** CMS'te kayıt değişince `withSiteRevalidate` sitenin `POST /api/revalidate` ucunu
  çağırır. Yedek ISR: etkinlikler 1 saat, diğer içerik 1 gün. Yeni bir içerik koleksiyonu eklenirse slug'ı
  **üç yere** yazılmalı: `cms/src/lib/siteRevalidate.ts`, `site/src/lib/revalidate.ts` ve
  `site/src/lib/api.ts` içindeki fetch `tags`'i.
- **Formlar:** Turnstile ile korunur (tek kullanımlık jeton, forma göre hız sınırı). Site, CMS'e yalnız izinli
  alanları `INTERNAL_API_KEY` ile iletir (`site/src/lib/cmsProxy.ts`). CMS'te `duplicateGuard` aynı kişinin
  tekrar başvurusunu 409 ile reddeder.
- **Takım modu:** Etkinlik `teamMode` ise katılımcılar e-posta koduyla giriş yapar (`/katilimci`), takım kurar
  ya da katılır; jüri `/katilimci/juri/<etkinlikId>` sayfasında puanlar, salon ekranı `/sahne/<etkinlikId>`.
  CMS uçları `cms/src/endpoints/teams.ts`, `juryLive.ts`.
- **Birebir kopya dosyalar:** `site/src/lib/teams/design.ts` ↔ `cms/src/lib/teams/teamDesign.ts`,
  `site/src/lib/jury/score.ts` ↔ `cms/src/lib/teams/score.ts`, `site/src/lib/teams/contact.ts` ↔
  `cms/src/lib/teams/contact.ts`. Değişiklik ikisine birden yapılır; CMS testleri eşitliği denetler.
- **Sertifikalar:** Worker üretir, R2'ye yükler, CMS `certificates` koleksiyonuna yazar; site
  `/sertifika/<kod>` ile doğrular.
- **Kapı (giriş kontrolü):** CMS panelinde `/admin/kapi` ve worker'daki Kapı ekranı; bilet QR'ı okunur.
- **İstatistik ve gözlem:** Kendi analitiğimiz (`/api/analytics/collect`, panelde `/admin/istatistikler`);
  ham veriler kişisel veri saklamadan özetlenir.

---

## Testler ve kontroller

| Proje | Komut |
|---|---|
| Kulüp bilgileri | `node scripts/kulup-ayarla.mjs --kontrol` |
| Site | `cd site && npx tsx --test tests/*.test.ts` |
| Site | `npx tsc --noEmit -p . && npm run lint` |
| Site | `npx next build` (push öncesi üretim derlemesi) |
| CMS | `cd cms && npx pnpm@10 exec vitest run` (`tests/int/api.int.spec.ts` gerçek veritabanı ister) |
| Worker | `cd worker && npm run typecheck && npm test` |

Push öncesi asgari kontrol: tip denetimi, testler, siteyi üretim derlemesiyle açıp değişen sayfaları açık ve
koyu temada, masaüstü ve telefon genişliğinde görmek.

---

## Yayına alma

1. Değişiklikler bir dalda birikir; her commit kendi başına derlenebilir olmalı.
2. Değişiklik yeni bir tablo/sütun istiyorsa SQL dosyası **önce** canlıya uygulanır (aşağıda).
3. Yeni bir ortam değişkeni gerekiyorsa **önce** Vercel'e eklenir.
4. `main`'e birleştirilip push edilir; iki proje `READY` olunca canlı sitede değişen sayfalar kontrol edilir.
5. Geri almak için Vercel panelinde önceki deployment'ı "Promote" et ya da `git revert` + push.

---

## Veritabanı şeması

- `cms/sql/000_kurulum.sql`: boş veritabanına tek seferde uygulanan tam şema (Payload tabloları + analitik + gözlem).
- Sonraki değişiklikler: `cms/sql/001_<konu>.sql`, `002_…` (`BEGIN; … COMMIT;`, yalnız ekleme, `DROP` yok).

Koleksiyon ya da alan eklediğinde:

1. Kodu değiştir.
2. `cd cms && bash scripts/sema-uret.sh` komutunu çalıştır. Docker'da geçici bir Postgres açar ve koddan güncel
   Payload şemasını `cms/sql/.uretilen-sema.sql` dosyasına döker.
3. Bu dökümü `000_kurulum.sql` (ve sonraki dosyalar) ile karşılaştır. Farktan **yalnız ekleme** ifadelerini
   yeni dosyaya al: `CREATE TABLE/TYPE/INDEX`, `ALTER TABLE … ADD …`.
4. Önce test veritabanına, sonra canlıya uygula. **Ardından** CMS kodunu yayına al.

---

## Klasör rehberi

```
kulup.config.json            kulübün kimliği (tek kaynak)
scripts/                     kulup-ayarla.mjs (config kopyalama), export-fallback.mjs
site/src/app/[locale]/       sayfalar (etkinlikler, blog, basvuru, katilimci, sertifika, ticket, takim, link, …)
site/src/app/api/            cms vekili, takım vekili, revalidate, og görseli
site/src/components/         home (ana sayfa), events, teams, jury, layout, ui
site/src/lib/                kulup.ts (config), api.ts (CMS okuma), cmsProxy, revalidate, seo, teams, jury
cms/src/collections/         Payload koleksiyonları (Events, EventRegistrations, Teams, Certificates, …)
cms/src/globals/             SiteSettings, LegalDocs, UniversityGuideSettings
cms/src/endpoints/           özel uçlar: teams, juryLive, gateCheckin
cms/src/lib/                 kulup.ts (config), resend, telegram, backup, siteRevalidate, duplicateGuard, obs, analytics
cms/sql/                     veritabanı şeması (000_kurulum.sql + sonraki değişiklikler)
worker/                      masaüstü aracı (kendi README'si var)
```

---

## Sık yapılan işler

- **Ana sayfayı değiştirmek:** `site/src/app/[locale]/page.tsx` bölümleri sıralar. Bölümler
  `site/src/components/home/` altında; içerik CMS'ten gelir.
- **Menü:** `site/src/components/layout/Navbar.tsx` içindeki `navLinks`.
- **Yeni içerik koleksiyonu:** koleksiyonu yaz → şema dosyası üret ve uygula → slug'ı üç önbellek listesine
  ekle (Mimari > Önbellek yenileme) → sitede `lib/api.ts`'e fetch fonksiyonu.
- **Görsel değiştirmek:** dosya adını değiştir ya da `?v=<özet>` ekle; tarayıcı önbelleği 1 saat.
- **Test ortamı (staging):** ayrı bir Supabase projesi + Vercel Preview ortamında `BYT_STAGING=1`
  (CMS, e-posta kilidi) ve `NEXT_PUBLIC_BYT_STAGING=1` (site, arama motorlarına kapalı).
