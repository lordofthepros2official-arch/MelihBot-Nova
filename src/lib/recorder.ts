/** Mikrofon kaydı + canlı ses seviyesi (dalga animasyonu için). */

import { getPrimaryMicStream } from "./mic-device";

export type RecorderHandle = {
  stop: () => Promise<Blob>;
  cancel: () => void;
};

export async function startRecording(onLevel: (level: number) => void): Promise<RecorderHandle> {
  // Sistemin birincil/varsayılan mikrofonu açıkça istenir (bkz. mic-device.ts) —
  // VAD (voice-activity.ts) ile aynı seçim mantığı kullanılır ki iki farklı
  // yerde iki farklı mikrofon seçilmesin.
  const stream = await getPrimaryMicStream({ echoCancellation: true, noiseSuppression: true });
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i]! - 128) / 128;
      sum += v * v;
    }
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();

  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();

  const cleanup = () => {
    cancelAnimationFrame(raf);
    onLevel(0);
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    void ctx.close();
  };

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        if (rec.state !== "inactive") rec.stop();
        else {
          cleanup();
          resolve(new Blob(chunks));
        }
      }),
    cancel: () => {
      if (rec.state !== "inactive") rec.stop();
      cleanup();
    },
  };
}
