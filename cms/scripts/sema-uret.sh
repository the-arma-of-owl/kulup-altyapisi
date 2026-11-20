#!/usr/bin/env bash
# Koddaki Payload koleksiyonlarından GÜNCEL şemanın tam dökümünü üretir (geçici Docker Postgres'te).
#
#   cd cms && bash scripts/sema-uret.sh            → sql/.uretilen-sema.sql
#
# Ne işe yarar? Bir koleksiyona alan/koleksiyon eklediğinde canlı veritabanına uygulanacak SQL'i yazmak için:
#   1) Bu betiği değişiklikten ÖNCE ve SONRA çalıştır (ya da sql/000_kurulum.sql ile karşılaştır).
#   2) İki döküm arasındaki farktan yalnız EKLEME ifadelerini (CREATE TABLE/TYPE/INDEX, ALTER TABLE ADD ...) al,
#      sql/00N_<aciklama>.sql adıyla kaydet, önce test veritabanında sonra canlıda uygula.
# Canlı veritabanına ASLA Payload push'u yapma: tanımadığı tabloları (analytics_events, obs.*) siler.
#
# Gerekenler: docker, cms/ içinde `pnpm install` yapılmış olması.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="kulup-sema-$$"
PORT="${SEMA_PORT:-55433}"
OUT="sql/.uretilen-sema.sql"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f src/__sema_push.ts' EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=yerel -e POSTGRES_DB=sema -p "127.0.0.1:${PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres -q && break; sleep 1; done

# 1) Payload şemayı boş veritabanına kurar (R2 sütunları da oluşsun diye sahte R2 değişkenleri verilir)
cat > src/__sema_push.ts <<'TS'
import { getPayload } from 'payload'
import config from './payload.config'
await getPayload({ config })
process.exit(0)
TS
PAYLOAD_DB=postgres PAYLOAD_PUSH=1 NODE_ENV=development \
DATABASE_URL="postgres://postgres:yerel@127.0.0.1:${PORT}/sema" PAYLOAD_SECRET=yalniz-sema-uretimi \
R2_ENDPOINT=https://x.r2.cloudflarestorage.com R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=x \
  npx tsx src/__sema_push.ts < /dev/null

# 2) Payload dışı tablolar (analytics_events, obs.*) 000_kurulum.sql'den alınır: dosyayı ayrı bir veritabanına
#    uygulayıp yalnız bu nesneleri karşılaştırmak için ayrıca dökmeye gerek yok; fark Payload tablolarındadır.
docker exec "$NAME" pg_dump -U postgres -d sema --schema-only --no-owner --no-privileges --schema=public \
  | grep -v '^\\' > "$OUT"

echo "Yazıldı: cms/$OUT ($(grep -c 'CREATE TABLE' "$OUT") tablo)"
echo "Karşılaştır: diff <(grep -v '^--' sql/000_kurulum.sql) <(grep -v '^--' $OUT) | less"
