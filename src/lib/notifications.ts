import { getStoredSettings } from "./settings-store";
import type { NotificationKey } from "./settings-store";

/**
 * Uygulama içi bildirim yardımcıları. Ayarlar > Bildirimler'deki her
 * kategori (bkz. NOTIFICATION_LABELS) burada `isNotificationEnabled` ile
 * kontrol edilip, kapalıysa ilgili bildirim hiç tetiklenmez.
 *
 * Not: Bu proje bir push-notification sunucusu içermiyor; buradaki
 * bildirimler sekme arka plandayken tarayıcının kendi Notification API'si
 * (izin verildiyse) veya sekme başlığı yanıp sönmesi üzerinden gösterilir.
 */

export function isNotificationEnabled(key: NotificationKey): boolean {
  return getStoredSettings().notifications[key] ?? true;
}

let titleFlashInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle: string | null = null;

function flashTitle(message: string) {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return; // sekme zaten açıksa gerek yok
  if (titleFlashInterval) return; // zaten yanıp sönüyor
  originalTitle = document.title;
  let showingMessage = false;
  titleFlashInterval = setInterval(() => {
    document.title = showingMessage ? (originalTitle ?? document.title) : message;
    showingMessage = !showingMessage;
  }, 1200);

  const stop = () => {
    if (titleFlashInterval) {
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
    }
    if (originalTitle) document.title = originalTitle;
    document.removeEventListener("visibilitychange", stop);
  };
  document.addEventListener("visibilitychange", stop);
}

/**
 * Bir bildirim kategorisi için kullanıcıyı uyarır — kategori Ayarlar'dan
 * kapatıldıysa hiçbir şey yapmaz. Tarayıcı bildirim izni verilmişse ve
 * sekme arka plandaysa native Notification gösterilir; izin yoksa/sekme
 * arka plandaysa sekme başlığı yanıp söner (visibilitychange ile durur).
 */
export function notify(key: NotificationKey, title: string, body?: string): void {
  if (!isNotificationEnabled(key)) return;
  if (typeof window === "undefined") return;

  if (document.visibilityState !== "visible") {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, body ? { body, silent: false } : { silent: false });
      } catch {
        flashTitle(title);
      }
    } else {
      flashTitle(title);
    }
  }
}

/** Tarayıcı bildirim iznini ister (yalnızca kullanıcı açıkça bir eylemle tetiklediğinde çağrılmalı). */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  try {
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}
