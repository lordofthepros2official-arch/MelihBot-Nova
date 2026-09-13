import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Volume2,
  PaintBucket,
  KeyRound,
  Check,
  Trash2,
  LogOut,
  Play,
  Loader2,
  ImageUp,
  RotateCcw,
  Gauge,
  RefreshCw,
  Radio,
  Keyboard,
  Pencil,
  Database,
  Archive,
  ArchiveRestore,
  Link2,
  Download,
  ShieldAlert,
  Bell,
  Puzzle,
} from "lucide-react";
import {
  VOICE_OPTIONS,
  COLOR_THEMES,
  DEFAULT_SETTINGS,
  ACCENT_SWATCHES,
  FONT_OPTIONS,
  LIVE_ORB_THEMES,
  LANGUAGE_OPTIONS,
  TONE_STYLE_OPTIONS,
  DEFAULT_TONE_ATTRIBUTES,
  PERSONA_PRESETS,
  type ToneStyle,
  type ToneAttributes,
  type AttributeLevel,
  getStoredBackgroundPhoto,
  setStoredBackgroundPhoto,
  resetTokenUsage,
  type FontSize,
  type BubbleDensity,
  type BackgroundMode,
  type LiveOrbShape,
  type ContrastMode,
  NOTIFICATION_LABELS,
  type NotificationKey,
  INTEGRATION_OPTIONS,
  type IntegrationKey,
} from "@/lib/settings-store";
import { useSettings } from "@/lib/use-settings";
import { useAuth } from "@/lib/use-auth";
import {
  clearStoredGeminiKey,
  getStoredGeminiKey,
  setStoredGeminiKey,
  isLikelyValidGeminiKey,
} from "@/lib/gemini-key";
import { speakLocal } from "@/lib/gemini-speech";
import {
  DEFAULT_SHORTCUTS,
  getStoredShortcuts,
  setStoredShortcut,
  resetStoredShortcuts,
  eventToCombo,
  comboToDisplay,
  type ShortcutAction,
} from "@/lib/keyboard-shortcuts";
import {
  loadThreads,
  fetchThreads,
  setThreadArchived,
  archiveAllThreads,
  deleteAllThreads,
  deleteThread,
  type Thread,
} from "@/lib/chat-store";
import { fetchProjects } from "@/lib/projects";
import { getStorageEstimate } from "@/lib/idb-store";
import {
  getSharedLinks,
  revokeSharedLink,
  clearSharedLinks,
  type SharedLink,
} from "@/lib/shared-links";
import { requestNotificationPermission } from "@/lib/notifications";

type Category =
  | "model"
  | "voice"
  | "interface"
  | "live"
  | "account"
  | "keyboard"
  | "data"
  | "notifications"
  | "integrations";

/** Ayarlar kategorileri, sık/liste halinde ve her birinin altında ne
 * içerdiğini açıklayan kısa bir metinle gösterilir (bkz. render). */
const CATEGORIES: { key: Category; label: string; icon: React.ElementType; blurb: string }[] = [
  {
    key: "model",
    label: "Model",
    icon: Sparkles,
    blurb: "Sohbet modeli, kişilik ve akıllı token tasarrufu",
  },
  { key: "voice", label: "Ses", icon: Volume2, blurb: "Seslendirme sesi ve otomatik okuma" },
  {
    key: "interface",
    label: "Arayüz",
    icon: PaintBucket,
    blurb: "Renk, buton rengi, yazı fontu, arka plan",
  },
  {
    key: "live",
    label: "Live Profil",
    icon: Radio,
    blurb: "Sesli sohbet ekranının orb rengi ve görünümü",
  },
  {
    key: "keyboard",
    label: "Klavye",
    icon: Keyboard,
    blurb: "Kısayolları görüntüle ve özelleştir",
  },
  {
    key: "data",
    label: "Veri Kontrolleri",
    icon: Database,
    blurb: "Arşiv, paylaşım, depolama, dışa aktarma",
  },
  {
    key: "notifications",
    label: "Bildirimler",
    icon: Bell,
    blurb: "Hangi konularda bildirim alacağını seç",
  },
  {
    key: "integrations",
    label: "Eklentiler",
    icon: Puzzle,
    blurb: "Composer'daki araçları aç/kapat",
  },
  { key: "account", label: "API Anahtarı", icon: KeyRound, blurb: "Gemini anahtarını yönet" },
];

export function SettingsPanel({
  onClose,
  settingsCtx,
}: {
  onClose: () => void;
  settingsCtx: SettingsCtx;
}) {
  const { settings, update, save, discardDraft, isDirty, hydrated } = settingsCtx;
  const [category, setCategory] = useState<Category | null>(null);
  // Kaydedilmemiş değişiklik varken kapatma denenirse (Esc veya X) kısa bir
  // onay adımına geç — aksi halde kullanıcı "Kaydet"e basmayı unutup taslağı
  // habersizce kaybedebilir.
  const [confirmingClose, setConfirmingClose] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div
        className="animate-rise flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] bg-white text-ink shadow-2xl sm:h-[640px]"
        role="dialog"
        aria-modal="true"
        aria-label="Ayarlar"
      >
        <div className="flex min-h-0 flex-1">
          {/* SOL: kategori listesi — geniş ekranda her zaman görünür, dar
              ekranda yalnızca henüz bir kategori seçilmemişse görünür. */}
          <div
            className={`flex w-full shrink-0 flex-col border-r border-black/5 sm:w-[240px] ${
              category ? "hidden sm:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[16px] font-semibold">Ayarlar</h2>
              <button
                onClick={requestClose}
                className="rounded-full p-1.5 hover:bg-black/5 sm:hidden"
                aria-label="Kapat"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="nova-scroll flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    category === c.key ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"
                  }`}
                >
                  <c.icon className="size-[17px] shrink-0 text-ink/70" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium leading-tight">{c.label}</span>
                    <span className="block text-[11.5px] leading-snug text-ink/50">{c.blurb}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink/30 sm:hidden" />
                </button>
              ))}
            </nav>
          </div>

          {/* SAĞ: seçili kategorinin içeriği */}
          <div className={`flex min-w-0 flex-1 flex-col ${category ? "flex" : "hidden sm:flex"}`}>
            <div className="flex items-center gap-2 border-b border-black/5 px-5 py-4">
              <button
                onClick={() => setCategory(null)}
                className="rounded-full p-1.5 hover:bg-black/5 sm:hidden"
                aria-label="Kategorilere dön"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h3 className="flex-1 text-[15px] font-semibold sm:text-center">
                {category ? CATEGORIES.find((c) => c.key === category)?.label : "Bir kategori seç"}
              </h3>
              <button
                onClick={requestClose}
                className="hidden rounded-full p-1.5 hover:bg-black/5 sm:block"
                aria-label="Kapat"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="nova-scroll flex-1 overflow-y-auto px-5 py-5">
              {!hydrated ? (
                <div className="flex h-full items-center justify-center text-ink/40">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : category === "model" ? (
                <ModelSection settings={settings} update={update} />
              ) : category === "voice" ? (
                <VoiceSection settings={settings} update={update} />
              ) : category === "interface" ? (
                <InterfaceSection settings={settings} update={update} />
              ) : category === "live" ? (
                <LiveSection settings={settings} update={update} />
              ) : category === "keyboard" ? (
                <KeyboardSection />
              ) : category === "data" ? (
                <DataSection settings={settings} update={update} />
              ) : category === "notifications" ? (
                <NotificationsSection settings={settings} update={update} />
              ) : category === "integrations" ? (
                <IntegrationsSection settings={settings} update={update} />
              ) : category === "account" ? (
                <AccountSection onClose={onClose} />
              ) : (
                <div className="hidden h-full items-center justify-center text-center text-[14px] text-ink/40 sm:flex">
                  Soldan bir ayar kategorisi seç.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alt "Kaydet" çubuğu: yalnızca kaydedilmemiş bir değişiklik
            (isDirty) varken görünür. Kaydedilene kadar değişiklikler yalnızca
            ekrandaki taslakta (React state) yaşar — bkz. use-settings.ts. */}
        {hydrated && isDirty && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-black/5 bg-amber-50/70 px-5 py-3">
            <p className="text-[12.5px] text-ink/60">Kaydedilmemiş değişikliklerin var.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={discardDraft}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink/60 transition hover:bg-black/5"
              >
                Vazgeç
              </button>
              <button
                onClick={save}
                className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
              >
                Kaydet
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kaydedilmemiş değişiklikle kapatma onayı */}
      {confirmingClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-ink shadow-2xl">
            <h4 className="text-[15px] font-semibold">Değişiklikleri kaydetmeden çıkılsın mı?</h4>
            <p className="mt-1.5 text-[13px] text-ink/60">
              Kaydetmediğin değişiklikler kaybolacak.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmingClose(false)}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink/60 transition hover:bg-black/5"
              >
                Geri dön
              </button>
              <button
                onClick={() => {
                  discardDraft();
                  setConfirmingClose(false);
                  onClose();
                }}
                className="rounded-full bg-red-50 px-3.5 py-1.5 text-[13px] font-medium text-red-600 transition hover:bg-red-100"
              >
                Kaydetmeden çık
              </button>
              <button
                onClick={() => {
                  save();
                  setConfirmingClose(false);
                  onClose();
                }}
                className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
              >
                Kaydet ve çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SettingsCtx = ReturnType<typeof useSettings>;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[12.5px] font-semibold tracking-wide text-ink/45 uppercase">
      {children}
    </p>
  );
}

function ModelSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Asistanın Adı</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Asistana kendi verdiğin bir isimle hitap edebilirsin; hem uygulama genelinde (kenar
          çubuğu, canlı mod) hem de kendinden bahsederken bu ismi kullanır. Boş bırakırsan
          varsayılan "Nova" adına döner.
        </p>
        <input
          type="text"
          value={settings.assistantName}
          onChange={(e) => update({ assistantName: e.target.value.slice(0, 60) })}
          onBlur={(e) => {
            if (!e.target.value.trim()) update({ assistantName: DEFAULT_SETTINGS.assistantName });
          }}
          placeholder="Örn: Aria, Deniz, Atlas…"
          className="w-full rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/15"
        />
      </div>

      <div>
        <SectionLabel>Sohbet Modeli</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Model artık elle seçilmiyor: Nova en güncel Gemini modelinden başlar (3.8 Flash), bir
          sorun olursa otomatik olarak sırayla 3.7 → 3.6 → 3.5 → 3.1 → 2.5 Flash'a kadar dener ve
          ilk çalışanı kullanır. Ayrıca her model önce doğrudan, olmazsa Google'ın güncel alt yapısı
          üzerinden bir kez daha denenir. Bunların hepsi arka planda, sen fark etmeden olur.
        </p>
      </div>

      <div>
        <SectionLabel>Canlı API Kullanımı</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Kendi Gemini API anahtarınla bu oturumda gerçekten tüketilen toplam token — Gemini'nin her
          yanıtta döndürdüğü gerçek sayaçtan canlı okunur. Salt bilgi amaçlıdır, herhangi bir limit
          uygulanmaz.
        </p>
        <div className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Gauge className="size-4 shrink-0 text-ink/60" strokeWidth={1.8} />
            <p className="text-[14.5px] font-medium">
              {settings.tokensUsed.toLocaleString("tr-TR")} token
            </p>
          </div>
          <button
            onClick={() => update(resetTokenUsage())}
            className="flex items-center gap-1.5 text-[12px] font-medium text-ink/50 hover:text-ink"
          >
            <RefreshCw className="size-3" /> Sayacı sıfırla
          </button>
        </div>
      </div>

      <div>
        <SectionLabel>Temel Üslup ve Konuşma Tonu</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Modelin seninle konuşurken kullanacağı genel tonu belirler.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TONE_STYLE_OPTIONS.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ toneStyle: t.id })}
              className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition ${
                settings.toneStyle === t.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{t.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ink/50">{t.description}</p>
              </div>
              {settings.toneStyle === t.id && (
                <Check className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Nitelikler</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Temel üslup tercihine ek olarak özelleştirmeler seç.
        </p>
        <div className="space-y-3">
          <AttributeRow
            label="Samimi"
            value={settings.toneAttributes.warmth}
            lessLabel="Daha Az"
            moreLabel="Daha Çok"
            onChange={(v) => update({ toneAttributes: { ...settings.toneAttributes, warmth: v } })}
          />
          <AttributeRow
            label="Coşkulu"
            value={settings.toneAttributes.enthusiasm}
            lessLabel="Daha Az"
            moreLabel="Daha Fazla"
            onChange={(v) =>
              update({ toneAttributes: { ...settings.toneAttributes, enthusiasm: v } })
            }
          />
          <AttributeRow
            label="Başlıklar ve listeler"
            value={settings.toneAttributes.structure}
            lessLabel="Daha Az"
            moreLabel="Daha Fazla"
            onChange={(v) =>
              update({ toneAttributes: { ...settings.toneAttributes, structure: v } })
            }
          />
          <AttributeRow
            label="Emoji"
            value={settings.toneAttributes.emoji}
            lessLabel="Daha Az"
            moreLabel="Daha Fazla"
            onChange={(v) => update({ toneAttributes: { ...settings.toneAttributes, emoji: v } })}
          />
        </div>
        {(Object.values(settings.toneAttributes) as AttributeLevel[]).some(
          (v) => v !== "default",
        ) && (
          <button
            onClick={() => update({ toneAttributes: DEFAULT_TONE_ATTRIBUTES })}
            className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink/50 hover:text-ink"
          >
            <RotateCcw className="size-3" /> Niteliklerini sıfırla
          </button>
        )}
      </div>

      <div>
        <SectionLabel>Özel Talimatlar</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Modelin sana nasıl hitap edeceğini ve seni nasıl tanıyacağını belirle.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-ink/70">Takma ad</label>
            <input
              type="text"
              value={settings.userNickname}
              onChange={(e) => update({ userNickname: e.target.value.slice(0, 60) })}
              placeholder="Sana nasıl hitap edelim?"
              className="w-full rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-ink/70">Meslek</label>
            <input
              type="text"
              value={settings.userOccupation}
              onChange={(e) => update({ userOccupation: e.target.value.slice(0, 100) })}
              placeholder="Ne iş yapıyorsun?"
              className="w-full rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-ink/70">
              Senin Hakkında Daha Fazla Bilgi
            </label>
            <textarea
              value={settings.userAboutMe}
              onChange={(e) => update({ userAboutMe: e.target.value.slice(0, 1500) })}
              placeholder="Modelin bilmesini istediğin herhangi bir şey…"
              rows={4}
              className="w-full resize-none rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/15"
            />
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Kişilik / Ekstra Talimat (opsiyonel)</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Modelin her yanıtında dikkate almasını istediğin bir kişilik, üslup veya kural
          tanımlayabilirsin. Örn: "Her zaman esprili ve samimi konuş." veya "Cevapları maddeler
          halinde ver."
        </p>
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {PERSONA_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ extraInstructions: p.instructions })}
              title={p.instructions}
              className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1.5 text-[12.5px] font-medium text-ink/70 transition hover:bg-black/[0.05] hover:text-ink"
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
        <textarea
          value={settings.extraInstructions}
          onChange={(e) => update({ extraInstructions: e.target.value.slice(0, 4000) })}
          placeholder="Buraya kendi talimatını yaz…"
          rows={5}
          className="w-full resize-none rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/15"
        />
        <p className="mt-1 text-right text-[11px] text-ink/35">
          {settings.extraInstructions.length}/4000
        </p>
      </div>
    </div>
  );
}

function AttributeRow({
  label,
  value,
  lessLabel,
  moreLabel,
  onChange,
}: {
  label: string;
  value: AttributeLevel;
  lessLabel: string;
  moreLabel: string;
  onChange: (v: AttributeLevel) => void;
}) {
  const options: { id: AttributeLevel; label: string }[] = [
    { id: "less", label: lessLabel },
    { id: "default", label: "Varsayılan" },
    { id: "more", label: moreLabel },
  ];
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3">
      <p className="text-[13.5px] font-medium">{label}</p>
      <div className="flex shrink-0 gap-1 rounded-full bg-black/[0.04] p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
              value === o.id ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VoiceSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  const [previewing, setPreviewing] = useState<string | null>(null);

  const preview = (voiceId: string) => {
    if (previewing) return;
    setPreviewing(voiceId);
    void speakLocal(
      "Merhaba, ben bu ses ile konuşuyorum.",
      () => setPreviewing(null),
      voiceId,
    ).catch(() => setPreviewing(null));
  };

  const previewPace = (pace: "slow" | "normal" | "fast") => {
    if (previewing) return;
    setPreviewing(`pace:${pace}`);
    void speakLocal(
      "Bu cümleyi şu anki hız ayarıyla dinliyorsun.",
      () => setPreviewing(null),
      settings.ttsVoice,
      pace,
    ).catch(() => setPreviewing(null));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5">
        <div>
          <p className="text-[14.5px] font-medium">Yanıtları otomatik seslendir</p>
          <p className="mt-0.5 text-[12.5px] text-ink/55">
            Her yeni yanıt geldiğinde otomatik olarak sesli okunsun.
          </p>
        </div>
        <Toggle checked={settings.autoSpeak} onChange={(v) => update({ autoSpeak: v })} />
      </div>

      <div>
        <SectionLabel>Konuşma Hızı</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "slow", label: "Yavaş" },
              { id: "normal", label: "Normal" },
              { id: "fast", label: "Hızlı" },
            ] as const
          ).map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-1 rounded-2xl border px-2.5 py-2 transition ${
                settings.ttsPace === p.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <button
                onClick={() => update({ ttsPace: p.id })}
                className={`min-w-0 flex-1 text-left text-[13.5px] font-medium ${
                  settings.ttsPace === p.id ? "text-ink" : "text-ink/60"
                }`}
              >
                {p.label}
              </button>
              <button
                onClick={() => previewPace(p.id)}
                disabled={previewing !== null}
                aria-label={`${p.label} hızını dinle`}
                className="shrink-0 rounded-full p-1 text-ink/50 transition hover:bg-black/5 hover:text-ink disabled:opacity-40"
              >
                {previewing === `pace:${p.id}` ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Seslendirme Sesi</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VOICE_OPTIONS.map((v) => (
            <div
              key={v.id}
              className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 transition ${
                settings.ttsVoice === v.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <button
                onClick={() => update({ ttsVoice: v.id })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {settings.ttsVoice === v.id ? (
                  <Check className="size-4 shrink-0 text-ink" strokeWidth={2.5} />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{v.label}</span>
                  <span className="block truncate text-[11.5px] text-ink/50">{v.description}</span>
                </span>
              </button>
              <button
                onClick={() => preview(v.id)}
                disabled={previewing !== null}
                aria-label={`${v.label} sesini dinle`}
                className="shrink-0 rounded-full p-1.5 text-ink/50 transition hover:bg-black/5 hover:text-ink disabled:opacity-40"
              >
                {previewing === v.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InterfaceSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  const fontSizes: { id: FontSize; label: string }[] = [
    { id: "small", label: "Küçük" },
    { id: "medium", label: "Orta" },
    { id: "large", label: "Büyük" },
  ];
  const densities: { id: BubbleDensity; label: string; desc: string }[] = [
    { id: "cozy", label: "Ferah", desc: "Mesajlar arası normal boşluk" },
    { id: "compact", label: "Sıkı", desc: "Daha az boşluk, ekrana daha çok sığar" },
  ];
  const bgModes: { id: BackgroundMode; label: string }[] = [
    { id: "gradient", label: "Renk Teması" },
    { id: "solid", label: "Düz Renk" },
    { id: "photo", label: "Fotoğraf" },
  ];
  const contrastModes: { id: ContrastMode; label: string; desc: string }[] = [
    { id: "system", label: "Sistem", desc: "İşletim sisteminin kontrast ayarını takip et" },
    { id: "normal", label: "Orta", desc: "Standart, varsayılan kontrast" },
    { id: "high", label: "Artı", desc: "Kenarlıklar ve odak halkaları belirginleşir" },
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setHasPhoto(Boolean(getStoredBackgroundPhoto()));
  }, []);

  const handlePhotoPick = async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Lütfen bir görsel dosyası seç (jpg, png, webp…).");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1600, 0.82);
      const ok = setStoredBackgroundPhoto(dataUrl);
      if (!ok) {
        setUploadError(
          "Fotoğraf kaydedilemedi (çok büyük olabilir). Daha küçük bir görsel dener misin?",
        );
        setUploading(false);
        return;
      }
      setHasPhoto(true);
      update({ backgroundMode: "photo" });
    } catch {
      setUploadError("Fotoğraf işlenemedi. Farklı bir dosya dener misin?");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setStoredBackgroundPhoto(null);
    setHasPhoto(false);
    if (settings.backgroundMode === "photo") update({ backgroundMode: "gradient" });
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Buton Rengi</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Butonlar, seçili durumlar ve vurgu renkleri için kullanılacak renk. "Temaya göre"
          seçiliyken aşağıdaki renk temasının vurgu rengi kullanılır.
        </p>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
          {ACCENT_SWATCHES.map((s) => {
            const isCustom = s.id === "custom";
            const selected = settings.accentSwatch === s.id;
            const swatchColor = isCustom ? settings.customAccentColor : s.color || "var(--ink)";
            return (
              <button
                key={s.id}
                onClick={() => update({ accentSwatch: s.id })}
                title={s.label}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition ${
                  selected ? "border-ink" : "border-transparent hover:bg-black/[0.03]"
                }`}
              >
                <span
                  className="relative flex size-9 items-center justify-center rounded-full border border-black/10"
                  style={
                    s.id === "theme"
                      ? { backgroundImage: "var(--gradient-app)" }
                      : { background: swatchColor }
                  }
                >
                  {isCustom && (
                    <input
                      type="color"
                      value={settings.customAccentColor}
                      onChange={(e) => {
                        update({ customAccentColor: e.target.value, accentSwatch: "custom" });
                      }}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      aria-label="Özel buton rengi seç"
                    />
                  )}
                  {selected && (
                    <Check className="size-4 text-white drop-shadow" strokeWidth={2.5} />
                  )}
                </span>
                <span className="text-[10.5px] font-medium text-ink/60">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel>Yazı Fontu</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Tüm arayüzde kullanılacak yazı fontu — sohbet baloncukları, menüler ve başlıklar dahil.
        </p>
        <div className="space-y-1.5">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => update({ fontFamily: f.id })}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                settings.fontFamily === f.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
              style={{ fontFamily: f.stack }}
            >
              <span className="text-[15px]">{f.label}</span>
              {settings.fontFamily === f.id && (
                <Check className="size-4 shrink-0 text-ink" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Kontrast</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Kenarlıkları ve odak göstergelerini belirginleştirerek okunabilirliği artırır.
        </p>
        <div className="space-y-1.5">
          {contrastModes.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ contrastMode: c.id })}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                settings.contrastMode === c.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <span>
                <span className="block text-[14px] font-medium">{c.label}</span>
                <span className="block text-[12px] text-ink/50">{c.desc}</span>
              </span>
              {settings.contrastMode === c.id && (
                <Check className="size-4 shrink-0 text-ink" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Yanıt Dili</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          "Otomatik" seçiliyken model senin yazdığın dile göre cevap verir. Başka bir dil seçersen,
          sen hangi dilde yazarsan yaz model o dilde yanıt verir.
        </p>
        <select
          value={settings.responseLanguage}
          onChange={(e) => update({ responseLanguage: e.target.value })}
          className="w-full rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-ink/15"
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <SectionLabel>Arka Plan</SectionLabel>
        <div className="mb-3 flex gap-2">
          {bgModes.map((m) => (
            <button
              key={m.id}
              onClick={() => update({ backgroundMode: m.id })}
              className={`flex-1 rounded-2xl border px-3 py-2.5 text-[13.5px] font-medium transition ${
                settings.backgroundMode === m.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {settings.backgroundMode === "gradient" && (
          <div className="grid grid-cols-3 gap-2.5">
            {COLOR_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => update({ colorTheme: t.id })}
                className={`overflow-hidden rounded-2xl border-2 transition ${
                  settings.colorTheme === t.id ? "border-ink" : "border-transparent"
                }`}
              >
                <div
                  className="h-14 w-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${t.gradient[0]} 0%, ${t.gradient[1]} 38%, ${t.gradient[2]} 68%, ${t.gradient[3]} 100%)`,
                  }}
                />
                <p className="bg-white px-2 py-1.5 text-[11.5px] font-medium text-ink/75">
                  {t.label}
                </p>
              </button>
            ))}
          </div>
        )}

        {settings.backgroundMode === "solid" && (
          <div className="flex items-center gap-3 rounded-2xl border border-black/5 px-4 py-3.5">
            <input
              type="color"
              value={settings.solidColor}
              onChange={(e) => update({ solidColor: e.target.value })}
              className="size-10 shrink-0 cursor-pointer rounded-full border border-black/10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Düz arka plan rengi</p>
              <p className="font-mono text-[12px] text-ink/50">{settings.solidColor}</p>
            </div>
          </div>
        )}

        {settings.backgroundMode === "photo" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhotoPick(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-black/15 px-4 py-6 text-center transition hover:border-black/25 hover:bg-black/[0.02] disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-ink/50" />
              ) : (
                <ImageUp className="size-6 text-ink/50" strokeWidth={1.6} />
              )}
              <span className="text-[13.5px] font-medium text-ink/70">
                {hasPhoto ? "Fotoğrafı değiştir" : "Fotoğraf yükle"}
              </span>
              <span className="text-[11.5px] text-ink/40">
                Cihazından bir görsel seç, otomatik olarak boyutlandırılır
              </span>
            </button>
            {uploadError && <p className="text-[12.5px] text-red-600">{uploadError}</p>}
            {hasPhoto && (
              <>
                <button
                  onClick={removePhoto}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" /> Fotoğrafı Kaldır
                </button>
                <div>
                  <p className="mb-1.5 text-[12.5px] text-ink/55">
                    Karartma (yazıların okunabilirliği için)
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={settings.photoOverlayOpacity}
                    onChange={(e) => update({ photoOverlayOpacity: Number(e.target.value) })}
                    className="w-full accent-ink"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Yazı Boyutu</SectionLabel>
        <div className="flex gap-2">
          {fontSizes.map((f) => (
            <button
              key={f.id}
              onClick={() => update({ fontSize: f.id })}
              className={`flex-1 rounded-2xl border px-4 py-3 text-[14px] font-medium transition ${
                settings.fontSize === f.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Mesaj Yoğunluğu</SectionLabel>
        <div className="space-y-2">
          {densities.map((d) => (
            <button
              key={d.id}
              onClick={() => update({ bubbleDensity: d.id })}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                settings.bubbleDensity === d.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <span>
                <span className="block text-[14px] font-medium">{d.label}</span>
                <span className="block text-[12px] text-ink/50">{d.desc}</span>
              </span>
              {settings.bubbleDensity === d.id && (
                <Check className="size-4 text-ink" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5">
        <div>
          <p className="text-[14.5px] font-medium">Karşılama kartlarını göster</p>
          <p className="mt-0.5 text-[12.5px] text-ink/55">
            Yeni sohbet ekranındaki "Görsel Üret", "Web'de Ara" gibi hızlı kartlar.
          </p>
        </div>
        <Toggle
          checked={settings.showWelcomeCards}
          onChange={(v) => update({ showWelcomeCards: v })}
        />
      </div>

      <button
        onClick={() =>
          update({
            colorTheme: DEFAULT_SETTINGS.colorTheme,
            backgroundMode: DEFAULT_SETTINGS.backgroundMode,
            solidColor: DEFAULT_SETTINGS.solidColor,
            photoOverlayOpacity: DEFAULT_SETTINGS.photoOverlayOpacity,
            fontSize: DEFAULT_SETTINGS.fontSize,
            bubbleDensity: DEFAULT_SETTINGS.bubbleDensity,
            showWelcomeCards: DEFAULT_SETTINGS.showWelcomeCards,
            accentSwatch: DEFAULT_SETTINGS.accentSwatch,
            customAccentColor: DEFAULT_SETTINGS.customAccentColor,
            fontFamily: DEFAULT_SETTINGS.fontFamily,
          })
        }
        className="flex w-full items-center justify-center gap-1.5 rounded-full border border-black/10 px-4 py-2.5 text-[13.5px] font-medium text-ink/60 hover:bg-black/[0.03]"
      >
        <RotateCcw className="size-3.5" /> Görünümü Sıfırla
      </button>
    </div>
  );
}

function LiveSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  const shapes: { id: LiveOrbShape; label: string; desc: string }[] = [
    { id: "orb", label: "Küre (Orb)", desc: "Klasik dönen ışık küresi" },
    { id: "wave", label: "Dalga", desc: "Konuşurken dalgalanan çizgi" },
    { id: "bars", label: "Çubuklar", desc: "Eşitleyici tarzı dikey çubuklar" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Görünüm Şekli</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Live mod açıldığında ortada gösterilen sesli sohbet görselinin biçimi.
        </p>
        <div className="space-y-2">
          {shapes.map((s) => (
            <button
              key={s.id}
              onClick={() => update({ liveOrbShape: s.id })}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                settings.liveOrbShape === s.id
                  ? "border-ink/20 bg-ink/[0.04]"
                  : "border-black/5 hover:bg-black/[0.02]"
              }`}
            >
              <span>
                <span className="block text-[14px] font-medium">{s.label}</span>
                <span className="block text-[12px] text-ink/50">{s.desc}</span>
              </span>
              {settings.liveOrbShape === s.id && (
                <Check className="size-4 shrink-0 text-ink" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Renk Paleti</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">Orb/dalganın parlama ve halka renkleri.</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {LIVE_ORB_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ liveOrbTheme: t.id })}
              className={`overflow-hidden rounded-2xl border-2 transition ${
                settings.liveOrbTheme === t.id ? "border-ink" : "border-transparent"
              }`}
            >
              <div
                className="flex h-14 w-full items-center justify-center bg-black"
                style={{
                  backgroundImage: `radial-gradient(circle, ${t.glow}55 0%, transparent 70%)`,
                }}
              >
                <span
                  className="size-6 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${t.ring1}, ${t.ring2})`,
                  }}
                />
              </div>
              <p className="bg-white px-2 py-1.5 text-[11.5px] font-medium text-ink/75">
                {t.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Kullanıcının yüklediği fotoğrafı canvas ile en fazla `maxDim` piksel
 * kenar uzunluğuna küçültüp JPEG olarak sıkıştırır — localStorage'ın
 * (~5-10MB) doluvermesini engeller. Orijinal boyut ne olursa olsun sonuç
 * tipik olarak birkaç yüz KB civarında kalır.
 */
function resizeImageToDataUrl(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel yüklenemedi."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas desteklenmiyor."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}

/** Byte sayısını "1.2 GB" gibi okunabilir bir metne çevirir. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function IntegrationsSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Eklentiler</SectionLabel>
        <p className="mb-3 text-[12.5px] text-ink/50">
          Sohbet kutusundaki "+" menüsünde hangi araçların görüneceğini seç. Kapattığın bir araç
          menüden gizlenir, istediğin zaman tekrar açabilirsin.
        </p>
        <div className="space-y-2">
          {INTEGRATION_OPTIONS.map((opt) => (
            <div
              key={opt.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3.5"
            >
              <div className="min-w-0 pr-3">
                <p className="text-[14px] font-medium">{opt.label}</p>
                <p className="mt-0.5 text-[12px] text-ink/50">{opt.description}</p>
              </div>
              <Toggle
                checked={settings.integrations[opt.key as IntegrationKey]}
                onChange={(v) =>
                  update({ integrations: { ...settings.integrations, [opt.key]: v } })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : null,
  );

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Bildirimler</SectionLabel>
        <p className="mb-3 text-[12.5px] text-ink/50">
          Hangi konularda bildirim almak istediğini seç. Sekme arka plandayken bu kategorilerden
          birinde bir güncelleme olduğunda uyarılırsın.
        </p>
        <div className="space-y-2">
          {NOTIFICATION_LABELS.map((n) => (
            <div
              key={n.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3.5"
            >
              <div className="min-w-0 pr-3">
                <p className="text-[14px] font-medium">{n.label}</p>
                <p className="mt-0.5 text-[12px] text-ink/50">{n.description}</p>
              </div>
              <Toggle
                checked={settings.notifications[n.key as NotificationKey]}
                onChange={(v) =>
                  update({ notifications: { ...settings.notifications, [n.key]: v } })
                }
              />
            </div>
          ))}
        </div>
      </div>

      {permission !== null && permission !== "granted" && (
        <div className="rounded-2xl border border-black/5 px-4 py-3.5">
          {permission === "denied" ? (
            <p className="text-[13.5px] text-ink/60">
              Masaüstü bildirimlerini daha önce reddettin. Açmak için tarayıcının adres
              çubuğundaki site ayarlarından (kilit/bilgi simgesi) bildirim iznini elle
              değiştirmen gerekiyor — tarayıcılar reddedilen bir izni buradan tekrar sormaz.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[13.5px]">
                Sekme arka plandayken masaüstü bildirimi görmek için tarayıcı iznine ihtiyacımız
                var.
              </p>
              <button
                onClick={() => void requestNotificationPermission().then(setPermission)}
                className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
              >
                Bildirim izni ver
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DataSection({ settings, update }: Pick<SettingsCtx, "settings" | "update">) {
  const [threads, setThreads] = useState<Thread[]>(loadThreads);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>(getSharedLinks);
  const [storage, setStorage] = useState<{ usedBytes: number; limitBytes: number } | null>(null);
  const [subview, setSubview] = useState<"main" | "archived" | "shared">("main");
  const [confirmingBulk, setConfirmingBulk] = useState<"archiveAll" | "deleteAll" | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void fetchThreads().then(setThreads);
    void getStorageEstimate().then((estimate) => {
      if (estimate) setStorage({ usedBytes: estimate.usedBytes, limitBytes: estimate.quotaBytes });
    });
  }, []);

  const archived = threads.filter((t) => t.archived);
  const usedPct = storage ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100) : 0;

  const handleExport = async () => {
    setExporting(true);
    try {
      const [freshThreads, freshProjects] = await Promise.all([fetchThreads(), fetchProjects()]);
      const payload = {
        exportedAt: new Date().toISOString(),
        threads: freshThreads,
        projects: freshProjects,
        settings,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `melihbot-nova-veri-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (subview === "archived") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubview("main")}
          className="flex items-center gap-1.5 text-[13px] font-medium text-ink/60 hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Geri
        </button>
        <SectionLabel>Arşivlenmiş Sohbetler ({archived.length})</SectionLabel>
        {archived.length === 0 ? (
          <p className="text-[14px] text-ink/50">Arşivlenmiş sohbetin yok.</p>
        ) : (
          <div className="space-y-2">
            {archived.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3"
              >
                <p className="min-w-0 flex-1 truncate text-[14px]">{t.title}</p>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => {
                      setThreadArchived(t.id, false);
                      setThreads(loadThreads());
                    }}
                    title="Arşivden çıkar"
                    className="rounded-full p-2 text-ink/50 hover:bg-black/5 hover:text-ink"
                  >
                    <ArchiveRestore className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      deleteThread(t.id);
                      setThreads(loadThreads());
                    }}
                    title="Kalıcı olarak sil"
                    className="rounded-full p-2 text-red-500/70 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (subview === "shared") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubview("main")}
          className="flex items-center gap-1.5 text-[13px] font-medium text-ink/60 hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Geri
        </button>
        <SectionLabel>Paylaşılan Bağlantılar ({sharedLinks.length})</SectionLabel>
        {sharedLinks.length === 0 ? (
          <p className="text-[14px] text-ink/50">Henüz bir proje bağlantısı paylaşmadın.</p>
        ) : (
          <div className="space-y-2">
            {sharedLinks.map((l) => (
              <div
                key={l.projectId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{l.projectName}</p>
                  <p className="text-[11.5px] text-ink/45">
                    {new Date(l.createdAt).toLocaleDateString("tr-TR")} tarihinde paylaşıldı
                  </p>
                </div>
                <button
                  onClick={() => {
                    revokeSharedLink(l.projectId);
                    setSharedLinks(getSharedLinks());
                  }}
                  className="shrink-0 rounded-full border border-black/10 px-3 py-1.5 text-[12px] font-medium hover:bg-black/[0.03]"
                >
                  Kaldır
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                clearSharedLinks();
                setSharedLinks([]);
              }}
              className="text-[12.5px] font-medium text-ink/50 hover:text-ink"
            >
              Tümünü kaldır
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Depolama</SectionLabel>
        <div className="rounded-2xl border border-black/5 px-4 py-3.5">
          {storage ? (
            <>
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="font-medium">{formatBytes(storage.usedBytes)} kullanıldı</span>
                <span className="text-ink/45">{formatBytes(storage.limitBytes)} sınırından</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full bg-ink transition-all"
                  style={{ width: `${Math.max(usedPct, 1.5)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-ink/45">
              <Loader2 className="size-3.5 animate-spin" /> Depolama bilgisi okunuyor…
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Sohbetler</SectionLabel>
        <div className="space-y-2">
          <button
            onClick={() => setSubview("archived")}
            className="flex w-full items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5 text-left hover:bg-black/[0.02]"
          >
            <span className="flex items-center gap-2.5">
              <Archive className="size-4 text-ink/60" strokeWidth={1.8} />
              <span>
                <span className="block text-[14px] font-medium">Arşivlenmiş sohbetler</span>
                <span className="block text-[12px] text-ink/50">{archived.length} sohbet</span>
              </span>
            </span>
            <span className="text-[12.5px] font-medium text-ink/50">Yönet</span>
          </button>
          <button
            onClick={() => setSubview("shared")}
            className="flex w-full items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5 text-left hover:bg-black/[0.02]"
          >
            <span className="flex items-center gap-2.5">
              <Link2 className="size-4 text-ink/60" strokeWidth={1.8} />
              <span>
                <span className="block text-[14px] font-medium">Paylaşılan bağlantılar</span>
                <span className="block text-[12px] text-ink/50">{sharedLinks.length} bağlantı</span>
              </span>
            </span>
            <span className="text-[12.5px] font-medium text-ink/50">Yönet</span>
          </button>
        </div>
      </div>

      <div>
        <SectionLabel>Toplu İşlemler</SectionLabel>
        {confirmingBulk ? (
          <div className="rounded-2xl border border-black/5 p-4">
            <p className="mb-3 text-[13.5px]">
              {confirmingBulk === "archiveAll"
                ? "Tüm sohbetlerin arşivlenecek; sohbetler listesinden kaybolacaklar ama Arşivlenmiş Sohbetler'den geri getirebilirsin."
                : "Tüm sohbetlerin kalıcı olarak silinecek. Bu işlem geri alınamaz."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingBulk(null)}
                className="flex-1 rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium hover:bg-black/[0.03]"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  if (confirmingBulk === "archiveAll") archiveAllThreads();
                  else deleteAllThreads();
                  setThreads(loadThreads());
                  setConfirmingBulk(null);
                }}
                className={`flex-1 rounded-full px-4 py-2 text-[13px] font-medium text-white ${
                  confirmingBulk === "archiveAll"
                    ? "bg-ink hover:opacity-90"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmingBulk === "archiveAll" ? "Tümünü arşivle" : "Evet, tümünü sil"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setConfirmingBulk("archiveAll")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/10 px-4 py-2.5 text-[13.5px] font-medium hover:bg-black/[0.03]"
            >
              <Archive className="size-4" /> Tüm sohbetleri arşivle
            </button>
            <button
              onClick={() => setConfirmingBulk("deleteAll")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-red-200 px-4 py-2.5 text-[13.5px] font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" /> Tüm sohbetleri sil
            </button>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Verileri Dışarı Aktar</SectionLabel>
        <p className="mb-2 text-[12.5px] text-ink/50">
          Tüm sohbetlerini, projelerini ve ayarlarını tek bir JSON dosyası olarak indir.
        </p>
        <button
          onClick={() => void handleExport()}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Dışarı aktar
        </button>
      </div>

      <div>
        <SectionLabel>Korumalar</SectionLabel>
        <div className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-3.5">
          <div className="flex items-start gap-2.5 pr-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink/60" strokeWidth={1.8} />
            <div>
              <p className="text-[14px] font-medium">Hassas içerikleri azalt</p>
              <p className="mt-0.5 text-[12px] text-ink/50">
                Hassas konularla ilgili ek korumalar ekler ve bazı içerik türlerini sınırlar.
              </p>
            </div>
          </div>
          <Toggle
            checked={settings.reduceSensitiveContent}
            onChange={(v) => update({ reduceSensitiveContent: v })}
          />
        </div>
      </div>
    </div>
  );
}

function KeyboardSection() {
  const [bindings, setBindings] = useState(getStoredShortcuts);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  // Kullanıcı modifier'sız bir tuşa bastığında (örn. sadece "k") kısa süreli
  // bir uyarı gösterir — eventToCombo bu durumda null döner ve atama
  // yapılmaz (bkz. keyboard-shortcuts.ts: modifier zorunluluğu, aksi halde
  // global kısayol dinleyicisi input/textarea içinde de tetiklenip yazmayı
  // keserdi).
  const [needsModifier, setNeedsModifier] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    setNeedsModifier(false);
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) {
        // Sadece değiştirici tuşa basıldıysa (henüz kombinasyon
        // tamamlanmadı) sessizce bekle; asıl bir tuşa (Ctrl/Cmd/Alt
        // olmadan) basıldıysa kullanıcıyı uyar.
        if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) setNeedsModifier(true);
        return;
      }
      setNeedsModifier(false);
      setStoredShortcut(capturing, combo);
      setBindings(getStoredShortcuts());
      setCapturing(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing]);

  const actions = Object.entries(DEFAULT_SHORTCUTS) as [
    ShortcutAction,
    (typeof DEFAULT_SHORTCUTS)[ShortcutAction],
  ][];

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Kısayollar</SectionLabel>
        <p className="mb-3 text-[12.5px] text-ink/50">
          Bir kısayolu değiştirmek için "Değiştir"e bas, ardından istediğin tuş kombinasyonuna bas —
          otomatik olarak kaydedilir. Kombinasyon Ctrl/⌘ veya Alt içermelidir (yazarken karışmaması
          için tek bir harfe atanamaz). Vazgeçmek için Esc'e bas.
        </p>
        {needsModifier && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
            Bu tuş tek başına atanamaz — Ctrl/⌘ veya Alt ile birlikte basmayı dener misin?
          </p>
        )}
        <div className="space-y-2">
          {actions.map(([action, def]) => (
            <div
              key={action}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{def.label}</p>
                <p className="text-[12px] text-ink/50">{def.description}</p>
              </div>
              {capturing === action ? (
                <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-white">
                  Bir tuşa bas…
                </span>
              ) : (
                <button
                  onClick={() => setCapturing(action)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-[12px] font-medium hover:bg-black/[0.03]"
                >
                  <span className="font-mono">{comboToDisplay(bindings[action])}</span>
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          resetStoredShortcuts();
          setBindings(getStoredShortcuts());
        }}
        className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink/50 hover:text-ink"
      >
        <RotateCcw className="size-3.5" /> Varsayılanlara sıfırla
      </button>
    </div>
  );
}

function AccountUserCard() {
  const auth = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  if (!auth.user) return null;

  return (
    <div className="rounded-2xl border border-black/5 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{auth.user.fullName}</p>
          <p className="truncate text-[12.5px] text-ink/50">
            @{auth.user.username} · {auth.user.email}
          </p>
        </div>
        <button
          onClick={() => {
            setLoggingOut(true);
            void auth.logout().then(() => window.location.reload());
          }}
          disabled={loggingOut}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3.5 py-2 text-[13px] font-medium hover:bg-black/[0.03] disabled:opacity-60"
        >
          {loggingOut ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

function AccountSection({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    setCurrent(getStoredGeminiKey());
  }, []);

  const masked = current
    ? `${current.slice(0, 6)}${"•".repeat(Math.max(current.length - 10, 4))}${current.slice(-4)}`
    : null;

  const save = async () => {
    const trimmed = draft.trim();
    if (!isLikelyValidGeminiKey(trimmed)) {
      setError(
        "Bu anahtar çok kısa veya boşluk içeriyor görünüyor. Kontrol edip tekrar dener misin?",
      );
      return;
    }
    // Biçim kontrolünden geçti diye çalıştığı anlamına gelmez — Google'a
    // gerçek, ücretsiz bir istek atıp canlı doğrularız (bkz. /api/verify-key).
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean; reason?: string };
      if (data.valid === false) {
        setError(
          data.reason || "Google bu anahtarı reddetti. Yeni bir anahtar oluşturmayı dener misin?",
        );
        setVerifying(false);
        return;
      }
    } catch {
      /* doğrulama isteği başarısız oldu (ağ hatası) — anahtarı yine de kabul et */
    }
    setVerifying(false);
    setStoredGeminiKey(trimmed);
    setCurrent(trimmed);
    setEditing(false);
    setDraft("");
    setError(null);
  };

  if (confirmingDelete) {
    return (
      <div className="space-y-4">
        <p className="text-[14.5px]">
          Gemini API anahtarını silmek üzeresin. Anahtar silindiğinde uygulama tekrar zorunlu
          anahtar giriş ekranını gösterecek ve yeni bir anahtar girene kadar sohbet edemeyeceksin.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmingDelete(false)}
            className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-[14px] font-medium hover:bg-black/[0.03]"
          >
            Vazgeç
          </button>
          <button
            onClick={() => {
              clearStoredGeminiKey();
              onClose();
              // Sayfayı yenileyerek ChatShell'in useEffect'inin anahtarı
              // yeniden okumasını ve zorunlu giriş ekranını göstermesini
              // sağlıyoruz — böylece silme her koşulda anında etkili olur.
              window.location.reload();
            }}
            className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-red-700"
          >
            Evet, sil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountUserCard />

      <div>
        <SectionLabel>Mevcut Anahtar</SectionLabel>
        {masked ? (
          <div className="rounded-2xl border border-black/5 px-4 py-3.5">
            <p className="font-mono text-[14px] tracking-wide">{masked}</p>
            <p className="mt-1 text-[12px] text-ink/50">
              Bu anahtar yalnızca bu tarayıcıda saklanır, kalıcıdır ve her sohbet isteğinde otomatik
              olarak kullanılır — her seferinde tekrar sormaz.
            </p>
          </div>
        ) : (
          <p className="text-[14px] text-ink/50">Kayıtlı bir anahtar bulunamadı.</p>
        )}
      </div>

      {editing ? (
        <div>
          <SectionLabel>Yeni Anahtar</SectionLabel>
          <input
            type="text"
            autoFocus
            value={draft}
            disabled={verifying}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Yeni API anahtarını yapıştır"
            className="w-full rounded-2xl border border-black/10 bg-black/[0.015] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:opacity-60"
          />
          {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setDraft("");
                setError(null);
              }}
              disabled={verifying}
              className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-[14px] font-medium hover:bg-black/[0.03] disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              onClick={() => void save()}
              disabled={verifying}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {verifying ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Doğrulanıyor…
                </>
              ) : (
                "Kaydet"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
          >
            Anahtarı Değiştir
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-red-200 px-4 py-2.5 text-[14px] font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-4" /> Anahtarı Sil
          </button>
        </div>
      )}

      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noreferrer noopener"
        className="block text-center text-[12.5px] text-ink/45 underline underline-offset-2 hover:text-ink/65"
      >
        Google AI Studio'dan yeni bir anahtar oluştur
      </a>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? "bg-ink" : "bg-black/15"
      }`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
