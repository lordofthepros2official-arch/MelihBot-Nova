import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";

/**
 * Bir Veo video üretim işleminin durumunu sorgular (bkz. video.ts). İşlem
 * tamamlandığında (done: true), üretilen videoyu Gemini Files API'sinden
 * indirip base64 data-URL'e çevirip döner — client için tek bir GET isteği
 * yeterli olsun diye (ayrı bir indirme adımı gerektirmiyoruz).
 *
 * GET /api/video-status?name=operations%2F...
 *     header: x-gemini-api-key (zorunlu)
 * -> 200 JSON: { done: false } | { done: true, dataUrl: string } | { done: true, error: string }
 */
function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
}

/** Node'a özgü Buffer yerine platform-bağımsız (Edge/Workers'ta da çalışan)
 * base64 dönüşümü — kod tabanındaki diğer binary-response route'larıyla
 * (bkz. stt.ts) aynı desen. 8KB'lik parçalar halinde işler; büyük video
 * dosyalarında tek seferde String.fromCharCode(...bytes) çağrısı call
 * stack taşmasına yol açabileceğinden parçalama gereklidir. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function handleVideoStatus(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;

  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Gemini API anahtarı bulunamadı. Lütfen anahtarını gir." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const opName = url.searchParams.get("name")?.trim();
  if (!opName || !opName.startsWith("operations/")) {
    return Response.json({ error: "Geçersiz işlem adı." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error("[api/video-status] Gemini'ye ulaşılamadı:", e);
    return Response.json({ error: "Gemini'ye ulaşılamadı." }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/video-status] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json(
        { error: "Gemini API anahtarı geçersiz veya yetkisiz." },
        { status: 401 },
      );
    }
    return Response.json({ error: "Durum sorgulanamadı." }, { status: 502 });
  }

  const data = (await upstream.json()) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: { video?: { uri?: string } }[];
      };
    };
  };

  if (!data.done) {
    return Response.json({ done: false });
  }

  if (data.error?.message) {
    return Response.json({ done: true, error: data.error.message });
  }

  const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) {
    return Response.json({ done: true, error: "Video üretilemedi (boş yanıt)." });
  }

  // Videoyu Gemini'nin dosya URI'sinden indirip base64 data-URL'e çeviriyoruz
  // — client'ta doğrudan <video> etiketiyle oynatılabilsin diye.
  let fileRes: Response;
  try {
    fileRes = await fetch(videoUri, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error("[api/video-status] Video indirilemedi:", e);
    return Response.json({ done: true, error: "Video indirilemedi." });
  }

  if (!fileRes.ok) {
    console.error("[api/video-status] Video indirme hatası:", fileRes.status);
    return Response.json({ done: true, error: "Video indirilemedi." });
  }

  const buf = await fileRes.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buf));
  const mimeType = fileRes.headers.get("content-type") || "video/mp4";

  return Response.json({ done: true, dataUrl: `data:${mimeType};base64,${base64}` });
}

export const Route = createFileRoute("/api/video-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await handleVideoStatus(request);
        } catch (e) {
          console.error("[api/video-status] beklenmeyen hata:", e);
          return Response.json({ error: "Beklenmeyen bir hata oluştu." }, { status: 500 });
        }
      },
      POST: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      HEAD: methodNotAllowed,
      OPTIONS: methodNotAllowed,
    },
  },
});
