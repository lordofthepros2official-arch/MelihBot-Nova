/**
 * Kullanıcının kendi Gemini API anahtarını tarayıcıda (localStorage)
 * saklayan basit yardımcı modül. Anahtar SUNUCUYA sadece istek başlığı
 * (x-gemini-api-key) olarak, her /api/chat çağrısında gönderilir; sunucu
 * bunu hiçbir yerde kalıcı olarak saklamaz (bkz. src/routes/api/chat.ts).
 */

const STORAGE_KEY = "nova:gemini_api_key";

import { namespacedKey } from "./current-user";

/**
 * Basit biçim kontrolü. Google AI Studio anahtarları genelde "AIza" ile
 * başlar ve ~39 karakterdir, AMA her zaman değil — Google farklı proje/
 * kota türleri için başka önekler ve uzunluklarla da anahtar verebiliyor.
 * Bu yüzden burada belirli bir önek ZORUNLU TUTULMAZ; sadece "bariz şekilde
 * bir API anahtarı olamayacak" girdileri (boş, boşluklu, çok kısa) elemeye
 * çalışırız. Asıl doğrulama zaten ilk gerçek istekte sunucu/Gemini
 * tarafından yapılır (bkz. GeminiKeyGate/AccountSection hata mesajları).
 */
export function isLikelyValidGeminiKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= 8 && !/\s/.test(trimmed);
}

export function getStoredGeminiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(namespacedKey(STORAGE_KEY));
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredGeminiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(namespacedKey(STORAGE_KEY), key.trim());
  } catch {
    /* localStorage kullanılamıyorsa (gizli mod vb.) sessizce yok say */
  }
}

export function clearStoredGeminiKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(namespacedKey(STORAGE_KEY));
  } catch {
    /* yok say */
  }
}
