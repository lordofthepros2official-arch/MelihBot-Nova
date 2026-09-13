import { useState } from "react";
import { KeyRound, ExternalLink, Copy, Check, ShieldCheck, Sparkles, Loader2 } from "lucide-react";
import { isLikelyValidGeminiKey, setStoredGeminiKey } from "@/lib/gemini-key";

/**
 * Uygulama ilk açıldığında ZORUNLU olarak gösterilen ekran: kullanıcı kendi
 * Gemini API anahtarını girmeden sohbete geçemez. Anahtar alma adımları,
 * hiç teknik bilgisi olmayan biri de (kelimenin tam anlamıyla bir çocuğa
 * anlatır gibi) rahatça takip edebilsin diye tek tek, resim tarifi gibi
 * yazılmıştır. Bu bileşen kapatılamaz (X butonu, arka plana tıklayınca
 * kapanma vb. yoktur) — geçerli bir anahtar girilene kadar ekranda kalır.
 */
export function GeminiKeyGate({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Lütfen önce API anahtarını yapıştır. Boş bırakamazsın.");
      return;
    }
    if (!isLikelyValidGeminiKey(trimmed)) {
      setError(
        "Bu anahtar çok kısa veya boşluk içeriyor görünüyor. Google AI Studio sayfasından kopyaladığın metni tekrar kontrol edip yapıştırır mısın?",
      );
      return;
    }

    // Biçim kontrolünden geçti diye anahtarın gerçekten çalıştığı anlamına
    // gelmez — Google'a küçük, ücretsiz bir istek atıp CANLI doğrularız.
    // Böylece kullanıcı yanlış/süresi dolmuş bir anahtarla sohbete
    // geçmeye çalışıp ilk mesajda hata almak yerine, sorunu hemen burada
    // öğrenir.
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean; reason?: string };
      if (data.valid === false) {
        setError(
          data.reason || "Google bu anahtarı reddetti. Yeni bir anahtar oluşturmayı dener misin?",
        );
        setVerifying(false);
        return;
      }
      // valid === true, veya doğrulama isteğinin kendisi başarısız oldu
      // (ağ hatası vb.) — bu durumda kullanıcıyı belirsizlikte bırakmak
      // yerine, biçimce doğru anahtarla devam etmesine izin veririz;
      // gerçek bir sorun varsa ilk sohbet isteğinde zaten net bir hata
      // mesajıyla karşılaşacak.
    } catch {
      /* zaman aşımı/ağ hatası — anahtarı yine de kabul et, aşağıda devam */
    }
    setVerifying(false);
    setStoredGeminiKey(trimmed);
    onSaved();
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText("https://aistudio.google.com/apikey");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano erişimi yoksa sessizce yok say */
    }
  };

  return (
    <div className="app-gradient fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-8 sm:items-center">
      <div className="glass-card w-full max-w-lg rounded-3xl p-6 sm:p-8">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-ink/10">
            <KeyRound className="size-5 text-ink" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[19px] font-semibold text-ink">Önce bir anahtar lazım</h1>
            <p className="text-[13px] text-ink/60">MelihBot Nova'yı kullanabilmek için</p>
          </div>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-ink/75">
          Bu uygulama, senin yazdıklarını cevaplamak, güncel bilgi için web'de arama yapmak, görsel
          üretmek, sesini yazıya çevirmek ve cevapları sesli okumak için Google'ın <b>Gemini</b>{" "}
          yapay zekasını kullanıyor. Hiçbir şey bilgisayarına indirilmiyor — her şey Gemini'nin
          sunucusunda çalışıyor. Bunun için senin kendi, ücretsiz bir "API anahtarına" ihtiyacı var.
          Anahtar almak çok kolay — aşağıdaki adımları sırayla takip etmen yeterli. Sadece birkaç
          dakika sürer. 👇
        </p>

        <ol className="mt-5 space-y-4">
          <Step number={1} title="Google hesabınla giriş yap">
            Aşağıdaki butona bas, açılan sayfada senden Google hesabınla giriş yapmanı isteyecek
            (Gmail'de kullandığın e-posta ve şifre yeterli). Hesabın yoksa önce bir Google hesabı
            açman gerekir.
          </Step>

          <Step number={2} title='"Create API key" (Anahtar oluştur) butonuna bas'>
            Sayfa açıldığında ortada veya üstte mavi/renkli bir buton göreceksin, üzerinde genelde{" "}
            <b>"Create API key"</b> ya da <b>"Get API key"</b> yazar. Ona tıkla.
          </Step>

          <Step number={3} title="Anahtarı kopyala">
            Karşına <b>"AIza..."</b> diye başlayan uzun bir yazı (harf ve rakam karışımı) çıkacak.
            Onun yanındaki küçük kopyalama simgesine bas — anahtar panoya kopyalanmış olur.
          </Step>

          <Step number={4} title="Buraya yapıştır ve gönder">
            Aşağıdaki kutuya (uzun basılı tut → Yapıştır, ya da Ctrl+V / Cmd+V ile) yapıştır, sonra{" "}
            <b>"Kaydet ve Başla"</b> butonuna bas. Hepsi bu kadar!
          </Step>
        </ol>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-medium text-white transition hover:opacity-90"
        >
          Google AI Studio'yu Aç <ExternalLink className="size-4" strokeWidth={2} />
        </a>

        <button
          type="button"
          onClick={copyUrl}
          className="mt-2 flex w-full items-center justify-center gap-1.5 text-[12.5px] text-ink/55 hover:text-ink/80"
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Bağlantı kopyalandı
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Bağlantı açılmadıysa buraya tıklayıp kopyala:
              aistudio.google.com/apikey
            </>
          )}
        </button>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6">
          <label className="mb-1.5 block text-[13px] font-medium text-ink/70">
            Gemini API Anahtarın
          </label>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={key}
            disabled={verifying}
            onChange={(e) => {
              setKey(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Kopyaladığın API anahtarını buraya yapıştır"
            className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
          />
          {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={verifying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
          >
            {verifying ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Anahtar doğrulanıyor…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Kaydet ve Başla
              </>
            )}
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-black/[0.03] p-3.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink/50" strokeWidth={1.8} />
          <p className="text-[12px] leading-relaxed text-ink/55">
            Anahtarın yalnızca bu tarayıcıda, kendi cihazında saklanır ve sadece senin adına
            Gemini'ye istek atmak için kullanılır. İstediğin zaman değiştirebilirsin. Anahtar
            tamamen ücretsizdir, Google seni kredi kartı bilgisi girmeye zorlamaz.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
        {number}
      </span>
      <div>
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink/65">{children}</p>
      </div>
    </li>
  );
}
