import { createFileRoute } from "@tanstack/react-router";
import { createUser, getUserByUsername, getUserByEmail, isDatabaseBusyError } from "@/lib/db";
import {
  hashPassword,
  generateSessionToken,
  SESSION_TTL_MS,
  buildSessionCookie,
  isValidUsername,
  isValidEmail,
  isValidFullName,
  isValidPassword,
} from "@/lib/auth";
import { createSession } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_REQUEST_BODY_BYTES = 10_000;
// IP başına: 1 saatte en fazla 8 kayıt denemesi. Otomatik hesap açma/spam
// saldırılarını yavaşlatmak için — normal bir kullanıcının bu sınıra takılması
// pratikte beklenmez.
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_MAX_PER_IP = 8;

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

async function handleRegister(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(`register:ip:${ip}`, REGISTER_MAX_PER_IP, REGISTER_WINDOW_MS))) {
    return Response.json(
      { error: "Çok fazla kayıt denemesi yapıldı. Lütfen daha sonra tekrar dene." },
      { status: 429, headers: { "Retry-After": "300" } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  // Savunma-derinliği: asıl CSRF koruması global middleware'de (bkz.
  // start.ts, Origin/Referer/Sec-Fetch-Site kontrolü) ama Content-Type'ı da
  // burada zorunlu kılmak, "simple request" sınıfına giren (preflight
  // gerektirmeyen, ör. text/plain body'li) cross-origin isteklerin gövdesini
  // JSON olarak yorumlamayı reddeder — ekstra bir katman, tek başına yeterli
  // değil ama global middleware yanlışlıkla gevşetilirse de bu route yine
  // korunur.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Geçersiz istek türü." }, { status: 415 });
  }

  let body: { fullName?: unknown; username?: unknown; email?: unknown; password?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BODY_BYTES) {
      return Response.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidFullName(fullName)) {
    return Response.json({ error: "Ad soyad en az 2 karakter olmalı." }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return Response.json(
      {
        error:
          "Kullanıcı adı 3-32 karakter olmalı ve yalnızca harf, rakam, alt çizgi (_) ya da nokta (.) içermeli.",
      },
      { status: 400 },
    );
  }
  if (!isValidEmail(email)) {
    return Response.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return Response.json({ error: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }

  try {
    if (await getUserByUsername(username)) {
      return Response.json({ error: "Bu kullanıcı adı zaten alınmış." }, { status: 409 });
    }
    if (await getUserByEmail(email)) {
      return Response.json({ error: "Bu e-posta adresiyle zaten bir hesap var." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    await createUser({
      id: userId,
      fullName,
      username,
      email,
      passwordHash,
      createdAt: Date.now(),
    });

    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await createSession(token, userId, expiresAt);

    return Response.json(
      { user: { id: userId, fullName, username, email } },
      {
        status: 201,
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
    // UNIQUE constraint yarışı (aynı anda iki kayıt isteği) gibi uç durumlar
    // için de kullanıcıya net bir mesaj döneriz, ham DB hatasını sızdırmayız.
    console.error("[api/auth/register] beklenmeyen hata:", e);
    return Response.json(
      { error: "Kayıt oluşturulamadı. Kullanıcı adı veya e-posta zaten kullanılıyor olabilir." },
      { status: 409 },
    );
  }
}

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleRegister(request);
        } catch (e) {
          console.error("[api/auth/register] beklenmeyen hata:", e);
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
