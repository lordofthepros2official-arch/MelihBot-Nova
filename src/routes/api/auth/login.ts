import { createFileRoute } from "@tanstack/react-router";
import { getUserByUsernameOrEmail, createSession, isDatabaseBusyError } from "@/lib/db";
import {
  verifyPassword,
  generateSessionToken,
  SESSION_TTL_MS,
  buildSessionCookie,
} from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// IP başına: 15 dakikada en fazla 20 deneme. Kullanıcı adı/e-posta başına
// (IP değiştirilse bile tek bir hesabı hedefleyen brute-force'u yavaşlatmak
// için) ayrıca: 15 dakikada en fazla 10 deneme.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_PER_IDENTIFIER = 10;

const MAX_REQUEST_BODY_BYTES = 10_000;

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleLogin(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  // Savunma-derinliği: bkz. register.ts'teki aynı kontrolün gerekçesi
  // (asıl CSRF koruması start.ts'teki global middleware'de).
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Geçersiz istek türü." }, { status: 415 });
  }

  let body: { identifier?: unknown; password?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BODY_BYTES) {
      return Response.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password) {
    return Response.json({ error: "Kullanıcı adı/e-posta ve şifre gerekli." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const tooManyByIp = !(await checkRateLimit(`login:ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS));
  const tooManyByIdentifier = !(await checkRateLimit(
    `login:id:${identifier.toLowerCase()}`,
    LOGIN_MAX_PER_IDENTIFIER,
    LOGIN_WINDOW_MS,
  ));
  if (tooManyByIp || tooManyByIdentifier) {
    return Response.json(
      { error: "Çok fazla giriş denemesi yapıldı. Lütfen birkaç dakika sonra tekrar dene." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    // Kullanıcı adı büyük/küçük harf duyarlı saklanıyor (kayıtta trim
    // dışında dönüştürülmüyor); e-posta ile giriş için normalize edilmiş
    // (lowercase) hâli de ayrıca denenir.
    const user =
      (await getUserByUsernameOrEmail(identifier)) ??
      (await getUserByUsernameOrEmail(identifier.toLowerCase()));

    // Kullanıcı bulunamasa bile aynı miktarda "iş" yapmak (sahte bir hash
    // karşılaştırması) zamanlama yoluyla "bu kullanıcı adı var mı yok mu"
    // bilgisinin sızmasını zorlaştırır.
    const dummyHash =
      "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);

    if (!user || !ok) {
      return Response.json({ error: "Kullanıcı adı/e-posta veya şifre hatalı." }, { status: 401 });
    }

    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await createSession(token, user.id, expiresAt);

    return Response.json(
      {
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
        },
      },
      {
        headers: { "Set-Cookie": buildSessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) },
      },
    );
  } catch (e) {
    if (isDatabaseBusyError(e)) {
      return Response.json(
        { error: "Veritabanı şu anda meşgul, lütfen tekrar deneyin." },
        { status: 503, headers: { "Retry-After": "1" } },
      );
    }
    console.error("[api/auth/login] beklenmeyen hata:", e);
    return Response.json({ error: "Giriş yapılamadı." }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleLogin(request);
        } catch (e) {
          console.error("[api/auth/login] beklenmeyen hata:", e);
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
