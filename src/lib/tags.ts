/**
 * Sohbetlere (ve gerektiğinde projelere) eklenebilen serbest-metin
 * etiketler için renk paleti ve yardımcı fonksiyonlar.
 *
 * Kullanıcı etiket adını kendi yazar (ör. "İş", "Tatil", "Acil") — ayrı bir
 * "renk seç" adımı yoktur; her etiketin rengi, etiket METNİNDEN
 * DETERMİNİSTİK olarak türetilir (basit bir hash → sabit palet). Aynı
 * etiket adı her zaman aynı rengi alır, farklı thread'lerde bile — bu
 * sayede kullanıcı "İş" etiketini birden fazla sohbete eklediğinde hepsi
 * görsel olarak tutarlı kalır, ekstra bir eşleme tablosu saklamaya gerek
 * kalmaz.
 */

export const TAG_COLORS = [
  { bg: "bg-blue-500/15", text: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/15", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-amber-500/15", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-500/15", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-violet-500/15", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-cyan-500/15", text: "text-cyan-700", dot: "bg-cyan-500" },
  { bg: "bg-orange-500/15", text: "text-orange-700", dot: "bg-orange-500" },
  { bg: "bg-pink-500/15", text: "text-pink-700", dot: "bg-pink-500" },
] as const;

/** Etiket metninden deterministik bir palet rengi seçer. */
export function colorForTag(tag: string): (typeof TAG_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}

/** Etiket girişini normalize eder: baş/son boşluk temizlenir, 24 karaktere
 * kırpılır. Boş girişte null döner (eklenmemeli demektir). */
export function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 24);
  return trimmed || null;
}
