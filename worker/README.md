# Kulüp Worker

Kulüp yöneticileri için masaüstü aracı: etkinlik başvuruları, kapı modu, mail/WhatsApp
gönderimi ve sertifikalar. Yerel sunucu yalnızca `127.0.0.1:4100` üzerinde açılır ve
varsayılan olarak kulübün CMS adresine (`KULUP.adresler.cms` + `/api`) bağlanır.

## Kulübe uyarlama

- Kulübe özel tüm değerler (ad, kısa ad, adresler, tema rengi, sertifika kod öneki vb.)
  kök dizindeki `kulup.config.json` dosyasından gelir. `node scripts/kulup-ayarla.mjs`
  bu dosyayı `worker/shared/kulup.json` olarak kopyalar; kopyayı elle düzenlemeyin.
  Kod bu değerleri `shared/kulup.ts` üzerinden (`KULUP`) okur.
- **İkon ve logo:** `assets/icon.png` (uygulama/paket ikonu, en az 512×512 PNG) ve
  `src/assets/logo-512.png` (giriş ekranı ve kenar çubuğu logosu) şablondan gelen örnek
  görsellerdir. Kendi kulübünüzün görselleriyle aynı adla değiştirin. Açılış videosu
  `src/assets/intro.mp4` için de aynısı geçerlidir.
- **Paket kimliği:** `package.json` içindeki `build.appId` (`org.kulup.worker`) ve
  `build.productName` (`Kulüp Worker`) değerlerini isterseniz kendi kulübünüze göre
  değiştirin (ör. `org.ornekkulup.worker`).
- **Sürüm yayımlama:** `.github/workflows/worker-release.yml`, `main`'e `worker/`
  altında değişiklik gelince paketleri derler ve kendi deponuzda `worker-v<sürüm>`
  etiketiyle ön sürüm açar. Ek ayar gerekmez; depo sahibi/adı iş akışında sabit
  değildir (`GITHUB_TOKEN` kullanılır). Yeni sürüm için `package.json`'daki `version`
  artırılır. `electron-builder` ile doğrudan yayımlamak isterseniz `build.publish`
  alanına `{ "provider": "github", "owner": "<kullanici-veya-org>", "repo": "<depo>" }`
  ekleyin.

## Kurulum

Node.js 22 veya üzeriyle geliştirme: `npm ci`, ardından `npm run dev`.
Linux AppImage: `npm run dist`. Windows NSIS: `npm run dist:win`.
Paket komutları Chrome for Testing'i platforma göre indirip pakete ekler.

Yöneticiler CMS yönetici e-postası ve parolasıyla giriş yapar. Hesapta iki adımlı
doğrulama (TOTP) önceden yönetim panelinde kurulmuş olmalıdır. Oturum yerel
`session.json` dosyasında 0600 izinleriyle iki saat saklanır; parola saklanmaz.

## Günlük kullanım

1. **WhatsApp:** Bağlan'a basın, telefonda Bağlı cihazlar menüsünden QR kodunu okutun.
2. **Başvurular:** Etkinliği seçin, kişileri işaretleyin, kabul/ret/yedek kararını
   önizleyip onaylayın. Durum CMS'e yazılır, aktif mail şablonu gönderilir; istenirse
   WhatsApp metni kuyruğa eklenir. Test kayıtları varsayılan olarak seçim dışındadır.
3. **Kapı:** Biletler kapıdaki telefonda CMS kapı okuyucusuyla (`<CMS>/admin/kapi`)
   okutulur; bu ekran canlı panodur ve hoş geldin mesajlarını kuyruktan gönderir.
4. **Şablonlar:** Mail konusu, HTML ve isteğe bağlı WhatsApp metni. Değişkenler çift
   süslü parantezle yazılır: `adSoyad`, `ad`, `etkinlik`, `tarih`, `saat`, `konum`,
   `konumLinki`, `biletLinki`, `masa`.

## Sorun giderme

- **Giriş 403:** Hesapta TOTP kurulu ve doğrulanmış olmalı.
- **CMS bağlantısı yok:** İnterneti ve CMS adresinin erişilebilirliğini kontrol edin.
- **Kuyrukta inceleme gerekiyor:** Mesajın ulaşıp ulaşmadığını telefondan kontrol
  etmeden yeniden göndermeyin.
- **4100 portu dolu:** Uygulamanın ikinci kopyasını kapatın.

## Geliştirici notları

Ortam değişkenleri (adları CMS ile ortak sözleşmedir, değiştirmeyin):

| Değişken | Açıklama |
| --- | --- |
| `BYT_WORKER_CMS_ORIGIN` | CMS kökü (varsayılan `KULUP.adresler.cms`) |
| `BYT_WORKER_SITE_URL` | Bilet/sertifika bağlantıları için site (varsayılan `KULUP.adresler.site`) |
| `BYT_WORKER_MEDIA_HOSTS` | WhatsApp medyası için izinli hostlar (varsayılan `KULUP.adresler.cdn` hostu) |
| `BYT_WORKER_WA_ALLOWLIST` | Doluysa WhatsApp yalnız bu numaralara gider |
| `BYT_WORKER_MAIL_ALLOWLIST` | Doluysa mail yalnız bu adreslere gider |

Staging örneği (Linux):

```sh
BYT_WORKER_CMS_ORIGIN=https://staging-cms.example.invalid \
BYT_WORKER_SITE_URL=https://staging.example.invalid \
BYT_WORKER_WA_ALLOWLIST=+900000000001 \
BYT_WORKER_MEDIA_HOSTS=media.staging.example.invalid \
npm run dev
```

Canlı olmayan CMS'e bağlıyken üstte sarı bant görünür; site hostu canlı siteyse bilet
bağlantılarının canlıya gideceği ayrıca uyarılır. CMS tarafında worker kökenine izin
vermek için `EXTRA_ALLOWED_ORIGINS` ayarlanmalıdır.

Kontroller: `npm run typecheck`, `npm test`, `npm run build`. WhatsApp oturumu ve
gönderim geçmişi Electron'un kullanıcı verisi dizininde tutulur; `whatsapp-auth/`,
`session.json`, `history.json`, `queue-uncertain.json` repoya eklenmez.
