/**
 * Rate limiter: Upstash Redis yapılandırılmışsa (UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN ortam değişkenleri) onu kullanır — bu, Vercel'in
 * serverless fonksiyonları arasında (her instance kendi belleğine sahip
 * olduğundan) PAYLAŞILAN, doğru bir sayaç sağlar. Yapılandırılmamışsa
 * (örn. yerel geliştirme) bellek-içi bir sayaca düşülür — bu, tek process
 * için yeterlidir ama birden fazla serverless instance arasında paylaşılmaz.
 *
 * NEDEN BU GEREKLİ (Vercel context'i): Vercel'de her istek potansiyel olarak
 * farklı bir fonksiyon instance'ında (farklı bellek alanında) çalışabilir.
 * Salt bellek-içi bir sayaç kullanılırsa, bir saldırgan/kötüye kullanım
 * isteği N farklı instance'a dağılabilir ve her biri kendi sayacını sıfırdan
 * başlatır — limit fiilen (N kat) gevşer. Upstash Redis (HTTP tabanlı, tüm
 * instance'ların erişebildiği tek bir merkezi sayaç) bu sorunu çözer.
 */
import { Redis } from "@upstash/redis";

const UPSTASH_URL = process.env["UPSTASH_REDIS_REST_URL"]?.trim();
const UPSTASH_TOKEN = process.env["UPSTASH_REDIS_REST_TOKEN"]?.trim();
const isVercel = !!process.env["VERCEL"];

let redis: Redis | null = null;
if (UPSTASH_URL && UPSTASH_TOKEN) {
  redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
} else if (isVercel) {
  // Vercel'de Upstash olmadan bellek-içi sayaç kullanmak, yukarıda açıklanan
  // sebeple rate limit'i fiilen gevşetir. Bu, güvenliği tamamen ortadan
  // kaldırmaz (yine de bir miktar yavaşlatma sağlar) ama sunucu loglarında
  // gözden kaçmaması için açıkça uyarılır.
  console.error(
    "[rate-limit] UYARI: Vercel üzerinde çalışıyor ama UPSTASH_REDIS_REST_URL/" +
      "UPSTASH_REDIS_REST_TOKEN ayarlı değil. Rate limit sayaçları instance'lar " +
      "arasında paylaşılmayacak (fiilen daha gevşek çalışacak). Vercel proje " +
      "ayarlarından Upstash entegrasyonunu ekleyin: https://vercel.com/marketplace/upstash",
  );
}

// ── Bellek-içi fallback (Upstash yokken, örn. yerel geliştirme) ────────────

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();
let lastSweep = 0;
function sweepIfNeeded(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt < now) memoryBuckets.delete(key);
  }
}

function checkRateLimitMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweepIfNeeded(now);
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/**
 * Redis'te sabit pencereli sayaç: `INCR` + (yalnızca ilk artırımda) `EXPIRE`.
 * Bu iki komut arasında teorik bir yarış durumu olsa da (INCR başarılı olur
 * ama EXPIRE ayarlanmadan önce process çökerse anahtar süresiz kalır),
 * pratikte ihmal edilebilir bir risktir ve rate-limit gibi "kesin olmayan
 * ama yaklaşık doğru yeterli" bir kullanım alanı için kabul edilebilir.
 */
async function checkRateLimitRedis(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!redis) throw new Error("redis istemcisi başlatılmadı");
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  return count <= limit;
}

/**
 * `key` için bir deneme kaydeder. `limit` içinde `windowMs` süresince en
 * fazla `limit` kez true döner; aşılırsa false döner (istek reddedilmeli).
 * Upstash yapılandırılmışsa Redis üzerinden (tüm instance'lar arasında
 * paylaşılan), değilse bellek-içi (yalnızca bu process için geçerli) çalışır.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (redis) {
    try {
      return await checkRateLimitRedis(key, limit, windowMs);
    } catch (e) {
      // Redis'e erişilemiyorsa (geçici ağ sorunu vb.) isteği tamamen
      // reddetmek yerine bellek-içi sayaca düş — kullanıcı deneyimini
      // Redis'in kısa süreli kesintisi yüzünden tamamen bozmamak için.
      console.error("[rate-limit] Redis hatası, bellek-içi sayaca düşülüyor:", e);
      return checkRateLimitMemory(key, limit, windowMs);
    }
  }
  return checkRateLimitMemory(key, limit, windowMs);
}

/** İstek başlıklarından en iyi çabayla istemci IP'sini çıkarır. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * AI/medya endpoint'leri (chat, image, music, video, tts, stt, search) için
 * kullanıcı başına genel bir istek sınırı. Bu endpoint'ler kimlik
 * doğrulaması gerektirse de (requireAuth), giriş yapmış herhangi bir
 * kullanıcının sunucuyu (ve kendi Gemini kotasını) sınırsız hızda
 * zorlamasını önlemek için ayrıca bir üst sınır gerekir. Sınır kasıtlı
 * olarak cömerttir (dakikada 60 istek = saniyede 1) — normal, hatta yoğun
 * bir sohbet/üretim kullanımını asla engellemez, sadece otomatik/döngüsel
 * kötüye kullanımı yavaşlatır.
 */
const AI_ENDPOINT_WINDOW_MS = 60 * 1000;
const AI_ENDPOINT_MAX_PER_USER = 60;

export async function checkAiEndpointRateLimit(userId: string, endpoint: string): Promise<boolean> {
  return checkRateLimit(
    `ai:${endpoint}:${userId}`,
    AI_ENDPOINT_MAX_PER_USER,
    AI_ENDPOINT_WINDOW_MS,
  );
}
