/**
 * Ses tanıma (STT) ve konuşma sentezi (TTS) — tamamen Gemini API üzerinden.
 * Tarayıcıya HİÇBİR model indirilmez (eskiden Whisper-tiny ve Piper ONNX
 * modelleri indiriliyordu, artık ikisi de kaldırıldı). Ses üretimi/tanıma
 * Google'ın sunucusunda yapılır; biz sadece kullanıcının kendi Gemini API
 * anahtarıyla sunucudaki /api/stt ve /api/tts uç noktalarına istek atarız.
 */
import { getStoredGeminiKey } from "./gemini-key";
import { getStoredSettings } from "./settings-store";

/** Ses kaydını Gemini'ye gönderip yazıya çevirir. */
export async function transcribe(blob: Blob): Promise<string> {
  const apiKey = getStoredGeminiKey();
  if (!apiKey) throw new Error("Gemini API anahtarı bulunamadı.");
  const res = await fetch("/api/stt", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-gemini-api-key": apiKey,
      "x-audio-mime": blob.type || "audio/webm",
    },
    body: blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "Ses yazıya çevrilemedi.");
  }
  return (await res.text()).trim();
}

let currentAudio: HTMLAudioElement | null = null;
// Her speakLocal() çağrısı kendi benzersiz "nesil" numarasını alır. Fetch
// tamamlandığında bu numara hâlâ "en güncel" olan mıdır diye kontrol edilir;
// değilse (kullanıcı bu arada başka bir mesajı okutmaya bastıysa) sonuç
// sessizce atılır. Bu olmadan: mesaj A "sesli oku"ya basılır (fetch başlar,
// henüz currentAudio yok) -> kullanıcı hemen mesaj B'ye basar (stopLocalSpeech
// çağrılır ama currentAudio zaten null, hiçbir şey durmaz) -> B'nin fetch'i
// başlar -> A'nın fetch'i önce biterse A çalmaya başlar, sonra B'nin fetch'i
// bitince B de çalmaya başlar -> iki ses üst üste biner.
let currentGeneration = 0;

export function stopLocalSpeech() {
  currentGeneration++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * Gemini TTS ile konuşur. `voiceId` verilmezse kullanıcının Ayarlar >
 * Ses panelinden seçtiği ses (veya hiç seçmediyse varsayılan "Kore")
 * kullanılır. `paceOverride` verilmezse kayıtlı `ttsPace` ayarı kullanılır
 * — Ayarlar panelindeki hız önizlemesi (preview) bu parametreyi override
 * ederek, henüz kaydedilmemiş bir taslak hızı da duyurabilir. Gemini'ye
 * ulaşılamazsa (ağ hatası, geçersiz anahtar vb.) tarayıcının yerleşik
 * `speechSynthesis`'ine düşer — bu da indirme gerektirmez, işletim
 * sisteminin hazır sesini kullanır (not: tarayıcı fallback'i pace
 * talimatını desteklemez, çünkü SpeechSynthesisUtterance kendi `rate`
 * alanını kullanır — bkz. fallbackToBrowserVoice).
 *
 * Eşzamanlı çağrılara karşı güvenlidir: art arda hızlı çağrılarda yalnızca
 * en son başlatılan çağrı gerçekten ses çalar (bkz. currentGeneration).
 */
export async function speakLocal(
  text: string,
  onEnd?: () => void,
  voiceId?: string,
  paceOverride?: "slow" | "normal" | "fast",
) {
  const clean = text.replace(/[*#`_>]/g, "").trim();
  if (!clean) {
    onEnd?.();
    return;
  }
  stopLocalSpeech();
  const myGeneration = currentGeneration;
  const isStale = () => myGeneration !== currentGeneration;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };

  const fallbackToBrowserVoice = () => {
    if (isStale()) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      finish();
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(clean.slice(0, 900));
      utter.lang = "tr-TR";
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
    } catch {
      finish();
    }
  };

  const apiKey = getStoredGeminiKey();
  if (!apiKey) {
    fallbackToBrowserVoice();
    return;
  }

  const resolvedVoice = voiceId || getStoredSettings().ttsVoice || "Kore";
  const pace = paceOverride ?? getStoredSettings().ttsPace;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
      body: JSON.stringify({ text: clean.slice(0, 4000), voice: resolvedVoice, pace }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => "TTS isteği başarısız."));
    const wavBlob = await res.blob();
    if (isStale()) {
      // Bu fetch beklerken başka bir speakLocal()/stopLocalSpeech() çağrısı
      // yapılmış — bu sonucu artık uygulama, eski sesin yeni sesin üstüne
      // binmesini önler.
      finish();
      return;
    }
    const url = URL.createObjectURL(wavBlob);
    const el = new Audio(url);
    el.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === el) currentAudio = null;
      finish();
    };
    el.onerror = (ev) => {
      console.error("[gemini-speech] ses oynatma hatası:", ev);
      URL.revokeObjectURL(url);
      if (currentAudio === el) currentAudio = null;
      finish();
    };
    currentAudio = el;
    await el.play();
  } catch (e) {
    console.warn("[gemini-speech] Gemini TTS başarısız, tarayıcı sesine düşülüyor:", e);
    if (currentAudio) currentAudio = null;
    fallbackToBrowserVoice();
  }
}
