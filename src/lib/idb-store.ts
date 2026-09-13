/**
 * Sohbetler ve projeler için kalıcı tarayıcı depolaması: IndexedDB.
 *
 * NEDEN localStorage DEĞİL: localStorage senkron API'ye sahiptir ama
 * genelde 5-10MB gibi küçük bir kotayla sınırlıdır ve tarayıcının "site
 * verilerini/geçmişi temizle" akışlarında ilk silinen depolardan biridir.
 * IndexedDB hem çok daha büyük kotalara (disk alanının önemli bir kısmı)
 * hem de `navigator.storage.persist()` ile "kalıcı" (persistent) olarak
 * işaretlenebilme özelliğine sahiptir — tarayıcı, bu izni aldıktan sonra
 * normal otomatik temizlik / "son X gün" temizliği gibi akışlarda bu veriyi
 * silmemeye çalışır (bu %100 garanti DEĞİLDİR: kullanıcı özellikle "bu site
 * için depolamayı sıfırla" derse veya tarayıcıyı tamamen kaldırırsa veri
 * yine silinir — hiçbir tarayıcı deposu buna karşı mutlak bir garanti
 * veremez, ama bu, mevcut en dayanıklı istemci-taraflı seçenektir).
 *
 * Bu proje artık sohbet/proje verisini SUNUCUDA SAKLAMAZ (bkz. db.ts'teki
 * mimari notu) — bu modül gerçek, tek kaynak (source of truth) haline gelir.
 */
import { openDB, type IDBPDatabase } from "idb";
import { DEFAULT_PROFILE_ID, getActiveProfileId, getCurrentUserId, onCurrentUserChange } from "./current-user";

const DB_NAME = "nova-store";
const DB_VERSION = 2;
const THREADS_STORE = "threads";
const PROJECTS_STORE = "projects";
const VIDEOS_STORE = "generated-videos";
const MUSIC_STORE = "generated-music";
const STUDIO_IMAGES_STORE = "generated-images-studio";
const ALL_STORES = [
  THREADS_STORE,
  PROJECTS_STORE,
  VIDEOS_STORE,
  MUSIC_STORE,
  STUDIO_IMAGES_STORE,
] as const;
export type IdbStoreName = (typeof ALL_STORES)[number];

let dbPromise: Promise<IDBPDatabase> | null = null;
let persistRequested = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/**
 * Tarayıcıdan bu site için depolamanın "kalıcı" (persistent) olarak
 * işaretlenmesini ister. Tarayıcı bu izni otomatik (kullanıcıya sormadan,
 * "site önemli" sinyallerine göre — sık ziyaret, yer imi, bildirim izni
 * vb.) verebilir veya reddedebilir; Nova bu konuda tarayıcının kararına
 * müdahale edemez, sadece isteği gönderir. Reddedilse bile IndexedDB normal
 * şekilde çalışmaya devam eder — sadece agresif otomatik temizliğe karşı
 * ekstra koruma olmaz.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return true;
  persistRequested = true;
  if (!isBrowser() || !navigator.storage?.persist) return false;
  try {
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function getDb(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // v2: "generated-videos"/"generated-music"/"generated-images-studio"
      // eklendi — bunlar önceden localStorage'da tutuluyordu (bkz.
      // media-store.ts eski sürümü), ama base64 video/görsel verisi
      // localStorage'ın 5-10MB kotasını birkaç üretimde doldurup sessizce
      // veri kaybına yol açabiliyordu. Diğer büyük veri (threads, projects)
      // gibi artık IndexedDB'de tutulur.
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    },
  });
  // Veritabanı ilk açıldığında kalıcılık iznini de iste — sessiz bir
  // arka plan isteğidir, kullanıcı akışını bloklamaz veya kesmez.
  void requestPersistentStorage();
  return dbPromise;
}

/**
 * Tüm anahtarlar kullanıcı ID'si + aktif profille namespace'lenir (bkz.
 * current-user.ts Madde 12 — Çoklu profil desteği) — aynı tarayıcıda
 * birden fazla hesap kullanılırsa (paylaşılan cihaz) her kullanıcının,
 * ve aynı kullanıcının farklı profillerinin (ör. "İş" / "Kişisel") verisi
 * kendi anahtarı altında ayrı kalır.
 */
function nsKey(baseKey: string): string {
  return `${baseKey}::${getCurrentUserId()}::${getActiveProfileId()}`;
}

/** Profil kavramından ÖNCEKİ eski anahtar formatı — yalnızca bir kerelik
 * migration için kullanılır (bkz. idbGetAll). */
function legacyNsKey(baseKey: string): string {
  return `${baseKey}::${getCurrentUserId()}`;
}

export async function idbGetAll<T>(store: IdbStoreName): Promise<T[]> {
  if (!isBrowser()) return [];
  try {
    const db = await getDb();
    const key = nsKey(store);
    const value = (await db.get(store, key)) as T[] | undefined;
    if (Array.isArray(value)) return value;

    // Profil desteği eklenmeden önce bu kullanıcı için kaydedilmiş veri
    // olabilir (eski anahtar formatı, profil eki yok). Yalnızca varsayılan
    // profildeyken ve yeni anahtarda hiç veri yokken bir kerelik taşınır
    // — böylece var olan kullanıcılar sohbet/proje geçmişini kaybetmiş
    // gibi görmez. Başka bir profil oluşturulup seçildiğinde bu migration
    // hiç tetiklenmez (o profilin zaten kendi, baştan boş alanı vardır).
    if (getActiveProfileId() === DEFAULT_PROFILE_ID) {
      const legacyValue = (await db.get(store, legacyNsKey(store))) as T[] | undefined;
      if (Array.isArray(legacyValue) && legacyValue.length > 0) {
        await db.put(store, legacyValue, key);
        await db.delete(store, legacyNsKey(store));
        return legacyValue;
      }
    }
    return [];
  } catch (e) {
    console.error(`[idb-store] ${store} okunamadı:`, e);
    return [];
  }
}

export async function idbSetAll<T>(store: IdbStoreName, items: T[]): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await getDb();
    await db.put(store, items, nsKey(store));
  } catch (e) {
    console.error(`[idb-store] ${store} yazılamadı:`, e);
  }
}

/**
 * Kullanıcı değişince (login/logout → namespace değişimi) IndexedDB'den
 * o kullanıcının kendi verisini yeniden okumaları için store'ların
 * (chat-store.ts, projects.ts) abone olabileceği bir yayın noktası.
 */
export function onIdbUserChange(listener: () => void): () => void {
  return onCurrentUserChange(listener);
}

/**
 * Ayarlar > Veri Kontrolleri panelindeki depolama göstergesi için:
 * tarayıcının verdiği yaklaşık kullanım/kota tahminini döner. Bu, Nova'nın
 * kendi IndexedDB kullanımına özel değildir (tarayıcı tüm origin için tek
 * bir tahmin verir) ama kullanıcıya "ne kadar yer kaldı" konusunda anlamlı
 * bir fikir verir. Tarayıcı desteklemiyorsa null döner.
 */
export async function getStorageEstimate(): Promise<{
  usedBytes: number;
  quotaBytes: number;
} | null> {
  if (!isBrowser() || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (usage === undefined || quota === undefined) return null;
    return { usedBytes: usage, quotaBytes: quota };
  } catch {
    return null;
  }
}
