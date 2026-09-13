import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Folder,
  PanelLeft,
  ShieldCheck,
  BookOpen,
  ImageIcon,
  Sparkles,
  Search,
  Code2,
  HelpCircle,
  Settings,
  Wand2,
  Loader2,
  Trash2,
  Pin,
  X,
  Check,
} from "lucide-react";
import { Sidebar, type PaneView } from "./Sidebar";
import { Composer, type ComposerModes, type Attachment } from "./Composer";
import { MessageItem } from "./MessageItem";
import { LiveOverlay } from "./LiveOverlay";
import { PolicyMenu, type PolicyView } from "./PolicyMenu";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { CommandPalette } from "./CommandPalette";
import { CompareModal } from "./CompareModal";
import { GALLERY } from "./gallery";
import { MediaStudioPane } from "./MediaStudioPane";
import { ThinkingDots } from "./ThinkingDots";
import { GeminiKeyGate } from "./GeminiKeyGate";
import { AuthGate } from "./AuthGate";
import { useAuth } from "@/lib/use-auth";
import { SettingsPanel } from "./SettingsPanel";
import { useSettings } from "@/lib/use-settings";
import { FONT_SIZE_PX } from "@/lib/settings-store";
import { ThemeApplier } from "@/lib/theme-applier";
import { getStoredGeminiKey } from "@/lib/gemini-key";
import { onCurrentUserChange } from "@/lib/current-user";
import {
  fetchStoredImages,
  addStoredImage,
  deleteStoredImage,
  type GeneratedMedia,
} from "@/lib/media-store";
import { getStoredShortcuts, eventToCombo } from "@/lib/keyboard-shortcuts";
import { CanvasPane, extractCodeBlocks, type CanvasFile } from "./CanvasPane";
import { ProjectsPane } from "./ProjectsPane";
import { extractGeneratedImages } from "@/lib/chat-store";
import { addThreadToProject, fetchProjects, loadProjects, type Project } from "@/lib/projects";
import * as rt from "@/lib/chat-runtime";
import { planAgentSteps, runAgentStep, shouldTriggerAgent } from "@/lib/agent-runtime";
import signatureDark from "@/assets/signature-dark.png";
import { readInitialUiStateFromUrl, syncUiStateToUrl } from "@/lib/ui-url-state";
import {
  deleteThread,
  deleteThreads,
  fetchThread,
  fetchThreads,
  getThread,
  loadThreads,
  newId,
  setThreadsArchived,
  setThreadTags,
  titleFrom,
  upsertThread,
  type ChatMessage,
  type ChatAgentStep,
  type Thread,
} from "@/lib/chat-store";
import { colorForTag, normalizeTag } from "@/lib/tags";

const WELCOME_FEATURES = [
  { icon: ImageIcon, title: "Görsel Üret", prompt: "Bana " },
  { icon: Search, title: "Web'de Ara", prompt: "Şunu araştır: " },
  { icon: Code2, title: "Kod Yaz", prompt: "Şunun için kod yaz: " },
  { icon: Sparkles, title: "Fikir Üret", prompt: "Şu konuda bana fikir ver: " },
] as const;

function buildMessageContent(
  text: string,
  modes: ComposerModes,
  attachments: Attachment[],
): string {
  let content = text;
  if (attachments.length) {
    const parts = attachments.map((a) => {
      if (a.isImage) {
        return a.dataUrl
          ? `[Görsel eklendi: ${a.name}]`
          : `[Görsel eklendi: ${a.name} — dosya çok büyük olduğu için gönderilemedi, dosya adına göre bağlam kur]`;
      }
      if (a.videoFrames && a.videoFrames.length > 0) {
        return `[Video eklendi: ${a.name} — videodan ${a.videoFrames.length} örnek kare çıkarılıp aşağıda görsel olarak eklendi, bu karelere bakarak videoyu yorumla]`;
      }
      if (a.content) return `[Dosya: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``;
      return `[Dosya eklendi: ${a.name} — içerik okunamadı, dosya adına göre bağlam kur]`;
    });
    content += `\n\n${parts.join("\n\n")}`;
  }
  if (modes.think)
    content +=
      "\n\n(Derin düşünme modu: adım adım analiz et, varsayımlarını kontrol et ve gerekçeli bir sonuç ver.)";
  if (modes.web)
    content +=
      "\n\n(Web arama modu: en güncel bilgini kullan, tarih hassasiyeti olan noktaları ve emin olmadığın yerleri açıkça belirt.)";
  return content;
}

function extractImageDataUrls(attachments: Attachment[]): string[] {
  const urls: string[] = [];
  for (const a of attachments) {
    if (a.isImage && a.dataUrl) urls.push(a.dataUrl);
    if (a.videoFrames) urls.push(...a.videoFrames);
  }
  return urls;
}

/**
 * Kitaplık aramasında bir mesaj eşleştiğinde, mesajın tamamı yerine arama
 * teriminin GEÇTİĞİ yerin etrafındaki kısa bir kesiti gösterir (arama
 * sonucu kartlarında "neden eşleşti" sorusuna görsel cevap verir). Terim
 * metnin ortasındaysa "…" ile başlar/biter.
 */
function snippetAround(content: string, query: string, radius = 60): string {
  const q = query.trim();
  if (!q) return content.slice(0, 140);
  const idx = content.toLocaleLowerCase("tr").indexOf(q.toLocaleLowerCase("tr"));
  if (idx === -1) return content.slice(0, 140);
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + q.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

/**
 * `exactOptionalPropertyTypes: true` altında "images: undefined" atamak
 * TypeScript'te hataya yol açar (undefined, "alan yok" ile aynı şey
 * sayılmaz) — bu yüzden ChatMessage'daki opsiyonel `images` alanını
 * güvenle set etmek için bu yardımcı kullanılır: dizi boşsa/yoksa alanı
 * hiç eklemez, doluysa ekler. editMessage/restorePreviousMessageVersion
 * tarafından kullanılır.
 */
function withImages<T extends object>(
  base: T,
  images: string[] | undefined,
): T & { images?: string[] } {
  return images && images.length > 0 ? { ...base, images } : base;
}

// Sidebar açık/kapalı tercihi de modül seviyesinde saklanır ki yeniden
// mount (route değişimi) sırasında görsel "sıçrama" yaşanmasın.
let sidebarOpenPreference: boolean | null = null;

export function ChatShell({ threadId }: { threadId?: string }) {
  const navigate = useNavigate();
  // Kullanıcı geçerli bir Gemini API anahtarı girene kadar uygulamanın
  // geri kalanı hiç render edilmez — bu ekran zorunludur ve kapatılamaz.
  //
  // ÖNEMLİ (hydration): localStorage sunucuda hiç yoktur, bu yüzden ilk
  // state DAİMA `false` olmalı (hem sunucuda hem client'ın ilk render'ında)
  // — aksi halde sunucunun ürettiği HTML ile client'ın ilk render'ı
  // birbirinden farklı olur ve React "Hydration failed" / #418 hatası
  // fırlatır. Gerçek değer, DOM zaten hydrate olduktan SONRA, aşağıdaki
  // useEffect içinde okunup state'e yazılır.
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  useEffect(() => {
    setHasGeminiKey(Boolean(getStoredGeminiKey()));
    // Kullanıcı değişince (login/logout → namespace değişimi) o kullanıcının
    // kendi Gemini anahtarı var mı diye yeniden kontrol et. Aksi halde,
    // reload olmadan giriş yapan bir kullanıcı (örn. logout sonrası aynı
    // sekmede yeniden giriş) bir önceki kullanıcının "anahtar var" durumunu
    // görmeye devam edebilirdi.
    return onCurrentUserChange(() => setHasGeminiKey(Boolean(getStoredGeminiKey())));
  }, []);
  // Kimlik doğrulama (oturum) durumu — GeminiKeyGate'ten ÖNCE kontrol
  // edilir: kullanıcı önce giriş yapmalı/üye olmalı, sonra kendi Gemini
  // anahtarını girmeli. `isLoading` sırasında (ilk /api/auth/me isteği
  // sürerken) hiçbir gate render edilmez, böylece "signed-out" ekranı bir
  // an için yanlışlıkla görünüp kaybolmaz.
  const auth = useAuth();
  const [sidebarOpen, setSidebarOpenState] = useState(() => sidebarOpenPreference ?? true);
  const setSidebarOpen = useCallback((v: boolean) => {
    sidebarOpenPreference = v;
    setSidebarOpenState(v);
  }, []);
  const [view, setView] = useState<PaneView>(() => readInitialUiStateFromUrl().view);
  const [sharedProjectId, setSharedProjectId] = useState<string | null>(null);

  // Bir proje paylaşım linkiyle açıldıysa (?project=ID), doğrudan o projeyi göster.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("project");
    if (id) {
      setSharedProjectId(id);
      setView("projects");
    }
    // Sadece ilk yüklemede kontrol edilir.
  }, []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  // A/B karşılaştırma modalı (Madde 7): açıkken karşılaştırılacak kullanıcı
  // mesajının ID'si; null ise modal kapalı.
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [canvasFiles, setCanvasFiles] = useState<CanvasFile[] | null>(null);
  const [policy, setPolicy] = useState<PolicyView | null>(() => readInitialUiStateFromUrl().policy);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // useSettings() burada TEK bir kez çağrılır ve SettingsPanel'e prop
  // olarak geçirilir (bkz. aşağıdaki <SettingsPanel> render'ı) — böylece
  // Ayarlar panelindeki bir değişiklik (taslak state), ChatShell'in kendi
  // <ThemeApplier> önizlemesine de ANINDA yansır. Eğer SettingsPanel kendi
  // bağımsız useSettings() örneğini çağırsaydı, ikisi ayrı React state'i
  // taşırdı ve panel içindeki "taslak" değişiklik (henüz Kaydet'e
  // basılmamış) arka plandaki sohbet ekranında görünmezdi.
  const settingsCtx = useSettings();
  const userSettings = settingsCtx.settings;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Deep-link / paylaşılabilir URL desteği: QA raporlarında her panel ve
  // modal için "Eşlenen Rotalar" (?view=kitaplik, ?modal=guvenlik vb.)
  // belgelenmişti ama bu parametreler sayfa yüklenirken hiç okunmuyor,
  // state değiştiğinde de adres çubuğuna yazılmıyordu — yani bir sekmeyi
  // yenilemek veya linki bir başkasına göndermek her zaman sohbet
  // ekranına dönüyordu. `view`/`policy` her değiştiğinde URL'i buradan
  // (replaceState ile, geçmişe yeni girdi eklemeden) güncel tutuyoruz;
  // başlangıç değeri de yukarıda aynı şemayla URL'den okunuyor.
  useEffect(() => {
    syncUiStateToUrl(view, policy);
  }, [view, policy]);

  // Kullanıcı Kitaplık'tan başka bir sayfaya geçince seçim modu otomatik
  // kapanır — aksi halde geri döndüğünde eski seçimler kafa karıştırıcı
  // şekilde hâlâ işaretli görünürdü.
  useEffect(() => {
    if (view !== "library") {
      setSelectMode(false);
      setSelectedThreadIds(new Set());
      setConfirmingBulkDelete(false);
    }
  }, [view]);

  const refresh = useCallback(() => setThreads(loadThreads()), []);

  // Model kod ürettiğinde Canvas'ı otomatik aç (yanıt tamamlandığında, streaming sırasında değil).
  const prevBusyRef = useRef(false);
  useEffect(() => {
    if (prevBusyRef.current && !busy) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.content) {
        const blocks = extractCodeBlocks(last.content);
        if (blocks.length > 0) setCanvasFiles(blocks);
      }
    }
    prevBusyRef.current = busy;
  }, [busy, messages]);

  // Aktif sohbet bir projeye aitse, kullanıcının "hangi projedeyim"
  // bilgisini kaybetmemesi için üstte küçük bir rozet gösterilir.
  const activeProject = useMemo(() => {
    if (!threadId) return null;
    return loadProjects().find((p) => p.chatIds.includes(threadId)) ?? null;
  }, [threadId]);

  const projectContextFor = useCallback((id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const project = loadProjects().find((p) => p.chatIds.includes(id));
    if (!project) return undefined;

    // "Bellek kapalı": kullanıcı bu projede hiçbir proje-seviyeli bağlamın
    // (talimat, kaynak, geçmiş özet) modele gitmesini istemiyor — tam
    // izolasyon. Sadece proje adını (kimlik amaçlı, zararsız) bırakırız.
    if (project.memory === "Bellek kapalı") {
      return `Proje adı: ${project.name} (bu projede "Bellek kapalı" seçili — proje talimatlarını, kaynaklarını veya geçmiş sohbet özetini dikkate alma, sadece bu mesajın kendisine göre yanıt ver).`;
    }

    const parts: string[] = [`Proje adı: ${project.name}`];
    if (project.instructions.trim())
      parts.push(`Proje talimatları: ${project.instructions.trim()}`);
    if (project.sources.length) {
      const sourceText = project.sources
        .map((s) => `--- Kaynak: ${s.name} ---\n${s.content.slice(0, 6000)}`)
        .join("\n\n");
      parts.push(`Proje kaynakları:\n${sourceText}`);
    }

    // "Proje belleği": bu projedeki DİĞER sohbetlerden kısa bir özet de
    // bağlama eklenir, böylece model projenin genel gidişatından haberdar
    // olur (yalnızca "Varsayılan bellek"te bu ek bağlam eklenmez — o mod
    // sadece talimat+kaynaklarla, konuşmalar arası sızıntı olmadan çalışır).
    if (project.memory === "Proje belleği") {
      const otherThreadSummaries = project.chatIds
        .filter((tid) => tid !== id)
        .map((tid) => getThread(tid))
        .filter((t): t is NonNullable<typeof t> => !!t && t.messages.length > 0)
        .slice(0, 5)
        .map((t) => {
          const firstUserMsg = t.messages.find((m) => m.role === "user")?.content ?? "";
          return `- "${t.title}": ${firstUserMsg.slice(0, 200)}`;
        });
      if (otherThreadSummaries.length > 0) {
        parts.push(
          `Bu projedeki diğer sohbetlerden kısa özet (bağlam için, gerekmedikçe doğrudan atıfta bulunma):\n${otherThreadSummaries.join("\n")}`,
        );
      }
    }

    // "Kitaplık erişimi: Devre dışı" iken modelin bu projede daha önce
    // üretilmiş görsel/video/müzik içeriğine (Kitaplık) referans vermemesi
    // gerektiği açıkça belirtilir.
    if (project.libraryAccess === "Devre dışı") {
      parts.push(
        "Bu projede Kitaplık erişimi devre dışı: daha önce bu hesapta üretilmiş görsel, video veya müzik içeriğine referans verme veya bunlardan bahsetme; sadece bu sohbetin kendi bağlamını kullan.",
      );
    }

    return parts.join("\n\n");
  }, []);

  useEffect(() => {
    refresh();
    // Sunucudaki (SQLite) gerçek veriyle önbelleği tazele — böylece farklı
    // bir cihazdan veya tarayıcı verisi temizlendikten sonra da geçmiş görünür.
    void fetchThreads();
    void fetchProjects();
    if (sidebarOpenPreference === null) setSidebarOpen(window.innerWidth >= 768);
    const onChange = () => refresh();
    window.addEventListener("nova:threads", onChange);
    return () => window.removeEventListener("nova:threads", onChange);
  }, [refresh, setSidebarOpen]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setBusy(false);
      setError(null);
      return;
    }
    const sync = () => {
      const state = rt.getState(threadId);
      setMessages([...state.messages]);
      setBusy(state.busy);
      setError(state.error);
      setThreads(loadThreads());
    };
    sync();
    // Bu thread'in mesajları henüz bu sekmede hiç yüklenmediyse (örn. sayfa
    // doğrudan bu URL ile açıldıysa) sunucudan taze veriyi çek ve runtime
    // state'ine yaz — aksi halde geçmiş boş görünür.
    if (rt.getState(threadId).messages.length === 0) {
      void fetchThread(threadId).then((fresh) => {
        if (fresh) {
          rt.setMessages(threadId, fresh.messages);
          sync();
        }
      });
    }
    const unsub = rt.subscribe(threadId, sync);
    return () => {
      unsub();
    };
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const persist = useCallback(
    (id: string, msgs: ChatMessage[]) => {
      const existing = getThread(id);
      upsertThread({
        id,
        title: existing?.title ?? titleFrom(msgs.find((m) => m.role === "user")?.content ?? ""),
        updatedAt: Date.now(),
        messages: msgs,
      });
      refresh();
    },
    [refresh],
  );

  /** "Web'de Arama" modu için DuckDuckGo'dan sonuç çekip modele bağlam olarak ekler. */
  const fetchWebContext = useCallback(async (query: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(9_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: { title: string; url: string; snippet: string }[];
      };
      if (!data.results?.length) return null;
      const lines = data.results
        .map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`)
        .join("\n");
      return `(DuckDuckGo web arama sonuçları, "${query}" için — bu bilgileri kaynak göstererek kullan, güncelliğinden emin olamadığın konularda buna dayan. Bu arama zaten senin için yapıldı, aynı konuda tekrar web_search çağırmana gerek yok:)\n${lines}`;
    } catch {
      // Arama başarısız olursa sessizce yok say — sohbet aramasız devam eder.
      return null;
    }
  }, []);

  const send = useCallback(
    (text: string, modes: ComposerModes, attachments: Attachment[]) => {
      const content = buildMessageContent(text, modes, attachments);
      const images = extractImageDataUrls(attachments);

      const id = threadId ?? newId();
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user" as const,
        content,
        ...(images.length ? { images } : {}),
      };
      const next = [...messages, userMsg];
      setMessages(next);
      rt.setMessages(id, next);
      persist(id, next);
      if (!threadId) {
        void navigate({ to: "/c/$threadId", params: { threadId: id } });
      }

      // Agent akışı iki şekilde tetiklenir: (1) kullanıcı Composer'daki
      // "Agent" anahtarını manuel açarsa (modes.agent), (2) kullanıcı
      // anahtarı açmamış olsa bile mesaj metni çok-adımlı/görev
      // niteliğinde görünüyorsa otomatik olarak (bkz. agent-runtime.ts
      // shouldTriggerAgent — bu modülün tasarım amacı buydu, önceden
      // tanımlıydı ama hiçbir yerden çağrılmıyordu). Ek dosyalar
      // (attachments) varsa otomatik tetikleme yapılmaz — kullanıcı
      // bilerek görsel/dosya ekleyip normal sohbet bekliyor olabilir;
      // manuel toggle bu durumda yine de geçerlidir.
      const autoAgent =
        !modes.agent && !attachments.length && !modes.web && shouldTriggerAgent(text);

      if ((modes.agent || autoAgent) && !attachments.length) {
        void runAgentFlow(id, text, next);
      } else if (modes.web) {
        void (async () => {
          const webContext = await fetchWebContext(text);
          const projectCtx = projectContextFor(id);
          const combinedContext = [projectCtx, webContext].filter(Boolean).join("\n\n");
          void rt.run(id, next, combinedContext || undefined);
        })();
      } else {
        void rt.run(id, next, projectContextFor(id));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, threadId, persist, navigate, projectContextFor, fetchWebContext],
  );

  /**
   * Bir kullanıcı mesajını düzenler: mesajın metnini değiştirir (görseller
   * varsa aynen korunur — düzenleme UI'sı yalnızca metin içindir), o
   * mesajdan SONRAKİ her şeyi (eski yanıt zinciri) siler ve yeniden yanıt
   * üretir. Silinen zincir kaybolmaz — düzenlenen mesajın `supersededTail`
   * alanına taşınır, eski `content` de `editHistory`'ye eklenir; böylece
   * kullanıcı MessageItem'daki "önceki hali gör" bağlantısıyla eski
   * versiyona geri dönebilir (bkz. restorePreviousMessageVersion).
   */
  const editMessage = useCallback(
    (messageId: string, newText: string) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx === -1 || current[idx]!.role !== "user") return;

      const original = current[idx]!;
      const tail = current.slice(idx + 1); // eski yanıt zinciri (varsa)
      const editedMsg: ChatMessage = {
        ...original,
        content: newText,
        editHistory: [
          ...(original.editHistory ?? []),
          withImages({ content: original.content }, original.images),
        ],
        ...(tail.length > 0
          ? { supersededTail: tail }
          : original.supersededTail
            ? { supersededTail: original.supersededTail }
            : {}),
      };
      const next = [...current.slice(0, idx), editedMsg];
      setMessages(next);
      rt.setMessages(threadId, next);
      persist(threadId, next);
      void rt.run(threadId, next, projectContextFor(threadId));
    },
    [threadId, persist, projectContextFor],
  );

  /**
   * MessageItem'daki sürüm oklarına basıldığında çağrılır: geçmişteki bir
   * önceki düzenleme versiyonuna döner. Versiyonla birlikte o versiyona ait
   * `supersededTail` (eski yanıt zinciri) de geri getirilir ki kullanıcı
   * ileri geri gidip geldiğinde her versiyonun kendi yanıtını görsün.
   */
  const restorePreviousMessageVersion = useCallback(
    (messageId: string) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const msg = current[idx]!;
      const history = msg.editHistory ?? [];
      if (history.length === 0) return;

      const prevVersion = history[history.length - 1]!;
      const restoredTail = msg.supersededTail ?? [];
      const { images: _msgImages, supersededTail: _msgTail, ...msgRest } = msg;
      const updatedMsg: ChatMessage = withImages(
        {
          ...msgRest,
          content: prevVersion.content,
          editHistory: history.slice(0, -1),
        },
        prevVersion.images,
      );
      const next = [...current.slice(0, idx), updatedMsg, ...restoredTail];
      setMessages(next);
      rt.setMessages(threadId, next);
      persist(threadId, next);
    },
    [threadId, persist],
  );

  /**
   * Sohbeti özetler (Madde 5 — Otomatik özetleme): mevcut mesajların
   * tamamını /api/summarize'e gönderir, dönen özeti tek bir "assistant"
   * mesajı olarak (başında görsel bir "Özet" etiketiyle ayırt edilebilir)
   * thread'in BAŞINA koyar ve öncesindeki tüm mesajları siler — böylece
   * hem context gerçekten küçülür hem de kullanıcı konuşmanın nereden
   * devam ettiğini görür. Geri alınamaz (özetlenen orijinal mesajlar
   * silinir) — bu yüzden ChatShell.tsx'teki UI bir onay adımı içerir.
   */
  const summarizeThread = useCallback(async () => {
    if (!threadId || messages.length === 0) return;
    const apiKey = getStoredGeminiKey();
    if (!apiKey) {
      setSummarizeError("Özetlemek için önce bir Gemini API anahtarı girmen gerekiyor.");
      return;
    }
    setSummarizing(true);
    setSummarizeError(null);
    try {
      const transcript = messages
        .map((m) => `${m.role === "user" ? "Kullanıcı" : "Asistan"}: ${m.content}`)
        .join("\n\n");
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
        body: JSON.stringify({ text: transcript }),
      });
      const data = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
      if (!res.ok || !data.summary) {
        throw new Error(data.error || "Özet oluşturulamadı.");
      }
      const summaryMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: `📋 **Önceki konuşmanın özeti**\n\n${data.summary}`,
      };
      const next = [summaryMsg];
      setMessages(next);
      rt.setMessages(threadId, next);
      persist(threadId, next);
    } catch (e) {
      setSummarizeError(e instanceof Error ? e.message : "Özetlenemedi, tekrar dener misin?");
    } finally {
      setSummarizing(false);
    }
  }, [threadId, messages, persist]);

  /** Agent akışı: sohbetin içinde, ayrı bir modal olmadan çok adımlı görevi yürütür. */
  const runAgentFlow = useCallback(
    async (id: string, goal: string, historyBefore: ChatMessage[]) => {
      const agentMsgId = newId();
      const setAgentMsg = (updater: (m: ChatMessage) => ChatMessage) => {
        const current = rt.getState(id).messages;
        const updated = current.map((m) => (m.id === agentMsgId ? updater(m) : m));
        rt.setMessages(id, updated);
        setMessages(updated);
        persist(id, updated);
      };

      let placeholder: ChatMessage = {
        id: agentMsgId,
        role: "assistant",
        content: "",
        agentGoal: goal,
        agentSteps: [],
      };
      const withPlaceholder = [...historyBefore, placeholder];
      rt.setMessages(id, withPlaceholder);
      setMessages(withPlaceholder);
      persist(id, withPlaceholder);

      try {
        const steps = await planAgentSteps(goal);
        placeholder = { ...placeholder, agentSteps: steps };
        setAgentMsg(() => placeholder);

        for (const step of steps) {
          if (step.status === "needs_approval") continue; // kullanıcı onayı bekleniyor
          setAgentMsg((m) => ({
            ...m,
            agentSteps: (m.agentSteps ?? []).map((s) =>
              s.id === step.id ? { ...s, status: "running" as const } : s,
            ),
          }));
          try {
            const currentSteps = rt.getState(id).messages.find((m) => m.id === agentMsgId)
              ?.agentSteps as ChatAgentStep[] | undefined;
            const out = await runAgentStep(goal, step, currentSteps ?? []);
            setAgentMsg((m) => ({
              ...m,
              agentSteps: (m.agentSteps ?? []).map((s) =>
                s.id === step.id ? { ...s, status: "done" as const, output: out } : s,
              ),
            }));
          } catch {
            setAgentMsg((m) => ({
              ...m,
              agentSteps: (m.agentSteps ?? []).map((s) =>
                s.id === step.id ? { ...s, status: "error" as const } : s,
              ),
            }));
          }
        }

        const finalSteps = rt.getState(id).messages.find((m) => m.id === agentMsgId)?.agentSteps as
          ChatAgentStep[] | undefined;
        const stillWaiting = (finalSteps ?? []).some((s) => s.status === "needs_approval");
        if (!stillWaiting) {
          const summary = (finalSteps ?? [])
            .filter((s) => s.output)
            .map((s) => `**${s.title}**\n${s.output}`)
            .join("\n\n");
          setAgentMsg((m) => ({ ...m, content: summary || "Görev tamamlandı." }));
        }
      } catch (e) {
        setAgentMsg((m) => ({
          ...m,
          content: e instanceof Error ? e.message : "Agent planı oluşturulamadı.",
        }));
      }
    },
    [persist],
  );

  const approveAgentStep = useCallback(
    (messageId: string, stepId: number) => {
      if (!threadId) return;
      const msg = messages.find((m) => m.id === messageId);
      const step = msg?.agentSteps?.find((s) => s.id === stepId);
      if (!msg || !step) return;
      const runOne = async () => {
        const updateStep = (updater: (s: ChatAgentStep) => ChatAgentStep) => {
          const current = rt.getState(threadId).messages;
          const updated = current.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  agentSteps: (m.agentSteps ?? []).map((s) => (s.id === stepId ? updater(s) : s)),
                }
              : m,
          );
          rt.setMessages(threadId, updated);
          setMessages(updated);
          persist(threadId, updated);
        };
        updateStep((s) => ({ ...s, status: "running" as const }));
        try {
          const out = await runAgentStep(msg.agentGoal ?? "", step, msg.agentSteps ?? []);
          updateStep((s) => ({ ...s, status: "done" as const, output: out }));
        } catch {
          updateStep((s) => ({ ...s, status: "error" as const }));
        }
      };
      void runOne();
    },
    [messages, threadId, persist],
  );

  const skipAgentStep = useCallback(
    (messageId: string, stepId: number) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const updated = current.map((m) =>
        m.id === messageId
          ? {
              ...m,
              agentSteps: (m.agentSteps ?? []).map((s) =>
                s.id === stepId ? { ...s, status: "skipped" as const } : s,
              ),
            }
          : m,
      );
      rt.setMessages(threadId, updated);
      setMessages(updated);
      persist(threadId, updated);
    },
    [threadId, persist],
  );

  const handleFeedback = useCallback(
    (messageId: string, feedback: "up" | "down" | null) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const updated = current.map((m) => (m.id === messageId ? { ...m, feedback } : m));
      rt.setMessages(threadId, updated);
      setMessages(updated);
      persist(threadId, updated);
    },
    [threadId, persist],
  );

  const handleTogglePin = useCallback(
    (messageId: string) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const updated = current.map((m) =>
        m.id === messageId ? { ...m, pinned: !m.pinned } : m,
      );
      rt.setMessages(threadId, updated);
      setMessages(updated);
      persist(threadId, updated);
    },
    [threadId, persist],
  );

  /**
   * Sohbeti belirtilen mesajdan (dahil) itibaren ikiye böler: o mesajdan
   * sonraki her şey (dahil) yeni bir thread'e taşınır, orijinal thread'de
   * yalnızca önceki mesajlar kalır. Yeni thread'in başlığı, taşınan ilk
   * kullanıcı mesajından türetilir. Kullanıcı yeni thread'e otomatik
   * yönlendirilir. Bkz. MessageItem.tsx "Buradan böl" eylemi.
   */
  const splitThreadFrom = useCallback(
    (messageId: string) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const before = current.slice(0, idx);
      const after = current.slice(idx);
      if (after.length === 0) return;

      const firstUserMsg = after.find((m) => m.role === "user");
      const newThreadId = newId();
      const newThread: Thread = {
        id: newThreadId,
        title: titleFrom(firstUserMsg?.content ?? after[0]!.content),
        updatedAt: Date.now(),
        messages: after,
      };
      upsertThread(newThread);

      rt.setMessages(threadId, before);
      setMessages(before);
      persist(threadId, before);

      refresh();
      void navigate({ to: "/c/$threadId", params: { threadId: newThreadId } });
    },
    [threadId, persist, refresh, navigate],
  );

  /**
   * A/B karşılaştırma modalında kullanıcı bir varyantı "Bunu kullan"
   * diyerek seçtiğinde çağrılır: karşılaştırılan kullanıcı mesajından
   * hemen sonraki assistant yanıtını (varsa) seçilen metinle değiştirir;
   * yoksa (mesaj henüz hiç yanıtlanmadıysa, ör. regenerate sonrası) yeni
   * bir assistant mesajı olarak ekler.
   */
  const handleCompareUseVariant = useCallback(
    (messageId: string, variantText: string) => {
      if (!threadId) return;
      const current = rt.getState(threadId).messages;
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const next = [...current];
      const nextMsg = next[idx + 1];
      if (nextMsg && nextMsg.role === "assistant") {
        next[idx + 1] = { ...nextMsg, content: variantText };
      } else {
        next.splice(idx + 1, 0, { id: newId(), role: "assistant", content: variantText });
      }
      setMessages(next);
      rt.setMessages(threadId, next);
      persist(threadId, next);
      setCompareFor(null);
    },
    [threadId, persist],
  );

  const regenerate = useCallback(() => {
    if (!threadId || busy) return;
    let cut = messages.length - 1;
    while (cut >= 0 && messages[cut]?.role === "assistant") cut--;
    const history = messages.slice(0, cut + 1);
    if (history.length === 0) return;
    void rt.run(threadId, history, projectContextFor(threadId));
  }, [messages, threadId, busy, projectContextFor]);

  const appendExchange = useCallback(
    (user: string, assistant: string) => {
      const id = threadId ?? newId();
      const next = [
        ...messages,
        { id: newId(), role: "user" as const, content: user },
        { id: newId(), role: "assistant" as const, content: assistant },
      ];
      setMessages(next);
      rt.setMessages(id, next);
      persist(id, next);
      if (!threadId) void navigate({ to: "/c/$threadId", params: { threadId: id } });
    },
    [messages, threadId, persist, navigate],
  );

  const startInProject = useCallback(
    (project: Project, text: string, modes: ComposerModes, attachments: Attachment[]) => {
      const content = buildMessageContent(text, modes, attachments);
      const images = extractImageDataUrls(attachments);
      const id = newId();
      const msgs: ChatMessage[] = [
        { id: newId(), role: "user", content, ...(images.length ? { images } : {}) },
      ];
      upsertThread({ id, title: titleFrom(text), updatedAt: Date.now(), messages: msgs });
      addThreadToProject(project.id, id);
      rt.setMessages(id, msgs);
      refresh();
      setView("chat");
      void navigate({ to: "/c/$threadId", params: { threadId: id } });
      void rt.run(id, msgs, projectContextFor(id));
    },
    [navigate, refresh, projectContextFor],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setView("chat");
    void navigate({ to: "/" });
  }, [navigate]);

  // Genel klavye kısayolları (bkz. src/lib/keyboard-shortcuts.ts). Ayarlar >
  // Klavye'den kullanıcı tarafından yeniden atanabilir; burada her tuş
  // basışında güncel eşleme localStorage'dan okunur ki değişiklik anında
  // etkili olsun (sayfa yenilemeye gerek kalmadan).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Kullanıcı bir metin alanına (textarea, input, contenteditable)
      // yazarken genel kısayolları devre dışı bırak. Kısayollar zorunlu
      // olarak Ctrl/Cmd/Alt içerir (bkz. eventToCombo) ama bu, ör.
      // "Ctrl+," ile bir metin alanında imleç hareketi/seçim yapan
      // tarayıcı/işletim sistemi davranışlarıyla çakışmayı önlemek için
      // ekstra bir güvenlik katmanıdır.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      // "?" (Shift+/ ile yazılır ama tarayıcı e.key olarak doğrudan "?"
      // verir) modifier gerektirmeyen tek bir yardım kısayolıdır — GitHub,
      // Slack, Linear gibi birçok uygulamada standart olan "yardım aç"
      // tuşu. eventToCombo() zorunlu modifier istediği için bunu ayrı ele
      // alıyoruz; kullanıcının kendi atadığı kısayollarla çakışmaz çünkü
      // onlar hep bir modifier içerir.
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsHelpOpen((v) => !v);
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) return;
      const bindings = getStoredShortcuts();
      if (combo === bindings.newChat) {
        e.preventDefault();
        handleNewChat();
      } else if (combo === bindings.toggleSidebar) {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      } else if (combo === bindings.openSettings) {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (combo === bindings.openLibrary) {
        e.preventDefault();
        setView("library");
      } else if (combo === bindings.focusComposer) {
        e.preventDefault();
        setView("chat");
        requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
        });
      } else if (combo === bindings.commandPalette) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewChat, sidebarOpen, setSidebarOpen]);

  const startedChat = messages.length > 0;
  const myImages = useMemo(() => extractGeneratedImages(threads), [threads]);

  // "Görseller" sayfasındaki doğrudan üretim kutusu (bkz. Video/Müzik
  // stüdyolarındaki aynı desen) — /api/image'ı gerçekten kullanır.
  // Başlangıçta boş: IndexedDB okuması asenkron olduğundan (bkz.
  // media-store.ts), gerçek liste aşağıdaki useEffect ile hydrate edilir.
  const [studioImages, setStudioImages] = useState<GeneratedMedia[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchStoredImages().then((list) => {
      if (!cancelled) setStudioImages(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateImage = useCallback(async () => {
    const trimmed = imagePrompt.trim();
    if (!trimmed || imageBusy) return;
    const apiKey = getStoredGeminiKey();
    if (!apiKey) {
      setImageError("Önce Ayarlar > API Anahtarı bölümünden Gemini anahtarını gir.");
      return;
    }
    setImageError(null);
    setImageBusy(true);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-api-key": apiKey },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) throw new Error(data.error || "Görsel üretilemedi.");
      const item = addStoredImage(trimmed, data.dataUrl);
      setStudioImages((prev) => [item, ...prev]);
      setImagePrompt("");
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setImageBusy(false);
    }
  }, [imagePrompt, imageBusy]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  // Kitaplık sayfasında çoklu seçim modu: "Seç" butonuna basılınca açılır,
  // her karta checkbox eklenir, en altta seçili sayıya göre bir toplu
  // işlem çubuğu (arşivle/sil) belirir. Sayfadan çıkınca (view değişince)
  // otomatik kapanması için ayrı bir useEffect var (aşağıda).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  // Arama boşken normal thread listesi döner (matchedMessage yok). Arama
  // varken her thread için "başlıkta mı yoksa hangi mesajda eşleşti"
  // bilgisi de taşınır — kart üzerinde o mesajın snippet'ini göstermek ve
  // tıklanınca doğrudan o mesaja scroll etmek için (bkz. threadId
  // navigasyonundaki ?highlight= parametresi).
  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLocaleLowerCase("tr");
    const active = threads.filter((t) => !t.archived);
    if (!q) return active.map((t) => ({ thread: t, matchedMessage: null as ChatMessage | null }));
    const results: { thread: Thread; matchedMessage: ChatMessage | null }[] = [];
    for (const t of active) {
      const titleMatches = t.title.toLocaleLowerCase("tr").includes(q);
      const matchedMessage =
        t.messages.find((m) => m.content.toLocaleLowerCase("tr").includes(q)) ?? null;
      if (titleMatches || matchedMessage) {
        results.push({ thread: t, matchedMessage: titleMatches ? null : matchedMessage });
      }
    }
    return results;
  }, [threads, libraryQuery]);

  // Kitaplık sayfasındaki "Sabitlenenler" bölümü için: tüm thread'lerdeki
  // sabitlenmiş mesajları, hangi thread'e ait olduklarıyla birlikte toplar.
  // En yeni sabitlenen mesaj thread'i en üstte (thread.updatedAt'a göre).
  const pinnedMessages = useMemo(() => {
    const result: { threadId: string; threadTitle: string; message: ChatMessage }[] = [];
    for (const t of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
      for (const m of t.messages) {
        if (m.pinned) result.push({ threadId: t.id, threadTitle: t.title, message: m });
      }
    }
    return result;
  }, [threads]);

  // Sohbet, modelin bağlam penceresine yaklaşabilecek kadar uzadıysa
  // (kaba bir sezgi: toplam karakter sayısı) özetleme önerisini göster.
  // Gerçek token sayımı yapmıyoruz (ekstra bir API çağrısı gerektirir);
  // karakter sayısı üzerinden kaba bir eşik yeterli bir erken uyarı verir.
  // Kullanıcı özeti reddedebilir, banner ısrarcı değildir (busy sırasında
  // da gösterilmez ki yanıt akışıyla karışmasın).
  const SUMMARIZE_SUGGEST_CHAR_THRESHOLD = 24_000;
  const shouldSuggestSummarize = useMemo(() => {
    if (busy || messages.length < 8) return false;
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return totalChars > SUMMARIZE_SUGGEST_CHAR_THRESHOLD;
  }, [messages, busy]);

  if (auth.isLoading) {
    return (
      <div className="app-gradient flex h-dvh w-full items-center justify-center">
        <ThemeApplier settings={userSettings} />
        <Loader2 className="size-6 animate-spin text-ink/40" />
      </div>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <>
        <ThemeApplier settings={userSettings} />
        <AuthGate onSignedIn={auth.setSignedIn} />
      </>
    );
  }

  if (!hasGeminiKey) {
    return (
      <>
        <ThemeApplier settings={userSettings} />
        <GeminiKeyGate onSaved={() => setHasGeminiKey(true)} />
      </>
    );
  }

  return (
    <div className="app-gradient flex h-dvh w-full overflow-hidden">
      <ThemeApplier settings={userSettings} />
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
        threads={threads.filter((t) => !t.archived)}
        activeId={threadId}
        view={view}
        onView={setView}
        onNewChat={handleNewChat}
        onDelete={(id) => {
          deleteThread(id);
          refresh();
          if (id === threadId) void navigate({ to: "/" });
        }}
        assistantName={userSettings.assistantName}
      />

      {/* Sol panelin hemen sağına bitişik, dikey "Ayarlar" tuşu. Sidebar
          kapalıyken (mobilde veya kullanıcı gizlediğinde) bu şerit de
          görünmez — o durumda Ayarlar, sohbet başlığındaki menüden veya
          Sidebar tekrar açıldığında buradan erişilir. */}
      {sidebarOpen && (
        <div className="hidden w-10 shrink-0 flex-col items-center border-r border-black/5 bg-white/40 py-4 md:flex">
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Ayarlar"
            title="Ayarlar"
            className="rounded-full p-2.5 text-ink/50 transition hover:bg-black/5 hover:text-ink"
          >
            <Settings className="size-[18px]" strokeWidth={1.8} />
          </button>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <img
          src={signatureDark}
          alt="M. Ertürk imzası"
          className="pointer-events-none fixed right-4 bottom-3 z-20 h-9 w-auto opacity-70 select-none sm:h-10"
        />
        {!sidebarOpen && (
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Paneli göster"
              className="rounded-full bg-white/70 p-2.5 text-ink shadow backdrop-blur"
            >
              <PanelLeft className="size-[18px]" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Ayarlar"
              className="rounded-full bg-white/70 p-2.5 text-ink shadow backdrop-blur"
            >
              <Settings className="size-[18px]" strokeWidth={1.8} />
            </button>
          </div>
        )}

        {view === "chat" && (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {activeProject && (
                <button
                  onClick={() => setView("projects")}
                  className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-1.5 text-[12.5px] font-medium text-ink shadow backdrop-blur transition hover:bg-white"
                >
                  <Folder className="size-3.5" strokeWidth={2} />
                  {activeProject.name}
                </button>
              )}
              <div className="nova-scroll flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-6">
                  {!startedChat ? (
                    <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                      <h1 className="text-[28px] leading-tight font-semibold text-ink sm:text-[34px]">
                        Merhaba, Nasıl Yardımcı Olabilirim?
                      </h1>
                      <p className="mt-3 max-w-md text-[15px] text-ink/60">
                        Sorunu yaz, sesle konuş ya da Live moduna geç.
                      </p>
                      {userSettings.showWelcomeCards && (
                        <div className="mt-8 grid w-full max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {WELCOME_FEATURES.map((f) => (
                            <button
                              key={f.title}
                              onClick={() => setDraft(f.prompt)}
                              className="glass-card flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center transition hover:scale-[1.03]"
                            >
                              <f.icon className="size-5 text-ink/70" strokeWidth={1.7} />
                              <span className="text-[12px] leading-tight font-medium text-ink/85">
                                {f.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={
                        userSettings.bubbleDensity === "compact" ? "space-y-3" : "space-y-7"
                      }
                    >
                      {shouldSuggestSummarize && (
                        <div className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-medium text-ink">
                              Bu sohbet oldukça uzadı
                            </p>
                            <p className="text-[12px] text-ink/55">
                              İstersen buraya kadarki konuşmayı özetleyip devam edebiliriz — bu,
                              modelin bağlamı korumasına yardımcı olur.
                            </p>
                            {summarizeError && (
                              <p className="mt-1 text-[12px] text-red-600">{summarizeError}</p>
                            )}
                          </div>
                          <button
                            onClick={() => void summarizeThread()}
                            disabled={summarizing}
                            className="shrink-0 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                          >
                            {summarizing ? "Özetleniyor…" : "Özetle ve devam et"}
                          </button>
                        </div>
                      )}
                      {messages.map((m, i) => (
                        <MessageItem
                          key={m.id}
                          message={m}
                          canRegenerate={!busy && i === messages.length - 1}
                          onRegenerate={regenerate}
                          onApproveAgentStep={approveAgentStep}
                          onSkipAgentStep={skipAgentStep}
                          onFeedback={handleFeedback}
                          onTogglePin={handleTogglePin}
                          onEditMessage={editMessage}
                          onNavigateMessageVersion={restorePreviousMessageVersion}
                          onSplitThread={splitThreadFrom}
                          onCompareResponses={setCompareFor}
                          autoSpeak={userSettings.autoSpeak}
                          {...(activeProject?.ttsVoiceOverride
                            ? { ttsVoiceOverride: activeProject.ttsVoiceOverride }
                            : {})}
                          fontSize={FONT_SIZE_PX[userSettings.fontSize]}
                        />
                      ))}
                      {busy && (
                        <ThinkingDots
                          label={messages[messages.length - 1]?.content ? "Yazıyor" : "Düşünüyor"}
                        />
                      )}
                      {error && (
                        <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-900">
                          {error}
                        </p>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-3xl px-4 pb-5">
                <Composer
                  draft={draft}
                  onDraftChange={setDraft}
                  onSend={send}
                  busy={busy}
                  onStop={() => threadId && rt.stop(threadId)}
                  onOpenLive={() => setLiveOpen(true)}
                  onOpenMedia={(mode) => setView(mode === "video" ? "videos" : "music")}
                  onOpenCanvas={() =>
                    setCanvasFiles([
                      {
                        filename: "index.html",
                        language: "html",
                        code: "<!doctype html>\n<html>\n  <body>\n    <h1>Merhaba!</h1>\n  </body>\n</html>\n",
                      },
                    ])
                  }
                />
                {!startedChat && (
                  <p className="mt-3 text-center text-[12.5px] leading-relaxed text-ink/70">
                    Sohbeti Başlatarak{" "}
                    <button
                      onClick={() => setPolicy("security")}
                      className="font-medium text-ink underline underline-offset-2"
                    >
                      Güvenlik
                    </button>{" "}
                    ve{" "}
                    <button
                      onClick={() => setPolicy("privacy")}
                      className="font-medium text-ink underline underline-offset-2"
                    >
                      Gizlilik
                    </button>{" "}
                    politikalarımızı kabul etmiş sayılırsınız.
                  </p>
                )}
              </div>
            </div>

            {canvasFiles && (
              <div className="hidden w-[46%] min-w-[320px] border-l border-black/10 lg:block">
                <CanvasPane files={canvasFiles} onClose={() => setCanvasFiles(null)} />
              </div>
            )}
          </div>
        )}

        {canvasFiles && (
          <div className="fixed inset-0 z-40 bg-white lg:hidden">
            <CanvasPane files={canvasFiles} onClose={() => setCanvasFiles(null)} />
          </div>
        )}

        {view === "library" && (
          <PaneWrap title="Kitaplık" icon={BookOpen}>
            {pinnedMessages.length > 0 && (
              <div className="mb-7">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-ink/55">
                  <Pin className="size-3.5" strokeWidth={2} />
                  Sabitlenenler
                </h3>
                <div className="space-y-2">
                  {pinnedMessages.map(({ threadId: tId, threadTitle, message: m }) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setView("chat");
                        void navigate({ to: "/c/$threadId", params: { threadId: tId } });
                      }}
                      className="glass-card block w-full rounded-2xl p-3.5 text-left transition hover:scale-[1.005]"
                    >
                      <p className="line-clamp-2 text-[13.5px] text-ink/85">{m.content}</p>
                      <p className="mt-1.5 truncate text-[11px] text-ink/45">{threadTitle}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {threads.length > 0 && (
              <div className="mb-5 flex items-center gap-2">
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Sohbetlerinde ara…"
                  className="w-full rounded-full bg-black/[0.04] px-4 py-2.5 text-[14px] text-ink placeholder:text-ink/40 focus:outline-none"
                />
                <button
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedThreadIds(new Set());
                  }}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-[13.5px] font-medium transition ${
                    selectMode ? "bg-ink text-white" : "bg-black/[0.04] text-ink/70 hover:bg-black/[0.07]"
                  }`}
                >
                  {selectMode ? "Vazgeç" : "Seç"}
                </button>
              </div>
            )}
            {threads.length === 0 ? (
              <Empty text="Kitaplığında henüz sohbet yok." />
            ) : filteredLibrary.length === 0 ? (
              <Empty text={`"${libraryQuery}" için sonuç bulunamadı.`} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredLibrary.map(({ thread: t, matchedMessage }) => (
                  <div
                    key={t.id}
                    className={`glass-card rounded-3xl p-4 text-left transition hover:scale-[1.01] ${
                      selectMode && selectedThreadIds.has(t.id) ? "ring-2 ring-ink/40" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (selectMode) {
                          setSelectedThreadIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          });
                          return;
                        }
                        setView("chat");
                        void navigate({ to: "/c/$threadId", params: { threadId: t.id } });
                      }}
                      className="block w-full text-left"
                    >
                      <span className="flex items-start gap-2.5">
                        {selectMode && (
                          <span
                            className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition ${
                              selectedThreadIds.has(t.id)
                                ? "border-ink bg-ink text-white"
                                : "border-black/20"
                            }`}
                            aria-hidden="true"
                          >
                            {selectedThreadIds.has(t.id) && <Check className="size-3" strokeWidth={3} />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-ink">{t.title}</p>
                          {matchedMessage ? (
                            <>
                              <p className="mt-1 line-clamp-2 text-[13px] text-ink/60">
                                {snippetAround(matchedMessage.content, libraryQuery)}
                              </p>
                              <p className="mt-1.5 text-[10.5px] font-medium text-ink/40">
                                {matchedMessage.role === "user" ? "Senin mesajında" : "Yanıtta"} eşleşti
                              </p>
                            </>
                          ) : (
                            <p className="mt-1 line-clamp-2 text-[13px] text-ink/60">
                              {t.messages[t.messages.length - 1]?.content.slice(0, 140)}
                            </p>
                          )}
                          <p className="mt-2 text-[11px] text-ink/45">
                            {new Date(t.updatedAt).toLocaleString("tr-TR")}
                          </p>
                        </span>
                      </span>
                    </button>

                    {/* Etiketler: mevcutlar rozet olarak gösterilir (× ile
                        kaldırılabilir), altında "+ etiket" ile yeni etiket
                        eklenebilir. Kartın kendi onClick'iyle çakışmasın diye
                        her etkileşim stopPropagation ile durdurulur. */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {(t.tags ?? []).map((tag) => {
                        const c = colorForTag(tag);
                        return (
                          <span
                            key={tag}
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}
                          >
                            {tag}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = (t.tags ?? []).filter((x) => x !== tag);
                                setThreadTags(t.id, next);
                                refresh();
                              }}
                              aria-label={`"${tag}" etiketini kaldır`}
                              className="rounded-full hover:opacity-70"
                            >
                              <X className="size-3" strokeWidth={2.5} />
                            </button>
                          </span>
                        );
                      })}
                      {editingTagsFor === t.id ? (
                        <input
                          autoFocus
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              const tag = normalizeTag(newTagInput);
                              if (tag && !(t.tags ?? []).includes(tag)) {
                                setThreadTags(t.id, [...(t.tags ?? []), tag]);
                                refresh();
                              }
                              setNewTagInput("");
                              setEditingTagsFor(null);
                            } else if (e.key === "Escape") {
                              setNewTagInput("");
                              setEditingTagsFor(null);
                            }
                          }}
                          onBlur={() => {
                            const tag = normalizeTag(newTagInput);
                            if (tag && !(t.tags ?? []).includes(tag)) {
                              setThreadTags(t.id, [...(t.tags ?? []), tag]);
                              refresh();
                            }
                            setNewTagInput("");
                            setEditingTagsFor(null);
                          }}
                          placeholder="Etiket adı…"
                          className="w-24 rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[11px] text-ink placeholder:text-ink/40 focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTagsFor(t.id);
                          }}
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink/40 hover:bg-black/[0.04] hover:text-ink/70"
                        >
                          + etiket
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PaneWrap>
        )}

        {view === "images" && (
          <PaneWrap
            title="Görseller"
            wide
            subtitle={
              myImages.length > 0 || studioImages.length > 0
                ? "Sohbetlerinde ve burada ürettiğin görseller birlikte listelenir."
                : "Henüz görsel üretmedin — aşağıdan bir prompt yaz ya da örneklerden ilham al."
            }
          >
            <div className="mb-8 rounded-3xl border border-black/5 bg-black/[0.015] p-4">
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Örn: Dağların üzerinde gün batımı, sinematik ışıklandırma…"
                rows={3}
                disabled={imageBusy}
                className="w-full resize-none bg-transparent text-[14.5px] text-ink placeholder:text-ink/35 focus:outline-none disabled:opacity-60"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[12px] text-ink/40">Üretim birkaç saniye sürer.</p>
                <button
                  onClick={() => void handleGenerateImage()}
                  disabled={imageBusy || !imagePrompt.trim()}
                  className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {imageBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Üretiliyor…
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-4" /> Üret
                    </>
                  )}
                </button>
              </div>
              {imageError && <p className="mt-2 text-[12.5px] text-red-600">{imageError}</p>}
            </div>

            {(myImages.length > 0 || studioImages.length > 0) && (
              <>
                <p className="mb-3 text-[13px] font-medium tracking-wide text-ink/50 uppercase">
                  Senin görsellerin
                </p>
                <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {studioImages.map((img) => (
                    <div
                      key={img.id}
                      className="group relative overflow-hidden rounded-3xl bg-black/10 shadow-lg"
                    >
                      <img
                        src={img.dataUrl}
                        alt={img.prompt}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="flex items-start justify-between gap-2 px-4 py-3">
                        <p className="line-clamp-1 text-[14px] font-medium text-ink">
                          {img.prompt}
                        </p>
                        <button
                          onClick={() => {
                            deleteStoredImage(img.id);
                            setStudioImages((prev) => prev.filter((i) => i.id !== img.id));
                          }}
                          aria-label="Sil"
                          className="shrink-0 rounded-full p-1.5 text-ink/40 opacity-0 transition hover:bg-black/5 hover:text-red-600 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {myImages.map((img, i) => (
                    <button
                      key={img.url + i}
                      onClick={() => {
                        setView("chat");
                        void navigate({ to: "/c/$threadId", params: { threadId: img.threadId } });
                      }}
                      className="group overflow-hidden rounded-3xl bg-black/10 text-left shadow-lg transition hover:-translate-y-0.5"
                    >
                      <img
                        src={img.url}
                        alt={img.alt || "Üretilen görsel"}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {img.alt && (
                        <p className="line-clamp-1 px-4 py-3 text-[14px] font-medium text-ink">
                          {img.alt}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="mb-3 text-[13px] font-medium tracking-wide text-ink/50 uppercase">
              İlham al
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {GALLERY.map((item) => (
                <button
                  key={item.title}
                  onClick={() => {
                    setDraft(item.prompt);
                    setView("chat");
                  }}
                  className="group overflow-hidden rounded-3xl bg-black/10 text-left shadow-lg transition hover:-translate-y-0.5"
                >
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <p className="px-4 py-3 text-[14px] font-medium text-ink">{item.title}</p>
                </button>
              ))}
            </div>
          </PaneWrap>
        )}

        {view === "videos" && <MediaStudioPane mode="video" />}

        {view === "music" && <MediaStudioPane mode="music" />}

        {view === "projects" && (
          <ProjectsPane
            initialOpenId={sharedProjectId}
            onOpenChat={(id) => {
              setView("chat");
              void navigate({ to: "/c/$threadId", params: { threadId: id } });
            }}
            onNewChatInProject={startInProject}
          />
        )}
      </main>

      {/* Kitaplık'ta çoklu seçim modu açıkken görünen sabit toplu işlem
          çubuğu (bkz. Madde 21 — Toplu işlemler). Seçili öğe yoksa
          gösterilmez; "Sil" için kısa bir onay adımı var (diğer kalıcı
          silme eylemleriyle tutarlı). */}
      {view === "library" && selectMode && selectedThreadIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-white shadow-2xl">
            <span className="text-[13.5px] font-medium">
              {selectedThreadIds.size} sohbet seçildi
            </span>
            <button
              onClick={() => {
                setThreadsArchived([...selectedThreadIds], true);
                setSelectedThreadIds(new Set());
                setSelectMode(false);
                refresh();
              }}
              className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium transition hover:bg-white/25"
            >
              Arşivle
            </button>
            {confirmingBulkDelete ? (
              <button
                onClick={() => {
                  deleteThreads([...selectedThreadIds]);
                  setSelectedThreadIds(new Set());
                  setSelectMode(false);
                  setConfirmingBulkDelete(false);
                  refresh();
                }}
                className="rounded-full bg-red-500 px-3.5 py-1.5 text-[13px] font-medium transition hover:bg-red-600"
              >
                Emin misin? Tekrar tıkla
              </button>
            ) : (
              <button
                onClick={() => setConfirmingBulkDelete(true)}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Sil
              </button>
            )}
          </div>
        </div>
      )}

      {liveOpen && (
        <LiveOverlay
          onClose={() => setLiveOpen(false)}
          history={messages.map((m) => ({ role: m.role, content: m.content }))}
          onExchange={appendExchange}
          assistantName={userSettings.assistantName}
        />
      )}

      {policy && <PolicyMenu initial={policy} onClose={() => setPolicy(null)} />}
      {shortcutsHelpOpen && <ShortcutsHelp onClose={() => setShortcutsHelpOpen(false)} />}
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          threads={threads}
          onNewChat={handleNewChat}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenThread={(id) => {
            setView("chat");
            void navigate({ to: "/c/$threadId", params: { threadId: id } });
          }}
          onView={setView}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} settingsCtx={settingsCtx} />
      )}
      {compareFor &&
        (() => {
          const idx = messages.findIndex((m) => m.id === compareFor);
          if (idx === -1) return null;
          const target = messages[idx]!;
          return (
            <CompareModal
              onClose={() => setCompareFor(null)}
              prompt={target.content}
              history={messages.slice(0, idx)}
              onUseVariant={(text) => handleCompareUseVariant(compareFor, text)}
            />
          );
        })()}
    </div>
  );
}

function PaneWrap({
  title,
  subtitle,
  icon: Icon = ShieldCheck,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  /** Görseller gibi geniş kart galerilerinde daha ferah bir düzen için
   * içerik genişliğini max-w-4xl yerine max-w-5xl yapar. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className={`mx-auto w-full px-5 pt-16 pb-10 ${wide ? "max-w-5xl" : "max-w-4xl"}`}>
        <div className="mb-5 flex items-center gap-2">
          <Icon className="size-5 text-ink" strokeWidth={1.8} />
          <h1 className="text-[22px] font-semibold text-ink">{title}</h1>
        </div>
        {subtitle && <p className="mb-4 text-[14px] text-ink/65">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-3xl bg-white/40 px-5 py-8 text-center text-[14px] text-ink/60">{text}</p>
  );
}
