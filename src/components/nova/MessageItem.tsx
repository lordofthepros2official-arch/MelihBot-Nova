import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  Square,
  X,
  Download,
  Share2,
  Bot,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  Circle,
  AlertCircle,
  Pin,
  Pencil,
  Scissors,
  SplitSquareHorizontal,
} from "lucide-react";
import type { ChatMessage, ChatAgentStep } from "@/lib/chat-store";
import { speakLocal, stopLocalSpeech } from "@/lib/gemini-speech";
import { StreamWave } from "./StreamWave";

function AgentStepList({
  goal,
  steps,
  onApprove,
  onSkip,
}: {
  goal: string;
  steps: ChatAgentStep[];
  onApprove: (stepId: number) => void;
  onSkip: (stepId: number) => void;
}) {
  return (
    <div className="my-2 max-w-lg rounded-3xl border border-black/10 bg-black/[0.025] p-4">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-ink/70" strokeWidth={1.8} />
        <p className="text-[13.5px] font-medium text-ink/80">Agent: {goal}</p>
      </div>
      <div className="mt-3 space-y-2">
        {steps.map((s) => (
          <div key={s.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              {s.status === "done" && <CheckCircle2 className="size-4 text-emerald-600" />}
              {s.status === "running" && <Loader2 className="size-4 animate-spin text-ink/60" />}
              {s.status === "error" && <AlertCircle className="size-4 text-red-500" />}
              {s.status === "skipped" && <Circle className="size-4 text-ink/30" />}
              {(s.status === "pending" || s.status === "needs_approval") && (
                <Circle className="size-4 text-ink/30" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[13.5px] ${s.status === "skipped" ? "text-ink/40 line-through" : "text-ink/85"}`}
              >
                {s.title}
              </p>
              {s.status === "needs_approval" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11.5px] text-amber-700">
                    <ShieldAlert className="size-3.5" /> Onay gerekiyor
                  </span>
                  <button
                    onClick={() => onApprove(s.id)}
                    className="rounded-full bg-ink px-3 py-1 text-[11.5px] font-medium text-white"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => onSkip(s.id)}
                    className="rounded-full px-3 py-1 text-[11.5px] text-ink/60 hover:bg-black/5"
                  >
                    Atla
                  </button>
                </div>
              )}
              {s.output && s.status === "done" && (
                <p className="mt-1 line-clamp-3 text-[12.5px] text-ink/55">{s.output}</p>
              )}
              {s.status === "error" && (
                <p className="mt-1 text-[12.5px] text-red-500">Bu adımda bir sorun oluştu.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const download = async () => {
    setDownloadError(false);
    setDownloading(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(alt || "melihbot-gorsel").slice(0, 60).replace(/[^\w\- ]/g, "")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // CORS engelleyebilir; yeni sekmede açarak kullanıcının kendi kaydetmesini sağla
      window.open(src, "_blank", "noopener,noreferrer");
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ url: src, title: alt || "MelihBot Nova görseli" });
        return;
      }
    } catch {
      /* kullanıcı iptal etti veya paylaşım desteklenmiyor */
    }
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      /* pano izni yok */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Görsel önizleme"}
    >
      <div className="relative max-h-[90vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
        />
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => void download()}
            disabled={downloading}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-ink shadow-lg transition hover:scale-[1.03] disabled:opacity-60"
          >
            <Download className="size-4" />
            {downloading ? "İndiriliyor…" : "İndir"}
          </button>
          <button
            onClick={() => void share()}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-ink shadow-lg transition hover:scale-[1.03]"
          >
            <Share2 className="size-4" />
            Paylaş
          </button>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="flex size-10 items-center justify-center rounded-full bg-white text-ink shadow-lg transition hover:scale-[1.03]"
          >
            <X className="size-5" />
          </button>
        </div>
        {downloadError && (
          <p className="mt-2 text-center text-[12.5px] text-white/70">
            Doğrudan indirme engellendi, görsel yeni sekmede açıldı — oradan kaydedebilirsiniz.
          </p>
        )}
      </div>
    </div>
  );
}

function MessageImage({ src, alt }: { src?: string | undefined; alt?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Görsel bir süre içinde yüklenmezse (ör. üretim başarısız oldu ama
  // hata dönmedi) sonsuza kadar "Görsel oluşturuluyor…" yazmaması için
  // bir güvenlik zaman aşımı: bu süre geçince hata durumuna düşer.
  useEffect(() => {
    if (!src || loaded || failed) return;
    const t = setTimeout(() => setFailed(true), 30_000);
    return () => clearTimeout(t);
  }, [src, loaded, failed]);

  if (!src) return null;

  if (failed) {
    return (
      <span className="my-2 flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-[13.5px] text-ink/60">
        Görsel yüklenemedi. Bağlantı sorunlu olabilir, yeniden deneyebilirsiniz.
      </span>
    );
  }

  return (
    <>
      {/*
        NOT: Bunun <button> DEĞİL <span role="button"> olması bilinçli bir
        seçim. react-markdown, tek başına bir satırdaki markdown görselini
        `<p><img/></p>` şeklinde render eder; buradaki bileşen o <img>'nin
        yerine geçtiği için üretilen HTML `<p>{BU_BİLEŞEN}</p>` olur.
        İçeriden bir <button> dönersek sonuç `<p><button>...</button></p>`
        olur ki bu geçersiz bir HTML iç içeliğidir (interactive content bir
        <p> içine giremez) — tarayıcı bunu hydration sırasında sessizce
        "düzeltip" React'in beklediği ağaçtan farklı bir gerçek DOM üretir,
        bu da "Cannot read properties of null (reading 'child')" tarzı
        hydration/fiber hatalarına yol açar. <span role="button"> aynı
        tıklama/klavye erişilebilirliğini <p> içinde de geçerli kalarak sağlar.
      */}
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="my-2 block w-fit cursor-pointer overflow-hidden rounded-2xl shadow-md transition hover:scale-[1.01]"
      >
        {!loaded && (
          <span className="flex aspect-square w-full max-w-sm animate-pulse items-center justify-center bg-black/[0.06] text-[13px] text-ink/40">
            Görsel oluşturuluyor…
          </span>
        )}
        <img
          src={src}
          alt={alt || "Üretilen görsel"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`max-w-full rounded-2xl object-cover ${loaded ? "block" : "hidden"}`}
          style={{ maxHeight: 420 }}
        />
      </span>
      {open && (
        <ImageLightbox src={src} alt={alt || "Üretilen görsel"} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ActionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-full p-2 transition hover:bg-black/10 ${active ? "bg-black/10" : ""}`}
    >
      {children}
    </button>
  );
}

export function MessageItem({
  message,
  onRegenerate,
  canRegenerate,
  onApproveAgentStep,
  onSkipAgentStep,
  onFeedback,
  onTogglePin,
  onEditMessage,
  onNavigateMessageVersion,
  onSplitThread,
  onCompareResponses,
  autoSpeak,
  ttsVoiceOverride,
  fontSize = "15.5px",
}: {
  message: ChatMessage;
  onRegenerate: () => void;
  canRegenerate: boolean;
  onApproveAgentStep?: (messageId: string, stepId: number) => void;
  onSkipAgentStep?: (messageId: string, stepId: number) => void;
  /** "Beğen"/"Beğenme" butonlarına basıldığında çağrılır; kalıcı olarak saklanır (bkz. ChatShell). */
  onFeedback?: (messageId: string, feedback: "up" | "down" | null) => void;
  /** "Sabitle" butonuna basıldığında çağrılır; kalıcı olarak saklanır (bkz. ChatShell). */
  onTogglePin?: (messageId: string) => void;
  /** Kullanıcı bir mesajı düzenleyip gönderince çağrılır (yalnızca role
   * "user" mesajlarında kullanılır) — bkz. ChatShell.tsx editMessage:
   * mesajdan sonraki yanıt zincirini siler ve yeniden yanıt üretir. */
  onEditMessage?: (messageId: string, newText: string) => void;
  /** "Önceki hali gör" bağlantısına basıldığında çağrılır — bkz.
   * ChatShell.tsx restorePreviousMessageVersion. */
  onNavigateMessageVersion?: (messageId: string) => void;
  /** "Buradan böl" eylemine basıldığında çağrılır — bkz. ChatShell.tsx
   * splitThreadFrom: bu mesajdan (dahil) itibaren her şeyi yeni bir
   * sohbete taşır. */
  onSplitThread?: (messageId: string) => void;
  /** "Farklı yanıtları karşılaştır" eylemine basıldığında çağrılır (bkz.
   * ChatShell.tsx openCompareFor) — yalnızca role "user" mesajlarında
   * kullanılır. */
  onCompareResponses?: (messageId: string) => void;
  /** true ise ve bu, tamamlanmış en son assistant mesajıysa otomatik seslendirilir. */
  autoSpeak?: boolean;
  /** Aktif projenin (varsa) TTS ses override'ı — bkz. ProjectsPane.tsx
   * ProjectSettingsModal ttsVoiceOverride. Verilmezse gemini-speech.ts
   * kullanıcının genel Ayarlar > Ses tercihine düşer. */
  ttsVoiceOverride?: string;
  /** Ayarlar > Arayüz panelinden seçilen yazı boyutu (ör. "15.5px"). */
  fontSize?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const vote = message.feedback ?? null;
  const pinned = message.pinned ?? false;

  useEffect(() => {
    return () => {
      if (speaking) stopLocalSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Otomatik seslendirme: sadece Ayarlar > Ses panelinden açıldıysa ve bu
  // mesaj akış tamamlanmış en son assistant yanıtıysa (canRegenerate zaten
  // bu koşulu taşıyor: !busy && son mesaj), bir kez tetiklenir. `message.id`
  // bağımlılığı, aynı mesajın tekrar tekrar okunmasını engeller.
  useEffect(() => {
    if (!autoSpeak || !canRegenerate || message.role !== "assistant" || !message.content.trim()) {
      return;
    }
    stopLocalSpeech();
    setSpeaking(true);
    void speakLocal(message.content, () => setSpeaking(false), ttsVoiceOverride);
    return () => stopLocalSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpeak, canRegenerate, message.id]);

  if (message.role === "user") {
    const textOnly = message.content
      .split("\n\n")
      .filter((part) => !/^\[(Görsel|Dosya) eklendi:/.test(part) && !/^\[Dosya:/.test(part))
      .join("\n\n")
      .trim();

    if (editing) {
      return (
        <div className="flex justify-end">
          <div className="w-full max-w-[85%] space-y-2">
            <textarea
              autoFocus
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
                // Enter tek başına yeni satır ekler (mesaj yazarken olduğu
                // gibi); Ctrl/Cmd+Enter düzenlemeyi gönderir — yanlışlıkla
                // erken göndermeyi önler.
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (editDraft.trim()) {
                    onEditMessage?.(message.id, editDraft.trim());
                    setEditing(false);
                  }
                }
              }}
              rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
              className="w-full resize-none rounded-[24px] rounded-br-lg bg-ink px-4 py-3 text-[15px] text-white shadow-lg focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink/50 transition hover:bg-black/5"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  if (editDraft.trim()) {
                    onEditMessage?.(message.id, editDraft.trim());
                    setEditing(false);
                  }
                }}
                disabled={!editDraft.trim()}
                className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex justify-end">
        <div className="max-w-[85%] space-y-2">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Eklenen görsel ${i + 1}`}
                  className="size-24 rounded-2xl object-cover shadow-lg"
                />
              ))}
            </div>
          )}
          {textOnly && (
            <div className="rounded-[24px] rounded-br-lg bg-ink px-4 py-3 text-[15px] whitespace-pre-wrap text-white shadow-lg">
              {textOnly}
            </div>
          )}
          <div className="flex items-center justify-end gap-2.5 px-1 opacity-0 transition group-hover:opacity-100">
            {(message.editHistory?.length ?? 0) > 0 && (
              <span className="text-[11px] text-ink/40">
                Düzenlendi
                {onNavigateMessageVersion && (
                  <button
                    onClick={() => onNavigateMessageVersion(message.id)}
                    className="ml-1 underline decoration-dotted underline-offset-2 hover:text-ink/70"
                  >
                    önceki hali gör
                  </button>
                )}
              </span>
            )}
            {onEditMessage && (
              <button
                onClick={() => {
                  setEditDraft(textOnly);
                  setEditing(true);
                }}
                aria-label="Mesajı düzenle"
                className="rounded-full p-1 text-ink/40 transition hover:bg-black/5 hover:text-ink"
              >
                <Pencil className="size-3.5" strokeWidth={1.8} />
              </button>
            )}
            {onCompareResponses && (
              <button
                onClick={() => onCompareResponses(message.id)}
                aria-label="Farklı yanıtları karşılaştır"
                title="Farklı yanıtları karşılaştır"
                className="rounded-full p-1 text-ink/40 transition hover:bg-black/5 hover:text-ink"
              >
                <SplitSquareHorizontal className="size-3.5" strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const speak = () => {
    if (speaking) {
      stopLocalSpeech();
      setSpeaking(false);
      return;
    }
    stopLocalSpeech();
    setSpeaking(true);
    void speakLocal(message.content, () => setSpeaking(false), ttsVoiceOverride);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied */
    }
  };

  // Tek bir mesajı Markdown (.md) dosyası olarak indirir — tüm sohbeti
  // dışa aktarmaktan (bkz. SettingsPanel.tsx DataSection handleExport,
  // JSON formatında) farklı olarak, burada tek bir yanıtı paylaşılabilir/
  // okunabilir bir dosya olarak kaydetme ihtiyacı karşılanır.
  const downloadAsMarkdown = () => {
    const blob = new Blob([message.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `mesaj-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="group max-w-full">
      {message.agentSteps && message.agentSteps.length > 0 && (
        <AgentStepList
          goal={message.agentGoal ?? ""}
          steps={message.agentSteps}
          onApprove={(stepId) => onApproveAgentStep?.(message.id, stepId)}
          onSkip={(stepId) => onSkipAgentStep?.(message.id, stepId)}
        />
      )}
      <div className="prose-nova text-ink" style={{ fontSize }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => (
              <MessageImage src={typeof src === "string" ? src : undefined} alt={alt} />
            ),
          }}
        >
          {message.content || "…"}
        </ReactMarkdown>
      </div>
      {message.content.length > 0 && (
        <div className="mt-1 -ml-2 flex items-center gap-0.5 text-ink/70">
          <ActionButton label="Sesli oku" active={speaking} onClick={speak}>
            {speaking ? <Square className="size-4" /> : <Volume2 className="size-4" />}
          </ActionButton>
          {speaking && (
            <div className="ml-1">
              <StreamWave label="Sesli okunuyor…" />
            </div>
          )}
          {canRegenerate && (
            <ActionButton label="Yeniden üret" onClick={onRegenerate}>
              <RefreshCw className="size-4" />
            </ActionButton>
          )}
          <ActionButton
            label="Beğen"
            active={vote === "up"}
            onClick={() => onFeedback?.(message.id, vote === "up" ? null : "up")}
          >
            <ThumbsUp className="size-4" />
          </ActionButton>
          <ActionButton
            label="Beğenme"
            active={vote === "down"}
            onClick={() => onFeedback?.(message.id, vote === "down" ? null : "down")}
          >
            <ThumbsDown className="size-4" />
          </ActionButton>
          <ActionButton label="Kopyala" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </ActionButton>
          <ActionButton label="Markdown olarak indir" onClick={downloadAsMarkdown}>
            <Download className="size-4" />
          </ActionButton>
          <ActionButton
            label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
            active={pinned}
            onClick={() => onTogglePin?.(message.id)}
          >
            <Pin className="size-4" fill={pinned ? "currentColor" : "none"} />
          </ActionButton>
          {onSplitThread && (
            <ActionButton
              label="Buradan yeni sohbet başlat"
              onClick={() => onSplitThread(message.id)}
            >
              <Scissors className="size-4" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}
