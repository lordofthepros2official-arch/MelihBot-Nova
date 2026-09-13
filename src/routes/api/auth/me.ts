import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId, getUserById } from "@/lib/db";
import { readCookie, SESSION_COOKIE_NAME } from "@/lib/auth";

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
}

async function handleMe(request: Request): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return Response.json({ user: null }, { status: 200 });

  const userId = await getSessionUserId(token);
  if (!userId) return Response.json({ user: null }, { status: 200 });

  const user = await getUserById(userId);
  if (!user) return Response.json({ user: null }, { status: 200 });

  return Response.json({
    user: { id: user.id, fullName: user.fullName, username: user.username, email: user.email },
  });
}

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await handleMe(request);
        } catch (e) {
          console.error("[api/auth/me] beklenmeyen hata:", e);
          return Response.json({ user: null }, { status: 500 });
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
