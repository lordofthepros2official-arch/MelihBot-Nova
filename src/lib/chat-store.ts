import { idbGetAll, idbSetAll, onIdbUserChange } from "./idb-store";

export type ChatRole = "user" | "assistant";

export type AgentStepStatus =
  "pending" | "needs_approval" | "running" | "done" | "error" | "skipped";

export type ChatAgentStep = {
  id: number;
  title: string;
  detail: string;
  status: AgentStepStatus;
  output: string;
  requiresApproval: boolean;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Kullanıcı mesajına eklenen görsellerin base64 data URL'leri (varsa). */
  images?: string[];
  /** Bu mesaj bir agent görevi ise (otomatik tetiklenmiş çok adımlı görev) adımlar burada tutulur. */
  agentGoal?: string;
  agentSteps?: ChatAgentStep[];
  /** Kullanıcının bu assistant yanıtına verdiği geri bildirim ("Beğen"/"Beğenme" butonları). Kalıcıdır. */
  feedback?: "up" | "down" | null;
  /** Kullanıcı bu mesajı sabitlediyse (bkz. MessageItem.tsx "Sabitle" eylemi
   * ve ChatShell.tsx pinned mesajlar listesi). Kalıcıdır, IndexedDB'de
   * mesajla birlikte saklanır. */
  pinned?: boolean;
  /** Bu bir kullanıcı mesajıysa ve daha önce düzenlendiyse, ESKİ
   * versiyonlar (düzenlemeden hemen önceki hal) burada saklanır — en
   * eskiden en yeniye sıralı. "Şu anki" hal her zaman message.content'te
   * durur, bu dizide değil (bkz. ChatShell.tsx editMessage). Boşsa/yoksa
   * mesaj hiç düzenlenmemiş demektir. */
  editHistory?: { content: string; images?: string[] }[];
  /** editMessage() çağrıldığında, düzenlenen mesajdan SONRAKİ tüm mesajlar
   * (eski yanıt zinciri) silinmeden önce burada saklanır — kullanıcı
   * "önceki yanıta dön" diyerek bu dalı geri getirebilir (bkz.
   * MessageItem.tsx sürüm gezinme okları 1/2, 2/2 ...). Yalnızca bir
   * düzenlemeden hemen sonraki assistant mesajında (veya en son kullanıcı
   * mesajında, eğer henüz yanıtlanmadıysa) anlamlıdır. */
  supersededTail?: ChatMessage[];
};

export type Thread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  /** Kullanıcı bu sohbeti arşivlediyse true. Arşivlenen sohbetler normal
   * "Sohbetler" listesinden gizlenir, Ayarlar > Veri Kontrolleri'nden
   * yönetilir (bkz. SettingsPanel DataSection). */
  archived?: boolean;
  /** Kullanıcının bu sohbete taktığı etiketler (bkz. lib/tags.ts TAG_COLORS
   * — her etiket sabit bir renk paletinden bir renkle ilişkilendirilir).
   * Birden fazla etiket olabilir. Boş/yoksa hiç etiket yok demektir. */
  tags?: string[];
};

export const isBrowser = () => typeof window !== "undefined";

export function newId() {
  if (isBrowser() && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Sohbet geçmişi artık SUNUCUDA DEĞİL, tarayıcının IndexedDB'sinde saklanır
 * (bkz. src/lib/idb-store.ts) — bu, gerçek/tek kaynaktır (source of truth).
 * `loadThreads()` gibi bazı fonksiyonlar senkron çağrılabilmesi (UI'ın anlık
 * render etmesi) için bir bellek-içi önbellek kullanır; IndexedDB'nin kendi
 * API'si asenkron olduğundan, sayfa ilk açıldığında bu önbellek boş
 * başlar ve `fetchThreads()` (artık IndexedDB'den okuyan, ama aynı ismi
 * koruyan fonksiyon) tamamlanınca doldurulur.
 */
let threadsCache: Thread[] = [];
let cacheHydrated = false;

if (isBrowser()) {
  // Kullanıcı değiştiğinde (login/logout → namespace değişimi) bellek-içi
  // önbelleği zorla yeniden hydrate et — aksi halde bir önceki kullanıcının
  // thread'leri, yeni kullanıcı için IndexedDB'den taze veri gelene kadar
  // ekranda kalmaya devam edebilirdi.
  onIdbUserChange(() => {
    cacheHydrated = false;
    threadsCache = [];
    window.dispatchEvent(new CustomEvent("nova:threads"));
    void fetchThreads();
  });
}

function setCache(threads: Thread[]) {
  threadsCache = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
  void idbSetAll("threads", threadsCache);
  if (isBrowser()) window.dispatchEvent(new CustomEvent("nova:threads"));
}

/** Senkron erişim: en son bilinen (önbellekteki) thread listesini döner. */
export function loadThreads(): Thread[] {
  return threadsCache;
}

/** IndexedDB'den taze thread listesini okur ve önbelleği günceller. */
export async function fetchThreads(): Promise<Thread[]> {
  const threads = await idbGetAll<Thread>("threads");
  threads.sort((a, b) => b.updatedAt - a.updatedAt);
  threadsCache = threads;
  cacheHydrated = true;
  if (isBrowser()) window.dispatchEvent(new CustomEvent("nova:threads"));
  return threads;
}

export function getThread(id: string): Thread | undefined {
  return loadThreads().find((t) => t.id === id);
}

/** Geriye dönük uyumluluk için korunan isim: artık IndexedDB'den okur (ağ isteği yok). */
export async function fetchThread(id: string): Promise<Thread | undefined> {
  if (!cacheHydrated) await fetchThreads();
  return getThread(id);
}

/** Thread'i hem bellek-içi önbellekte hem de IndexedDB'de (kalıcı kaynak) günceller. */
export function upsertThread(thread: Thread) {
  const threads = loadThreads().filter((t) => t.id !== thread.id);
  setCache([thread, ...threads]);
}

export function deleteThread(id: string) {
  setCache(loadThreads().filter((t) => t.id !== id));
}

/** Tek bir thread'i arşivler/arşivden çıkarır (bkz. SettingsPanel DataSection). */
export function setThreadArchived(id: string, archived: boolean) {
  const thread = loadThreads().find((t) => t.id === id);
  if (!thread) return;
  upsertThread({ ...thread, archived, updatedAt: thread.updatedAt });
}

/** Bir thread'in etiket listesini komple değiştirir (bkz. ChatShell.tsx
 * Kitaplık sayfasındaki etiket düzenleyici). updatedAt bilerek DEĞİŞTİRİLMEZ
 * — etiketleme "son güncelleme" sırasını etkilememeli (bkz. toggleProjectPinned
 * ile aynı gerekçe, projects.ts). */
export function setThreadTags(id: string, tags: string[]) {
  const thread = loadThreads().find((t) => t.id === id);
  if (!thread) return;
  upsertThread({ ...thread, tags, updatedAt: thread.updatedAt });
}

/** Tüm sohbetleri tek seferde arşivler ("Tümünü arşivle"). */
export function archiveAllThreads() {
  for (const t of loadThreads()) {
    if (!t.archived) upsertThread({ ...t, archived: true });
  }
}

/** Tüm sohbetleri kalıcı olarak siler ("Tümünü sil"). */
export function deleteAllThreads() {
  setCache([]);
}

/** Belirtilen ID'lere sahip sohbetleri tek seferde arşivler/arşivden
 * çıkarır (bkz. ChatShell.tsx Kitaplık sayfasındaki çoklu seçim modu).
 * archiveAllThreads'ten farklı olarak tek bir setCache çağrısıyla çalışır
 * — çok sayıda seçili thread'de tek tek upsertThread çağırmaktan (her
 * seferinde tüm listeyi yeniden IndexedDB'ye yazar) daha verimlidir. */
export function setThreadsArchived(ids: string[], archived: boolean) {
  const idSet = new Set(ids);
  const updated = loadThreads().map((t) => (idSet.has(t.id) ? { ...t, archived } : t));
  setCache(updated);
}

/** Belirtilen ID'lere sahip sohbetleri tek seferde kalıcı olarak siler
 * (bkz. ChatShell.tsx Kitaplık sayfasındaki çoklu seçim modu). */
export function deleteThreads(ids: string[]) {
  const idSet = new Set(ids);
  setCache(loadThreads().filter((t) => !idSet.has(t.id)));
}

export function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 38 ? clean.slice(0, 38) + "…" : clean || "Yeni sohbet";
}

export type GeneratedImage = { url: string; alt: string; threadId: string; createdAt: number };

const MARKDOWN_IMG = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

/** Tüm thread'lerdeki mesajları tarayıp modelin ürettiği görselleri (markdown img) çıkarır. */
export function extractGeneratedImages(threads: Thread[]): GeneratedImage[] {
  const images: GeneratedImage[] = [];
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.role !== "assistant") continue;
      let match: RegExpExecArray | null;
      MARKDOWN_IMG.lastIndex = 0;
      while ((match = MARKDOWN_IMG.exec(m.content))) {
        const alt = match[1] ?? "";
        const url = match[2];
        if (url) images.push({ url, alt, threadId: t.id, createdAt: t.updatedAt });
      }
    }
  }
  return images.sort((a, b) => b.createdAt - a.createdAt);
}
