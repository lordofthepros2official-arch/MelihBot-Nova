/**
 * Kullanıcının "Görseller", "Videolar" ve "Müzikler" sayfalarında ürettiği
 * içerikleri kalıcı olarak saklayan store.
 *
 * NEDEN IndexedDB (localStorage DEĞİL): Bu store önceden localStorage
 * kullanıyordu, ama base64 video/görsel data-URL'leri büyük olabildiğinden
 * (özellikle video, birkaç MB'a kadar), localStorage'ın tipik 5-10MB
 * kotası 2-4 üretimde dolabiliyor ve `setItem` sessizce başarısız olup
 * en eski kayıtları kullanıcıya haber vermeden kaybettiriyordu. IndexedDB
 * (bkz. idb-store.ts) çok daha büyük kotalara sahiptir ve chat-store.ts /
 * projects.ts ile aynı, tek kaynak (source of truth) desenini kullanır:
 * senkron erişim için bir bellek-içi önbellek + IndexedDB'den taze veriyi
 * çeken async `fetchStoredX()` fonksiyonları.
 *
 * Sohbet mesajlarına bağlı değildir (bkz. chat-store.ts
 * extractGeneratedImages) — bu sayfalar kendi başına bir üretim akışıdır,
 * tıpkı bir "stüdyo" gibi çalışır.
 *
 * Base64 data-URL'ler büyük olabileceğinden, en fazla MAX_ITEMS kayıt
 * tutulur; yenisi eklenince en eskisi silinir.
 */

import { idbGetAll, idbSetAll, onIdbUserChange, type IdbStoreName } from "./idb-store";
import { getCurrentUserId } from "./current-user";

export type GeneratedMedia = {
  id: string;
  prompt: string;
  dataUrl: string;
  createdAt: number;
};

const MAX_ITEMS = 12;
const VIDEO_STORE: IdbStoreName = "generated-videos";
const MUSIC_STORE: IdbStoreName = "generated-music";
const IMAGE_STORE: IdbStoreName = "generated-images-studio";

// Bu store önceden localStorage kullanıyordu (bkz. modül başındaki not);
// eski kullanıcıların o dönemde ürettiği medyayı kaybetmemek için, ilgili
// IndexedDB store'u boşsa ve eski localStorage anahtarında hâlâ veri
// varsa, bir kerelik olarak IndexedDB'ye taşınır ve eski anahtar temizlenir.
// Anahtar formatı ("nova:<store>::<userId>") eski media-store.ts'teki
// VIDEO_KEY/MUSIC_KEY/IMAGE_KEY + namespacedKey() ile birebir aynıdır.
const LEGACY_LOCALSTORAGE_KEY: Record<IdbStoreName, string | null> = {
  threads: null,
  projects: null,
  [VIDEO_STORE]: "nova:generated-videos",
  [MUSIC_STORE]: "nova:generated-music",
  [IMAGE_STORE]: "nova:generated-images-studio",
};

function readLegacyLocalStorage(store: IdbStoreName): GeneratedMedia[] {
  const base = LEGACY_LOCALSTORAGE_KEY[store];
  if (!base || typeof window === "undefined") return [];
  try {
    // DİKKAT: burada bilerek namespacedKey() DEĞİL, eski (profil eki
    // olmadan) format kullanılıyor — bkz. current-user.ts Madde 12 notu:
    // namespacedKey() artık "${base}::${userId}::${profileId}" üretiyor,
    // ama bu migration'ın aradığı eski veri "${base}::${userId}" formatında
    // (profil kavramı henüz yokken) kaydedilmişti. namespacedKey()
    // kullansaydık bu eski anahtarı asla bulamazdık.
    const raw = window.localStorage.getItem(`${base}::${getCurrentUserId()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GeneratedMedia[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacyLocalStorage(store: IdbStoreName): void {
  const base = LEGACY_LOCALSTORAGE_KEY[store];
  if (!base || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${base}::${getCurrentUserId()}`);
  } catch {
    /* yok say */
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// Her medya türü için ayrı bir bellek-içi önbellek: senkron çağrılar
// (getStoredVideos vb.) sayfa render'ını bloklamadan bu önbellekten okur;
// IndexedDB'nin kendi API'si asenkron olduğundan, sayfa ilk açıldığında bu
// önbellek boş başlar ve fetchStoredX() tamamlanınca doldurulur (bkz.
// MediaStudioPane.tsx / ChatShell.tsx useEffect'leri).
const caches: Partial<Record<IdbStoreName, GeneratedMedia[]>> = {};
function getCache(store: IdbStoreName): GeneratedMedia[] {
  return caches[store] ?? [];
}
function setCacheAndPersist(store: IdbStoreName, items: GeneratedMedia[]): void {
  const trimmed = items.slice(0, MAX_ITEMS);
  caches[store] = trimmed;
  void idbSetAll(store, trimmed);
}

if (isBrowser()) {
  // Kullanıcı değiştiğinde (login/logout → namespace değişimi) önbellekleri
  // sıfırla ki bir önceki kullanıcının medyası ekranda kalmasın; IndexedDB
  // zaten kullanıcı ID'siyle namespace'lenmiş durumda (bkz. idb-store.ts).
  onIdbUserChange(() => {
    caches[VIDEO_STORE] = [];
    caches[MUSIC_STORE] = [];
    caches[IMAGE_STORE] = [];
  });
}

async function fetchList(store: IdbStoreName): Promise<GeneratedMedia[]> {
  const list = await idbGetAll<GeneratedMedia>(store);
  if (list.length > 0) {
    caches[store] = list;
    return list;
  }
  // IndexedDB boş — eski localStorage'da veri kalmış olabilir (bkz. yukarı).
  const legacy = readLegacyLocalStorage(store);
  if (legacy.length === 0) {
    caches[store] = list;
    return list;
  }
  const migrated = legacy.slice(0, MAX_ITEMS);
  caches[store] = migrated;
  await idbSetAll(store, migrated);
  clearLegacyLocalStorage(store);
  return migrated;
}

function addItem(store: IdbStoreName, prompt: string, dataUrl: string): GeneratedMedia {
  const item: GeneratedMedia = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    dataUrl,
    createdAt: Date.now(),
  };
  setCacheAndPersist(store, [item, ...getCache(store)]);
  return item;
}

function deleteItem(store: IdbStoreName, id: string): void {
  setCacheAndPersist(
    store,
    getCache(store).filter((v) => v.id !== id),
  );
}

// ── Videolar ─────────────────────────────────────────────────────────────
/** Senkron erişim: en son bilinen (önbellekteki) video listesini döner. */
export function getStoredVideos(): GeneratedMedia[] {
  return getCache(VIDEO_STORE);
}
/** IndexedDB'den taze video listesini okur ve önbelleği günceller. */
export function fetchStoredVideos(): Promise<GeneratedMedia[]> {
  return fetchList(VIDEO_STORE);
}
export function addStoredVideo(prompt: string, dataUrl: string): GeneratedMedia {
  return addItem(VIDEO_STORE, prompt, dataUrl);
}
export function deleteStoredVideo(id: string): void {
  deleteItem(VIDEO_STORE, id);
}

// ── Müzikler ─────────────────────────────────────────────────────────────
export function getStoredMusic(): GeneratedMedia[] {
  return getCache(MUSIC_STORE);
}
export function fetchStoredMusic(): Promise<GeneratedMedia[]> {
  return fetchList(MUSIC_STORE);
}
export function addStoredMusic(prompt: string, dataUrl: string): GeneratedMedia {
  return addItem(MUSIC_STORE, prompt, dataUrl);
}
export function deleteStoredMusic(id: string): void {
  deleteItem(MUSIC_STORE, id);
}

// ── Görseller (Stüdyo) ───────────────────────────────────────────────────
export function getStoredImages(): GeneratedMedia[] {
  return getCache(IMAGE_STORE);
}
export function fetchStoredImages(): Promise<GeneratedMedia[]> {
  return fetchList(IMAGE_STORE);
}
export function addStoredImage(prompt: string, dataUrl: string): GeneratedMedia {
  return addItem(IMAGE_STORE, prompt, dataUrl);
}
export function deleteStoredImage(id: string): void {
  deleteItem(IMAGE_STORE, id);
}
