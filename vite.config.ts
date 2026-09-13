// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { UserConfig, ConfigEnv, UserConfigFnPromise } from "vite";

const baseConfig = defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Varsayılan preset Cloudflare'dir; bu projeyi Vercel'de dağıtabilmek için
  // Nitro'nun yerleşik "vercel" preset'ini açıkça seçiyoruz (Vercel Build
  // Output API'ye göre serverless fonksiyon üretir, sıfır ekstra config
  // gerektirir). Bkz. https://nitro.build/deploy/providers/vercel
  nitro: {
    preset: "vercel",
  },
});

// @lovable.dev/vite-tanstack-config sabit olarak dev sunucusunu "::" (IPv6
// wildcard) adresine bağlıyor. Bu, IPv6 desteklemeyen host/konteyner
// ortamlarında ("EAFNOSUPPORT: address family not supported") sunucunun hiç
// başlamamasına yol açar. Burada, kütüphanenin ürettiği nihai config'i
// aldıktan SONRA host'u daha taşınabilir bir varsayılana ("0.0.0.0", hem
// IPv4-only hem çoğu IPv6 ortamında çalışır) çeviriyoruz — istenirse HOST
// ortam değişkeniyle override edilebilir. Port/diğer ayarlara dokunulmaz.
export default (async (env: ConfigEnv): Promise<UserConfig> => {
  const resolved = await (baseConfig as UserConfigFnPromise)(env);
  const host = process.env["HOST"]?.trim() || "0.0.0.0";
  return {
    ...resolved,
    server: { ...resolved.server, host },
  };
}) satisfies UserConfigFnPromise;
