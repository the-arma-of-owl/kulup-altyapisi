# Yapay zekâ ajanları için

Bu repoda çalışmaya başlamadan önce **`README.md`'yi baştan sona oku**; mimari, yerel kurulum, testler, yayına
alma ve veritabanı şeması süreci orada. Site koduna dokunacaksan `site/AGENTS.md`'yi de oku.

En sık yapılan ve geri alınması zor hatalar:

- `main`'e push genellikle canlıya yayındır (Vercel site + CMS derler). Push'u bakımcıya sormadan yapma.
- Canlı veritabanına Payload şema push'u / `payload migrate` yok; şema `cms/sql/*.sql` ile ve onayla değişir.
- Medya deposunda (R2/S3) silme, taşıma, `sync` yok; yalnız yeni adla ekleme.
- Sır (token, parola, anahtar) ve kişisel veri koda, belgeye, commit'e girmez.
- Testte gerçek kişilere mail/WhatsApp gitmez; canlı formlar gönderilmez.
