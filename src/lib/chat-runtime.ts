import { getThread, newId, titleFrom, upsertThread, type ChatMessage } from "./chat-store";
import { getStoredGeminiKey } from "./gemini-key";
import { addTokenUsage, buildSettingsHeaders } from "./settings-store";
import { notify } from "./notifications";

/** Sunucunun stream sonuna eklediği görünmez kullanım sentinel'i (bkz.
 * src/routes/api/chat.ts). Client'ta metinden ayıklanır, ekrana asla
 * yazılmaz — yalnızca "Akıllı Token Tasarrufu" sayacını günceller.
 * \u0000 burada kasıtlı: normal metinde asla geçmeyecek bir sınırlayıcı
 * olarak seçildi, bu yüzden no-control-regex kuralı bilinçli olarak
 * devre dışı bırakılmıştır. */
// eslint-disable-next-line no-control-regex
const NOVA_USAGE_RE = /\u0000NOVA_USAGE:(\d+)\u0000/;

export function stripUsageSentinel(text: string): string {
  return text.replace(NOVA_USAGE_RE, "");
}

type RunState = {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  controller: AbortController | null;
};

const states = new Map<string, RunState>();
const listeners = new Map<string, Set<() => void>>();

function emit(threadId: string) {
  listeners.get(threadId)?.forEach((l) => l());
}

export function subscribe(threadId: string, listener: () => void) {
  const set = listeners.get(threadId) ?? new Set();
  set.add(listener);
  listeners.set(threadId, set);
  return () => set.delete(listener);
}

export function getState(threadId: string): RunState {
  let state = states.get(threadId);
  if (!state) {
    state = {
      messages: getThread(threadId)?.messages ?? [],
      busy: false,
      error: null,
      controller: null,
    };
    states.set(threadId, state);
  }
  return state;
}

function persist(threadId: string, messages: ChatMessage[]) {
  const existing = getThread(threadId);
  upsertThread({
    id: threadId,
    title: existing?.title ?? titleFrom(messages.find((m) => m.role === "user")?.content ?? ""),
    updatedAt: Date.now(),
    messages,
  });
}

export function setMessages(threadId: string, messages: ChatMessage[]) {
  const state = getState(threadId);
  state.messages = messages;
  emit(threadId);
}

export function stop(threadId: string) {
  getState(threadId).controller?.abort();
}

export async function run(
  threadId: string,
  history: ChatMessage[],
  projectContext?: string,
  webContext?: string,
) {
  const state = getState(threadId);
  const controller = new AbortController();
  state.busy = true;
  state.error = null;
  state.controller = controller;
  const assistantId = newId();
  state.messages = [...history, { id: assistantId, role: "assistant", content: "" }];
  persist(threadId, state.messages);
  emit(threadId);

  let timedOut = false;

  try {
    type WireContentPart =
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
    type WireMsg = {
      role: "user" | "assistant" | "system";
      content: string | WireContentPart[];
    };
    const wireMessages: WireMsg[] = history.map((m) => {
      if (m.role === "user" && m.images && m.images.length > 0) {
        const parts: WireContentPart[] = [{ type: "text", text: m.content }];
        for (const url of m.images) parts.push({ type: "image_url", image_url: { url } });
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });
    // Proje bağlamı ve web arama bağlamı KASITLI OLARAK ayrı sistem
    // mesajları olarak gönderilir (birleştirilmez). Sunucu tarafı (chat.ts)
    // bunları içeriklerine göre ayırt edip web bağlamına modele "bu güncel
    // bilgidir, mutlaka kullan" diyen ayrı ve daha vurgulu bir talimat
    // ekler. Tek bir "PROJE BAĞLAMI" mesajı altında birleştirilselerdi
    // model, güncel arama sonuçlarını kullanıcının statik proje
    // talimatıyla karıştırıp yeterince öncelik vermeyebilirdi.
    if (webContext) {
      wireMessages.unshift({ role: "system", content: webContext });
    }
    if (projectContext) {
      wireMessages.unshift({ role: "system", content: projectContext });
    }
    const geminiKey = getStoredGeminiKey();
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Kullanıcının kendi Gemini API anahtarı; sunucu bunu sadece bu
        // isteği Gemini'ye iletmek için kullanır, saklamaz (bkz. chat.ts).
        ...(geminiKey ? { "x-gemini-api-key": geminiKey } : {}),
        // Ayarlar panelinden seçilen model ve ekstra talimat (varsa).
        ...buildSettingsHeaders(),
      },
      body: JSON.stringify({ messages: wireMessages }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text()) || "Yanıt alınamadı.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    // Sunucu tarafında bir idle-timeout olsa da, ağ/tarayıcı seviyesinde
    // bağlantı hiç kapanmadan askıda kalabilir. Bu yüzden burada da
    // bağımsız bir "chunk'lar arası boşta bekleme" zaman aşımı uygulanır:
    // bu süre boyunca hiç yeni veri gelmezse istek iptal edilip kullanıcıya
    // hata gösterilir, "..." sonsuza kadar takılı kalmaz.
    const STREAM_IDLE_TIMEOUT_MS = 60_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    try {
      armIdleTimer();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armIdleTimer();
        full += decoder.decode(value, { stream: true });
        state.messages = state.messages.map((m) =>
          m.id === assistantId ? { ...m, content: stripUsageSentinel(full) } : m,
        );
        emit(threadId);
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }

    // Kullanım sentinel'ini metinden ayıkla ve Ayarlar > Model'deki "Canlı
    // API Kullanımı" sayacına ekle — salt bilgi amaçlıdır, limit uygulamaz.
    const usageMatch = full.match(NOVA_USAGE_RE);
    if (usageMatch) {
      full = stripUsageSentinel(full);
      const tokens = Number(usageMatch[1]);
      if (Number.isFinite(tokens) && tokens > 0) addTokenUsage(tokens);
      state.messages = state.messages.map((m) =>
        m.id === assistantId ? { ...m, content: full } : m,
      );
      emit(threadId);
    }

    if (!full.trim()) {
      throw new Error("Yanıt alınamadı, sunucudan veri gelmedi. Lütfen tekrar dener misin?");
    }
  } catch (e) {
    const wasAbort = e instanceof DOMException && e.name === "AbortError";
    if (wasAbort && timedOut) {
      state.error =
        "Yanıt alma zaman aşımına uğradı (sağlayıcıdan veri gelmedi). Lütfen tekrar dener misin?";
    } else if (!wasAbort) {
      state.error = e instanceof Error ? e.message : "Bir hata oluştu.";
    }
  } finally {
    state.busy = false;
    state.controller = null;
    persist(threadId, state.messages);
    emit(threadId);
    // Yanıt tamamlandığında, kullanıcı başka bir sekmedeyse/uygulama arka
    // plandaysa bilgilendir. Kısa/hızlı yanıtlarda gerek yok — sadece
    // makul sürede tamamlanmış (yani muhtemelen kullanıcının beklediği,
    // uzunca bir) yanıtlarda tetiklenir. Hata durumunda da bildirim
    // gönderilir ki kullanıcı sekmeye dönmeden hatayı öğrenmesin diye
    // beklemesin.
    const finishedMessage = state.messages.find((m) => m.id === assistantId);
    if (!state.error && finishedMessage && finishedMessage.content.length > 40) {
      notify("responses", "Yanıt hazır", titleFrom(finishedMessage.content));
    } else if (state.error) {
      notify("responses", "Yanıt alınamadı", state.error);
    }
  }
}
