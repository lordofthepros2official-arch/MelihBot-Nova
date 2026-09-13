// Gerçek zamanlı ses aktivitesi (VAD) — insan/çocuk sesi frekans bandına tepki verir.
// Yetişkin erkek ~85-180 Hz, kadın ~165-255 Hz, çocuk ~250-500 Hz temel frekans;
// konuşma harmonikleri ~3 kHz'e kadar taşınır. Bu bant enerjisi ölçülür.

import { getPrimaryMicStream } from "./mic-device";

export type VadOptions = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLevel?: (level: number) => void;
  /** Konuşma başlangıcı için gereken bant enerjisi (0-255). */
  threshold?: number;
  /** Konuşma bitişi sayılması için sessizlik süresi (ms). */
  silenceMs?: number;
};

export type VadHandle = {
  stop: () => void;
  setThreshold: (v: number) => void;
  setEnabled: (v: boolean) => void;
  /** VAD'ın kullandığı ham mikrofon akışı — paralel bir kayıt (Gemini STT fallback) için. */
  stream: MediaStream;
};

const VOICE_LOW_HZ = 85;
const VOICE_HIGH_HZ = 3000;
const NOISE_LOW_HZ = 4500;
const NOISE_HIGH_HZ = 9000;

export async function startVoiceActivity(options: VadOptions = {}): Promise<VadHandle> {
  // Sistemin birincil/varsayılan mikrofonu açıkça istenir (bkz. mic-device.ts).
  const stream = await getPrimaryMicStream({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });

  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("AudioContext desteklenmiyor");
  }

  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  const binHz = ctx.sampleRate / analyser.fftSize;
  const idx = (hz: number) => Math.min(bins.length - 1, Math.max(0, Math.round(hz / binHz)));
  const voiceFrom = idx(VOICE_LOW_HZ);
  const voiceTo = idx(VOICE_HIGH_HZ);
  const noiseFrom = idx(NOISE_LOW_HZ);
  const noiseTo = idx(NOISE_HIGH_HZ);

  let threshold = options.threshold ?? 20;
  const silenceMs = options.silenceMs ?? 900;
  let enabled = true;
  let speaking = false;
  let voiceFrames = 0;
  let lastVoiceAt = 0;
  let raf = 0;
  let stopped = false;

  const avg = (from: number, to: number) => {
    let sum = 0;
    let n = 0;
    for (let i = from; i <= to; i++) {
      sum += bins[i] ?? 0;
      n++;
    }
    return n ? sum / n : 0;
  };

  const tick = () => {
    if (stopped) return;
    analyser.getByteFrequencyData(bins);
    const voice = avg(voiceFrom, voiceTo);
    const noise = avg(noiseFrom, noiseTo);
    options.onLevel?.(Math.min(1, voice / 90));

    const isVoice = enabled && voice > threshold && voice > noise * 1.5;
    const now = performance.now();

    if (isVoice) {
      voiceFrames++;
      lastVoiceAt = now;
      if (!speaking && voiceFrames >= 3) {
        speaking = true;
        options.onSpeechStart?.();
      }
    } else {
      voiceFrames = 0;
      if (speaking && now - lastVoiceAt > silenceMs) {
        speaking = false;
        options.onSpeechEnd?.();
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stream,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    },
    setThreshold: (v) => {
      threshold = v;
    },
    setEnabled: (v) => {
      enabled = v;
      if (!v) {
        speaking = false;
        voiceFrames = 0;
      }
    },
  };
}
