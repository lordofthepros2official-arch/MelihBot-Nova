/**
 * Uygulama genelindeki klavye kısayollarını tek bir yerden yöneten modül.
 * Notlardaki istek: "Tüm kısayollar atanacak ama kullanıcı basınca o tuşa
 * atanacak" — yani her eylem için varsayılan bir tuş kombinasyonu vardır,
 * ama kullanıcı Ayarlar > Klavye'den "Değiştir"e basıp istediği tuşa
 * basarak yeni bir kombinasyon atayabilir.
 *
 * Kombinasyonlar "ctrl+k", "ctrl+shift+n" gibi normalize edilmiş string'ler
 * olarak localStorage'da saklanır. Mac'te Cmd tuşu da "ctrl" olarak kabul
 * edilir (metaKey || ctrlKey) — kullanıcı tarafında ekranda "⌘/Ctrl" olarak
 * gösterilir.
 */

export type ShortcutAction =
  "newChat" | "toggleSidebar" | "openSettings" | "focusComposer" | "openLibrary" | "commandPalette";

export type ShortcutBinding = { combo: string; label: string; description: string };

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutBinding> = {
  newChat: { combo: "ctrl+shift+o", label: "Yeni sohbet", description: "Boş bir sohbet başlatır" },
  toggleSidebar: {
    combo: "ctrl+shift+s",
    label: "Kenar çubuğunu aç/kapat",
    description: "Sol paneli gizler veya gösterir",
  },
  openSettings: { combo: "ctrl+,", label: "Ayarları aç", description: "Ayarlar panelini açar" },
  focusComposer: {
    combo: "ctrl+shift+m",
    label: "Mesaj kutusuna odaklan",
    description: "İmleci yazma alanına taşır",
  },
  commandPalette: {
    combo: "ctrl+k",
    label: "Komut paletini aç",
    description: "Hızlı arama ve eylem menüsünü açar",
  },
  openLibrary: {
    combo: "ctrl+shift+l",
    label: "Kitaplığı aç",
    description: "Library görünümünü açar",
  },
};

const STORAGE_KEY = "nova:keyboard-shortcuts";

import { namespacedKey } from "./current-user";

export function getStoredShortcuts(): Record<ShortcutAction, string> {
  const fallback = Object.fromEntries(
    Object.entries(DEFAULT_SHORTCUTS).map(([k, v]) => [k, v.combo]),
  ) as Record<ShortcutAction, string>;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(namespacedKey(STORAGE_KEY));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, string>>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function setStoredShortcut(action: ShortcutAction, combo: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredShortcuts();
    current[action] = combo;
    window.localStorage.setItem(namespacedKey(STORAGE_KEY), JSON.stringify(current));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yok say */
  }
}

export function resetStoredShortcuts(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(namespacedKey(STORAGE_KEY));
  } catch {
    /* yok say */
  }
}

/**
 * Bir KeyboardEvent'i "ctrl+shift+k" gibi normalize edilmiş bir string'e
 * çevirir. En az bir değiştirici tuş (Ctrl/Cmd/Alt) ZORUNLUDUR — aksi halde
 * null döner. Bu zorunluluk olmadan kullanıcı "Ayarlar > Klavye"den bir
 * kısayolu tek bir harfe (örn. sadece "k") atayabilirdi; global dinleyici
 * (bkz. ChatShell.tsx) input/textarea içeriğini ayırt etmediğinden, bu her
 * "k" basışında yazmayı keserdi (bkz. QA raporu: kullanıcı hiçbir metin
 * kutusuna o harfi yazamıyor). Shift tek başına yeterli sayılmaz (Shift+harf
 * normal yazım için de kullanılır, örn. büyük harf) — Ctrl/Cmd veya Alt
 * gerekir; Shift sadece bunlara ek olarak eklenebilir.
 */
export function eventToCombo(e: KeyboardEvent): string | null {
  const key = e.key;
  // Yalnızca değiştirici tuşlara (Shift, Control, Alt, Meta) basılıysa henüz
  // bir kombinasyon tamamlanmamıştır — bekle.
  if (["Shift", "Control", "Alt", "Meta"].includes(key)) return null;
  const hasRequiredModifier = e.ctrlKey || e.metaKey || e.altKey;
  if (!hasRequiredModifier) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key.toLowerCase());
  return parts.join("+");
}

/** Kayıtlı bir kombinasyonu ekranda gösterirken kullanılacak okunabilir hal. */
export function comboToDisplay(combo: string): string {
  return combo
    .split("+")
    .map((p) => {
      if (p === "ctrl") return "Ctrl/⌘";
      if (p === "alt") return "Alt";
      if (p === "shift") return "Shift";
      if (p === " ") return "Boşluk";
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" + ");
}
