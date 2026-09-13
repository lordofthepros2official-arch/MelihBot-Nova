/**
 * "Videolar" (Veo) ve "Müzikler" (Lyria) sayfalarındaki "İlham al"
 * galerisi için hazır prompt örnekleri. Görsel galerisinin aksine (bkz.
 * gallery.ts) burada gerçek küçük resim yok — her kart kendi gradyanı ve
 * ikonuyla temsil edilir, böylece ekstra varlık dosyası gerekmez.
 */

export type MediaGalleryItem = { title: string; prompt: string; gradient: string };

export const VIDEO_GALLERY: MediaGalleryItem[] = [
  {
    title: "Bulutların üstünde uçuş",
    prompt:
      "Cinematic drone shot flying above a sea of clouds at golden hour, sun rays breaking through, smooth continuous forward motion, warm cinematic color grade, 4k",
    gradient: "linear-gradient(135deg, #f97316 0%, #fb923c 45%, #fde68a 100%)",
  },
  {
    title: "Yağmurlu şehir sokağı",
    prompt:
      "A neon-lit city street at night during light rain, reflections on wet asphalt, a lone figure walking with an umbrella, cinematic slow tracking shot, moody atmosphere",
    gradient: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #0ea5e9 100%)",
  },
  {
    title: "Okyanus dalgaları",
    prompt:
      "Close-up slow motion shot of ocean waves crashing on a rocky shore, sea foam, golden sunset light, natural sound of water, ultra realistic, 4k",
    gradient: "linear-gradient(135deg, #0369a1 0%, #0ea5e9 50%, #67e8f9 100%)",
  },
  {
    title: "Orman ve ışık huzmeleri",
    prompt:
      "A quiet forest at dawn, soft god rays filtering through tall pine trees, mist slowly drifting, a deer walking in the distance, cinematic nature documentary style",
    gradient: "linear-gradient(135deg, #14532d 0%, #16a34a 50%, #86efac 100%)",
  },
];

export const MUSIC_GALLERY: MediaGalleryItem[] = [
  {
    title: "Lo-fi çalışma müziği",
    prompt:
      "A relaxing lo-fi hip hop instrumental with warm vinyl crackle, mellow piano chords, soft jazzy drums, and a laid-back bassline. Instrumental only, no vocals.",
    gradient: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #fbcfe8 100%)",
  },
  {
    title: "Epik sinematik orkestra",
    prompt:
      "An epic cinematic orchestral piece about a journey home. Starts with a solo piano intro, builds through sweeping strings, and climaxes with a massive wall of sound.",
    gradient: "linear-gradient(135deg, #78350f 0%, #d97706 50%, #fde68a 100%)",
  },
  {
    title: "Akustik gitar, sakin",
    prompt:
      "A short instrumental acoustic guitar piece, warm and gentle, fingerpicked, folk style, calm mood.",
    gradient: "linear-gradient(135deg, #065f46 0%, #10b981 50%, #a7f3d0 100%)",
  },
  {
    title: "Enerjik elektronik",
    prompt:
      "An upbeat electronic dance track with a driving four-on-the-floor beat, bright synth arpeggios, and an energetic buildup and drop. Instrumental only.",
    gradient: "linear-gradient(135deg, #db2777 0%, #f472b6 50%, #67e8f9 100%)",
  },
];

export const IMAGE_GALLERY: MediaGalleryItem[] = [
  {
    title: "Dağlarda gün batımı",
    prompt:
      "A breathtaking mountain landscape at sunset, dramatic clouds, warm golden light hitting snow-capped peaks, ultra realistic, photographic quality, 4k",
    gradient: "linear-gradient(135deg, #b45309 0%, #f59e0b 45%, #fde68a 100%)",
  },
  {
    title: "Fütüristik şehir",
    prompt:
      "A futuristic cyberpunk city skyline at night, neon signs, flying vehicles, rain-slicked streets reflecting colorful lights, highly detailed digital art",
    gradient: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #ec4899 100%)",
  },
  {
    title: "Minimalist stüdyo portresi",
    prompt:
      "A minimalist studio portrait photograph, soft even lighting, clean neutral background, shallow depth of field, professional photography style",
    gradient: "linear-gradient(135deg, #334155 0%, #64748b 50%, #cbd5e1 100%)",
  },
  {
    title: "Fantastik orman",
    prompt:
      "A magical fantasy forest with glowing bioluminescent plants, soft mist, tiny fireflies floating in the air, dreamlike atmosphere, digital painting",
    gradient: "linear-gradient(135deg, #14532d 0%, #059669 50%, #6ee7b7 100%)",
  },
];
