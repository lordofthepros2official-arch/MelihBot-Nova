/**
 * Kullanıcının "Paylaş" butonuyla oluşturduğu proje bağlantılarının basit
 * bir kaydı. Ayarlar > Veri Kontrolleri > Paylaşılan Bağlantılar bölümünde
 * listelenip tek tek veya toplu olarak iptal edilebilir (bkz.
 * SettingsPanel DataSection).
 *
 * ÖNEMLİ: Proje verisi artık SUNUCUDA DEĞİL, kullanıcının kendi
 * tarayıcısının IndexedDB'sinde saklanır (bkz. idb-store.ts, projects.ts).
 * Bu yüzden `?project=ID` linki BAŞKA BİR CİHAZDA veya BAŞKA BİR
 * KULLANICIDA hiçbir şey açmaz — o cihazın IndexedDB'si tamamen ayrı ve
 * boş bir depodur, sunucuda aranacak bir kayıt yoktur. Link pratikte
 * yalnızca "aynı tarayıcıda, aynı sekmede/pencerede bu projeye doğrudan
 * git" için işe yarar; gerçek bir kişilerarası veya cihazlar-arası
 * paylaşım/davet mekanizması DEĞİLDİR. Bu modül yalnızca kullanıcının
 * "hangi bağlantıları oluşturdum" bilgisini tutar ki Ayarlar'da görüp
 * yönetebilsin.
 */

export type SharedLink = { projectId: string; projectName: string; createdAt: number };

import { namespacedKey } from "./current-user";

const STORAGE_KEY = "nova:shared-links";

export function getSharedLinks(): SharedLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(namespacedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SharedLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Bir proje paylaşıldığında (Paylaş butonuna basıldığında) çağrılır — aynı proje zaten kayıtlıysa tarihini günceller. */
export function recordSharedLink(projectId: string, projectName: string): void {
  if (typeof window === "undefined") return;
  try {
    const others = getSharedLinks().filter((l) => l.projectId !== projectId);
    const next = [{ projectId, projectName, createdAt: Date.now() }, ...others];
    window.localStorage.setItem(namespacedKey(STORAGE_KEY), JSON.stringify(next));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yok say */
  }
}

/** Tek bir paylaşım bağlantısını listeden kaldırır (bağlantının kendisi hâlâ çalışır, sadece Ayarlar'daki kayıttan silinir). */
export function revokeSharedLink(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      namespacedKey(STORAGE_KEY),
      JSON.stringify(getSharedLinks().filter((l) => l.projectId !== projectId)),
    );
  } catch {
    /* yok say */
  }
}

export function clearSharedLinks(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(namespacedKey(STORAGE_KEY));
  } catch {
    /* yok say */
  }
}
