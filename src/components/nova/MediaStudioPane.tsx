import { useEffect, useRef, useState } from "react";
import { Clapperboard, Music2, ImageIcon, Loader2, Trash2, Wand2 } from "lucide-react";
import { getStoredGeminiKey } from "@/lib/gemini-key";
import { notify } from "@/lib/notifications";
import {
  fetchStoredVideos,
  addStoredVideo,
  deleteStoredVideo,
  fetchStoredMusic,
  addStoredMusic,
  deleteStoredMusic,
  fetchStoredImages,
  addStoredImage,
  deleteStoredImage,
  type GeneratedMedia,
} from "@/lib/media-store";
import {
  VIDEO_GALLERY,
  MUSIC_GALLERY,
  IMAGE_GALLERY,
  type MediaGalleryItem,
} from "./media-gallery";

type Mode = "video" | "music" | "image";

/**
 * Video üretim işlemi asenkron çalışır (bkz. src/routes/api/video.ts —
 * Veo bir "operation" başlatır). Bu süre boyunca kaç saniyede bir
 * durum sorgulanacağını ve en fazla ne kadar beklenileceğini belirler.
 */
const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_MS = 6 * 60_000;

export function MediaStudioPane({ mode }: { mode: Mode }) {
  const isVideo = mode === "video";
  const isMusic = mode === "music";
  const isImage = mode === "image";
  const [items, setItems] = useState<GeneratedMedia[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetcher = isVideo ? fetchStoredVideos : isMusic ? fetchStoredMusic : fetchStoredImages;
    void fetcher().then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [isVideo, isMusic]);

  const gallery: MediaGalleryItem[] = isVideo
    ? VIDEO_GALLERY
    : isMusic
      ? MUSIC_GALLERY
      : IMAGE_GALLERY;
  const Icon = isVideo ? Clapperboard : isMusic ? Music2 : ImageIcon;

  const handleDelete = (id: string) => {
    if (isVideo) deleteStoredVideo(id);
    else if (isMusic) deleteStoredMusic(id);
    else deleteStoredImage(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const generate = async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    if (!trimmed || busy) return;
    const apiKey = getStoredGeminiKey();
    if (!apiKey) {
      setError("Önce Ayarlar > API Anahtarı bölümünden Gemini anahtarını gir.");
      return;
    }
    setError(null);
    setBusy(true);
    abortRef.current = false;

    try {
      if (isVideo) {
        setStatusText("Video üretimi başlatılıyor…");
        const startRes = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
          body: JSON.stringify({ prompt: trimmed }),
        });
        const startData = (await startRes.json().catch(() => ({}))) as {
          operationName?: string;
          error?: string;
        };
        if (!startRes.ok || !startData.operationName) {
          throw new Error(startData.error || "Video üretimi başlatılamadı.");
        }

        setStatusText("Video oluşturuluyor, bu birkaç dakika sürebilir…");
        const deadline = Date.now() + MAX_POLL_MS;
        let dataUrl: string | null = null;
        while (Date.now() < deadline) {
          if (abortRef.current) return;
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (abortRef.current) return;
          const statusRes = await fetch(
            `/api/video-status?name=${encodeURIComponent(startData.operationName)}`,
            { headers: { "x-gemini-api-key": apiKey } },
          );
          const statusData = (await statusRes.json().catch(() => ({}))) as {
            done?: boolean;
            dataUrl?: string;
            error?: string;
          };
          if (!statusRes.ok) throw new Error(statusData.error || "Durum sorgulanamadı.");
          if (statusData.done) {
            if (statusData.error) throw new Error(statusData.error);
            if (statusData.dataUrl) dataUrl = statusData.dataUrl;
            break;
          }
        }
        if (!dataUrl)
          throw new Error("Video üretimi zaman aşımına uğradı, lütfen tekrar dener misin?");
        const item = addStoredVideo(trimmed, dataUrl);
        setItems((prev) => [item, ...prev]);
        notify("library", "Video hazır", trimmed);
      } else if (isMusic) {
        setStatusText("Müzik üretiliyor…");
        const res = await fetch("/api/music", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
          body: JSON.stringify({ prompt: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { dataUrl?: string; error?: string };
        if (!res.ok || !data.dataUrl) throw new Error(data.error || "Müzik üretilemedi.");
        const item = addStoredMusic(trimmed, data.dataUrl);
        setItems((prev) => [item, ...prev]);
        notify("library", "Müzik hazır", trimmed);
      } else {
        setStatusText("Görsel üretiliyor…");
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
          body: JSON.stringify({ prompt: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { dataUrl?: string; error?: string };
        if (!res.ok || !data.dataUrl) throw new Error(data.error || "Görsel üretilemedi.");
        const item = addStoredImage(trimmed, data.dataUrl);
        setItems((prev) => [item, ...prev]);
        notify("library", "Görsel hazır", trimmed);
      }
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setBusy(false);
      setStatusText("");
    }
  };

  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 pt-16 pb-10">
        <div className="mb-5 flex items-center gap-2">
          <Icon className="size-5 text-ink" strokeWidth={1.8} />
          <h1 className="text-[22px] font-semibold text-ink">
            {isVideo ? "Videolar" : isMusic ? "Müzikler" : "Görseller"}
          </h1>
        </div>
        <p className="mb-4 text-[14px] text-ink/65">
          {isVideo
            ? "Metinden gerçekçi, native sesli video üret (Veo) — bir prompt yaz ya da aşağıdan ilham al."
            : isMusic
              ? "Metinden 30 saniyelik yüksek kaliteli müzik üret (Lyria) — bir prompt yaz ya da aşağıdan ilham al."
              : "Metinden yüksek kaliteli görsel üret (Gemini) — bir prompt yaz ya da aşağıdan ilham al."}
        </p>

        <div className="mb-8 rounded-3xl border border-black/5 bg-black/[0.015] p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isVideo
                ? "Örn: Bulutların üzerinde uçan sinematik bir drone çekimi…"
                : isMusic
                  ? "Örn: Sakin, enstrümantal bir lo-fi parça…"
                  : "Örn: Dağların üzerinde gün batımı, sinematik ışıklandırma…"
            }
            rows={3}
            disabled={busy}
            className="w-full resize-none bg-transparent text-[14.5px] text-ink placeholder:text-ink/35 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[12px] text-ink/40">
              {isVideo
                ? "Üretim birkaç dakika sürebilir."
                : isMusic
                  ? "Üretim birkaç saniye sürer."
                  : "Üretim birkaç saniye sürer."}
            </p>
            <button
              onClick={() => generate(prompt)}
              disabled={busy || !prompt.trim()}
              className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {statusText || "Üretiliyor…"}
                </>
              ) : (
                <>
                  <Wand2 className="size-4" /> Üret
                </>
              )}
            </button>
          </div>
          {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
        </div>

        {items.length > 0 && (
          <>
            <p className="mb-3 text-[13px] font-medium tracking-wide text-ink/50 uppercase">
              {isVideo ? "Senin videoların" : isMusic ? "Senin müziklerin" : "Senin görsellerin"}
            </p>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-3xl bg-black/10 shadow-lg"
                >
                  {isVideo ? (
                    <video
                      src={item.dataUrl}
                      controls
                      preload="metadata"
                      className="aspect-video w-full bg-black object-cover"
                    />
                  ) : isMusic ? (
                    <div className="flex flex-col gap-2 bg-gradient-to-br from-violet-500/15 to-fuchsia-400/15 p-4">
                      <div className="flex items-center gap-2 text-ink/70">
                        <Music2 className="size-4" strokeWidth={1.8} />
                        <span className="text-[12.5px] font-medium">30 sn</span>
                      </div>
                      <audio src={item.dataUrl} controls preload="metadata" className="w-full" />
                    </div>
                  ) : (
                    <img
                      src={item.dataUrl}
                      alt={item.prompt}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2 px-4 py-3">
                    <p className="line-clamp-2 text-[13px] text-ink/70">{item.prompt}</p>
                    <button
                      onClick={() => handleDelete(item.id)}
                      aria-label="Sil"
                      className="shrink-0 rounded-full p-1.5 text-ink/40 opacity-0 transition hover:bg-black/5 hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mb-3 text-[13px] font-medium tracking-wide text-ink/50 uppercase">İlham al</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {gallery.map((g) => (
            <button
              key={g.title}
              onClick={() => setPrompt(g.prompt)}
              disabled={busy}
              className="group overflow-hidden rounded-3xl text-left shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div
                className="flex aspect-video w-full items-center justify-center"
                style={{ backgroundImage: g.gradient }}
              >
                <Icon className="size-9 text-white/85" strokeWidth={1.5} />
              </div>
              <div className="bg-black/[0.03] px-4 py-3">
                <p className="text-[13.5px] font-medium text-ink">{g.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-ink/50">{g.prompt}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
