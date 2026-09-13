import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";

/**
 * Kullanıcının girdiği Gemini API anahtarının GERÇEKTEN çalışıp
 * çalışmadığını, tek ve ucuz bir istekle canlı doğrular.
 *
 * Bundan önce hem GeminiKeyGate (ilk giriş ekranı) hem de Ayarlar >
 * API Anahtarı (AccountSection), anahtarın SADECE BİÇİMİNİ kontrol
 * ediyordu (isLikelyValidGeminiKey) — yanlış yazılmış, süresi dolmuş,
 * kotası biten veya iptal edilmiş bir anahtar ancak kullanıcı ilk
 * sohbet mesajını gönderdiğinde, akışın ortasında hata olarak ortaya
 * çıkıyordu. Bu endpoint, Google'ın `models.list` uç noktasına (ücretsiz
 * ve içerik üretmeyen, sadece kimlik doğrulayan bir GET isteği) tek bir
 * istek atarak anahtarı hemen doğrular.
 *
 * POST /api/verify-key
 * body: { apiKey: string }
 * -> 200 { valid: true }
 * -> 200 { valid: false, reason: string }  (anahtar formatça girildi ama Google reddetti)
 * -> 400 (istek hatalı)
 */

const MAX_KEY_CHARS = 400;

function methodNotAllowed(): Response {
  return new Response("Yalnızca POST desteklenir.", { status: 405, headers: { Allow: "POST" } });
}

export const Route = createFileRoute("/api/verify-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if ("unauthorized" in auth) return auth.unauthorized;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Geçersiz JSON gövdesi.", { status: 400 });
        }
        const apiKey = (body as { apiKey?: unknown } | null)?.apiKey;
        if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > MAX_KEY_CHARS) {
          return Response.json({ valid: false, reason: "Anahtar boş veya çok uzun görünüyor." });
        }

        try {
          const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
            {
              method: "GET",
              headers: { "x-goog-api-key": apiKey.trim() },
              signal: AbortSignal.timeout(10_000),
            },
          );

          if (res.ok) {
            return Response.json({ valid: true });
          }

          if (res.status === 400 || res.status === 401 || res.status === 403) {
            return Response.json({
              valid: false,
              reason:
                "Google bu anahtarı reddetti — anahtar hatalı, iptal edilmiş veya bu API için yetkili değil.",
            });
          }
          if (res.status === 429) {
            // Anahtar geçerli olabilir ama kota/rate-limit'e takıldı; bunu
            // "geçersiz" olarak işaretlemek yanıltıcı olur, kullanıcıyı
            // gereksiz yere anahtarı silmeye iter.
            return Response.json({
              valid: true,
              reason: "Anahtar geçerli görünüyor (kota sınırına yakın olabilir).",
            });
          }
          return Response.json({
            valid: false,
            reason: `Google'dan beklenmeyen bir yanıt geldi (HTTP ${res.status}). Birkaç saniye sonra tekrar dener misin?`,
          });
        } catch (e) {
          const timedOut = e instanceof DOMException && e.name === "TimeoutError";
          return Response.json({
            valid: false,
            reason: timedOut
              ? "Doğrulama isteği zaman aşımına uğradı. İnternet bağlantını kontrol edip tekrar dener misin?"
              : "Anahtar doğrulanırken bir ağ hatası oluştu.",
          });
        }
      },
      GET: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      HEAD: methodNotAllowed,
      OPTIONS: methodNotAllowed,
    },
  },
});
