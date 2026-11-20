#!/usr/bin/env bash
# Yer tutucu logo, ikon, OG ve mail görsellerini kulup.config.json'dan (kisaAd, tamAd, tema.anaRenk) üretir.
# Gerekli: ImageMagick 7 (magick), node. Kullanım: bash scripts/gorsel-uret.sh
# Kendi tasarımların hazır olunca aynı dosya adlarıyla üzerine koyman yeterli.
set -euo pipefail
cd "$(dirname "$0")/.."
oku() { node -e "const k=require('./kulup.config.json');console.log($1)"; }
KISA=$(oku k.kisaAd); TAM=$(oku k.tamAd); RENK=$(oku k.tema.anaRenk); IKINCI=$(oku k.tema.ikinciRenk)
FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || echo DejaVu-Sans-Bold)
FONT2=$(fc-match -f '%{file}' 'DejaVu Sans' 2>/dev/null || echo DejaVu-Sans)
P=site/public; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

# Logo: boş yer tutucu (gri daire, "LOGO" yazısı). Kendi logonu site/public/logo.png olarak koy.
magick -size 1024x1024 xc:none -fill '#e5e7eb' -stroke '#9ca3af' -strokewidth 16 -draw 'circle 512,512 512,16' \
  -stroke none -fill '#6b7280' -font "$FONT" -pointsize 210 -gravity center -annotate +0-40 'LOGO' \
  -font "$FONT2" -pointsize 70 -annotate +0+150 '1024 × 1024' "$T/logo.png"
cp "$T/logo.png" $P/logo.png
magick "$T/logo.png" -resize 256x256 site/src/app/icon.png
magick -size 180x180 xc:white \( "$T/logo.png" -resize 164x164 \) -gravity center -composite site/src/app/apple-icon.png
magick "$T/logo.png" -define icon:auto-resize=48,32,16 $P/favicon.ico
for s in 192 512; do
  magick "$T/logo.png" -resize ${s}x${s} $P/pwa/icon-$s.png
  magick -size ${s}x${s} xc:'#e5e7eb' -fill '#6b7280' -font "$FONT" -pointsize $((s*18/100)) -gravity center -annotate +0+0 'LOGO' $P/pwa/maskable-$s.png
done

# Paylaşım önizlemesi (OG) 1200×630
magick -size 1200x630 xc:"$RENK" -fill "$IKINCI" -draw "rectangle 0,500 1200,630" -fill white -font "$FONT" -pointsize 150 -gravity center -annotate +0-60 "$KISA" \
  -font "$FONT2" -pointsize 40 -annotate +0+80 "$TAM" -quality 85 $P/og/varsayilan.jpg

# Mail görselleri: boş yer tutucular
magick -size 1200x900 xc:'#eceef2' -stroke '#b8bdc7' -strokewidth 6 -fill none -draw 'roundrectangle 30,30 1170,870 40,40' \
  -stroke none -fill '#8a909c' -font "$FONT" -pointsize 54 -gravity center -annotate +0-40 'Mail üst görseli' \
  -font "$FONT2" -pointsize 34 -annotate +0+40 '1200 × 900 · site/public/mail/kod-ust-1.png' $P/mail/kod-ust-1.png
magick -size 408x218 xc:none -fill '#3a3f4a' -draw 'circle 102,109 102,19' -draw 'circle 306,109 306,19' \
  -fill '#c9ccd3' -font "$FONT" -pointsize 22 -gravity center -annotate -102+0 'Üniversite' -annotate +102+0 'Kulüp' $P/mail/logolar-1.png

# Worker ikonları
magick "$T/logo.png" worker/assets/icon.png
magick "$T/logo.png" -resize 256x256 cms/public/logo.png
magick "$T/logo.png" -resize 512x512 worker/src/assets/logo-512.png
echo "Görseller üretildi ($KISA, $RENK)."
