/**
 * Kullanıcının Ayarlar panelinden yaptığı tüm özelleştirmeleri localStorage'da
 * saklayan merkezi store. Tek bir JSON nesnesi olarak tutulur, React
 * bileşenleri `useSettings()` hook'uyla okur/günceller (bkz. SettingsPanel).
 *
 * Not: Model seçimi kullanıcıya bırakılmıyor — sohbet backend'i
 * (routes/api/chat.ts) MODEL_FALLBACK_CHAIN üzerinden otomatik dener,
 * bu yüzden burada model listesi/seçimi tanımlı DEĞİL. Eskiden
 * "CHAT_MODEL_OPTIONS" / "chatModel" adında bir liste ve ayar alanı
 * vardı; hiçbir UI bileşeni bunu okumuyor/göstermiyordu ve backend'in
 * kendi model listesinden bağımsız, senkron olmayan bir kopyaydı —
 * ölü kod olduğu için kaldırıldı.
 */

import { namespacedKey } from "./current-user";

export type VoiceOption = { id: string; label: string; description: string };

export type PersonaPreset = { id: string; label: string; emoji: string; instructions: string };

/**
 * Ayarlar > Kişilik'te "Kişilik / Ekstra Talimat" alanının üstünde gösterilen
 * hazır şablonlar. Tıklanınca `extraInstructions` alanının içeriğini bu
 * metinle DOLDURUR (üzerine yazar) — kullanıcı isterse sonra elle düzenler.
 * Ayrı bir "seçili şablon" state'i TUTULMAZ: şablon sadece bir başlangıç
 * noktasıdır, seçildikten sonra normal serbest metin gibi davranır (bu
 * yüzden NovaSettings tipine yeni bir alan eklenmedi).
 */
export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "concise",
    label: "Kısa ve net",
    emoji: "⚡",
    instructions:
      "Yanıtlarını olabildiğince kısa ve öz tut. Gereksiz giriş/kapanış cümleleri kurma, doğrudan cevaba gir. Uzun açıklama yerine maddeler kullan.",
  },
  {
    id: "teacher",
    label: "Öğretmen modu",
    emoji: "🎓",
    instructions:
      "Bir öğretmen gibi davran: kavramları adım adım, basit örneklerle açıkla. Karmaşık bir terim kullandığında kısaca tanımla. Anladığımdan emin olmak için ara sıra kontrol sorusu sor.",
  },
  {
    id: "code",
    label: "Kod odaklı",
    emoji: "💻",
    instructions:
      "Teknik ve kod ağırlıklı yanıt ver. Gereksiz teori yerine doğrudan çalışan kod örnekleri sun. Açıklamaları kod yorumları veya kısa maddeler halinde ver, uzun düzyazıdan kaçın.",
  },
  {
    id: "friendly",
    label: "Samimi ve sıcak",
    emoji: "😊",
    instructions:
      "Samimi, sıcak ve arkadaşça bir üslup kullan. Resmi dilden kaçın, günlük konuşma diline yakın yaz. Ara sıra emoji kullanabilirsin ama abartma.",
  },
  {
    id: "critic",
    label: "Doğrudan eleştirel",
    emoji: "🧭",
    instructions:
      "Fikirlerimi nazikçe süslemeden, doğrudan değerlendir. Bir şeyde hata veya zayıf nokta görürsen açıkça söyle, gerekçesini kısaca belirt. Gereksiz onay/övgüden kaçın.",
  },
];

/** Gemini TTS'in desteklediği 30 hazır ses (bkz. Gemini API "Voice options"). */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "Zephyr", label: "Zephyr", description: "Parlak" },
  { id: "Puck", label: "Puck", description: "Neşeli" },
  { id: "Charon", label: "Charon", description: "Bilgilendirici" },
  { id: "Kore", label: "Kore", description: "Kararlı (varsayılan)" },
  { id: "Fenrir", label: "Fenrir", description: "Heyecanlı" },
  { id: "Leda", label: "Leda", description: "Genç" },
  { id: "Orus", label: "Orus", description: "Kararlı" },
  { id: "Aoede", label: "Aoede", description: "Rahat" },
  { id: "Callirrhoe", label: "Callirrhoe", description: "Sakin" },
  { id: "Autonoe", label: "Autonoe", description: "Parlak" },
  { id: "Enceladus", label: "Enceladus", description: "Nefesli" },
  { id: "Iapetus", label: "Iapetus", description: "Net" },
  { id: "Umbriel", label: "Umbriel", description: "Rahat" },
  { id: "Algieba", label: "Algieba", description: "Pürüzsüz" },
  { id: "Despina", label: "Despina", description: "Pürüzsüz" },
  { id: "Erinome", label: "Erinome", description: "Net" },
  { id: "Algenib", label: "Algenib", description: "Kalın" },
  { id: "Rasalgethi", label: "Rasalgethi", description: "Bilgilendirici" },
  { id: "Laomedeia", label: "Laomedeia", description: "Neşeli" },
  { id: "Achernar", label: "Achernar", description: "Yumuşak" },
  { id: "Alnilam", label: "Alnilam", description: "Kararlı" },
  { id: "Schedar", label: "Schedar", description: "Dengeli" },
  { id: "Gacrux", label: "Gacrux", description: "Olgun" },
  { id: "Pulcherrima", label: "Pulcherrima", description: "Girişken" },
  { id: "Achird", label: "Achird", description: "Samimi" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi", description: "Gündelik" },
  { id: "Vindemiatrix", label: "Vindemiatrix", description: "Nazik" },
  { id: "Sadachbia", label: "Sadachbia", description: "Canlı" },
  { id: "Sadaltager", label: "Sadaltager", description: "Bilgili" },
  { id: "Sulafat", label: "Sulafat", description: "Sıcak" },
];

export type LanguageOption = { code: string; label: string };

/** Ayarlar panelinde seçilebilen yanıt dilleri. "auto" model, kullanıcının
 * yazdığı dile göre otomatik yanıt verir (varsayılan davranış); diğerleri
 * seçildiğinde model o dilde yanıt vermesi için açıkça yönlendirilir (bkz.
 * buildSettingsHeaders). Liste dünyada yaygın konuşulan dilleri kapsar. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "auto", label: "Otomatik (yazdığın dile göre)" },
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "el", label: "Ελληνικά" },
  { code: "cs", label: "Čeština" },
  { code: "ro", label: "Română" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" },
  { code: "no", label: "Norsk" },
  { code: "hu", label: "Magyar" },
  { code: "bg", label: "Български" },
  { code: "sr", label: "Српски" },
  { code: "hr", label: "Hrvatski" },
  { code: "sk", label: "Slovenčina" },
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "fa", label: "فارسی" },
  { code: "ur", label: "اردو" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "th", label: "ไทย" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "az", label: "Azərbaycan dili" },
  { code: "kk", label: "Қазақ тілі" },
  { code: "uz", label: "Oʻzbek tili" },
  { code: "sw", label: "Kiswahili" },
  { code: "am", label: "አማርኛ" },
];

export type ToneStyle =
  "default" | "professional" | "friendly" | "candid" | "quirky" | "efficient" | "sharp-tongued";

export type ToneStyleOption = {
  id: ToneStyle;
  label: string;
  description: string;
  instruction: string;
};

/** Ayarlar > Kişiselleştirme > Temel üslup ve konuşma tonu seçenekleri. */
export const TONE_STYLE_OPTIONS: ToneStyleOption[] = [
  {
    id: "default",
    label: "Varsayılan",
    description: "Dengeli, yardımsever, standart bir ton",
    instruction: "",
  },
  {
    id: "professional",
    label: "Profesyonel",
    description: "Resmi, net, iş odaklı bir dil",
    instruction: "Profesyonel, resmi ve net bir üslup kullan; gereksiz gündelik ifadelerden kaçın.",
  },
  {
    id: "friendly",
    label: "Dostane",
    description: "Sıcak, destekleyici, samimi bir arkadaş gibi",
    instruction:
      "Dostane, sıcak ve destekleyici bir üslup kullan; samimi bir arkadaşla konuşur gibi yaz.",
  },
  {
    id: "candid",
    label: "İçten",
    description: "Dürüst, doğrudan, süslemeden konuşan",
    instruction:
      "İçten ve dürüst bir üslup kullan; doğrudan konuş, gereksiz yere yumuşatma veya süsleme.",
  },
  {
    id: "quirky",
    label: "Sıra Dışı",
    description: "Yaratıcı, beklenmedik, esprili bir enerji",
    instruction:
      "Sıra dışı ve yaratıcı bir üslup kullan; beklenmedik benzetmeler ve hafif esprili bir enerji kat.",
  },
  {
    id: "efficient",
    label: "Etkili",
    description: "Kısa, öz, dolaysız — laf kalabalığı yok",
    instruction:
      "Etkili ve öz bir üslup kullan; mümkün olduğunca kısa yaz, gereksiz girizgahlardan kaçın.",
  },
  {
    id: "sharp-tongued",
    label: "Sivri Dilli",
    description: "Keskin, iğneleyici, filtresiz yorumlar",
    instruction:
      "Sivri dilli ve keskin bir üslup kullan; gerektiğinde iğneleyici ve filtresiz yorumlar yap (kaba veya hakaret içeren bir dile varmadan).",
  },
];

export type AttributeLevel = "less" | "default" | "more";

export interface ToneAttributes {
  /** "Samimi" niteliği: Daha Az / Varsayılan / Daha Çok. */
  warmth: AttributeLevel;
  /** "Coşkulu" niteliği: Daha Az / Varsayılan / Daha Fazla. */
  enthusiasm: AttributeLevel;
  /** "Başlıklar ve listeler" niteliği: Daha Az / Varsayılan / Daha Fazla. */
  structure: AttributeLevel;
  /** "Emoji" niteliği: Daha Az / Varsayılan / Daha Fazla. */
  emoji: AttributeLevel;
}

export const DEFAULT_TONE_ATTRIBUTES: ToneAttributes = {
  warmth: "default",
  enthusiasm: "default",
  structure: "default",
  emoji: "default",
};

/** Nitelik ayarlarını (bkz. ToneAttributes) tek bir talimat metnine çevirir. Hepsi "default" ise boş döner. */
export function buildToneAttributeInstruction(attrs: ToneAttributes): string {
  const parts: string[] = [];
  if (attrs.warmth !== "default") {
    parts.push(
      attrs.warmth === "more" ? "Daha samimi ve içten ol." : "Daha az samimi, daha mesafeli ol.",
    );
  }
  if (attrs.enthusiasm !== "default") {
    parts.push(
      attrs.enthusiasm === "more"
        ? "Daha coşkulu ve enerjik bir ton kullan."
        : "Daha az coşkulu, daha sakin bir ton kullan.",
    );
  }
  if (attrs.structure !== "default") {
    parts.push(
      attrs.structure === "more"
        ? "Yanıtlarında başlıklar ve listeler kullanarak daha fazla yapılandır."
        : "Başlık ve liste kullanımını azalt, daha çok düz metin (paragraf) halinde yaz.",
    );
  }
  if (attrs.emoji !== "default") {
    parts.push(
      attrs.emoji === "more"
        ? "Yanıtlarında daha fazla emoji kullan."
        : "Emoji kullanımını azalt, mümkünse hiç kullanma.",
    );
  }
  return parts.join(" ");
}

// Not: Bu liste, gerçekte notify() ile tetiklenen kategorilerle sınırlı
// tutulur (bkz. notifications.ts). Önceden burada "tasks" (zamanlanmış
// görev sistemi yok), "personalizedTips" (öneri motoru yok) ve "usage"
// (token/kullanım sınırı takibi yok) gibi hiçbir kod yolunun tetiklemediği
// kategoriler de vardı — kullanıcı bunları açıp kapatabiliyordu ama
// hiçbir gözlemlenebilir etkisi yoktu. Karşılığı olmayan bir ayarı
// göstermek yerine kaldırıldılar; ileride bu özellikler gerçekten
// eklenirse buraya geri konulabilir.
export type NotificationKey = "code" | "library" | "projects" | "responses";

export type NotificationPrefs = Record<NotificationKey, boolean>;

export const NOTIFICATION_LABELS: { key: NotificationKey; label: string; description: string }[] = [
  {
    key: "code",
    label: "Code",
    description: "Canvas'ta kod çalıştırma tamamlandığında bildirim",
  },
  {
    key: "library",
    label: "Library",
    description: "Görsel/video/müzik üretimi tamamlandığında bildirim",
  },
  {
    key: "projects",
    label: "Projeler",
    description: "Proje bağlantısı paylaşıldığında bildirim",
  },
  {
    key: "responses",
    label: "Yanıtlar",
    description: "Uzun süren yanıtlar tamamlandığında bildirim",
  },
];

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  code: true,
  library: true,
  projects: true,
  responses: true,
};

export type IntegrationKey =
  "webSearch" | "canvas" | "imageGen" | "videoGen" | "musicGen" | "liveVoice";

export type IntegrationOption = { key: IntegrationKey; label: string; description: string };

export const INTEGRATION_OPTIONS: IntegrationOption[] = [
  {
    key: "webSearch",
    label: "Web'de Arama",
    description: "Güncel bilgi için canlı web araması yapar",
  },
  { key: "canvas", label: "Canvas", description: "Kod/metin için ayrı bir çalışma alanı açar" },
  { key: "imageGen", label: "Görsel Oluşturma", description: "Metinden görsel üretir" },
  { key: "videoGen", label: "Video Oluşturma", description: "Metinden video üretir" },
  { key: "musicGen", label: "Müzik Oluşturma", description: "Lyria ile metinden müzik üretir" },
  {
    key: "liveVoice",
    label: "Live (Sesli Sohbet)",
    description: "Gerçek zamanlı sesli sohbet modunu açar",
  },
];

export type IntegrationPrefs = Record<IntegrationKey, boolean>;

export const DEFAULT_INTEGRATIONS: IntegrationPrefs = {
  webSearch: true,
  canvas: true,
  imageGen: true,
  videoGen: true,
  musicGen: true,
  liveVoice: true,
};

export type FontSize = "small" | "medium" | "large";
export type BubbleDensity = "cozy" | "compact";
export type BackgroundMode = "gradient" | "solid" | "photo";
/** "system": işletim sisteminin `prefers-contrast` tercihini takip eder.
 * "normal": her zaman standart (mevcut) kontrast. "high": metin/kenarlık
 * kontrastını her zaman artırır — düşük görüşlü kullanıcılar için. */
export type ContrastMode = "system" | "normal" | "high";

/** Ayarlar panelinde seçilebilen hazır vurgu/gradient renk temaları. */
export type ColorTheme = {
  id: string;
  label: string;
  /** Ana gradient (4 durak) — app-gradient arka planında kullanılır. */
  gradient: [string, string, string, string];
  /** Butonlar, seçili durumlar, imza rengi için ana vurgu rengi. */
  accent: string;
  /** Sol panel (sidebar) arka plan rengi. */
  sidebar: string;
};

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "ocean",
    label: "Okyanus (varsayılan)",
    gradient: [
      "oklch(0.42 0.14 255)",
      "oklch(0.52 0.11 220)",
      "oklch(0.58 0.12 185)",
      "oklch(0.64 0.14 150)",
    ],
    accent: "oklch(0.16 0.02 250)",
    sidebar: "oklch(0.14 0.02 255)",
  },
  {
    id: "sunset",
    label: "Gün Batımı",
    gradient: [
      "oklch(0.45 0.18 25)",
      "oklch(0.55 0.19 45)",
      "oklch(0.62 0.17 65)",
      "oklch(0.7 0.15 85)",
    ],
    accent: "oklch(0.3 0.14 30)",
    sidebar: "oklch(0.16 0.05 25)",
  },
  {
    id: "violet",
    label: "Mor",
    gradient: [
      "oklch(0.4 0.16 300)",
      "oklch(0.48 0.17 285)",
      "oklch(0.56 0.16 270)",
      "oklch(0.63 0.14 255)",
    ],
    accent: "oklch(0.28 0.13 295)",
    sidebar: "oklch(0.15 0.05 295)",
  },
  {
    id: "forest",
    label: "Orman",
    gradient: [
      "oklch(0.38 0.1 155)",
      "oklch(0.46 0.11 145)",
      "oklch(0.54 0.12 135)",
      "oklch(0.62 0.13 120)",
    ],
    accent: "oklch(0.25 0.07 150)",
    sidebar: "oklch(0.14 0.03 150)",
  },
  {
    id: "mono",
    label: "Siyah-Beyaz",
    gradient: ["oklch(0.22 0 0)", "oklch(0.35 0 0)", "oklch(0.5 0 0)", "oklch(0.65 0 0)"],
    accent: "oklch(0.15 0 0)",
    sidebar: "oklch(0.1 0 0)",
  },
  {
    id: "rose",
    label: "Gül",
    gradient: [
      "oklch(0.45 0.15 350)",
      "oklch(0.55 0.16 5)",
      "oklch(0.62 0.14 20)",
      "oklch(0.7 0.12 40)",
    ],
    accent: "oklch(0.32 0.13 355)",
    sidebar: "oklch(0.16 0.05 355)",
  },
];

/** Limit dolduğunda otomatik ve zorunlu olarak geçilecek, kilitli tutulan model. */
export const FALLBACK_MODEL_ID = "gemini-3.1-flash-lite";

/** Ayarlar panelinde seçilebilen buton/vurgu renkleri (hazır palet). "custom"
 * seçiliyken kullanıcının kendi seçtiği herhangi bir renk (customAccentColor)
 * kullanılır — bkz. ThemeApplier. */
export type AccentSwatch = { id: string; label: string; color: string };

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { id: "theme", label: "Temaya göre", color: "" },
  { id: "indigo", label: "İndigo", color: "#4338ca" },
  { id: "emerald", label: "Zümrüt", color: "#059669" },
  { id: "amber", label: "Kehribar", color: "#d97706" },
  { id: "rose", label: "Gül", color: "#e11d48" },
  { id: "sky", label: "Gökyüzü", color: "#0284c7" },
  { id: "custom", label: "Özel", color: "" },
];

export type FontOption = { id: string; label: string; stack: string };

/** Ayarlar panelinde seçilebilen yazı fontları. Hepsi sistem/web-safe ya da
 * yaygın Google Fonts aileleridir; ekstra bir dosya yüklemeye gerek kalmadan
 * kullanıcının cihazında zaten varsa direkt, yoksa en yakın sistem fontuna
 * (stack sonundaki genel aile) düşer. */
export const FONT_OPTIONS: FontOption[] = [
  {
    id: "sf",
    label: "SF Pro (varsayılan)",
    stack:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", system-ui, sans-serif',
  },
  { id: "inter", label: "Inter", stack: '"Inter", "Segoe UI", system-ui, sans-serif' },
  { id: "roboto", label: "Roboto", stack: '"Roboto", "Segoe UI", system-ui, sans-serif' },
  { id: "poppins", label: "Poppins", stack: '"Poppins", "Segoe UI", system-ui, sans-serif' },
  { id: "nunito", label: "Nunito", stack: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  {
    id: "merriweather",
    label: "Merriweather (serif)",
    stack: '"Merriweather", Georgia, "Times New Roman", serif',
  },
  {
    id: "mono",
    label: "Mono (kodlayıcı)",
    stack: '"JetBrains Mono", "Fira Code", ui-monospace, "SF Mono", Menlo, monospace',
  },
  {
    id: "comic",
    label: "Samimi (Comic)",
    stack: '"Comic Sans MS", "Comic Neue", cursive, sans-serif',
  },
];

/** Live mod ekranındaki orb/dalga için hazır görünüm paletleri. */
export type LiveOrbTheme = {
  id: string;
  label: string;
  ring1: string;
  ring2: string;
  glow: string;
};

export const LIVE_ORB_THEMES: LiveOrbTheme[] = [
  {
    id: "aurora",
    label: "Aurora (varsayılan)",
    ring1: "#6ee7b7",
    ring2: "#67e8f9",
    glow: "#22d3ee",
  },
  { id: "sunset", label: "Gün Batımı", ring1: "#fca5a5", ring2: "#fdba74", glow: "#fb923c" },
  { id: "violet", label: "Mor", ring1: "#c4b5fd", ring2: "#a5b4fc", glow: "#a78bfa" },
  { id: "mono", label: "Siyah-Beyaz", ring1: "#e5e7eb", ring2: "#9ca3af", glow: "#f3f4f6" },
  { id: "rose", label: "Gül", ring1: "#fda4af", ring2: "#f9a8d4", glow: "#fb7185" },
];

export type LiveOrbShape = "orb" | "wave" | "bars";

export interface NovaSettings {
  /** Kullanıcının kendi Gemini API anahtarıyla bu oturumda şu ana kadar
   * tüketilen toplam token (prompt+yanıt). Sunucudan gelen usageMetadata
   * ile canlı güncellenir (bkz. chat-runtime.ts) — salt bilgi amaçlıdır,
   * hiçbir limit veya otomatik model değişimi tetiklemez. */
  tokensUsed: number;
  /** Sistem promptunun sonuna eklenen, kullanıcının kendi yazdığı ekstra talimat. */
  extraInstructions: string;
  /** Asistanın UI'da ve modelin kendinden bahsederken kullandığı görünen adı.
   * Boş bırakılamaz — kullanıcı silerse varsayılan "Nova"ya döner (bkz.
   * SettingsPanel.tsx ModelSection: input boşsa kaydetmede "Nova" yazılır).
   * "MelihBot" ürün/marka ön eki bundan ayrıdır ve sabittir (bkz.
   * lib/policies.ts, login ekranı) — burada değişen yalnızca kısa isim. */
  assistantName: string;
  /** Kullanıcının kendi adı/takma adı — modelin KULLANICIYA nasıl hitap
   * edeceğini belirler (assistantName'in tam tersi: o asistanın adıdır, bu
   * kullanıcının adıdır). Boşsa modele hiçbir isim bağlamı verilmez. */
  userNickname: string;
  /** Kullanıcının mesleği (Özel Talimatlar bölümünden girilir, sistem promptuna eklenir). */
  userOccupation: string;
  /** Kullanıcının kendisi hakkında serbest metin bilgisi (Özel Talimatlar). */
  userAboutMe: string;
  /** Seslendirme (TTS) için kullanılacak ses. */
  ttsVoice: string;
  /** Seslendirme konuşma hızı. Gemini TTS'in generateContent API'sinde
   * sayısal bir "speaking rate" parametresi YOKTUR (Vertex AI'da vardır
   * ama Developer API'de resmi olarak etkisizdir) — hız/ton kontrolü
   * yalnızca metnin önüne eklenen doğal-dil talimatıyla yapılır (bkz.
   * routes/api/tts.ts PACE_INSTRUCTIONS, resmi Gemini TTS prompting
   * kılavuzuna dayanır). "normal" seçiliyken hiçbir ekstra talimat
   * eklenmez (davranış değişmez). */
  ttsPace: "slow" | "normal" | "fast";
  /** Her assistant yanıtı geldiğinde otomatik olarak sesli okunsun mu. */
  autoSpeak: boolean;
  /** Sohbet metninin yazı boyutu. */
  fontSize: FontSize;
  /** Mesaj balonları arası boşluk / yoğunluk. */
  bubbleDensity: BubbleDensity;
  /** Karşılama ekranındaki hızlı eylem kartları gösterilsin mi. */
  showWelcomeCards: boolean;
  /** Seçili hazır renk teması id'si (bkz. COLOR_THEMES). */
  colorTheme: string;
  /** Arka plan modu: hazır gradient, tek düz renk, veya kullanıcı fotoğrafı. */
  backgroundMode: BackgroundMode;
  /** backgroundMode "solid" iken kullanılacak düz renk (herhangi bir CSS rengi). */
  solidColor: string;
  /** backgroundMode "photo" iken arka planın üstüne uygulanan karartma (0-80). Okunabilirlik için. */
  photoOverlayOpacity: number;
  /** Buton/vurgu rengi paleti seçimi (bkz. ACCENT_SWATCHES). "theme" ise
   * colorTheme'in accent'i kullanılır; "custom" ise customAccentColor. */
  accentSwatch: string;
  /** accentSwatch "custom" iken kullanılacak serbest seçilmiş renk. */
  customAccentColor: string;
  /** Seçili yazı fontu id'si (bkz. FONT_OPTIONS). */
  fontFamily: string;
  /** Live mod orb/dalga görünüm paleti (bkz. LIVE_ORB_THEMES). */
  liveOrbTheme: string;
  /** Live mod görsel şekli: klasik orb, dalga çubuğu veya eşitleyici çubuklar. */
  liveOrbShape: LiveOrbShape;
  /** Kontrast tercihi: sistem ayarını takip et / normal / artırılmış. */
  contrastMode: ContrastMode;
  /** "Hassas içerikleri azalt" — açıkken sistem promptuna, hassas konularda
   * ekstra temkinli ve kısıtlı davranması yönünde bir talimat eklenir. */
  reduceSensitiveContent: boolean;
  /** Yanıt dili tercihi (bkz. LANGUAGE_OPTIONS). "auto" ise dil zorlanmaz. */
  responseLanguage: string;
  /** Temel üslup ve konuşma tonu (bkz. TONE_STYLE_OPTIONS). */
  toneStyle: ToneStyle;
  /** Seçili üslubun üzerine eklenen ince ayar nitelikleri (bkz. ToneAttributes). */
  toneAttributes: ToneAttributes;
  /** Bildirim kategorileri açık/kapalı tercihleri (bkz. NOTIFICATION_LABELS). */
  notifications: NotificationPrefs;
  /** Eklenti/entegrasyon açık-kapalı tercihleri (bkz. INTEGRATION_OPTIONS). Kapalı olanlar Composer'ın "+" menüsünden gizlenir. */
  integrations: IntegrationPrefs;
}

export const DEFAULT_SETTINGS: NovaSettings = {
  tokensUsed: 0,
  extraInstructions: "",
  assistantName: "Nova",
  userNickname: "",
  userOccupation: "",
  userAboutMe: "",
  ttsVoice: "Kore",
  ttsPace: "normal",
  autoSpeak: false,
  fontSize: "medium",
  bubbleDensity: "cozy",
  showWelcomeCards: true,
  colorTheme: COLOR_THEMES[0]!.id,
  backgroundMode: "gradient",
  solidColor: "#1c2c4a",
  photoOverlayOpacity: 45,
  accentSwatch: ACCENT_SWATCHES[0]!.id,
  customAccentColor: "#4338ca",
  fontFamily: FONT_OPTIONS[0]!.id,
  liveOrbTheme: LIVE_ORB_THEMES[0]!.id,
  liveOrbShape: "orb",
  contrastMode: "system",
  reduceSensitiveContent: false,
  responseLanguage: "auto",
  toneStyle: "default",
  toneAttributes: DEFAULT_TONE_ATTRIBUTES,
  notifications: DEFAULT_NOTIFICATIONS,
  integrations: DEFAULT_INTEGRATIONS,
};

const STORAGE_KEY = "nova:settings";
/** Arka plan fotoğrafı ayrı bir anahtarda tutulur (büyük base64 veri) — bkz.
 * setStoredBackgroundPhoto notu: diğer küçük ayarlardan bağımsız okunur/yazılır. */
const BG_PHOTO_KEY = "nova:bg-photo";

export function getStoredSettings(): NovaSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(namespacedKey(STORAGE_KEY));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NovaSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // "notifications" alt-objesini de normalize et: eski sürümlerde
    // kaydedilmiş olabilecek artık geçersiz kategoriler (bkz.
    // NOTIFICATION_LABELS'taki not — "tasks"/"personalizedTips"/"usage"
    // kaldırıldı) burada süzülür; kullanıcının hâlâ geçerli olan
    // kategorilerdeki tercihi (ör. "code": false) korunur.
    const cleanNotifications = { ...DEFAULT_NOTIFICATIONS };
    for (const key of Object.keys(DEFAULT_NOTIFICATIONS) as NotificationKey[]) {
      const stored = (parsed.notifications as Partial<NotificationPrefs> | undefined)?.[key];
      if (typeof stored === "boolean") cleanNotifications[key] = stored;
    }
    // "assistantName" boş kalmasın: varsayılan artık "Nova" ama daha önce
    // (bu alan hâlâ boş string'ken) kaydedilmiş eski kullanıcıların
    // localStorage'ında "" saklı kalmış olabilir — merge onu koruyup
    // DEFAULT_SETTINGS'teki "Nova"nın üzerine yazardı. UI'da (Sidebar
    // logosu, Live ekranı) boş bir isim görünmesin diye burada normalize
    // edilir.
    const assistantName = merged.assistantName.trim() || DEFAULT_SETTINGS.assistantName;
    return { ...merged, notifications: cleanNotifications, assistantName };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setStoredSettings(settings: NovaSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(namespacedKey(STORAGE_KEY), JSON.stringify(settings));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yok say */
  }
}

/** Arka plan fotoğrafını (data-URL) okur. Yoksa null döner. */
export function getStoredBackgroundPhoto(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(namespacedKey(BG_PHOTO_KEY));
  } catch {
    return null;
  }
}

/** Arka plan fotoğrafını kaydeder/siler (value null ise siler). */
export function setStoredBackgroundPhoto(value: string | null): boolean {
  if (typeof window === "undefined") return false;
  const nsKey = namespacedKey(BG_PHOTO_KEY);
  try {
    if (value) window.localStorage.setItem(nsKey, value);
    else window.localStorage.removeItem(nsKey);
    return true;
  } catch {
    // Muhtemelen kota aşımı (fotoğraf çok büyük) — çağıran taraf kullanıcıya
    // bilgi vermeli.
    return false;
  }
}

export const FONT_SIZE_PX: Record<FontSize, string> = {
  small: "14px",
  medium: "15.5px",
  large: "17.5px",
};

/**
 * Gemini API isteklerine (/api/chat, /api/tts, /api/stt) eklenmesi gereken
 * kullanıcı tercihi header'larını üretir: model seçimi ve ekstra sistem
 * talimatı. Ekstra talimat Türkçe karakterler içerebileceği için
 * encodeURIComponent ile kodlanır (HTTP header'ları teknik olarak Latin-1
 * ile sınırlıdır); sunucu tarafında decodeURIComponent ile çözülür (bkz.
 * src/routes/api/chat.ts decodeHeaderText).
 */
/**
 * Sunucudan dönen kullanım miktarını (prompt+yanıt token'ı) mevcut oturum
 * sayacına ekler. Salt bilgi amaçlıdır — hiçbir limit uygulanmaz, model
 * seçimini değiştirmez veya kilitlemez (bkz. ModelSection canlı gösterge).
 */
export function addTokenUsage(tokens: number): NovaSettings {
  const prev = getStoredSettings();
  const tokensUsed = Math.max(0, prev.tokensUsed + Math.max(0, tokens));
  const next: NovaSettings = { ...prev, tokensUsed };
  setStoredSettings(next);
  return next;
}

/** Oturumun token sayacını sıfırlar (bkz. ModelSection "Sayacı sıfırla"). */
export function resetTokenUsage(): NovaSettings {
  const prev = getStoredSettings();
  const next: NovaSettings = { ...prev, tokensUsed: 0 };
  setStoredSettings(next);
  return next;
}

export function buildSettingsHeaders(): Record<string, string> {
  const settings = getStoredSettings();
  const headers: Record<string, string> = {};
  // Model artık kullanıcı tarafından seçilmiyor — sunucu otomatik olarak
  // en güncelden en eskiye doğru bir model zinciri dener (bkz.
  // src/routes/api/chat.ts MODEL_FALLBACK_CHAIN). Bu yüzden "x-gemini-model"
  // header'ı artık gönderilmiyor.
  // Asistan ismi ve ekstra talimat, tek bir "kişilik" bloğu olarak birleşip
  // gönderilir; sunucu bunu sistem promptunun sonuna ekler (bkz. chat.ts).
  const personaParts: string[] = [];
  if (settings.assistantName.trim()) {
    personaParts.push(
      `Adın "${settings.assistantName.trim()}". Kendinden bahsederken bu ismi kullan.`,
    );
  }
  if (settings.userNickname.trim()) {
    personaParts.push(
      `Kullanıcı sana kendi adını/takma adını şöyle belirtti: "${settings.userNickname.trim()}". Ona hitap ederken bu ismi kullan.`,
    );
  }
  if (settings.userOccupation.trim()) {
    personaParts.push(
      `Kullanıcının mesleği: ${settings.userOccupation.trim()}. Yanıtlarını verirken bu bağlamı göz önünde bulundur.`,
    );
  }
  if (settings.userAboutMe.trim()) {
    personaParts.push(`Kullanıcı kendisi hakkında şunu paylaştı: ${settings.userAboutMe.trim()}`);
  }
  if (settings.extraInstructions.trim()) {
    personaParts.push(settings.extraInstructions.trim());
  }
  if (settings.reduceSensitiveContent) {
    personaParts.push(
      "Hassas konularda (şiddet, cinsellik, yasa dışı faaliyetler, kendine zarar verme vb.) ekstra temkinli ol; bu konularda ayrıntılı/grafik içerik üretme ve daha kısıtlı, güvenli bir üslup kullan.",
    );
  }
  if (settings.responseLanguage && settings.responseLanguage !== "auto") {
    const lang = LANGUAGE_OPTIONS.find((l) => l.code === settings.responseLanguage);
    if (lang) {
      personaParts.push(
        `Kullanıcı hangi dilde yazarsa yazsın, her zaman ${lang.label} dilinde yanıt ver (kullanıcı açıkça başka bir dil istemedikçe).`,
      );
    }
  }
  const toneOption = TONE_STYLE_OPTIONS.find((t) => t.id === settings.toneStyle);
  if (toneOption?.instruction) {
    personaParts.push(toneOption.instruction);
  }
  const attributeInstruction = buildToneAttributeInstruction(settings.toneAttributes);
  if (attributeInstruction) {
    personaParts.push(attributeInstruction);
  }
  if (personaParts.length > 0) {
    headers["x-nova-extra-instructions"] = encodeURIComponent(personaParts.join("\n"));
  }
  return headers;
}
