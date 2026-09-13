import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Mic,
  ArrowUp,
  AudioLines,
  Camera,
  Image as ImageIcon,
  Video,
  Paperclip,
  Brain,
  Globe,
  Bot,
  X,
  Square,
  PenSquare,
  Loader2,
  AlertTriangle,
  Clapperboard,
  Music2,
} from "lucide-react";
import { MicWave } from "./MicWave";
import { startRecording, type RecorderHandle } from "@/lib/recorder";
import { getRecognitionCtor, type Recognition } from "@/lib/speech";
import { transcribe } from "@/lib/gemini-speech";
import { useSettings } from "@/lib/use-settings";
import { type IntegrationKey } from "@/lib/settings-store";

export type ComposerModes = { think: boolean; web: boolean; agent: boolean };
export type Attachment = {
  name: string;
  content: string | null;
  isImage: boolean;
  /** Görseller için base64 data URL (örn. "data:image/png;base64,..."), modele doğrudan gönderilir. */
  dataUrl?: string;
  /** Videodan çıkarılan örnek kareler (data URL listesi), modele görsel olarak iletilir. */
  videoFrames?: string[];
  /** Dosya reddedildiyse veya içeriği okunamadıysa kullanıcıya gösterilecek kısa hata. */
  error?: string;
};

const TEXT_LIKE =
  /\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|h|css|html|xml|yaml|yml|log|sql|sh)$/i;
const MAX_ATTACHMENT_CHARS = 12000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB üstü görseller modele gönderilmez (istek çok büyür)

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB üstü videolardan kare çıkarma denenmez

/** Videodan başlangıç/orta/son olmak üzere 3 kare çıkarıp data URL olarak döner (model video dosyasını doğrudan işleyemediği için). */
function extractVideoFrames(file: File, count = 3): Promise<string[]> {
  return new Promise((resolve) => {
    if (file.size > MAX_VIDEO_BYTES) {
      resolve([]);
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const frames: string[] = [];
    let settled = false;
    const finish = (result: string[]) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(frames), 8000);

    video.onerror = () => {
      clearTimeout(timeout);
      finish([]);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) {
        clearTimeout(timeout);
        finish([]);
        return;
      }
      const times = Array.from({ length: count }, (_, i) => (duration * (i + 1)) / (count + 1));
      let idx = 0;
      const canvas = document.createElement("canvas");
      const captureNext = () => {
        if (idx >= times.length) {
          clearTimeout(timeout);
          finish(frames);
          return;
        }
        video.currentTime = times[idx] ?? 0;
      };
      video.onseeked = () => {
        try {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL("image/jpeg", 0.7));
          }
        } catch {
          /* CORS/decode hatası olursa bu kareyi atla */
        }
        idx++;
        captureNext();
      };
      captureNext();
    };
  });
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

async function readAttachment(file: File): Promise<Attachment> {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        name: file.name,
        content: null,
        isImage: true,
        error: `Görsel çok büyük (maks. ${formatMB(MAX_IMAGE_BYTES)}MB). Bu görsel modele gönderilmeyecek.`,
      };
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return { name: file.name, content: null, isImage: true, dataUrl };
    } catch {
      return {
        name: file.name,
        content: null,
        isImage: true,
        error: "Görsel okunamadı. Bu görsel modele gönderilmeyecek.",
      };
    }
  }
  if (file.type.startsWith("video/")) {
    if (file.size > MAX_VIDEO_BYTES) {
      return {
        name: file.name,
        content: null,
        isImage: false,
        error: `Video çok büyük (maks. ${formatMB(MAX_VIDEO_BYTES)}MB). Bu video modele gönderilmeyecek.`,
      };
    }
    const frames = await extractVideoFrames(file);
    return frames.length
      ? { name: file.name, content: null, isImage: false, videoFrames: frames }
      : {
          name: file.name,
          content: null,
          isImage: false,
          error: "Videodan kare çıkarılamadı. Bu video modele gönderilmeyecek.",
        };
  }
  const looksTextLike =
    file.type.startsWith("text/") || TEXT_LIKE.test(file.name) || file.size < 300_000;
  if (!looksTextLike) {
    return {
      name: file.name,
      content: null,
      isImage: false,
      error: "Desteklenmeyen dosya türü. Bu dosya modele gönderilmeyecek.",
    };
  }
  try {
    const raw = await file.text();
    const content =
      raw.length > MAX_ATTACHMENT_CHARS
        ? raw.slice(0, MAX_ATTACHMENT_CHARS) + "\n… (kırpıldı)"
        : raw;
    return { name: file.name, content, isImage: false };
  } catch {
    return {
      name: file.name,
      content: null,
      isImage: false,
      error: "Dosya okunamadı. Bu dosya modele gönderilmeyecek.",
    };
  }
}

export function Composer({
  onSend,
  busy,
  onStop,
  onOpenLive,
  onOpenCanvas,
  onOpenMedia,
  draft,
  onDraftChange,
  autoFocus = true,
  placeholder,
  compact = false,
}: {
  onSend: (text: string, modes: ComposerModes, attachments: Attachment[]) => void;
  busy: boolean;
  onStop: () => void;
  onOpenLive: () => void;
  onOpenCanvas: () => void;
  /** "Videolar" veya "Müzikler" stüdyo sayfasına götürür (bkz. ChatShell view). */
  onOpenMedia?: (mode: "video" | "music") => void;
  draft: string;
  onDraftChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** true ise Live/Canvas kısayolları gizlenir (ör. Projeler ekranındaki mini gönderim kutusu). */
  compact?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<RecorderHandle | null>(null);
  const speechRecRef = useRef<Recognition | null>(null);
  const dictatedRef = useRef("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings, update } = useSettings();
  const [modes, setModes] = useState<ComposerModes>({ think: false, web: false, agent: false });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [accept, setAccept] = useState<{ accept: string; capture: boolean }>({
    accept: "*/*",
    capture: false,
  });

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [draft]);

  useEffect(() => {
    if (autoFocus && !busy) taRef.current?.focus();
  }, [autoFocus, busy]);

  useEffect(
    () => () => {
      recRef.current?.cancel();
      speechRecRef.current?.abort();
    },
    [],
  );

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || reading) return;
    onSend(text, modes, attachments);
    onDraftChange("");
    setAttachments([]);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  /**
   * Ses tanıma önce tarayıcının Web Speech API'si (SpeechRecognition)
   * üzerinden denenir. `startRecording` ile aynı anda başlatılan mikrofon
   * akışı hem dalga animasyonu (MicWave) için, hem de SpeechRecognition ağ
   * hatası verirse (tarayıcının çevrimiçi tanıma sunucusuna ulaşılamıyorsa)
   * Gemini'ye (/api/stt üzerinden) gönderilecek yedek kayıt için kullanılır.
   */
  const networkFailedRef = useRef(false);

  const toggleMic = async () => {
    if (transcribing) return;
    if (recording) {
      const handle = recRef.current;
      recRef.current = null;
      setRecording(false);
      const rec = speechRecRef.current;
      speechRecRef.current = null;
      setTranscribing(true);
      rec?.stop();
      const usedGemini = networkFailedRef.current || !rec;
      // onend'in son sonuçları işlemesine kısa bir pay tanı, sonra kapat.
      window.setTimeout(() => {
        void (async () => {
          const audioBlob = handle ? await handle.stop().catch(() => null) : null;
          const dictated = dictatedRef.current.trim();
          dictatedRef.current = "";
          if (dictated && !usedGemini) {
            onDraftChange((draft ? draft.trim() + " " : "") + dictated);
            setTranscribing(false);
            requestAnimationFrame(() => taRef.current?.focus());
            return;
          }
          if (!audioBlob) {
            setMicError("Ses anlaşılamadı, tekrar dener misin?");
            setTranscribing(false);
            requestAnimationFrame(() => taRef.current?.focus());
            return;
          }
          try {
            const text = await transcribe(audioBlob);
            if (text.trim()) onDraftChange((draft ? draft.trim() + " " : "") + text.trim());
            else setMicError("Ses anlaşılamadı, tekrar dener misin?");
          } catch (e) {
            console.error("[Composer] Gemini ses tanıma hatası:", e);
            setMicError("Ses yazıya çevrilemedi.");
          } finally {
            setTranscribing(false);
            requestAnimationFrame(() => taRef.current?.focus());
          }
        })();
      }, 250);
      return;
    }

    networkFailedRef.current = false;
    try {
      setMicError(null);
      // Mikrofon akışı: hem ses seviyesi dalgası hem de Gemini fallback'i
      // için gerçek bir ses kaydı tutar.
      recRef.current = await startRecording(setLevel);
    } catch {
      setMicError("Mikrofon izni verilmedi.");
      return;
    }

    dictatedRef.current = "";
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      // Tarayıcı canlı ses tanımayı hiç desteklemiyor — sessizce Gemini'ye
      // (sunucu üzerinden) düşülüyor, kayıt zaten başladı.
      setMicError("Bu tarayıcı canlı ses tanımayı desteklemiyor, Gemini ile yazıya çevrilecek.");
      networkFailedRef.current = true;
      setRecording(true);
      return;
    }
    const rec = new Ctor();
    rec.lang = "tr-TR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      dictatedRef.current = (finalText + interim).trim();
    };
    rec.onerror = (err) => {
      console.warn("[Composer] SpeechRecognition hatası:", err.error);
      if (err.error === "not-allowed" || err.error === "service-not-allowed") {
        setMicError("Mikrofon izni verilmedi.");
      } else if (err.error === "network") {
        // Tarayıcının çevrimiçi tanıma sunucusuna ulaşılamıyor — bu kayıt
        // bittiğinde Gemini'ye (sunucu üzerinden) gönderilecek.
        console.warn("[Composer] Çevrimiçi ses tanımaya ulaşılamıyor, Gemini kullanılacak.");
        networkFailedRef.current = true;
        setMicError("Çevrimiçi ses tanımaya ulaşılamadı, Gemini ile yazıya çevrilecek.");
      }
      // "no-speech" gibi zararsız hatalarda sessizce devam edilir.
    };
    speechRecRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn("[Composer] SpeechRecognition başlatılamadı:", e);
    }
    setRecording(true);
  };

  const pick = (a: string, capture: boolean) => {
    setAccept({ accept: a, capture });
    setMenuOpen(false);
    requestAnimationFrame(() => fileRef.current?.click());
  };

  const menuItems: {
    icon: React.ElementType;
    label: string;
    hint: string;
    active?: boolean;
    action: () => void;
    /** İlgili Ayarlar > Eklentiler tercihi (bkz. settings.integrations). Yoksa her zaman gösterilir (ör. dosya/kamera ekleme, temel özellikler). */
    integrationKey?: IntegrationKey;
  }[] = [
    {
      icon: Camera,
      label: "Kamera",
      hint: "Fotoğraf çek ve ekle",
      action: () => pick("image/*", true),
    },
    {
      icon: ImageIcon,
      label: "Fotoğraflar",
      hint: "Galeriden görsel seç",
      action: () => pick("image/*", false),
    },
    {
      icon: Video,
      label: "Video Yükle",
      hint: "Video ekle, model kareleri inceler",
      action: () => pick("video/*", false),
    },
    {
      icon: Clapperboard,
      label: "Video Oluştur",
      hint: "Veo ile metinden video üret",
      integrationKey: "videoGen",
      action: () => {
        setMenuOpen(false);
        onOpenMedia?.("video");
      },
    },
    {
      icon: Music2,
      label: "Müzik Oluştur",
      hint: "Lyria ile metinden müzik üret",
      integrationKey: "musicGen",
      action: () => {
        setMenuOpen(false);
        onOpenMedia?.("music");
      },
    },
    {
      icon: Paperclip,
      label: "Dosyalar",
      hint: "Metin, kod veya belge ekle",
      action: () => pick("*/*", false),
    },
    {
      icon: Brain,
      label: "Düşün",
      hint: "Daha derin, adım adım analiz",
      active: modes.think,
      action: () => {
        setModes((m) => ({ ...m, think: !m.think }));
        setMenuOpen(false);
      },
    },
    {
      icon: Globe,
      label: "Web'de Arama",
      hint: "Güncel bilgiyi dikkate al",
      active: modes.web,
      integrationKey: "webSearch",
      action: () => {
        setModes((m) => ({ ...m, web: !m.web }));
        setMenuOpen(false);
      },
    },
    {
      icon: Bot,
      label: "Agent",
      hint: "Görevi adımlara bölüp sırayla yürüt (dosya/web erişimi yok)",
      active: modes.agent,
      action: () => {
        setModes((m) => ({ ...m, agent: !m.agent }));
        setMenuOpen(false);
      },
    },
    {
      icon: PenSquare,
      label: "Canvas",
      hint: "Kod/metin için ayrı çalışma alanı aç",
      integrationKey: "canvas",
      action: () => {
        setMenuOpen(false);
        onOpenCanvas();
      },
    },
  ];

  // Kompakt modda (ör. Projeler ekranındaki mini gönderim kutusu) sayfa
  // navigasyonu gerektiren kısayollar gizlenir — bu bağlamda Live, Canvas,
  // Video/Müzik Oluştur no-op'a düşer ve tıklanabilir ama işlevsiz bir
  // buton izlenimi verir (bkz. ProjectsPane.tsx Composer kullanımı).
  const visibleMenuItems = menuItems
    .filter(
      (item) => !(compact && ["Video Oluştur", "Müzik Oluştur", "Canvas"].includes(item.label)),
    )
    // Ayarlar > Eklentiler'den kapatılan araçlar menüden tamamen gizlenir.
    .filter((item) => !item.integrationKey || settings.integrations[item.integrationKey]);

  return (
    <div className="relative w-full">
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="animate-rise absolute bottom-full left-0 z-40 mb-3 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[26px] bg-white p-2 shadow-2xl">
            <p className="px-4 py-2 text-xs font-semibold tracking-wide text-black/40 uppercase">
              Sohbete ekle
            </p>
            {visibleMenuItems.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-black/5 ${
                  item.active ? "bg-black/[0.07]" : ""
                }`}
              >
                <item.icon className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.7} />
                <span>
                  <span
                    className={`block text-[15px] text-ink ${item.active ? "font-medium" : ""}`}
                  >
                    {item.label}
                  </span>
                  <span className="block text-[12px] text-ink/50">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="glass-card rounded-[30px] px-2.5 py-2.5">
        {(attachments.length > 0 || reading || modes.think || modes.web || modes.agent) && (
          <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
            {modes.think && (
              <Chip onRemove={() => setModes((m) => ({ ...m, think: false }))} icon={Brain}>
                Düşün
              </Chip>
            )}
            {modes.web && (
              <Chip onRemove={() => setModes((m) => ({ ...m, web: false }))} icon={Globe}>
                Web'de Arama
              </Chip>
            )}
            {modes.agent && (
              <Chip onRemove={() => setModes((m) => ({ ...m, agent: false }))} icon={Bot}>
                Agent
              </Chip>
            )}
            {attachments.map((att, i) => (
              <Chip
                key={att.name + i}
                icon={att.error ? AlertTriangle : Paperclip}
                error={!!att.error}
                onRemove={() => setAttachments((a) => a.filter((_, idx) => idx !== i))}
              >
                {att.name}
              </Chip>
            ))}
            {reading && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs text-ink/60">
                <Loader2 className="size-3.5 animate-spin" /> Dosya okunuyor…
              </span>
            )}
          </div>
        )}

        {recording ? (
          <div className="flex items-center gap-3 px-3 py-3 text-ink">
            <MicWave level={level} />
            <span className="text-[13px] text-ink/60">Dinliyorum… bitince mikrofona bas</span>
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={draft}
            rows={1}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              transcribing ? "Ses yazıya çevriliyor…" : (placeholder ?? "Bir şeyler sor…")
            }
            className="max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[16px] text-ink placeholder:text-ink/45 focus:outline-none"
          />
        )}

        <div className="mt-1 flex items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Sohbete ekle"
            className="flex size-9 items-center justify-center rounded-full bg-white text-ink shadow transition hover:scale-105"
          >
            <Plus className="size-5" strokeWidth={2} />
          </button>

          <div className="flex h-9 items-center gap-1 rounded-full bg-white/70 px-3 text-[12.5px] font-medium text-ink/70">
            Nova
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => void toggleMic()}
            aria-label={recording ? "Kaydı bitir" : "Mikrofon"}
            className={`flex size-9 items-center justify-center rounded-full transition ${
              recording ? "bg-red-500 text-white" : "bg-white/70 text-ink hover:bg-white"
            }`}
          >
            {transcribing ? (
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
            ) : (
              <Mic className="size-[18px]" strokeWidth={1.8} />
            )}
          </button>

          {settings.integrations.liveVoice && (
            <button
              type="button"
              onClick={onOpenLive}
              aria-label="Live"
              className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-white transition hover:opacity-90"
            >
              <AudioLines className="size-4" strokeWidth={1.8} /> Live
            </button>
          )}

          <button
            type="button"
            onClick={busy ? onStop : submit}
            disabled={!busy && draft.trim().length === 0}
            aria-label={busy ? "Durdur" : "Gönder"}
            className="flex size-9 items-center justify-center rounded-full bg-white text-ink shadow transition hover:scale-105 disabled:opacity-45 disabled:hover:scale-100"
          >
            {busy ? (
              <Square className="size-4 fill-current" />
            ) : (
              <ArrowUp className="size-5" strokeWidth={2.4} />
            )}
          </button>
        </div>
      </div>

      {micError && <p className="mt-2 px-3 text-xs text-white drop-shadow">{micError}</p>}

      {attachments.some((a) => a.error) && (
        <div className="mt-2 space-y-0.5 px-3">
          {attachments
            .filter((a) => a.error)
            .map((a, i) => (
              <p key={a.name + i} className="text-xs text-white drop-shadow">
                {a.name}: {a.error}
              </p>
            ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={accept.accept}
        {...(accept.capture ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          setReading(true);
          void Promise.all(files.map(readAttachment))
            .then((results) => setAttachments((a) => [...a, ...results]))
            .finally(() => setReading(false));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Chip({
  children,
  icon: Icon,
  onRemove,
  error = false,
}: {
  children: React.ReactNode;
  icon: React.ElementType;
  onRemove: () => void;
  error?: boolean;
}) {
  return (
    <span
      className={`flex max-w-[190px] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        error ? "bg-red-50 text-red-700" : "bg-white/80 text-ink"
      }`}
    >
      <Icon className={`size-3.5 ${error ? "text-red-600" : ""}`} />
      <span className="truncate">{children}</span>
      <button
        onClick={onRemove}
        aria-label="Kaldır"
        className="rounded-full p-0.5 hover:bg-black/10"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
