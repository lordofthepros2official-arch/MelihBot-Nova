import { createFileRoute } from "@tanstack/react-router";
import { deleteSession } from "@/lib/db";
import { readCookie, buildClearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleLogout(request: Request): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (token) {
    try {
      await deleteSession(token);
    } catch (e) {
      // Çıkış işleminde DB hatası olsa bile cookie'yi temizleyip kullanıcıyı
      // çıkmış say — takılıp kalmamalı. Sadece logla.
      console.error("[api/auth/logout] session silme hatası:", e);
    }
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": buildClearSessionCookie() } });
}

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleLogout(request);
        } catch (e) {
          console.error("[api/auth/logout] beklenmeyen hata:", e);
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
