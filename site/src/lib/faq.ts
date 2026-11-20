/**
 * SSS sıralaması ve anasayfa seçimi CMS'ten yönetilir:
 *  - Sorular ve kategoriler CMS listesinde sürükle-bırak ile sıralanır (Payload `orderable` → `_order`)
 *  - "Anasayfada göster" (showOnHomepage) işaretli sorular anasayfada çıkar
 * fetchFAQ soruları zaten `_order`a göre getirir; burada sadece kategorilere ayrılır.
 */

type FaqCategory = { name?: string; _order?: string | null } | string | number | null | undefined;
type FaqItem = { question?: string; answer?: string; category?: FaqCategory; showOnHomepage?: boolean | null };

const compareOrder = (a?: string | null, b?: string | null) => {
  // Sırası olmayanlar sona (Payload anahtarları düz string karşılaştırmasıyla sıralanır)
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  return a ? -1 : b ? 1 : 0;
};

/** Soruları kategorilere ayırır; kategoriler CMS sırasıyla, sırası yoksa ada göre. */
export function groupFaqsByCategory<T extends FaqItem>(faqs: T[]) {
  const groups = new Map<string, { name: string; order?: string | null; items: T[] }>();
  for (const item of faqs) {
    const cat = item.category;
    const name = (typeof cat === 'object' && cat !== null ? cat.name : undefined) || 'Genel';
    const order = typeof cat === 'object' && cat !== null ? cat._order : undefined;
    if (!groups.has(name)) groups.set(name, { name, order, items: [] });
    groups.get(name)!.items.push(item);
  }
  return [...groups.values()].sort(
    (a, b) => compareOrder(a.order, b.order) || a.name.localeCompare(b.name, 'tr')
  );
}

/** Anasayfa önizlemesi: işaretli sorular (en fazla 4); hiçbiri işaretli değilse ilk 4 soru. */
export function homepageFaqs<T extends FaqItem>(faqs: T[], limit = 4) {
  const featured = faqs.filter((f) => f.showOnHomepage);
  return (featured.length > 0 ? featured : faqs).slice(0, limit);
}
