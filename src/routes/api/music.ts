import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * Metinden müzik üretir — Google'ın Lyria 3 Clip modeliyle (30 saniyelik,
 * enstrümantal veya vokalli, 44.1kHz stereo MP3). Görsel üretimiyle aynı
 * senkron `generateContent` deseni; işlem birkaç saniye sürer, polling
 * gerekmez (video.ts'in aksine).
 *
 * POST /api/music   body: { prompt: string }
 *                    header: x-gemini-api-key (zorunlu)
 * -> 200 JSON: { dataUrl: string }   (data:audio/mpeg;base64,...)
 */
const MAX_PROMPT_CHARS = 2000;
const MAX_REQUEST_BODY_BYTES = 10_000; // prompt + JSON zarfı için fazlasıyla yeterli
const MUSIC_MODEL = "lyria-3-clip-preview";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleMusic(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "music"))) {
    return Response.json(
      { error: "Çok fazla istek gönderildi. Lütfen biraz yavaşlayın." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Gemini API anahtarı bulunamadı. Lütfen anahtarını gir." },
      { status: 401 },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  let body: { prompt?: unknown };
  try {
    body = JSON.parse(rawBody) as { prompt?: unknown };
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "prompt required" }, { status: 400 });
  const clipped = prompt.slice(0, MAX_PROMPT_CHARS);

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MUSIC_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: clipped }] }] }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (e) {
    console.error("[api/music] Gemini'ye ulaşılamadı:", e);
    return Response.json({ error: "Gemini müzik üretim servisine ulaşılamadı." }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/music] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json(
        { error: "Gemini API anahtarı geçersiz veya yetkisiz." },
        { status: 401 },
      );
    }
    return Response.json(
      { error: "Müzik üretilemedi, lütfen tekrar dener misin?" },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
      finishReason?: string;
    }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) {
    return Response.json({ error: "Müzik üretilemedi (boş yanıt)." }, { status: 502 });
  }

  const mimeType = part.mimeType || "audio/mpeg";
  return Response.json({ dataUrl: `data:${mimeType};base64,${part.data}` });
}

export const Route = createFileRoute("/api/music")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleMusic(request);
        } catch (e) {
          console.error("[api/music] beklenmeyen hata:", e);
          return Response.json({ error: "Beklenmeyen bir hata oluştu." }, { status: 500 });
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
