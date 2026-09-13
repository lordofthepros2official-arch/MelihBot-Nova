/**
 * Kullanıcının aynı hesap içinde oluşturabileceği ayrı "profiller"
 * (Madde 12 — Çoklu profil desteği, ör. "İş" / "Kişisel"). Her profil,
 * current-user.ts'teki namespace mekanizması sayesinde kendi sohbetlerine,
 * projelerine, medyasına ve ayarlarına sahiptir — bu dosya yalnızca
 * profillerin İSİM LİSTESİNİ tutar (hangi profil ID'lerinin var olduğunu
 * ve görünen adlarını); asıl veri ayrımı idb-store.ts/current-user.ts'te
 * olur.
 *
 * Profil listesinin kendisi KULLANICI bazında saklanır (profil bazında
 * değil — bir profilin "hangi profiller var" bilgisini bilmesi anlamsız
 * olurdu, bu yüzden namespacedKey() yerine doğrudan kullanıcı ID'si
 * kullanılır).
 */

import { getCurrentUserId, getActiveProfileId, setActiveProfileId, DEFAULT_PROFILE_ID } from "./current-user";

export type Profile = { id: string; name: string; createdAt: number };

const STORAGE_KEY_PREFIX = "nova:profiles";
const MAX_PROFILES = 8; // makul bir üst sınır — sınırsız profil oluşturmayı önler

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}::${getCurrentUserId()}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Her zaman en az bir profil (varsayılan) içeren listeyi döner. */
export function listProfiles(): Profile[] {
  if (!isBrowser()) return [{ id: DEFAULT_PROFILE_ID, name: "Varsayılan", createdAt: 0 }];
  try {
    const raw = window.localStorage.getItem(storageKey());
    const stored = raw ? (JSON.parse(raw) as Profile[]) : [];
    if (Array.isArray(stored) && stored.some((p) => p.id === DEFAULT_PROFILE_ID)) {
      return stored;
    }
  } catch {
    /* bozuk veri — varsayılana düş */
  }
  return [{ id: DEFAULT_PROFILE_ID, name: "Varsayılan", createdAt: 0 }];
}

function saveProfiles(profiles: Profile[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(profiles));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yok say */
  }
}

/** Yeni bir profil oluşturur ve listeye ekler (aktif hale GETİRMEZ —
 * bkz. switchToProfile). Profil sayısı MAX_PROFILES'a ulaştıysa null döner. */
export function createProfile(name: string): Profile | null {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return null;
  const profiles = listProfiles();
  if (profiles.length >= MAX_PROFILES) return null;
  const profile: Profile = {
    id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    createdAt: Date.now(),
  };
  saveProfiles([...profiles, profile]);
  return profile;
}

/** Bir profili yeniden adlandırır (varsayılan profil dahil — "Varsayılan"
 * adı da değiştirilebilir, ID'si sabit kalır). */
export function renameProfile(id: string, name: string): void {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  saveProfiles(listProfiles().map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

/** Varsayılan profil ASLA silinemez (her zaman en az bir profil kalmalı).
 * Aktif profil siliniyorsa, önce varsayılana geçiş yapılır. Bu profile ait
 * VERİ (sohbetler, projeler vb.) SİLİNMEZ — yalnızca listeden çıkarılır;
 * IndexedDB'deki kayıtlar artık erişilemez ama teknik olarak durur (bu,
 * "profili sil" ile "profildeki her şeyi sil"i kasıtlı olarak ayırır —
 * kullanıcı yanlışlıkla bir profili silerse verisi geri getirilebilir
 * hale gelir, profili aynı ID'yle yeniden oluşturarak değil ama en azından
 * disk üzerinde kalıcı olarak kaybolmamış olur). */
export function deleteProfile(id: string): void {
  if (id === DEFAULT_PROFILE_ID) return;
  if (getActiveProfileId() === id) setActiveProfileId(DEFAULT_PROFILE_ID);
  saveProfiles(listProfiles().filter((p) => p.id !== id));
}

export { getActiveProfileId, setActiveProfileId };
