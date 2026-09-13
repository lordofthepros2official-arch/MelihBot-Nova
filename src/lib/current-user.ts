/**
 * Oturum açmış kullanıcının ID'sini, React dışındaki (modül seviyesindeki)
 * kod da senkron olarak okuyabilsin diye burada tutarız. chat-store.ts,
 * projects.ts, media-store.ts, settings-store.ts, gemini-key.ts,
 * shared-links.ts, keyboard-shortcuts.ts gibi store'ların hepsi
 * `localStorage` anahtarlarını bu ID ile namespace'ler (bkz.
 * namespacedKey aşağıda) — böylece aynı tarayıcıda birden fazla hesap
 * kullanılsa (paylaşılan cihaz) bile her kullanıcının verisi kendi
 * anahtarları altında ayrı kalır, hesaplar arası sızma olmaz.
 *
 * Bu değer `useAuth()` hook'u tarafından (sayfa yüklendiğinde /api/auth/me
 * yanıtına göre, sonra login/logout'ta) güncellenir — bkz. use-auth.ts.
 * Kullanıcı henüz bilinmiyorsa (ilk yüklemede /api/auth/me dönmeden önce)
 * "anon" kullanılır; bu, o kısa pencerede yazılan hiçbir verinin gerçek bir
 * hesapla karışmayacağı, zararsız bir geçici ad alanıdır.
 */

const ANON_NAMESPACE = "anon";
export const DEFAULT_PROFILE_ID = "default";
const ACTIVE_PROFILE_KEY_PREFIX = "nova:active-profile";

let currentUserId: string = ANON_NAMESPACE;
// Aktif "profil" (Madde 12 — Çoklu profil desteği): kullanıcı, aynı hesap
// içinde tamamen ayrı sohbet/proje/ayar setleri arasında geçiş yapabilir
// (örn. "İş" / "Kişisel"). Profil, kullanıcı ID'sinin İÇİNDE bir alt
// namespace'tir — bu sayede namespacedKey()'i kullanan HER store
// (chat-store, projects, media-store, settings-store, gemini-key,
// shared-links, keyboard-shortcuts...) otomatik olarak profil bazında
// ayrılır, tek tek değiştirilmelerine gerek kalmaz.
let currentProfileId: string = DEFAULT_PROFILE_ID;
const listeners = new Set<() => void>();

/** `useAuth()` tarafından kullanıcı değiştiğinde (giriş/çıkış) çağrılır. */
export function setCurrentUserId(userId: string | null): void {
  const next = userId || ANON_NAMESPACE;
  if (next === currentUserId) {
    // Kullanıcı aynı kaldıysa bile, o kullanıcı için daha önce seçilmiş
    // bir aktif profil varsa (localStorage'da) onu geri yükle — sayfa
    // yenilendiğinde profil sıfırlanmasın diye.
    restoreActiveProfileForCurrentUser();
    return;
  }
  currentUserId = next;
  currentProfileId = DEFAULT_PROFILE_ID;
  restoreActiveProfileForCurrentUser();
  for (const l of listeners) l();
}

function restoreActiveProfileForCurrentUser(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(`${ACTIVE_PROFILE_KEY_PREFIX}::${currentUserId}`);
    if (stored) currentProfileId = stored;
  } catch {
    /* localStorage kullanılamıyorsa varsayılan profilde kal */
  }
}

/** Senkron erişim: modül seviyesindeki store'lar bunu her okuma/yazmada çağırır. */
export function getCurrentUserId(): string {
  return currentUserId;
}

/** Şu an aktif olan profil ID'sini döner ("default" varsayılandır). */
export function getActiveProfileId(): string {
  return currentProfileId;
}

/**
 * Aktif profili değiştirir — bkz. lib/profiles.ts listProfiles/createProfile
 * (profil isimleri/listesi ayrı, kullanıcı-bazlı bir listede tutulur; bu
 * fonksiyon yalnızca "şu an hangisi aktif" bilgisini değiştirir). Tercih
 * kalıcıdır: sayfa yenilendiğinde aynı profil geri yüklenir.
 */
export function setActiveProfileId(profileId: string): void {
  if (profileId === currentProfileId) return;
  currentProfileId = profileId;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${ACTIVE_PROFILE_KEY_PREFIX}::${currentUserId}`, profileId);
    } catch {
      /* localStorage kullanılamıyorsa yalnızca bu sekme için geçerli olur */
    }
  }
  for (const l of listeners) l();
}

/** Kullanıcı değiştiğinde (namespace değiştiğinde) bileşenlerin state'ini tazelemesi için. */
export function onCurrentUserChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Bir temel anahtarı, o anki kullanıcı + aktif profile özel bir anahtara
 * çevirir. Örn: namespacedKey("nova:settings") ->
 * "nova:settings::u_abc123::default" (veya seçili profil ID'si).
 * Anonim durumda: "nova:settings::anon::default" (yalnızca giriş öncesi
 * kısa an için kullanılır, kalıcı bir hesapla asla ilişkilendirilmez).
 */
export function namespacedKey(baseKey: string): string {
  return `${baseKey}::${currentUserId}::${currentProfileId}`;
}
