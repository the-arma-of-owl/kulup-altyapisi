// Okuma sayfaları (blog yazıları, Üniversitede Yeniyim rehberi) ve takım modu form sayfaları
// (katılımcı girişi, takım paneli/editörü, jüri paneli, herkese açık takım sayfası): dikkat dağılmasın ve
// formların üstüne binmesin diye robot kapalı gelir (istenirse açılır), kenardaki sosyal medya kutuları
// ve kayan yazı gösterilmez.
const READING_SEGMENTS = ['blog', 'universitede-yeniyim', 'katilimci'];
// /etkinlikler/<slug>/<alt> derin yolları (etkinlik detay sayfasının kendisi okuma modu DEĞİL)
const EVENT_SUBPAGES = ['takim', 'takimlar', 'juri'];

/** `/tr/blog/...` veya `/blog/...` (yerel önekli ya da öneksiz) yolları için true. */
export function isReadingPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const all = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  const parts = all[0] === 'tr' || all[0] === 'en' ? all.slice(1) : all;
  const first = parts[0] ?? '';
  if (READING_SEGMENTS.includes(first)) return true;
  return first === 'etkinlikler' && parts.length >= 3 && EVENT_SUBPAGES.includes(parts[2]);
}
