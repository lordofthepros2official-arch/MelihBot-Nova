/* eslint-disable react-refresh/only-export-components -- bu dosya bileşenin yanında yardımcı fonksiyon/sabit de export eder, bu shadcn/ui bileşenleri için standart bir kalıptır ve fast-refresh dışında bir etkisi yoktur. */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Download, Copy, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/notifications";

export type CanvasFile = { filename: string; language: string; code: string };

/** Asistan yanıtındaki markdown kod bloklarından dosyaları çıkarır. */
export function extractCodeBlocks(markdown: string): CanvasFile[] {
  const re = /```(\w+)?(?:\s+filename=([^\s`]+))?\n([\s\S]*?)```/g;
  const blocks: CanvasFile[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const language = (m[1] ?? "text").toLowerCase();
    const filename = m[2] ?? guessFilename(language, blocks.length);
    const code = m[3] ?? "";
    if (code.trim()) blocks.push({ filename, language, code });
  }
  return blocks;
}

function guessFilename(language: string, index: number): string {
  const ext: Record<string, string> = {
    html: "index.html",
    javascript: "script.js",
    js: "script.js",
    jsx: "App.jsx",
    tsx: "App.tsx",
    typescript: "script.ts",
    ts: "script.ts",
    css: "style.css",
    python: "script.py",
    py: "script.py",
    json: "data.json",
  };
  return ext[language] ?? `dosya-${index + 1}.txt`;
}

/** Bu diller tarayıcıda gerçekten çalıştırılıp canlı önizlenebilir (iframe sandbox). */
const RUNNABLE = new Set(["html", "javascript", "js", "jsx", "tsx", "typescript", "ts"]);

// Template literal içine gömülen <script> bloklarının, aradaki kodda geçebilecek
// bir "</script>" alt-dizisi yüzünden erken kapanmasını önlemek için kullanılır.
// String birleştirmesi, kaynak kodda literal "</script>" dizisinin hiç
// görünmemesini sağlar — kaçış karakterine (\/) ihtiyaç kalmaz.
const CLOSE_SCRIPT = "<" + "/script>";

function buildPreviewHtml(files: CanvasFile[], runId: number): string {
  const htmlFile = files.find((f) => f.language === "html");
  const cssFiles = files.filter((f) => f.language === "css");
  const jsFiles = files.filter((f) => ["javascript", "js"].includes(f.language));
  const reactFiles = files.filter((f) => ["jsx", "tsx", "typescript", "ts"].includes(f.language));

  const errorReporter = `
    const __send = (line, isError) => parent.postMessage({ __nova: "canvas", runId: ${runId}, line, isError: !!isError }, "*");
    window.onerror = (m) => { __send(String(m), true); return true; };
    window.addEventListener("unhandledrejection", (e) => __send("Hata: " + (e.reason?.message || e.reason), true));
    console.error = (...a) => __send(a.map(String).join(" "), true);
  `;

  if (htmlFile) {
    // Kullanıcının/modelin verdiği tam HTML'i kullan, hata yakalayıcıyı head'e enjekte et.
    const withReporter = htmlFile.code.includes("<head>")
      ? htmlFile.code.replace("<head>", `<head><script>${errorReporter}${CLOSE_SCRIPT}`)
      : `<script>${errorReporter}${CLOSE_SCRIPT}` + htmlFile.code;
    return withReporter;
  }

  if (reactFiles.length > 0) {
    const componentCode = reactFiles[0]?.code ?? "";
    return `<!doctype html><html><head>
      <script>${errorReporter}${CLOSE_SCRIPT}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js">${CLOSE_SCRIPT}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js">${CLOSE_SCRIPT}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js">${CLOSE_SCRIPT}
      <script src="https://cdn.tailwindcss.com">${CLOSE_SCRIPT}
      <style>${cssFiles.map((f) => f.code).join("\n")}</style>
      </head><body>
      <div id="root"></div>
      <script type="text/babel" data-presets="react,typescript">
        ${componentCode}
        const __root = ReactDOM.createRoot(document.getElementById("root"));
        try {
          const Comp = typeof App !== "undefined" ? App : (typeof default1 !== "undefined" ? default1 : null);
          if (Comp) __root.render(React.createElement(Comp));
          else __send("Bileşen bulunamadı: kodun 'App' adlı bir bileşen içermesi gerekir.", true);
        } catch (e) { __send("Render hatası: " + e.message, true); }
      ${CLOSE_SCRIPT}
      </body></html>`;
  }

  // Sadece JS varsa: konsol çıktısı gösteren minimal sayfa.
  const jsCode = jsFiles.map((f) => f.code).join("\n\n");
  return `<!doctype html><html><body><script>
    ${errorReporter}
    const fmt = (a) => a.map((v) => { try { return typeof v === "string" ? v : JSON.stringify(v); } catch { return String(v); } }).join(" ");
    console.log = (...a) => __send(fmt(a), false);
    console.warn = (...a) => __send("Uyarı: " + fmt(a), false);
    (async () => {
      try { await (0, eval)(${JSON.stringify(jsCode)}); }
      catch (e) { __send("Hata: " + (e && e.message ? e.message : e), true); }
    })();
  ${CLOSE_SCRIPT}</body></html>`;
}

/**
 * Sağ panelde açılan canlı kod önizleyicisi. Model bir yanıtta kod bloğu
 * ürettiğinde otomatik açılır (bkz. ChatShell). HTML/CSS/JS/React kodu,
 * tarayıcının kendi iframe sandbox'ında (network/dosya erişimi olmadan)
 * gerçekten çalıştırılıp canlı gösterilir. npm paketi kurmaz — bu ortamda
 * gerçek bir sunucu taraflı sandbox (Docker vb.) mevcut değildir.
 */
export function CanvasPane({ files, onClose }: { files: CanvasFile[]; onClose: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [logs, setLogs] = useState<{ line: string; isError: boolean }[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const runIdRef = useRef(0);

  const active = files[activeIdx] ?? files[0];
  const canRun = active ? RUNNABLE.has(active.language) : false;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { __nova?: string; runId?: number; line?: string; isError?: boolean };
      if (data?.__nova !== "canvas" || data.runId !== runIdRef.current) return;
      setLogs((l) => [...l, { line: data.line ?? "", isError: !!data.isError }]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const run = useMemo(
    () => () => {
      if (!canRun) return;
      const runId = ++runIdRef.current;
      setLogs([]);
      setRunning(true);
      const html = buildPreviewHtml(files, runId);
      const frame = frameRef.current;
      if (frame) frame.srcdoc = html;
      setTimeout(() => {
        setRunning(false);
        // Sekme arka plandaysa (kullanıcı başka bir yerdeyse) "code"
        // kategorisiyle bildirir; Ayarlar > Bildirimler'den kapatılabilir
        // (bkz. notify — sekme görünürken zaten hiçbir şey yapmaz).
        notify("code", "Kod çalıştırıldı", active?.filename);
      }, 600);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, canRun],
  );

  useEffect(() => {
    if (canRun) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const copy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* pano izni yok */
    }
  };

  const download = () => {
    if (!active) return;
    const blob = new Blob([active.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = active.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = logs.filter((l) => l.isError).length;

  if (!active) return null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-black/10 bg-white/70 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2.5">
        <span className="text-[14px] font-semibold text-ink">Canvas</span>
        {files.length > 1 && (
          <div className="ml-2 flex gap-1 overflow-x-auto">
            {files.map((f, i) => (
              <button
                key={f.filename + i}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
                  i === activeIdx ? "bg-ink text-white" : "bg-black/5 text-ink/60"
                }`}
              >
                {f.filename}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {canRun && (
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            {running ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {running ? "Çalışıyor…" : "Yeniden Çalıştır"}
          </button>
        )}
        <button
          onClick={() => void copy()}
          aria-label="Kopyala"
          className="rounded-full p-2 text-ink/70 hover:bg-black/5"
        >
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </button>
        <button
          onClick={download}
          aria-label="İndir"
          className="rounded-full p-2 text-ink/70 hover:bg-black/5"
        >
          <Download className="size-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="Canvas'ı kapat"
          className="rounded-full p-2 text-ink/70 hover:bg-black/5"
        >
          <X className="size-4" />
        </button>
      </div>

      {canRun ? (
        <>
          <div className="min-h-0 flex-[3]">
            <iframe
              ref={frameRef}
              sandbox="allow-scripts"
              title="canvas-preview"
              className="size-full bg-white"
            />
          </div>
          <div className="nova-scroll max-h-40 flex-1 overflow-y-auto border-t border-black/10 bg-black/[0.03] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <p className="text-[11px] font-semibold tracking-wide text-ink/45 uppercase">
                Konsol
              </p>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-600">
                  <AlertTriangle className="size-3" /> {errorCount} hata
                </span>
              )}
            </div>
            {logs.length === 0 ? (
              <p className="text-[12.5px] text-ink/45">Henüz çıktı yok.</p>
            ) : (
              logs.map((l, i) => (
                <pre
                  key={i}
                  className={`font-mono text-[12.5px] whitespace-pre-wrap ${l.isError ? "text-red-600" : "text-ink/85"}`}
                >
                  {l.line}
                </pre>
              ))
            )}
          </div>
        </>
      ) : (
        <pre className="nova-scroll flex-1 overflow-auto p-4 font-mono text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">
          {active.code}
        </pre>
      )}
    </aside>
  );
}
