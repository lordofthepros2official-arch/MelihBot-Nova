import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * Ses kaydını Gemini'nin ses-anlama yeteneğiyle (generateContent, audio
 * input) yazıya çevirir. Hiçbir model tarayıcıya indirilmez — tanıma
 * tamamen Google'ın sunucusunda yapılır; biz sadece isteği kullanıcının
 * kendi Gemini API anahtarıyla iletip düz metin sonucu döneriz.
 *
 * POST /api/stt   body: ham ses baytları (audio/webm, audio/mp4, ...)
 *                 header: x-gemini-api-key (zorunlu), x-audio-mime (opsiyonel)
 * -> 200, text/plain: yazıya çevrilmiş metin
 */
const MAX_AUDIO_BYTES = 15_000_000; // ~15MB (birkaç dakikalık konuşma için fazlasıyla yeterli)
const STT_MODEL = "gemini-3.1-flash-lite";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function handleStt(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "stt"))) {
    return Response.json(
      { error: "Çok fazla istek gönderildi. Lütfen biraz yavaşlayın." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) {
    return new Response("Gemini API anahtarı bulunamadı. Lütfen anahtarını gir.", {
      status: 401,
    });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    return new Response("Ses kaydı çok büyük.", { status: 413 });
  }

  const mimeType = request.headers.get("x-audio-mime")?.trim() || "audio/webm";

  let audioBuf: ArrayBuffer;
  try {
    audioBuf = await request.arrayBuffer();
  } catch {
    return new Response("Geçersiz istek gövdesi.", { status: 400 });
  }
  if (audioBuf.byteLength === 0) return new Response("audio required", { status: 400 });
  if (audioBuf.byteLength > MAX_AUDIO_BYTES) {
    return new Response("Ses kaydı çok büyük.", { status: 413 });
  }

  const base64Audio = bytesToBase64(new Uint8Array(audioBuf));

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${STT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Bu ses kaydında söylenenleri, konuşulduğu dilde, kelimesi kelimesine, " +
                    "hiçbir yorum veya ekleme yapmadan sadece düz metin olarak yaz. Ses kaydında " +
                    "hiç konuşma yoksa veya anlaşılmıyorsa boş bir yanıt ver.",
                },
                { inlineData: { mimeType, data: base64Audio } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );
  } catch (e) {
    console.error("[api/stt] Gemini'ye ulaşılamadı:", e);
    return new Response("Gemini ses tanıma servisine ulaşılamadı.", { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/stt] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return new Response("Gemini API anahtarı geçersiz veya yetkisiz.", { status: 401 });
    }
    return new Response("Ses yazıya çevrilemedi, lütfen tekrar dener misin?", { status: 502 });
  }

  const data = (await upstream.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleStt(request);
        } catch (e) {
          console.error("[api/stt] beklenmeyen hata:", e);
          return new Response("Beklenmeyen bir hata oluştu.", { status: 500 });
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
