type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean; length: number }>;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

/**
 * Not: Bu dosya önceden kendi `speak()`/`stopSpeaking()` fonksiyonlarını da
 * (tarayıcının yerleşik `speechSynthesis`'ini doğrudan kullanan, basit bir
 * TTS) içeriyordu. Gemini tabanlı `speakLocal()`/`stopLocalSpeech()`
 * (bkz. gemini-speech.ts — Gemini TTS + tarayıcı sesine fallback) yazılınca
 * bu ikisi hiçbir yerden çağrılmaz oldu; kod tabanında iki paralel TTS
 * implementasyonu bulunması kafa karıştırıcı olduğundan kaldırıldı. Bu
 * dosya artık yalnızca STT (ses tanıma) için `SpeechRecognition` tarayıcı
 * API'sine erişim sağlar.
 */
export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type { Recognition };
