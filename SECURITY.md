# Güvenlik Politikası · Security Policy

[Türkçe](#türkçe) · [English](#english)

<div align="center">

## 📮 efecamn200@gmail.com

**Güvenlik açığı bildirimleri için · For security reports**

</div>

---

## Türkçe

Bu altyapıda bir güvenlik açığı bulduysanız lütfen bize bildirin. Bulgunuzu ciddiye alır, hızlıca inceler ve
geçerli bildirimleri **Hall of Fame** (Onur Listesi) sayfamızda adınızla anmaktan mutluluk duyarız.

### Nasıl bildirilir

1. **E-posta:** **efecamn200@gmail.com** adresine yazın. Konu satırına `[GÜVENLİK]` ekleyin.
2. **GitHub:** Bu deponun **Security** sekmesinden **Report a vulnerability** ile gizli bildirim açabilirsiniz.

Lütfen açığı **herkese açık bir issue ya da pull request olarak paylaşmayın**; düzeltme yayına çıkana kadar
gizli kalsın.

### Bildiriminizde neler olsun

- Açığın kısa tanımı ve etkisi (ne yapılabiliyor?)
- Etkilenen bölüm: site (`site/`), CMS (`cms/`), worker (`worker/`) ya da altyapıyı kullanan bir kulübün canlı sitesi
- Adım adım yeniden üretme yolu, varsa kavram kanıtı (PoC)
- Hall of Fame'de görünmesini istediğiniz ad ve bağlantı (isteğe bağlı)

### Ne zaman dönüş alırsınız

| Aşama | Hedef süre |
|---|---|
| İlk yanıt | 3 gün içinde |
| İlk değerlendirme | 7 gün içinde |
| Düzeltme | Önem derecesine göre, mümkün olan en kısa sürede |

Düzeltme yayına çıkınca sizi bilgilendirir, isterseniz adınızı Hall of Fame'e ekleriz.

### Kapsam

**Kapsamda:** bu depodaki kod (site, CMS, worker) ve altyapıyı kullanan kulüplerin canlı siteleri
(ör. [bytfirat.com](https://www.bytfirat.com), [abtfirat.com](https://www.abtfirat.com)).

**Kapsam dışı:** hizmet engelleme (DoS/DDoS), yoğun otomatik tarama, sosyal mühendislik, fiziksel saldırılar,
üçüncü taraf hizmetlerin (Vercel, Supabase, Cloudflare, Resend) kendi açıkları.

### Kurallar

- Yalnız kendi hesaplarınızla ve test verisiyle çalışın; başkalarının kişisel verisine erişmeyin, değiştirmeyin,
  silmeyin. Erişirseniz durun ve bize bildirin.
- Hizmeti bozacak ya da diğer kullanıcıları etkileyecek testlerden kaçının.
- Açığı düzeltilene kadar kimseyle paylaşmayın.

Bu kurallara uyan, iyi niyetli güvenlik araştırmalarına karşı hukuki yola başvurmayız.

---

## English

If you have found a security vulnerability in this stack, please report it to us. We take every report
seriously, review it quickly, and we are happy to credit valid reports by name on our **Hall of Fame** page.

### How to report

1. **Email:** write to **efecamn200@gmail.com**. Add `[SECURITY]` to the subject line.
2. **GitHub:** open a private report via **Report a vulnerability** on this repository's **Security** tab.

Please **do not share the vulnerability in a public issue or pull request**; keep it private until a fix is released.

### What to include

- A short description of the issue and its impact (what can an attacker do?)
- The affected part: website (`site/`), CMS (`cms/`), worker (`worker/`), or a live site of a club using this stack
- Step-by-step reproduction and a proof of concept (PoC), if you have one
- The name and link you would like shown on the Hall of Fame (optional)

### When to expect a response

| Stage | Target |
|---|---|
| First reply | within 3 days |
| Initial assessment | within 7 days |
| Fix | as soon as possible, depending on severity |

We will let you know when the fix is released and, if you wish, add your name to the Hall of Fame.

### Scope

**In scope:** the code in this repository (site, CMS, worker) and the live sites of clubs using this stack
(e.g. [bytfirat.com](https://www.bytfirat.com), [abtfirat.com](https://www.abtfirat.com)).

**Out of scope:** denial of service (DoS/DDoS), high-volume automated scanning, social engineering, physical
attacks, and vulnerabilities in third-party services themselves (Vercel, Supabase, Cloudflare, Resend).

### Rules

- Only test with your own accounts and test data; do not access, modify or delete other people's personal data.
  If you do access it, stop and tell us.
- Avoid tests that would disrupt the service or affect other users.
- Do not share the vulnerability with anyone until it is fixed.

We will not pursue legal action against good-faith security research that follows these rules.
