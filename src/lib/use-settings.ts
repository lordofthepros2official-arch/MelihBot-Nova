import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getStoredSettings,
  setStoredSettings,
  type NovaSettings,
} from "./settings-store";
import { onCurrentUserChange } from "./current-user";

/**
 * Ayarları React state olarak sunar. SSR/hydration güvenliği için ilk
 * render'da HER ZAMAN DEFAULT_SETTINGS döner (server'da localStorage yok);
 * gerçek kayıtlı değerler DOM hydrate olduktan sonra bir useEffect içinde
 * okunup state'e yazılır — bkz. ChatShell.tsx'teki aynı desenin
 * getStoredGeminiKey() için neden gerekli olduğuna dair not.
 *
 * KAYDETME DAVRANIŞI: `update()` yalnızca ekrandaki (taslak) state'i
 * değiştirir, localStorage'a YAZMAZ — kullanıcı "Kaydet"e basana (`save()`)
 * kadar değişiklikler kalıcı olmaz. Panelden çıkıp geri girerse (veya
 * sayfayı yenilerse) en son KAYDEDİLMİŞ hal geri gelir, taslak kaybolur.
 * `isDirty`, kaydedilmemiş bir değişiklik olup olmadığını bildirir —
 * SettingsPanel bunu "Kaydet" butonunu etkinleştirmek ve kapatırken
 * uyarmak için kullanır.
 */
export function useSettings() {
  const [settings, setSettings] = useState<NovaSettings>(DEFAULT_SETTINGS);
  // En son KAYDEDİLMİŞ hal — isDirty karşılaştırması ve "vazgeç" (discard)
  // için referans. Ref kullanılır çünkü render tetiklememesi gerekir.
  const savedRef = useRef<NovaSettings>(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredSettings();
    setSettings(stored);
    savedRef.current = stored;
    setIsDirty(false);
    setHydrated(true);
    // Kullanıcı değişince (login/logout) o kullanıcının kendi namespace'li
    // ayarlarını yeniden oku — aksi halde önceki kullanıcının ayarları
    // (tema, ses, kişiselleştirme metinleri) ekranda kalmaya devam ederdi.
    return onCurrentUserChange(() => {
      const fresh = getStoredSettings();
      setSettings(fresh);
      savedRef.current = fresh;
      setIsDirty(false);
    });
  }, []);

  // Yalnızca taslağı (ekrandaki state) günceller; localStorage'a DOKUNMAZ.
  const update = useCallback((patch: Partial<NovaSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setIsDirty(JSON.stringify(next) !== JSON.stringify(savedRef.current));
      return next;
    });
  }, []);

  // Taslağı kalıcı olarak kaydeder (localStorage'a yazar). "Kaydet" butonu
  // tarafından çağrılır.
  const save = useCallback(() => {
    setSettings((current) => {
      setStoredSettings(current);
      savedRef.current = current;
      setIsDirty(false);
      return current;
    });
  }, []);

  // Kaydedilmemiş taslağı atıp en son kayıtlı hale döner (kullanıcı panel
  // içinde "Vazgeç" derse veya kaydetmeden kapatırsa).
  const discardDraft = useCallback(() => {
    setSettings(savedRef.current);
    setIsDirty(false);
  }, []);

  const reset = useCallback(() => {
    setStoredSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    savedRef.current = DEFAULT_SETTINGS;
    setIsDirty(false);
  }, []);

  return { settings, update, save, discardDraft, reset, isDirty, hydrated };
}
