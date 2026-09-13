import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";
import { MODEL_FALLBACK_CHAIN } from "./chat";

/**
 * Uzun bir sohbeti kısa bir özete indirger — Madde 5 "Otomatik özetleme":
 * sohbet, modelin bağlam penceresine yaklaştığında (bkz. ChatShell.tsx
 * "özetle ve devam et" önerisi) veya kullanıcı elle istediğinde çağrılır.
 *
 * Basit tutuluyor: chat.ts'teki streaming/tool-calling/görsel-üretim
 * karmaşıklığının hiçbiri burada yok — tek bir generateContent isteği,
 * tek bir düz metin yanıtı. Aynı MODEL_FALLBACK_CHAIN'i (chat.ts'ten
 * import edilir, tekrar tanımlanmaz) dener.
 *
 * POST /api/summarize   body: { text: string }
 * -> 200 { summary: string }
 */

const MAX_INPUT_CHARS = 60_000; // özetlenecek ham metin için makul bir üst sınır
const MAX_REQUEST_BODY_BYTES = MAX_INPUT_CHARS + 2_000;

function methodNotAllowed(): Response {
  return new Response("Yalnızca POST desteklenir.", { status: 405, headers: { Allow: "POST" } });
}

async function handleSummarize(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "summarize"))) {
    return Response.json(
      { error: "Çok fazla istek gönderildi. Lütfen biraz yavaşlayın." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) return Response.json({ error: "Gemini API anahtarı gerekli." }, { status: 401 });

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  let body: { text?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BODY_BYTES) {
      return Response.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    body = JSON.parse(raw) as { text?: unknown };
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Özetlenecek metin boş olamaz." }, { status: 400 });
  const clipped = text.slice(0, MAX_INPUT_CHARS);

  const prompt = `Aşağıda bir sohbetin geçmişi var. Bunu, konuşmanın devamında bağlam olarak kullanılabilecek şekilde, üçüncü şahıs ağzıyla kısa bir özet halinde yaz. Önemli kararları, kullanıcının belirttiği tercihleri ve hâlâ açık olan konuları koru; küçük ayrıntıları ve selamlaşmaları atla. Yalnızca özeti yaz, başka bir şey ekleme.\n\n--- SOHBET GEÇMİŞİ ---\n${clipped}`;

  let lastError: string | null = null;
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      if (!res.ok) {
        lastError = await res.text().catch(() => `HTTP ${res.status}`);
        continue; // sıradaki modeli dene
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (summary) return Response.json({ summary });
      lastError = "Model boş yanıt döndürdü.";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  console.error("[summarize] tüm modeller başarısız:", lastError);
  return Response.json(
    { error: "Özet oluşturulamadı, lütfen tekrar dener misin?" },
    { status: 502 },
  );
}

export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: ({ request }) => handleSummarize(request),
      GET: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
    },
  },
});
