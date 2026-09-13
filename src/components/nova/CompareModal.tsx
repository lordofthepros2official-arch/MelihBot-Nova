import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/chat-store";
import { getStoredGeminiKey } from "@/lib/gemini-key";
import { stripUsageSentinel } from "@/lib/chat-runtime";

type Variant = { id: string; label: string; instruction: string };

/**
 * Madde 7 — Yanıt karşılaştırma (A/B): aynı prompt için iki farklı yanıt
 * üretip yan yana gösterir, kullanıcı birini "kullan" diyerek seçebilir.
 *
 * ÖNEMLİ MİMARİ NOT: model seçimi artık kullanıcıya bırakılmıyor (bkz.
 * settings-store.ts buildSettingsHeaders — sunucu otomatik bir fallback
 * zinciri kullanır, x-gemini-model header'ı gönderilmez). Bu yüzden "iki
 * farklı MODEL"le karşılaştırma yapmak mümkün değil; bunun yerine aynı
 * prompt iki farklı ÜSLUP TALİMATIYLA (ör. "kısa ve net" vs "detaylı ve
 * açıklamalı") çalıştırılır — bu, gerçek ve kullanıcı için anlamlı bir
 * karşılaştırma sağlar, kullanıcının kendi extraInstructions ayarına
 * dokunmadan (istek başına, geçici bir sistem talimatı olarak eklenir).
 */
const VARIANTS: Variant[] = [
  { id: "a", label: "Kısa ve net", instruction: "Yanıtını kısa, öz ve doğrudan ver." },
  {
    id: "b",
    label: "Detaylı ve açıklamalı",
    instruction: "Yanıtını daha ayrıntılı ver, gerekirse örneklerle açıkla.",
  },
];

async function streamVariant(
  prompt: string,
  history: ChatMessage[],
  instruction: string,
  apiKey: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const wireMessages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: prompt },
  ];
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gemini-api-key": apiKey,
      "x-nova-extra-instructions": encodeURIComponent(instruction),
    },
    body: JSON.stringify({ messages: wireMessages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || "Yanıt alınamadı.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(stripUsageSentinel(full));
  }
}

export function CompareModal({
  onClose,
  prompt,
  history,
  onUseVariant,
}: {
  onClose: () => void;
  /** Karşılaştırılacak prompt (kullanıcının son mesajı). */
  prompt: string;
  /** Prompttan ÖNCEKİ konuşma geçmişi (bağlam için). */
  history: ChatMessage[];
  /** Kullanıcı bir varyantı "Bunu kullan" ile seçince çağrılır. */
  onUseVariant: (text: string) => void;
}) {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const apiKey = getStoredGeminiKey();
    if (!apiKey) {
      setErrors(Object.fromEntries(VARIANTS.map((v) => [v.id, "Gemini API anahtarı gerekli."])));
      setDone(Object.fromEntries(VARIANTS.map((v) => [v.id, true])));
      return;
    }
    for (const v of VARIANTS) {
      void streamVariant(
        prompt,
        history,
        v.instruction,
        apiKey,
        (text) => setContents((prev) => ({ ...prev, [v.id]: text })),
        controller.signal,
      )
        .catch((e) => {
          if (controller.signal.aborted) return;
          setErrors((prev) => ({
            ...prev,
            [v.id]: e instanceof Error ? e.message : "Yanıt alınamadı.",
          }));
        })
        .finally(() => setDone((prev) => ({ ...prev, [v.id]: true })));
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="animate-rise flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Yanıtları karşılaştır"
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Yanıtları karşılaştır</h2>
            <p className="truncate text-[12.5px] text-ink/50">"{prompt}"</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5" aria-label="Kapat">
            <X className="size-5" />
          </button>
        </div>
        <div className="nova-scroll grid flex-1 grid-cols-1 gap-px overflow-y-auto bg-black/5 sm:grid-cols-2">
          {VARIANTS.map((v) => (
            <div key={v.id} className="flex flex-col bg-white">
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
                <span className="text-[12.5px] font-medium text-ink/70">{v.label}</span>
                {!done[v.id] && <Loader2 className="size-3.5 animate-spin text-ink/40" />}
              </div>
              <div className="nova-scroll flex-1 overflow-y-auto p-4 text-[14px] leading-relaxed">
                {errors[v.id] ? (
                  <p className="text-red-600">{errors[v.id]}</p>
                ) : contents[v.id] ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{contents[v.id]}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-ink/35">Yanıt hazırlanıyor…</p>
                )}
              </div>
              {done[v.id] && contents[v.id] && !errors[v.id] && (
                <div className="border-t border-black/5 p-3">
                  <button
                    onClick={() => onUseVariant(contents[v.id]!)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white transition hover:opacity-90"
                  >
                    <Check className="size-3.5" strokeWidth={2.5} />
                    Bunu kullan
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
