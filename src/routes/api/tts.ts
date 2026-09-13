import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
import { checkAiEndpointRateLimit } from "@/lib/rate-limit";

/**
 * Metni Gemini'nin TTS modeliyle (gemini-3.1-flash-tts-preview) sese çevirir.
 * Hiçbir model tarayıcıya indirilmez — ses üretimi tamamen Google'ın
 * sunucusunda yapılır, biz sadece isteği kullanıcının kendi Gemini API
 * anahtarıyla iletip sonucu WAV olarak geri döneriz.
 *
 * POST /api/tts   body: { text: string, voice?: string, pace?: "slow"|"normal"|"fast" }
 * -> 200, Content-Type: audio/wav, gövde: WAV ses baytları
 */
const MAX_TEXT_CHARS = 4000;
const MAX_REQUEST_BODY_BYTES = 12_000; // metin + JSON zarfı + apiKey/voice alanları için fazlasıyla yeterli
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_VOICE = "Kore";
/**
 * Gemini TTS'in generateContent API'sinde ("Developer API", bu route'un
 * kullandığı) sayısal bir "speaking rate" parametresi YOKTUR — bu alan
 * Vertex AI'a özgüdür ve Developer API'de resmi olarak etkisizdir (bkz.
 * googleapis/python-genai#1707). Hız kontrolü, resmi Gemini TTS prompting
 * kılavuzunun önerdiği şekilde metnin önüne eklenen doğal-dil talimatıyla
 * yapılır (ör. "Say this slowly and deliberately: ..."). "normal" için
 * hiçbir talimat eklenmez — davranış tamamen varsayılana bırakılır.
 */
const PACE_INSTRUCTIONS: Record<string, string> = {
  slow: "Say the following slowly and deliberately, with clear pacing between phrases: ",
  fast: "Say the following at a brisk, energetic pace: ",
};
const ALLOWED_PACES = new Set(["slow", "normal", "fast"]);
/** Gemini TTS'in desteklediği 30 hazır ses — bkz. src/lib/settings-store.ts VOICE_OPTIONS. */
const ALLOWED_VOICES = new Set([
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
]);

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

/** Ham 16-bit PCM (mono) baytlarının önüne bir WAV başlığı ekler; tarayıcı <audio> bunu doğrudan çalabilir. */
function pcmToWav(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  const byteRate = sampleRate * 2; // mono, 16-bit
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out.buffer.slice(0) as ArrayBuffer;
}

/** "audio/L16;rate=24000" gibi bir mimeType'tan örnekleme hızını çıkarır. */
function sampleRateFromMime(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime ?? "");
  return m?.[1] ? Number(m[1]) : 24000;
}

async function handleTts(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("unauthorized" in auth) return auth.unauthorized;
  if (!(await checkAiEndpointRateLimit(auth.userId, "tts"))) {
    return Response.json(
      { error: "Çok fazla istek gönderildi. Lütfen biraz yavaşlayın." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return new Response("İstek çok büyük.", { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response("Geçersiz istek gövdesi.", { status: 400 });
  }
  if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
    return new Response("İstek çok büyük.", { status: 413 });
  }

  let body: { text?: unknown; voice?: unknown; pace?: unknown };
  try {
    body = JSON.parse(rawBody) as { text?: unknown; voice?: unknown; pace?: unknown };
  } catch {
    return new Response("Geçersiz istek gövdesi.", { status: 400 });
  }

  // Not: API anahtarı diğer tüm route'larla (image/video/music/stt) tutarlı
  // şekilde yalnızca header'dan okunur. Eskiden body.apiKey da kabul
  // ediliyordu ama hiçbir istemci kodu bunu göndermiyordu (bkz.
  // lib/gemini-speech.ts — her zaman yalnızca header kullanır); kullanılmayan
  // ve tutarsız bu ikinci yol kaldırıldı.
  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) {
    return new Response("Gemini API anahtarı bulunamadı. Lütfen anahtarını gir.", {
      status: 401,
    });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return new Response("text required", { status: 400 });
  const clipped = text.slice(0, MAX_TEXT_CHARS);

  // Kullanıcı Ayarlar > Ses panelinden bir ses seçtiyse o kullanılır;
  // whitelist dışı bir değer gelirse (bozuk istek/manipülasyon) sessizce
  // varsayılan sese düşülür.
  const requestedVoice = typeof body.voice === "string" ? body.voice.trim() : "";
  const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_VOICE;

  // Hız talimatı (varsa) metnin önüne eklenir — bkz. yukarıdaki
  // PACE_INSTRUCTIONS notu. Modelin talimatı içerik olarak okuyup
  // seslendirmemesi için ayrı bir cümle olarak, net bir "Say the
  // following..." kalıbıyla eklenir (Gemini TTS prompting kılavuzunun
  // önerdiği desen).
  const requestedPace = typeof body.pace === "string" ? body.pace.trim() : "normal";
  const pace = ALLOWED_PACES.has(requestedPace) ? requestedPace : "normal";
  const paceInstruction = PACE_INSTRUCTIONS[pace];
  const promptText = paceInstruction ? `${paceInstruction}${clipped}` : clipped;

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
      },
    );
  } catch (e) {
    console.error("[api/tts] Gemini'ye ulaşılamadı:", e);
    return new Response("Gemini TTS servisine ulaşılamadı.", { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error("[api/tts] Gemini hata döndü:", upstream.status, errText.slice(0, 500));
    if (upstream.status === 401 || upstream.status === 403) {
      return new Response("Gemini API anahtarı geçersiz veya yetkisiz.", { status: 401 });
    }
    return new Response("Ses üretilemedi, lütfen tekrar dener misin?", { status: 502 });
  }

  const data = (await upstream.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) {
    return new Response("Ses üretilemedi (boş yanıt).", { status: 502 });
  }

  const pcm = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
  const wav = pcmToWav(pcm, sampleRateFromMime(part.mimeType));

  return new Response(wav, {
    status: 200,
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleTts(request);
        } catch (e) {
          console.error("[api/tts] beklenmeyen hata:", e);
          return new Response("Beklenmeyen bir hata oluştu.", { status: 500 });
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
