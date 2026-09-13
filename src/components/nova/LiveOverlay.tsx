import { useCallback, useEffect, useRef, useState } from "react";
import { X, Mic, MicOff, Camera, CameraOff, Paperclip, FileText } from "lucide-react";
import { getStoredGeminiKey } from "@/lib/gemini-key";
import { buildSettingsHeaders, LIVE_ORB_THEMES } from "@/lib/settings-store";
import { useSettings } from "@/lib/use-settings";
import orb from "@/assets/live-orb.jpeg";
import { getRecognitionCtor, type Recognition } from "@/lib/speech";
import { speakLocal, stopLocalSpeech, transcribe } from "@/lib/gemini-speech";
import { startVoiceActivity, type VadHandle } from "@/lib/voice-activity";

type Status = "connecting" | "listening" | "thinking" | "speaking";

export function LiveOverlay({
  onClose,
  history,
  onExchange,
  assistantName,
}: {
  onClose: () => void;
  history: { role: "user" | "assistant"; content: string }[];
  onExchange: (user: string, assistant: string) => void;
  /** Ayarlar > Model'den kullanıcının verdiği asistan ismi (bkz.
   * ChatShell.tsx'teki tek useSettings() kaynağı) — Sidebar'la aynı
   * kaynaktan geldiği için Ayarlar panelindeki anında önizlemeyle tutarlı
   * kalır. */
  assistantName: string;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const { settings } = useSettings();
  const orbTheme =
    LIVE_ORB_THEMES.find((t) => t.id === settings.liveOrbTheme) ?? LIVE_ORB_THEMES[0]!;
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string }[]>([]);
  // Transkript paneli: varsayılan kapalı (sade görünüm korunur), kullanıcı
  // header'daki simgeyle açabilir. Açıkken hem geçmiş dönüşler (history
  // prop'u — normal sohbetten gelen) hem de o anki canlı transkript/yanıt
  // (transcript/reply state'leri, daha önce hiçbir yerde render edilmiyordu)
  // alt alta gösterilir.
  const [showTranscript, setShowTranscript] = useState(false);

  const camStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const recRef = useRef<Recognition | null>(null);
  const vadRef = useRef<VadHandle | null>(null);
  const statusRef = useRef<Status>("connecting");
  const mutedRef = useRef(false);
  const finalRef = useRef("");
  const closedRef = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;

  const setPhase = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
    // Bot konuşurken sadece net insan sesine tepki ver (hoparlör yankısını ele).
    vadRef.current?.setThreshold(s === "speaking" ? 34 : 20);
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    rec?.abort();
  }, []);

  const captureCameraFrame = useCallback((): string | null => {
    if (!camOn || !videoRef.current) return null;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return null;
    }
  }, [camOn]);

  const ask = useCallback(
    async (text: string) => {
      setPhase("thinking");
      setReply("");
      try {
        const images: string[] = attachments.map((a) => a.dataUrl);
        const cameraFrame = captureCameraFrame();
        if (cameraFrame) images.push(cameraFrame);

        const userContent =
          text +
          (attachments.length
            ? `\n\n[Eklenen dosyalar: ${attachments.map((a) => a.name).join(", ")}]`
            : "") +
          "\n\n(Sesli konuşma modundasın: kısa, doğal ve konuşma diline uygun yanıt ver.)";

        const userMessage =
          images.length > 0
            ? {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: userContent },
                  ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                ],
              }
            : { role: "user" as const, content: userContent };

        const geminiKey = getStoredGeminiKey();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(geminiKey ? { "x-gemini-api-key": geminiKey } : {}),
            ...buildSettingsHeaders(),
          },
          body: JSON.stringify({
            messages: [
              ...historyRef.current.map((m) => ({ role: m.role, content: m.content })),
              userMessage,
            ],
          }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text());
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setReply(full);
        }
        if (closedRef.current) return;
        setAttachments([]);
        onExchange(text, full);
        setPhase("speaking");
        void speakLocal(full, () => {
          if (closedRef.current) return;
          startListening();
        });
      } catch (e) {
        if (closedRef.current) return;
        setError(e instanceof Error ? e.message : "Bağlantı hatası, tekrar dinliyorum.");
        startListening();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onExchange, setPhase, attachments, captureCameraFrame],
  );

  // Tarayıcı canlı ses tanımayı (Web Speech API) hiç desteklemiyorsa veya
  // ağ hatası (tarayıcının çevrimiçi tanıma sunucusuna erişilemiyorsa) alırsa
  // ham ses kaydı, kullanıcının Gemini API anahtarıyla /api/stt'ye gönderilir.
  const [unsupported, setUnsupported] = useState(false);
  const useGeminiSttRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  /** Mevcut VAD mikrofon akışı üzerinden (ek getUserMedia isteği açmadan) kayda başlar. */
  const startShadowRecording = useCallback(() => {
    const stream = vadRef.current?.stream;
    if (!stream) return;
    try {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) recordedChunksRef.current.push(e.data);
      };
      rec.start();
      recorderRef.current = rec;
    } catch {
      /* MediaRecorder desteklenmiyorsa sessizce yok say */
    }
  }, []);

  const stopShadowRecording = useCallback((): Promise<Blob | null> => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = recordedChunksRef.current.length
          ? new Blob(recordedChunksRef.current, { type: rec.mimeType || "audio/webm" })
          : null;
        recordedChunksRef.current = [];
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  const startListening = useCallback(() => {
    if (closedRef.current) return;
    stopLocalSpeech();
    stopRecognition();
    finalRef.current = "";
    setTranscript("");
    setPhase("listening");
    if (mutedRef.current) return;

    // Gemini'ye geçmiş olsak bile ham ses her zaman gölge kayda alınır: bu
    // sayede tarayıcı SpeechRecognition tekrar ağ hatası verirse elimizde
    // her zaman Gemini'ye gönderilecek bir kayıt hazır olur.
    startShadowRecording();

    if (useGeminiSttRef.current) {
      // Zaten Gemini'ye geçmişiz (bu oturumda SpeechRecognition ağ hatası
      // vermişti) — tekrar tarayıcı motorunu denemeden direkt kayda geç.
      setUnsupported(false);
      setError(null);
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      // Tarayıcı canlı ses tanımayı hiç desteklemiyor (ör. Firefox) —
      // sessizce Gemini ile yazıya çevirmeye geçiyoruz.
      useGeminiSttRef.current = true;
      setUnsupported(true);
      setError("Bu tarayıcı canlı ses tanımayı desteklemiyor, Gemini ile yazıya çevriliyor…");
      return;
    }
    setUnsupported(false);
    const rec = new Ctor();
    rec.lang = "tr-TR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (err) => {
      // Hiçbir hata artık sessizce yutulmuyor — en azından konsola loglanıyor,
      // böylece "sesim duyulmuyor" durumunda tarayıcı konsolundan asıl sebep
      // görülebiliyor.
      console.warn("[LiveOverlay] SpeechRecognition hatası:", err.error);
      if (err.error === "not-allowed" || err.error === "service-not-allowed") {
        setError(
          "Mikrofon izni verilmedi. Tarayıcı adres çubuğundaki kilit simgesinden izin verin.",
        );
        setMuted(true);
        mutedRef.current = true;
        return;
      }
      if (err.error === "network") {
        // Tarayıcının çevrimiçi ses tanıma servisine ulaşılamıyor (ağ/bölge
        // kısıtlaması). Bir daha bu tarayıcı motorunu denemek yerine kalıcı
        // olarak Gemini ile (sunucu üzerinden) yazıya çevirmeye geçiyoruz.
        console.warn("[LiveOverlay] Çevrimiçi ses tanımaya ulaşılamıyor, Gemini'ye geçiliyor.");
        useGeminiSttRef.current = true;
        stopRecognition();
        setUnsupported(true);
        setError("Çevrimiçi ses tanımaya ulaşılamadı, Gemini ile yazıya çevriliyor…");
        return;
      }
      // "no-speech" gibi zararsız hatalarda sessizce devam edilir; onend
      // zaten yeniden başlatacaktır.
    };
    rec.onend = () => {
      // Tarayıcı oturumu kapatırsa eller serbest modda yeniden başlat.
      if (closedRef.current || recRef.current !== rec) return;
      if (statusRef.current === "listening" && !mutedRef.current && !useGeminiSttRef.current) {
        try {
          rec.start();
        } catch {
          /* zaten başlıyor */
        }
      }
    };
    recRef.current = rec;
    setError(null);
    try {
      rec.start();
    } catch (e) {
      console.warn("[LiveOverlay] SpeechRecognition başlatılamadı:", e);
    }
  }, [setPhase, stopRecognition, startShadowRecording]);

  const commit = useCallback(() => {
    stopRecognition();
    const said = (finalRef.current || transcript).trim();
    finalRef.current = "";
    void (async () => {
      const audioBlob = await stopShadowRecording();
      if (said && !useGeminiSttRef.current) {
        void ask(said);
        return;
      }
      // Gemini moduna geçilmişse (ya da tarayıcı motoru hiç metin
      // üretmediyse) elimizdeki kayıt Gemini'ye (/api/stt) gönderilir.
      if (!audioBlob) {
        setError("Bir şey duyamadım, tekrar dener misin?");
        startRef.current();
        return;
      }
      try {
        setPhase("thinking");
        const text = await transcribe(audioBlob);
        if (text.trim()) {
          void ask(text.trim());
        } else {
          setError("Bir şey duyamadım, tekrar dener misin?");
          startRef.current();
        }
      } catch (e) {
        console.error("[LiveOverlay] Gemini ses tanıma hatası:", e);
        setError("Ses yazıya çevrilemedi, tekrar dener misin?");
        startRef.current();
      }
    })();
  }, [ask, stopRecognition, transcript, stopShadowRecording, setPhase]);

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const startRef = useRef(startListening);
  startRef.current = startListening;

  useEffect(() => {
    closedRef.current = false;
    let cancelled = false;

    void (async () => {
      try {
        const vad = await startVoiceActivity({
          threshold: 20,
          silenceMs: 950,
          onLevel: setLevel,
          onSpeechStart: () => {
            if (mutedRef.current) return;
            // Konuşurken insan sesi algılanırsa hemen sus (ses kesme / barge-in).
            if (statusRef.current === "speaking") {
              stopLocalSpeech();
              startRef.current();
            }
          },
          onSpeechEnd: () => {
            if (mutedRef.current) return;
            if (statusRef.current === "listening") commitRef.current();
          },
        });
        if (cancelled) {
          vad.stop();
          return;
        }
        vadRef.current = vad;
        startRef.current();
      } catch {
        setError("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin.");
        setPhase("listening");
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      recRef.current?.abort();
      recRef.current = null;
      vadRef.current?.stop();
      vadRef.current = null;
      stopLocalSpeech();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* zaten durmuş olabilir */
        }
      }
      recorderRef.current = null;
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    };
  }, [setPhase]);

  const toggleCamera = async () => {
    if (camOn) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      setCamOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setError("Kameraya erişilemedi.");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    vadRef.current?.setEnabled(!next);
    if (next) {
      stopRecognition();
      stopLocalSpeech();
      setTranscript("");
    } else {
      startListening();
    }
  };

  const label = unsupported
    ? useGeminiSttRef.current
      ? status === "listening"
        ? "Dinliyorum (Gemini ile yazıya çevriliyor)…"
        : "Gemini ile yazıya çevriliyor"
      : "Bu tarayıcıda ses tanıma yok"
    : muted
      ? "Mikrofon kapalı"
      : status === "connecting"
        ? "Bağlanıyor…"
        : status === "listening"
          ? transcript
            ? "Dinliyorum…"
            : "Konuşabilirsin, dinliyorum"
          : status === "thinking"
            ? "Düşünüyorum…"
            : "Konuşuyorum… (konuşmaya başlayınca susarım)";

  const scale = 1 + (status === "speaking" ? 0.06 : level * 0.22);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black px-6 py-8 text-white">
      <div className="flex w-full items-center justify-between">
        <span className="text-[13px] font-medium tracking-tight text-white/70">
          MelihBot {assistantName} · Live
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTranscript((v) => !v)}
            aria-label={showTranscript ? "Transkripti gizle" : "Transkripti göster"}
            aria-pressed={showTranscript}
            className={`rounded-full p-2.5 transition ${
              showTranscript ? "bg-white/20" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            <FileText className="size-5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Live'ı kapat"
            className="rounded-full bg-white/10 p-2.5 hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {showTranscript && (
        <div className="nova-scroll absolute inset-x-4 top-16 bottom-28 overflow-y-auto rounded-3xl bg-white/5 p-4 backdrop-blur-sm">
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className={h.role === "user" ? "text-right" : "text-left"}>
                <p
                  className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] ${
                    h.role === "user" ? "bg-white/15 text-white" : "bg-white/[0.06] text-white/85"
                  }`}
                >
                  {h.content}
                </p>
              </div>
            ))}
            {transcript && (
              <div className="text-right">
                <p className="inline-block max-w-[85%] rounded-2xl bg-white/15 px-3.5 py-2 text-[13.5px] text-white/70 italic">
                  {transcript}
                </p>
              </div>
            )}
            {reply && (
              <div className="text-left">
                <p className="inline-block max-w-[85%] rounded-2xl bg-white/[0.06] px-3.5 py-2 text-[13.5px] text-white/70 italic">
                  {reply}
                </p>
              </div>
            )}
            {history.length === 0 && !transcript && !reply && (
              <p className="py-6 text-center text-[12.5px] text-white/35">
                Konuşma başladığında burada görünecek.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="relative flex flex-col items-center gap-8">
        <div className="relative flex size-64 items-center justify-center">
          {!muted && (status === "speaking" || status === "listening") && (
            <>
              <span
                className="animate-ring absolute size-56 rounded-full border"
                style={{ borderColor: `${orbTheme.ring1}66` }}
              />
              <span
                className="animate-ring absolute size-56 rounded-full border"
                style={{ borderColor: `${orbTheme.ring2}4d`, animationDelay: "1.3s" }}
              />
            </>
          )}
          {settings.liveOrbShape === "wave" ? (
            <div
              className="flex size-56 items-center justify-center gap-1 rounded-full"
              style={{
                background: `radial-gradient(circle, ${orbTheme.glow}33 0%, transparent 72%)`,
                opacity: muted ? 0.45 : 1,
              }}
            >
              {Array.from({ length: 24 }).map((_, i) => {
                const wobble = Math.sin(i * 0.9) * 0.5 + 0.5;
                const h =
                  status === "speaking" ? 14 + wobble * 42 * (0.4 + level) : 8 + wobble * 18;
                return (
                  <span
                    key={i}
                    className="w-1.5 rounded-full transition-all duration-150"
                    style={{
                      height: `${h}px`,
                      background: `linear-gradient(180deg, ${orbTheme.ring1}, ${orbTheme.ring2})`,
                    }}
                  />
                );
              })}
            </div>
          ) : settings.liveOrbShape === "bars" ? (
            <div
              className="flex size-56 items-end justify-center gap-1.5 rounded-full px-8 pb-8"
              style={{
                background: `radial-gradient(circle, ${orbTheme.glow}33 0%, transparent 72%)`,
                opacity: muted ? 0.45 : 1,
              }}
            >
              {Array.from({ length: 9 }).map((_, i) => {
                const base = [0.3, 0.55, 0.8, 1, 0.65, 1, 0.75, 0.5, 0.35][i] ?? 0.5;
                const h = status === "speaking" ? base * (60 + level * 60) : base * 26;
                return (
                  <span
                    key={i}
                    className="w-2.5 rounded-full transition-all duration-150"
                    style={{
                      height: `${h}px`,
                      background: `linear-gradient(180deg, ${orbTheme.ring1}, ${orbTheme.ring2})`,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <img
              src={orb}
              alt="Live asistan"
              width={512}
              height={512}
              className="animate-orb size-56 rounded-full object-cover"
              style={{
                animationDuration: status === "speaking" ? "1.1s" : "4.2s",
                transform: `scale(${scale.toFixed(3)})`,
                transition: "transform 90ms linear",
                opacity: muted ? 0.45 : 1,
                boxShadow: `0 0 60px -12px ${orbTheme.glow}99`,
              }}
            />
          )}
        </div>
        {camOn && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-32 w-44 rounded-2xl border border-white/15 object-cover"
          />
        )}
        <p className="text-sm tracking-wide text-white/60">{label}</p>
        <p className="max-h-40 max-w-md overflow-y-auto text-center text-[17px] leading-relaxed">
          {status === "listening" ? transcript : reply}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="flex flex-col items-center gap-4">
        {attachments.length > 0 && (
          <p className="max-w-sm truncate text-[12px] text-white/50">
            Yüklenenler: {attachments.map((a) => a.name).join(", ")}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={() => void toggleCamera()}
            className={`flex size-14 items-center justify-center rounded-full transition ${
              camOn ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
            }`}
            aria-label={camOn ? "Kamerayı kapat" : "Kamerayı aç"}
          >
            {camOn ? <CameraOff className="size-6" /> : <Camera className="size-6" />}
          </button>

          <button
            onClick={toggleMute}
            className={`flex size-[72px] items-center justify-center rounded-full transition ${
              muted ? "bg-white/15 text-white" : "bg-white text-black"
            }`}
            aria-label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
          >
            {muted ? <MicOff className="size-7" /> : <Mic className="size-7" />}
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex size-14 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label="Dosya yükle"
          >
            <Paperclip className="size-6" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const inputFiles = Array.from(e.target.files ?? []);
            e.target.value = "";
            for (const f of inputFiles) {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                setAttachments((prev) => [...prev, { name: f.name, dataUrl }]);
              };
              reader.readAsDataURL(f);
            }
          }}
        />
      </div>
    </div>
  );
}
