# Vercel'e Dağıtım (Production)

## Mimari özeti

- **Kullanıcı hesapları + oturumlar** → sunucuda, Turso'da (küçük bir tablo).
- **Sohbetler + projeler** → sunucuda DEĞİL, tamamen kullanıcının kendi
  tarayıcısında (IndexedDB). Hiçbir dış servise ihtiyaç duymaz, hiçbir
  ortam değişkeni gerekmez. Sonuç: bu veri cihazlar arasında taşınmaz —
  aynı hesapla farklı bir cihazdan giriş yapan kullanıcı, o cihazda boş bir
  sohbet/proje listesiyle karşılaşır. Tarayıcıdan "kalıcı depolama" izni
  istenir (bkz. `src/lib/idb-store.ts` → `requestPersistentStorage`); bu
  verilirse tarayıcı, kullanıcı özellikle "bu site için depolamayı
  sıfırla" demedikçe bu veriyi normal önbellek/geçmiş temizliğinde silmemeye
  çalışır (kesin bir garanti değildir, ama en dayanıklı istemci-taraflı
  seçenektir).

Bu ayrım kasıtlıdır: sohbet/proje verisi (özellikle görsel/video base64
ekleri) kullanıcı başına büyük ve sınırsız olabilir; bunu bir sunucuda
tutmak dış servise (kota/maliyet) bağımlılık getirir. Hesap verisi ise
küçük ve kritik olduğundan sunucuda kalmaya devam eder.

## 1) Turso (yalnızca hesap/oturum verisi için) — ZORUNLU

**Neden gerekli?** Vercel'in serverless fonksiyonlarında dosya sistemi
salt-okunurdur; tek yazılabilir yer `/tmp`'dir ve **`/tmp` kalıcı değildir**
— her cold start'ta, her yeni deploy'da paylaşılmaz/sıfırlanır. Bu, kullanıcı
hesaplarının rastgele şekilde "kayıp" görünmesine (aslında farklı bir /tmp
instance'ına düşmesine) yol açar. Turso (SQLite protokolüyle konuşan ama
verinin ağ üzerinden, kalıcı bir sunucuda tutulduğu bir servis) bunu çözer.

Bu tabloda yalnızca kullanıcı adı/e-posta/şifre-hash'i ve oturum token'ları
var — kullanıcı başına birkaç yüz byte. Turso'nun ücretsiz katmanı (5GB
depolama, ayda 500M okuma/10M yazma) bu iş yükü için pratikte tükenmez.

**Kurulum:**
1. https://turso.tech üzerinden ücretsiz hesap açın (kredi kartı gerekmez).
2. CLI ile: `turso db create nova` (veya web arayüzünden).
3. `turso db show nova --url` ile bağlantı URL'sini alın.
4. `turso db tokens create nova` ile bir auth token üretin.
5. Vercel projenizde **Project Settings → Environment Variables** altına:
   - `TURSO_DATABASE_URL` = (3. adımdaki URL)
   - `TURSO_AUTH_TOKEN` = (4. adımdaki token)

Bu değişkenler olmadan deploy ederseniz sunucu konsol loglarına açık bir
uyarı basar ve `/tmp`'ye düşer — bunu fark etmeden production'a çıkmayın.

## 2) Upstash Redis (rate limiting) — ÖNERİLİR

**Neden gerekli?** Login/register brute-force koruması ve AI endpoint'lerinde
kullanıcı başına hız sınırı, sayaçların tüm serverless instance'lar arasında
paylaşılmasını gerektirir.

**Kurulum (en kolay yol):**
1. Vercel projenizde **Storage** sekmesine gidin, **Upstash for Redis**'i
   ekleyin (ücretsiz katman mevcut) — https://vercel.com/marketplace/upstash
2. Entegrasyon, `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN`
   ortam değişkenlerini otomatik ekler.

Atlanırsa proje yine çalışır (bellek-içi sayaca düşer), ama production'da
kurulması önerilir.

## 3) Deploy adımları

1. Bu klasörü bir Git deposuna push edin.
2. https://vercel.com/new üzerinden depoyu import edin.
3. Build Command: `npm run build`.
4. Yukarıdaki (1) ve (2) ortam değişkenlerini ekleyin.
5. Deploy edin.

## Yerelde test etmek

Turso/Upstash değişkenlerini boş bırakırsanız proje otomatik olarak yerel
bir SQLite dosyasına (yalnızca hesap/oturum için) ve bellek-içi rate-limit
sayacına düşer:

```
npm install
npm run dev
```

## Bilinen sınırlamalar (production'a çıkmadan bilinmesi gerekenler)

- **Sohbet/proje verisi cihazlar arası taşınmaz.** Bu bir hata değil, bu
  mimarinin doğrudan sonucu — kullanıcı arayüzünde bunu netleştirmek
  isterseniz (örn. "Bu veriler yalnızca bu cihazda saklanır" uyarısı)
  `GeminiKeyGate.tsx` veya ilk giriş akışına eklenebilir.
- **Kullanıcı tarayıcı verilerini/geçmişini manuel temizlerse veya "bu site
  için depolamayı sıfırla" derse sohbet/proje verisi kalıcı olarak
  kaybolur.** `navigator.storage.persist()` bunu tamamen engelleyemez,
  sadece normal/otomatik temizlik akışlarına karşı dayanıklılık sağlar.
- **Rate limiter, Redis erişilemez olduğunda bellek-içi sayaca düşer.**
- **Gemini API anahtarı hâlâ kullanıcının tarayıcısında (localStorage)
  saklanır**, sunucuda değil.
