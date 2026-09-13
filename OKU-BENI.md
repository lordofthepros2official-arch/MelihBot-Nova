# MelihBot Nova — Kurulum Kılavuzu

Bu proje bir web uygulamasıdır (React + TanStack Start). Tek bir HTML dosyası olarak
çalıştırılamaz çünkü sunucu tarafı kod (canlı sohbet akışı, AI bağlantısı) içerir.
Ama kurulum çok basittir ve bir kez yaptıktan sonra tek tıkla açılır.

## 1) Node.js kurun (yalnızca bir kere)

https://nodejs.org adresinden **LTS** sürümünü indirip kurun (Windows/Mac/Linux hepsinde var).

## 2) Gemini API anahtarı — ZORUNLU, ama uygulamanın içinden alınır

Bu proje artık **tamamen Google Gemini** üzerinde çalışır: metin sohbeti, görsel/video
anlama, sesi yazıya çevirme (STT) ve yanıtları sesli okuma (TTS) — hepsi Gemini API'si
üzerinden yapılır. Hiçbir yapay zeka modeli bilgisayara/tarayıcıya indirilmez.

Bu yüzden uygulama **ilk açıldığında** kullanıcıdan kendi ücretsiz Gemini API
anahtarını ister — bu ekran kapatılamaz, anahtar girilmeden sohbete geçilemez.
Ekranda adım adım (Google hesabıyla giriş → "Create API key" → kopyala → yapıştır)
anlatılır, ayrıca https://aistudio.google.com/apikey adresine giden bir buton bulunur.
Girilen anahtar sadece kullanıcının kendi tarayıcısında (localStorage) saklanır ve
sunucuya her istekte başlık olarak gönderilir; sunucu bu anahtarı hiçbir yerde kalıcı
olarak saklamaz.

Yani `.env` dosyasına dokunmanıza gerek yoktur — her kullanıcı kendi anahtarını
uygulamanın içinden girer. Sunucu tarafında herhangi bir API anahtarı, sağlayıcı
veya yedek yapılandırma YOKTUR ve GEREKMEZ; uygulama tamamen kullanıcının kendi
Gemini anahtarıyla çalışır.

## 3) Başlatın

Terminalde (Windows: Komut İstemi/PowerShell, Mac/Linux: Terminal) bu klasöre gelip
sırayla şu iki komutu çalıştırın:

```
npm install
npm run dev
```

`npm install` bağımlılıkları kurar (yalnızca ilk seferde gereklidir, birkaç dakika
sürebilir). `npm run dev` sunucuyu başlatır. Sonrasında tarayıcınızda şu adresi açın:

```
http://localhost:8080
```

Açılışta karşınıza Gemini API anahtarı isteyen ekran çıkacak — adımları takip edip
anahtarınızı yapıştırın, "Kaydet ve Başla" butonuna basın, sohbete başlayın.

Kapatmak için terminal penceresinde CTRL+C basın.

## Elle çalıştırmak isterseniz

```
npm install
npm run dev
```

## Üyelik ve giriş sistemi (YENİ)

Uygulama artık **birden fazla kişi tarafından güvenle kullanılabilir**. İlk açılışta
kullanıcıdan **Ad Soyad, Kullanıcı Adı, E-posta ve Şifre** ile üye olması ya da
zaten hesabı varsa kullanıcı adı/e-posta + şifresiyle giriş yapması istenir (bu
ekran, Gemini API anahtarı ekranından ÖNCE gelir ve o da kapatılamaz).

- **Şifreler asla düz metin olarak saklanmaz** — Node'un yerleşik `scrypt`
  algoritmasıyla (her kullanıcıya özel rastgele bir "salt" ile) hash'lenip
  SQLite'a öyle yazılır.
- Giriş yapıldığında sunucu, tarayıcıya **HttpOnly + Secure + SameSite=Lax**
  bir oturum çerezi (`nova_session`) verir. HttpOnly olduğu için bu çerez
  JavaScript'ten (dolayısıyla XSS saldırılarından) okunamaz.
- **Her kullanıcının sohbetleri ve projeleri birbirinden tamamen izole edilmiştir.**
  Bir kullanıcı başka bir kullanıcının sohbetini/projesini ne listede görebilir,
  ne ID'sini bilse bile açabilir, ne de silebilir — bu kontrol sunucu tarafında,
  veritabanı sorgusu seviyesinde (`WHERE user_id = ?`) uygulanır.
- Kullanıcı bilgisi ve "Çıkış Yap" butonu Ayarlar panelinin en üstünde yer alır.
- Kullanıcı, kayıt, giriş ve oturum verisi de aynı `data/nova.db` SQLite
  dosyasında (`users` ve `sessions` tabloları) saklanır — ayrı bir servis veya
  ekstra kurulum gerekmez.
- Oturumlar 30 gün geçerlidir; bu süre `src/lib/auth.ts` içindeki
  `SESSION_TTL_MS` sabitinden değiştirilebilir.

**Önemli:** Her kullanıcı GİRİŞ YAPTIKTAN SONRA kendi Gemini API anahtarını
girer (bu adım değişmedi) — yani üyelik sistemi "kim kimin verisini görebilir"
sorusunu çözer, Gemini kullanım/kota maliyeti hâlâ her kullanıcının kendi
anahtarına, dolayısıyla kendi hesabına yansır.

Artık hiçbir bağımlılık native/WASM model indirmeye çalışmıyor (eski
`@huggingface/transformers` ve `@diffusionstudio/vits-web` paketleri kaldırıldı),
bu yüzden `npm install` her ortamda sorunsuz tamamlanır.

## Web arama ve görsel üretimi — ikisi de artık Gemini üzerinden

- **Web arama:** Model, güncel/gerçek zamanlı bilgi gerektiren bir soruyla
  karşılaştığında Gemini'nin kendi native web arama özelliğini ("Grounding
  with Google Search") otomatik olarak kullanır — ayrı bir arama servisine
  veya API anahtarına gerek yoktur, arama tamamen Gemini'nin kendi
  altyapısında, kullanıcının Gemini anahtarıyla yapılır. Composer'daki
  "Web'de Arama" chip'i açıldığında ayrıca bir ön-arama bağlamı da eklenir,
  ama Gemini modunda esas arama zaten modelin kendi kararıyla otomatik
  gerçekleşir.
- **Görsel üretimi:** Kullanıcı bir görsel istediğinde model, yanıtının
  içine özel bir işaret (`nova-image:...`) yazar; sunucu bu işareti akış
  sırasında yakalayıp Gemini'nin görsel üretim modeliyle
  (`gemini-3.1-flash-image`, "Nano Banana 2") gerçek bir görsel üretir ve
  yanıta gerçek bir görsel olarak yerleştirir. Eskiden kullanılan
  Pollinations.ai bağlantısı tamamen kaldırıldı — artık hiçbir üçüncü
  taraf görsel servisi kullanılmıyor.

## Sesli özellikler (Live mod, mikrofon, seslendirme) — hepsi Gemini üzerinden

- **Mikrofon cihazı:** Her zaman sistemin birincil/varsayılan mikrofonu
  açıkça istenir (`deviceId: "default"` kısıtlamasıyla) — bilgisayarda
  birden fazla ses girişi (dahili mikrofon, kulaklık, webcam mikrofonu,
  sanal ses cihazı vb.) olsa bile, tarayıcının işletim sisteminden o an
  bildirilen birincil cihaz kullanılır. Bu kısıtlama nadir bir donanım/
  sürücü kombinasyonunda reddedilirse, uygulama otomatik olarak kısıtlamasız
  mikrofon isteğine düşer, yani mikrofon erişimi hiçbir ortamda tamamen
  kırılmaz.
- **Ses tanıma (STT — mikrofonla konuşup metne çevirme):** Önce tarayıcının
  kendi Web Speech API'si (`SpeechRecognition`) denenir — bu **Chrome veya
  Edge**'de çalışır (Firefox ve bazı mobil tarayıcılar bu API'yi
  desteklemez) ve hiçbir ek kurulum gerektirmez. Bu API çalışmazsa (tarayıcı
  desteklemiyorsa veya "network" hatası verirse), kayıt otomatik olarak
  sunucudaki `/api/stt` uç noktasına, oradan da kullanıcının kendi Gemini API
  anahtarıyla Gemini'ye gönderilir ve yazıya çevrilir. **Hiçbir model
  indirilmez** — tanıma tamamen Google'ın sunucusunda yapılır.
- **Seslendirme (TTS — yanıtın sesli okunması):** Gemini'nin TTS modeli
  (`gemini-3.1-flash-tts-preview`) kullanılır — hem Live modunda hem her
  mesajın altındaki "Sesli oku" butonunda. İstek sunucudaki `/api/tts` uç
  noktası üzerinden, kullanıcının kendi Gemini anahtarıyla yapılır ve sonuç
  WAV ses olarak tarayıcıya döner. Gemini TTS'e ulaşılamazsa (ağ hatası,
  geçersiz anahtar vb.), tarayıcının kendi yerleşik `speechSynthesis`
  sesine otomatik düşülür.
- Hiçbir ses modeli uygulama açılışında indirilmez — açılışta yalnızca
  zorunlu Gemini API anahtarı giriş ekranı gösterilir.

**"Live" modda ses duyulmuyor / mikrofon çalışmıyor" sorunu yaşarsanız:**
tarayıcı konsolunu açın (F12 → Console). Hiçbir ses hatası sessizce
yutulmuyor; `[LiveOverlay]` veya `[gemini-speech]` etiketiyle başlayan bir
log mesajı asıl sebebi (mikrofon izni reddi, ağ sorunu, geçersiz Gemini
anahtarı vb.) gösterecektir. Ekranda da kırmızı bir hata mesajı görünür —
sessizce "dinliyormuş gibi" takılı kalmaz.

## Neler yapıldı / neler değişti

- **Zorunlu Gemini API anahtarı girişi eklendi:** Uygulama ilk açıldığında,
  kapatılamayan bir ekran kullanıcıdan kendi Gemini API anahtarını ister.
  Anahtarın nasıl alınacağı (Google hesabıyla giriş → "Create API key" →
  kopyala → yapıştır) çok basit bir dille, adım adım anlatılır. Anahtar
  yalnızca kullanıcının kendi tarayıcısında saklanır.
- **Tüm yapay zeka özellikleri Gemini'ye taşındı:** Kullanıcı kendi Gemini
  anahtarını girdiğinde, metin sohbeti artık Gemini'nin NATIVE
  `generateContent`/`streamGenerateContent` API'sine konuşuyor (OpenAI-uyumlu
  katman yerine) — bu sayede gerçek `google_search` web arama grounding'i
  kullanılabiliyor. Ses tanıma (STT) ve seslendirme (TTS) da yeni
  `/api/stt` ve `/api/tts` sunucu uç noktaları üzerinden Gemini'ye bağlandı.
- **Web arama Gemini'nin kendi native aramasına taşındı:** Eskiden model,
  kendi kararıyla bir "web_search" fonksiyonunu çağırıp sunucudaki
  DuckDuckGo entegrasyonunu tetikliyordu. Gemini modunda artık bunun
  yerine Gemini'nin kendi "Grounding with Google Search" özelliği
  kullanılıyor — model gerçek bir Google araması yapıp sonucu doğrudan
  yanıtına gömüyor, ayrıca bir tool-call/ikinci istek döngüsü yönetmeye
  gerek kalmıyor.
- **Görsel üretimi Gemini'nin kendi görsel modeline taşındı:** Eskiden
  model, üçüncü taraf bir servise (Pollinations.ai) giden bir markdown
  görsel bağlantısı üretiyordu. Artık model özel bir işaret üretiyor,
  sunucu bunu yakalayıp Gemini'nin görsel üretim modeliyle
  (`gemini-3.1-flash-image`) gerçek bir görsel üretiyor ve base64 olarak
  yanıta yerleştiriyor — hiçbir üçüncü taraf görsel servisi kullanılmıyor.
- **Tarayıcıya model indirme tamamen kaldırıldı:** Eskiden kullanılan
  Whisper-tiny (STT, `@huggingface/transformers`) ve Piper (TTS,
  `@diffusionstudio/vits-web`) tarayıcı-içi modelleri ve bunların "model
  indiriliyor" açılış ekranı (`BootLoader`) tamamen silindi. Artık hiçbir
  model bilgisayara/tarayıcıya indirilmiyor; STT ve TTS de dahil her şey
  Gemini'nin sunucusunda çalışıyor.
- Tüm "Lovable" marka referansları kaldırıldı (sayfa başlığı, meta etiketleri,
  hata raporlama modülü).
- **Düzeltilen hata:** Mesaj gönderince ana ekrana atma sorunu — sayfa
  geçişlerinde uygulamanın "açılış ekranını" gereksiz yere tekrar göstermesinden
  kaynaklanıyordu, düzeltildi.
- **Düzeltilen hata:** Dosya ekleme özelliği önceden sadece dosya adını
  gösteriyor, içeriğini yapay zekaya hiç göndermiyordu. Artık metin/kod
  dosyalarının içeriği okunup mesaja ekleniyor.
- **Düzeltilen hata:** "Projeler" bölümünde tanımlanan talimatlar ve kaynak
  dosyalar önceden yapay zekaya hiç iletilmiyordu. Artık proje içindeki her
  sohbette bu bağlam otomatik olarak kullanılıyor.
- **Düzeltilen hata:** Mikrofon erişimi artık her zaman sistemin birincil/
  varsayılan cihazını açıkça ister (`deviceId: "default"`), bir güvenli
  kısıtlamasız fallback ile birlikte — birden fazla ses girişi olan
  cihazlarda yanlış mikrofonun seçilme riskini azaltır.
- TypeScript tip kontrolü ve production build başarıyla tamamlandı.

## Sorun giderme

- **Açılışta anahtar ekranı sürekli tekrar çıkıyor:** Tarayıcının
  localStorage'ı temizlenmiş olabilir (gizli/InPrivate sekme, "geçmişi
  temizle" vb.). Anahtarınızı tekrar girmeniz yeterlidir.
- **"Gemini API anahtarın geçersiz veya süresi dolmuş görünüyor" hatası:**
  https://aistudio.google.com/apikey adresinden anahtarınızı kontrol edin,
  gerekirse yeni bir anahtar oluşturup uygulamada güncelleyin.
- **Port 8080 kullanımda hatası:** Başka bir program o portu kullanıyor
  olabilir; ilgili programı kapatıp tekrar deneyin.
- **Live'da "network" hatası sürekli tekrarlıyor:** Bu, tarayıcının
  çevrimiçi ses tanıma servisine ulaşamadığı anlamına gelir — uygulama
  birkaç saniye içinde otomatik olarak Gemini üzerinden (sunucu API'si ile)
  yazıya çevirmeye geçer, bu normaldir.
- **Live'da ses duyulmuyor / mikrofon tepki vermiyor:** Yukarıdaki "Sesli
  özellikler" bölümüne bakın — mikrofon iznini adres çubuğundaki kilit
  simgesinden kontrol edin, ve tarayıcı konsolunu (F12) açıp hata mesajını
  okuyun.
