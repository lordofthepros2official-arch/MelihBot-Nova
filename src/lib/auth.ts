/**
 * Kimlik doğrulama yardımcı modülü: parola hash'leme ve session token
 * üretimi. Ekstra bir bağımlılık (bcrypt vb.) eklemeden, Node'un yerleşik
 * `node:crypto` modülündeki `scrypt` (parola hash'leme için tasarlanmış,
 * yavaş/maliyetli bir KDF) ve `randomBytes` (kriptografik olarak güvenli
 * rastgele token üretimi) kullanılır.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { getSessionUserId } from "./db";

const SCRYPT_KEY_LEN = 64;
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** "salt:hash" biçiminde, DB'de saklanacak tek bir string döner (her ikisi de hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(password, salt);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Zamanlama saldırılarına (timing attack) karşı `timingSafeEqual` kullanır —
 * basit bir `===` karşılaştırması, hash'in ilk farklı byte'ına göre değişen
 * sürede döner ve bu, teoride hash'i byte byte tahmin etmek için
 * kullanılabilir; `timingSafeEqual` bunu sabit sürede yaparak önler.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(password, salt);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

// ── Basit girdi doğrulama kuralları (kayıt formu) ───────────────────────────

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidUsername(v: string): boolean {
  return USERNAME_RE.test(v);
}

export function isValidEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v);
}

export function isValidFullName(v: string): boolean {
  const trimmed = v.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

/** Aşırı kısıtlayıcı değil: en az 8 karakter yeterli, karma karakter zorunlu tutulmuyor. */
export function isValidPassword(v: string): boolean {
  return v.length >= 8 && v.length <= 200;
}

export const SESSION_COOKIE_NAME = "nova_session";

/** Cookie header'ından tek bir cookie değerini okur. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  // HttpOnly: JS'den (document.cookie) okunamaz, XSS ile token çalınamaz.
  // SameSite=Lax: temel CSRF koruması, normal navigasyonları bozmaz.
  // Secure: sadece HTTPS üzerinden gönderilir (yerel http://localhost'ta
  // tarayıcılar Secure cookie'yi de kabul eder, bu yüzden dev'de sorun çıkarmaz).
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Oturum gerektiren route handler'larının başında çağrılır. Geçerli bir
 * oturum yoksa 401 Response döner, geçerliyse userId döner. Bu, her
 * korumalı uç noktada aynı cookie-okuma + session-doğrulama kodunun
 * tekrarlanmasını önler.
 *
 * NOT: getSessionUserId artık veritabanına ağ üzerinden (Turso/libSQL)
 * erişebildiğinden async'tir; bu yüzden requireAuth de async'tir — tüm
 * çağıran route handler'lar `await requireAuth(request)` kullanmalıdır.
 */
export async function requireAuth(
  request: Request,
): Promise<{ userId: string } | { unauthorized: Response }> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) {
    return { unauthorized: Response.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 }) };
  }
  const userId = await getSessionUserId(token);
  if (!userId) {
    return {
      unauthorized: Response.json(
        { error: "Oturum süresi dolmuş, tekrar giriş yapın." },
        { status: 401 },
      ),
    };
  }
  return { userId };
}
