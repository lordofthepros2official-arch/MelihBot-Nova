export const SECURITY_POLICY = `## Güvenlik Politikası

**Son güncelleme:** 2026

### 1. Amaç
Bu politika, hizmeti kullanırken verilerinizin ve etkileşimlerinizin nasıl korunduğunu açıklar. Amacımız maksimum güvenlik ile maksimum yardımcılığı birlikte sunmaktır.

### 2. Teknik Önlemler
- Tüm iletişim TLS (HTTPS) üzerinden şifrelenerek taşınır.
- Sohbet geçmişiniz ve projeleriniz sunucuda SAKLANMAZ — tamamen kendi cihazınızın tarayıcısında, IndexedDB adı verilen bir yerel depoda tutulur. Tarayıcınızdan "kalıcı depolama" izni istenir; bu izin verilirse tarayıcı bu veriyi normal önbellek temizleme işlemlerinde silmemeye çalışır (ama siz özellikle bu site için depolamayı sıfırlarsanız yine silinir). Bu veri hiçbir sunucuya kopyalanmaz; başka bir cihazdan giriş yaptığınızda o cihazın kendi (muhtemelen boş) deposunu görürsünüz.
- Sunucu tarafındaki anahtarlar ve gizli bilgiler istemciye hiçbir koşulda gönderilmez.
- Model istekleri yalnızca yanıt üretmek için işlenir, kalıcı olarak arşivlenmez.

### 3. Kabul Edilebilir Kullanım
Hizmeti aşağıdaki amaçlarla kullanamazsınız:
- Kötü amaçlı yazılım, dolandırıcılık, kimlik avı veya siber saldırı hazırlığı,
- Yasa dışı içerik üretimi, silah veya patlayıcı geliştirme,
- Başkalarına zarar verme, taciz, nefret söylemi veya istismar,
- Sistem güvenliğini aşmaya yönelik girişimler.

Bu tür talepler yanıtlanmaz ve güvenli alternatifler önerilir.

### 4. Yapay Zeka Güvenliği
Asistan; zararlı, yanıltıcı veya riskli talepleri reddeder, emin olmadığı bilgilerde belirsizliği açıkça belirtir ve kritik konularda (sağlık, hukuk, finans) uzmana danışmanızı önerir.

### 5. Olay Bildirimi
Bir güvenlik açığı veya kötüye kullanım tespit ederseniz uygulama içi geri bildirim kanalından bize iletin. Bildirimler en kısa sürede incelenir.

### 6. Sorumluluk
Yapay zeka yanıtları hata içerebilir. Önemli kararlar öncesinde bilgileri bağımsız kaynaklardan doğrulamanız önerilir.

---

**MelihBot Yönetim Kurulu Başkanı**`;

export const PRIVACY_POLICY = `## Gizlilik Politikası

**Son güncelleme:** 2026

### 1. Topladığımız Veriler
- **Sohbet içerikleri:** Yazdığınız mesajlar yanıt üretilebilmesi için işlenir.
- **Ses:** Mikrofon veya Live modunu kullandığınızda konuşmanız cihazınızın tarayıcısında metne dönüştürülür; ses kaydı sunucuya yüklenmez.
- **Hesap verisi:** Hizmeti kullanabilmek için ad soyad, kullanıcı adı, e-posta ve şifre ile bir hesap oluşturmanız gerekir. Şifreniz asla düz metin olarak saklanmaz (rastgele salt ile hash'lenir). Bu, sunucuda saklanan TEK veridir. Sohbetleriniz ve projeleriniz sunucuda TUTULMAZ — tamamen kendi cihazınızın tarayıcısında kalır; biz veya başka bir kullanıcı bunlara erişemeyiz çünkü sunucuda hiç yoktur.

### 2. Verilerin Saklanması
Sohbet geçmişiniz ve projeleriniz, bu uygulamayı çalıştıran sunucuya HİÇ gönderilmez; tamamen kendi cihazınızın tarayıcısında, IndexedDB adı verilen yerel bir depoda saklanır (bkz. Bölüm 1). Bu nedenle farklı bir cihazdan veya tarayıcıdan giriş yaptığınızda o cihazın kendi (muhtemelen boş) deposunu görürsünüz — geçmişiniz cihazlar arasında senkronize olmaz. Tarayıcı verilerinizi (site verisi/önbellek) temizlerseniz bu geçmiş kalıcı olarak kaybolur; bunun tek istisnası, tarayıcınızın izin verdiği "kalıcı depolama" (persistent storage) korumasıdır (bkz. Güvenlik Politikası). Sunucuda yalnızca hesabınızla ilgili veriler (Bölüm 1) tutulur. Sohbeti sildiğinizde kayıt yalnızca kendi cihazınızdaki depodan silinir — silinecek bir sunucu kaydı zaten yoktur.

### 3. Verilerin Kullanımı
Verileriniz yalnızca size yanıt üretmek için kullanılır. Reklam amacıyla kullanılmaz, satılmaz ve üçüncü taraflarla pazarlama amacıyla paylaşılmaz.

### 4. Çerezler
Reklam veya takip çerezi kullanmıyoruz. Yalnızca uygulamanın çalışması için gereken yerel depolama kullanılır.

### 5. Haklarınız
- Sohbetlerinizi dilediğiniz an kendi cihazınızdan silebilirsiniz.
- Tüm geçmişi tek seferde temizleyebilirsiniz.
- Paylaşmak istemediğiniz kişisel bilgileri hiç girmemeyi tercih edebilirsiniz.

### 6. Çocukların Gizliliği
Hizmet 13 yaş altındaki kullanıcılar için tasarlanmamıştır.

### 7. Öneri
Kimlik numarası, şifre, kart bilgisi gibi hassas verileri sohbete girmemenizi öneririz.

---

**MelihBot Yönetim Kurulu Başkanı**`;

export const TERMS_OF_USE = `## Kullanım Koşulları

**Son güncelleme:** 2026

### 1. Hizmetin Niteliği
MelihBot Nova, yapay zeka destekli bir sohbet asistanıdır. Verdiği yanıtlar bilgilendirme amaçlıdır; tıbbi, hukuki veya finansal tavsiye yerine geçmez.

### 2. Kullanıcı Sorumluluğu
- Hizmeti yasa dışı, zarar verici veya başkalarının haklarını ihlal edecek şekilde kullanamazsınız.
- Ürettiğiniz veya paylaştığınız içeriklerin sorumluluğu size aittir.

### 3. Hizmetin Sınırları
- Yapay zeka yanıtları hatalı veya eksik olabilir; kritik kararlarda bağımsız doğrulama yapın.
- Hizmet zaman zaman kesintiye uğrayabilir veya sağlayıcı kaynaklı gecikmeler yaşanabilir.

### 4. Fikri Mülkiyet
Sohbet sırasında ürettiğiniz metin ve görseller size aittir; yalnızca üçüncü taraf telif hakları saklıdır.

### 5. Değişiklikler
Bu koşullar zaman zaman güncellenebilir; güncel sürüm her zaman uygulama içinde yayınlanır.`;

export const USER_GUIDE = `## Kullanım Kılavuzu

### Sohbet
Mesajını yaz ve gönder. "+" menüsünden fotoğraf, video veya dosya ekleyebilir, Düşün/Web Arama modlarını açabilirsin.

### Sesli Konuşma
Mikrofon simgesine bas, konuş, tekrar bas — sesin yazıya çevrilip gönderilir. Tamamen cihazında çalışır, ses kaydı sunucuya gitmez.

### Live Mod
Sesli, kesintisiz bir sohbet başlatır. Kamerayı açarsan model anlık görüntüyü de görebilir.

### Görsel Üretimi
"Bir kedi çiz" gibi isteklerle görsel üretebilirsin. Üretilen görsele dokunarak indirebilir veya paylaşabilirsin.

### Agent (Otomatik Görev)
Karmaşık, çok adımlı bir görev yazdığında (örn. "şunu araştır ve karşılaştır") sistem otomatik olarak adımlara böler ve canlı olarak ilerler. Riskli adımlarda (gönderme, silme vb.) senden onay ister.

### Canvas
Kod veya uzun metin üretimi gerektiren isteklerde ekranın yanında ayrı bir çalışma alanı açılır.

### Projeler
Belirli bir konu etrafında talimat ve kaynak dosyalarını tanımlayıp o bağlamda birden çok sohbet yürütebilirsin.

### Gizlilik
Sohbet geçmişin, bu uygulamayı çalıştıran sunucuda güvenle saklanır. Detaylar için Gizlilik Politikası'na bakabilirsin.`;
