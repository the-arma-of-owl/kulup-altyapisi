export const GATE_FIELD_EXAMPLE = [
  { key: 'masa', label: 'Masa', required: true, min: 1, max: 40 },
  { key: 'grup', label: 'Grup', required: false, options: ['A', 'B', 'C'] },
]

export const GATE_FIELD_DESCRIPTION =
  `Kapıda her girişte görevliye sorulacak ek alanlar; gerekmiyorsa boş bırakın. key yalnız harf, rakam ve alt çizgi içerir; required: true alanı zorunlu kılar. Tamsayı min/max aralığı veya options listesi tekerlekle seçilir; sayı aralığı 500 değeri aşarsa metin kutusu kullanılır. Girilen değer mesaj şablonunda {{anahtar}} ile kullanılabilir. Yapay zekâya kopyalayın: Aşağıdaki ihtiyacı yalnız JSON dizi olarak yaz, açıklama ekleme, şu biçimde: ${JSON.stringify(GATE_FIELD_EXAMPLE)}. Her alan için key ve isteğe bağlı label, required, min, max veya options kullan. İhtiyacım: [alanları buraya yazın].`
