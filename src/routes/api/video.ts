import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * Metinden video üretir — Google'ın Veo 3.1 modeliyle (native ses dahil).
 * Video üretimi ASENKRON çalışır (bir işlem birkaç dakika sürebilir), bu
 * yüzden görsel üretiminin aksine burada sadece işlemi BAŞLATIR ve bir
 * "operation name" döndürürüz; client bunu /api/video-status ile pollar
 * (bkz. video-status.ts).
 *
 * POST /api/video   body: { prompt: string }
 *                    header: x-gemini-api-key (zorunlu)
 * -> 200 JSON: { operationName: string }
 */
const MAX_PROMPT_CHARS = 2000;
const MAX_REQUEST_BODY_BYTES = 10_000; // prompt + JSON zarfı için fazlasıyla yeterli
const VIDEO_MODEL = "veo-3.1-generate-preview";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleVideoStart(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "video"))) {
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
      `https://generativelanguage.googleapis.com/v1beta/models/${VIDEO_MODEL}:predictLongRunning`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ instances: [{ prompt: clipped }] }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (e) {
    console.error("[api/video] Gemini'ye ulaşılamadı:", e);
    return Response.json({ error: "Gemini video üretim servisine ulaşılamadı." }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/video] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json(
        { error: "Gemini API anahtarı geçersiz veya yetkisiz." },
        { status: 401 },
      );
    }
    return Response.json(
      { error: "Video üretimi başlatılamadı, lütfen tekrar dener misin?" },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as { name?: string };
  if (!data.name) {
    return Response.json({ error: "Video üretimi başlatılamadı (boş yanıt)." }, { status: 502 });
  }

  return Response.json({ operationName: data.name });
}

export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleVideoStart(request);
        } catch (e) {
          console.error("[api/video] beklenmeyen hata:", e);
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
