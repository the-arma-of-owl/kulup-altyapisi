# Site

Next.js 16 (App Router), React 19, Tailwind 4, next-intl (yalnız `tr`). İçeriği CMS'ten okur; kulübün adı,
adresleri ve renkleri `src/kulup.json`'dan gelir (kökteki `kulup.config.json`'un kopyası, elle düzenlenmez).

Kurulum, kurallar ve yayına alma için **kök `README.md`'yi oku.** Bu Next.js sürümü eğitim verisindekinden
farklı olabilir: kod yazmadan önce `AGENTS.md`'deki notu uygula.

```bash
cp .env.example .env.local
npm ci
npm run dev                      # http://localhost:3000 (127.0.0.1 değil)
npx tsx --test tests/*.test.ts   # birim testleri
npx tsc --noEmit -p . && npm run lint
```

| Klasör | İçerik |
|---|---|
| `src/app/[locale]/` | Sayfalar |
| `src/app/api/` | CMS vekili (`cms`), takım vekili (`takim`), `revalidate`, bağlantı önizleme görseli (`og`) |
| `src/components/` | `home` (ana sayfa bölümleri), `events`, `teams`, `jury`, `layout` (navbar, alt bilgi), `ui` |
| `src/lib/` | `kulup.ts` (kulüp bilgileri), `api.ts` (CMS okuma ve önbellek etiketleri), `cmsProxy.ts`, `revalidate.ts`, `seo.ts` |
| `public/` | Logo, simgeler, bağlantı önizleme görseli, e-posta görselleri |
