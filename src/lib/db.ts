/**
 * Sunucu tarafı kalıcı depolama — SADECE kimlik doğrulama verisi
 * (kullanıcı hesapları + oturumlar) için.
 *
 * ÖNEMLİ (mimari değişikliği): Sohbetler (thread'ler) ve projeler artık
 * SUNUCUDA SAKLANMAZ — tamamen kullanıcının tarayıcısında, IndexedDB'de
 * tutulur (bkz. src/lib/chat-store.ts, src/lib/projects.ts,
 * src/lib/idb-store.ts). Bunun sebebi bilinçli bir üründe kararı: sohbet/
 * proje verisi kullanıcı başına büyüyebilir (özellikle görsel/video base64
 * ekleri) ve bunu sınırsız şekilde bir sunucuda tutmak dış bir servise
 * (Turso vb.) bağımlılık ve kota/maliyet riski getirir. Bunun yerine bu veri
 * kullanıcının kendi cihazında, `navigator.storage.persist()` ile "kalıcı"
 * olarak işaretlenmiş bir IndexedDB veritabanında tutulur — tarayıcı normal
 * "önbelleği/geçmişi temizle" işlemlerinde bu depoyu silmemeye çalışır
 * (garanti değildir, kullanıcı özellikle "bu site için depolamayı sıfırla"
 * derse yine silinir, ama normal temizlik akışlarına karşı dayanıklıdır).
 *
 * BURADA (sunucuda, Turso'da) sadece şunlar kalır:
 *   - users: kullanıcı adı, e-posta, şifre hash'i — bunlar tarayıcıda
 *     tutulamaz, çünkü "hesap" kavramının anlamı budur: kullanıcı farklı
 *     bir cihazdan/tarayıcıdan giriş yapabilmelidir, bu da paylaşılan bir
 *     sunucu kaydı gerektirir.
 *   - sessions: aktif oturum token'ları (30 gün geçerli).
 * Bu tablo kullanıcı başına birkaç yüz byte'tır — Turso'nun ücretsiz
 * katmanı (5GB depolama, ayda 500M okuma/10M yazma satırı) bu iş yükü için
 * pratikte tükenmeyecek kadar geniştir.
 *
 * ÖNEMLİ (Vercel/serverless notu): Vercel'in serverless fonksiyonlarında
 * dosya sistemi salt-okunurdur (tek yazılabilir yer /tmp'dir) VE /tmp
 * KALICI DEĞİLDİR. Bu yüzden bu küçük ama kritik tablo için de yine Turso
 * (libSQL) kullanılır — TURSO_DATABASE_URL + TURSO_AUTH_TOKEN ortam
 * değişkenleri verilirse oraya, verilmezse (yerel geliştirme) yerel bir
 * dosyaya yazar.
 */
import { createClient, type Client, type InArgs } from "@libsql/client";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..", "..");

const TURSO_URL = process.env["TURSO_DATABASE_URL"]?.trim();
const TURSO_TOKEN = process.env["TURSO_AUTH_TOKEN"]?.trim();
const isVercel = !!process.env["VERCEL"];

if (isVercel && (!TURSO_URL || !TURSO_TOKEN)) {
  console.error(
    "[db] UYARI: Vercel üzerinde çalışıyor ama TURSO_DATABASE_URL/TURSO_AUTH_TOKEN " +
      "ayarlı değil. Kullanıcı hesapları /tmp'ye (kalıcı olmayan, her deploy/cold " +
      "start'ta kaybolabilecek bir yere) yazılacak — bu, kullanıcıların rastgele " +
      "şekilde giriş yapamaz hale gelmesine yol açar. Vercel proje ayarlarında " +
      "Environment Variables kısmından ekleyin: https://turso.tech",
  );
}

let clientInstance: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getClient(): Client {
  if (clientInstance) return clientInstance;
  if (TURSO_URL) {
    clientInstance = createClient(
      TURSO_TOKEN ? { url: TURSO_URL, authToken: TURSO_TOKEN } : { url: TURSO_URL },
    );
  } else {
    const dataDir = isVercel ? "/tmp/nova-data" : join(projectRoot, "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    clientInstance = createClient({ url: `file:${join(dataDir, "nova.db")}` });
  }
  return clientInstance;
}

async function ensureSchema(): Promise<void> {
  const db = getClient();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
    ],
    "write",
  );
}

async function withDb(): Promise<Client> {
  if (!schemaReady) schemaReady = ensureSchema();
  await schemaReady;
  return getClient();
}

async function run(sql: string, args: InArgs = []): Promise<void> {
  const db = await withDb();
  await db.execute({ sql, args });
}

async function get<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const db = await withDb();
  const res = await db.execute({ sql, args });
  return (res.rows as unknown as T[])[0];
}

/**
 * libSQL, kilit/eşzamanlılık hatalarını SQLITE_BUSY olarak değil, ağ/HTTP
 * seviyesinde farklı bir hata koduyla döndürebilir (Turso HTTP üzerinden
 * çalıştığı için). Her iki durumu da 503'e çeviren route handler'lar için
 * geniş bir kontrol burada tutulur.
 */
export function isDatabaseBusyError(e: unknown): boolean {
  const code = (e as { code?: unknown } | undefined)?.code;
  const message = String((e as { message?: unknown } | undefined)?.message ?? "");
  return (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_LOCKED" ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked")
  );
}

// ── Users & Sessions (kimlik doğrulama) ─────────────────────────────────────

export type DbUser = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: number;
};

const USER_SELECT = `SELECT id, full_name AS fullName, username, email,
  password_hash AS passwordHash, created_at AS createdAt FROM users`;

export async function createUser(user: DbUser): Promise<void> {
  await run(
    `INSERT INTO users (id, full_name, username, email, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.fullName, user.username, user.email, user.passwordHash, user.createdAt],
  );
}

/** Kullanıcı adı VEYA e-posta ile arar (giriş ekranı ikisini de kabul eder). */
export async function getUserByUsernameOrEmail(identifier: string): Promise<DbUser | null> {
  const row = await get<DbUser>(`${USER_SELECT} WHERE username = ? OR email = ?`, [
    identifier,
    identifier,
  ]);
  return row ?? null;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const row = await get<DbUser>(`${USER_SELECT} WHERE username = ?`, [username]);
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const row = await get<DbUser>(`${USER_SELECT} WHERE email = ?`, [email]);
  return row ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const row = await get<DbUser>(`${USER_SELECT} WHERE id = ?`, [id]);
  return row ?? null;
}

// Her yeni session oluşturmada süresi geçmiş session'ları tam taramak
// gereksiz DB yüküdür; bunun yerine düşük bir olasılıkla (yaklaşık her
// ~200 girişte bir) tetiklenir.
const EXPIRED_SESSION_CLEANUP_PROBABILITY = 1 / 200;

export async function createSession(
  token: string,
  userId: string,
  expiresAt: number,
): Promise<void> {
  await run(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`, [
    token,
    userId,
    Date.now(),
    expiresAt,
  ]);
  if (Math.random() < EXPIRED_SESSION_CLEANUP_PROBABILITY) {
    deleteExpiredSessions().catch((e: unknown) => {
      console.error("[db] süresi dolmuş session temizliği başarısız:", e);
    });
  }
}

/** Süresi geçmişse null döner (satırı da temizler); geçerliyse user_id döner. */
export async function getSessionUserId(token: string): Promise<string | null> {
  const row = await get<{ userId: string; expiresAt: number }>(
    "SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token = ?",
    [token],
  );
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    await run("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  return row.userId;
}

export async function deleteSession(token: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token = ?", [token]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}
