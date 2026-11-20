# CMS

Payload CMS 3.90 (Next.js 15). Yönetim paneli `/admin` (iki adımlı doğrulama zorunlu). Canlıda Postgres
(Supabase), dosyalar Cloudflare R2; yerelde SQLite (`data/dev.db`). Kulübün adı ve adresleri `src/kulup.json`'dan
gelir (kökteki `kulup.config.json`'un kopyası, elle düzenlenmez).

Kurulum, kurallar ve yayına alma için **kök `README.md`'yi oku.** Özellikle:

- Canlı veritabanında Payload şema "push"u ya da `payload migrate` çalıştırılmaz; şema `sql/` altındaki
  dosyalarla yönetilir (ilk kurulum: `sql/000_kurulum.sql`).
- Paket yöneticisi **pnpm 10** (`pnpm-lock.yaml`; Vercel de bunu kullanır).

```bash
cp .env.example .env
npx pnpm@10 install
npx pnpm@10 dev                 # http://localhost:3001
npx pnpm@10 seed:local          # örnek veri
npx pnpm@10 exec vitest run     # tests/int
npx pnpm@10 generate:types      # koleksiyon değişince payload-types.ts
bash scripts/sema-uret.sh       # koddan güncel şema dökümü (Docker)
```

| Klasör | İçerik |
|---|---|
| `src/collections/`, `src/globals/` | İçerik modelleri |
| `src/endpoints/` | Özel uçlar: takım modu (`teams.ts`), canlı jüri (`juryLive.ts`), kapı (`gateCheckin.ts`) |
| `src/app/api/cron/` | Vercel cron: `backup`, `daily-report` (`vercel.json`) |
| `src/app/api/telegram/webhook/` | Telegram bot komutları |
| `src/lib/` | `kulup.ts`, Resend, Telegram, yedek, site önbellek yenileme, tekrar başvuru koruması, analitik, gözlem |
| `sql/` | Veritabanı şeması |
