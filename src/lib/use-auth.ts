import { useCallback, useEffect, useState } from "react";
import { setCurrentUserId } from "./current-user";

export type AuthUser = { id: string; fullName: string; username: string; email: string };

/**
 * Eski (namespace'siz) localStorage anahtarları — geriye dönük temizlik
 * için hâlâ burada tutulur: bu isimlerle veri, current-user.ts eklenmeden
 * önce (bu düzeltmeden önceki bir sürümde) yazılmış olabilir. Artık asıl
 * koruma her anahtarın kullanıcı ID'siyle namespace'lenmesidir (bkz.
 * current-user.ts) — bu liste sadece eski/artık kullanılmayan düz
 * anahtarları çıkışta temizleyen ek bir güvenlik önlemidir.
 */
const LEGACY_UNNAMESPACED_KEYS = [
  "nova.threads.cache.v1",
  "nova.projects.cache.v2",
  "nova:generated-videos",
  "nova:generated-music",
  "nova:generated-images-studio",
  "nova:settings",
  "nova:bg-photo",
  "nova:gemini_api_key",
  "nova:shared-links",
  "nova:keyboard-shortcuts",
];

export function clearAllLocalNovaState(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_UNNAMESPACED_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* localStorage kullanılamıyorsa sessizce yok say */
    }
  }
}

type AuthState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: AuthUser };

/**
 * Oturum durumunu `/api/auth/me` üzerinden okur (cookie tabanlı, HttpOnly —
 * token'a doğrudan client kodundan erişilmez). Session cookie sunucu
 * tarafından otomatik yönetildiği için burada localStorage'a hiç ihtiyaç
 * yoktur.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { user?: AuthUser | null };
      if (data.user) {
        setCurrentUserId(data.user.id);
        setState({ status: "signed-in", user: data.user });
      } else {
        setCurrentUserId(null);
        setState({ status: "signed-out" });
      }
    } catch {
      setState({ status: "signed-out" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* çıkış isteği başarısız olsa bile client tarafında oturumu kapat */
    }
    // Namespace'i anonim'e döndür (bkz. current-user.ts) — bir sonraki
    // kullanıcı kendi ID'siyle namespace'lenmiş, tamamen ayrı anahtarlar
    // kullanacak. Eski/namespace'siz kalıntı anahtarları da ayrıca temizle.
    setCurrentUserId(null);
    clearAllLocalNovaState();
    setState({ status: "signed-out" });
  }, []);

  const setSignedIn = useCallback((user: AuthUser) => {
    setCurrentUserId(user.id);
    setState({ status: "signed-in", user });
  }, []);

  return {
    state,
    isLoading: state.status === "loading",
    isSignedIn: state.status === "signed-in",
    user: state.status === "signed-in" ? state.user : null,
    setSignedIn,
    logout,
    refresh,
  };
}
