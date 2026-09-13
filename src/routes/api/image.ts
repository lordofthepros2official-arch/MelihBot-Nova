import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * Metinden görsel üretir — Gemini'nin görsel üretim modeliyle
 * (gemini-3.1-flash-image, "Nano Banana 2"). Eskiden Pollinations.ai'ye
 * yönlendiren bir markdown URL'i üretiliyordu; artık görsel gerçekten
 * Gemini'de, kullanıcının kendi API anahtarıyla üretiliyor ve base64
 * data-URL olarak dönüyor.
 *
 * POST /api/image   body: { prompt: string }
 *                    header: x-gemini-api-key (zorunlu)
 * -> 200 JSON: { dataUrl: string }   (data:image/png;base64,...)
 */
const MAX_PROMPT_CHARS = 2000;
const MAX_REQUEST_BODY_BYTES = 10_000; // prompt + JSON zarfı için fazlasıyla yeterli
const IMAGE_MODEL = "gemini-3.1-flash-image";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleImage(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "image"))) {
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
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: clipped }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch (e) {
    console.error("[api/image] Gemini'ye ulaşılamadı:", e);
    return Response.json({ error: "Gemini görsel üretim servisine ulaşılamadı." }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/image] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json(
        { error: "Gemini API anahtarı geçersiz veya yetkisiz." },
        { status: 401 },
      );
    }
    return Response.json(
      { error: "Görsel üretilemedi, lütfen tekrar dener misin?" },
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
    return Response.json({ error: "Görsel üretilemedi (boş yanıt)." }, { status: 502 });
  }

  const mimeType = part.mimeType || "image/png";
  return Response.json({ dataUrl: `data:${mimeType};base64,${part.data}` });
}

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleImage(request);
        } catch (e) {
          console.error("[api/image] beklenmeyen hata:", e);
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
