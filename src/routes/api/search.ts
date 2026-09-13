import { createFileRoute } from "@tanstack/react-router";
import { searchDuckDuckGo, type SearchResult } from "@/lib/duckduckgo-search";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * "Web'de Arama" için arama proxy'si (Composer'daki manuel "web" anahtarı
 * açıldığında ChatShell.tsx'in fetchWebContext() üzerinden çağırdığı akış).
 * Tarayıcıdan doğrudan DuckDuckGo'ya istek atmak CORS tarafından
 * engellenir; bu yüzden istek sunucu üzerinden (bu route) yapılır ve sade
 * bir JSON sonuç listesi döner. Gerçek arama mantığı src/lib/duckduckgo-
 * search.ts içindedir.
 *
 * Not: src/routes/api/chat.ts BU route'u KULLANMAZ — chat.ts kendi
 * native Gemini `google_search` grounding tool'unu kullanır (bkz. o
 * dosyadaki ilgili yorumlar). İki ayrı web-arama mekanizması vardır:
 * biri modelin kendi tool-calling'i (chat.ts), diğeri kullanıcının
 * manuel "web" anahtarıyla tetiklediği bu proxy (search.ts).
 */
const MAX_REQUEST_BODY_BYTES = 4_000; // basit bir arama sorgusu için fazlasıyla yeterli
const MAX_QUERY_CHARS = 500; // gerçek bir arama motoru sorgusu için makul üst sınır

async function handleSearch(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "search"))) {
    return Response.json(
      { error: "Çok fazla istek gönderildi. Lütfen biraz yavaşlayın." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ results: [] as SearchResult[] }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ results: [] as SearchResult[] }, { status: 400 });
  }
  if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ results: [] as SearchResult[] }, { status: 413 });
  }

  let query: string;
  try {
    const body = JSON.parse(rawBody) as { query?: unknown };
    if (typeof body.query !== "string" || !body.query.trim()) {
      return Response.json({ results: [] as SearchResult[] }, { status: 400 });
    }
    query = body.query.trim().slice(0, MAX_QUERY_CHARS);
  } catch {
    return Response.json({ results: [] as SearchResult[] }, { status: 400 });
  }

  try {
    const results = await searchDuckDuckGo(query);
    return Response.json({ results });
  } catch (e) {
    console.error("[api/search] DuckDuckGo araması başarısız:", e);
    // Arama başarısız olursa sohbet asla kilitlenmemeli — boş sonuçla devam edilir.
    return Response.json({ results: [] as SearchResult[] });
  }
}

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleSearch(request);
        } catch (e) {
          console.error("[api/search] beklenmeyen hata:", e);
          return Response.json({ results: [] as SearchResult[] }, { status: 500 });
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
