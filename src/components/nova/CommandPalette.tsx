import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  SquarePen,
  Settings,
  BookOpen,
  ImageIcon,
  Clapperboard,
  Music2,
  Folder,
  MessageSquare,
  PanelLeft,
} from "lucide-react";
import type { Thread } from "@/lib/chat-store";
import type { PaneView } from "./Sidebar";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  action: () => void;
};

/**
 * Cmd/Ctrl+K ile açılan komut paleti. Sabit eylemler (yeni sohbet, ayarlar,
 * sayfalar arası geçiş) + yazıldıkça filtrelenen sohbet başlıkları aynı
 * listede birleşir — kullanıcı ne aradığını düşünmeden yazmaya başlar,
 * sonuçlar kendiliğinden ayrışır (klasik "command palette" deseni:
 * VS Code, Linear, Raycast).
 */
export function CommandPalette({
  onClose,
  threads,
  onNewChat,
  onOpenSettings,
  onOpenThread,
  onView,
  onToggleSidebar,
}: {
  onClose: () => void;
  threads: Thread[];
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenThread: (id: string) => void;
  onView: (v: PaneView) => void;
  onToggleSidebar: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const staticCommands: Command[] = useMemo(
    () => [
      { id: "new-chat", label: "Yeni sohbet", icon: SquarePen, action: onNewChat },
      {
        id: "toggle-sidebar",
        label: "Kenar çubuğunu aç/kapat",
        icon: PanelLeft,
        action: onToggleSidebar,
      },
      { id: "settings", label: "Ayarları aç", icon: Settings, action: onOpenSettings },
      { id: "library", label: "Kitaplığa git", icon: BookOpen, action: () => onView("library") },
      { id: "images", label: "Görsellere git", icon: ImageIcon, action: () => onView("images") },
      { id: "videos", label: "Videolara git", icon: Clapperboard, action: () => onView("videos") },
      { id: "music", label: "Müziklere git", icon: Music2, action: () => onView("music") },
      { id: "projects", label: "Projelere git", icon: Folder, action: () => onView("projects") },
    ],
    [onNewChat, onOpenSettings, onView, onToggleSidebar],
  );

  const threadCommands: Command[] = useMemo(
    () =>
      threads
        .filter((t) => !t.archived)
        .slice(0, 200) // makul bir üst sınır — binlerce thread'de arama gecikmesin
        .map((t) => ({
          id: `thread:${t.id}`,
          label: t.title,
          hint: "Sohbet",
          icon: MessageSquare,
          action: () => onOpenThread(t.id),
        })),
    [threads, onOpenThread],
  );

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return staticCommands;
    const all = [...staticCommands, ...threadCommands];
    return all.filter((c) => c.label.toLocaleLowerCase("tr").includes(q));
  }, [query, staticCommands, threadCommands]);

  useEffect(() => setActiveIndex(0), [query]);

  const runActive = () => {
    const cmd = results[activeIndex];
    if (!cmd) return;
    cmd.action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise w-full max-w-lg overflow-hidden rounded-[24px] bg-white text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-black/5 px-4 py-3">
          <Search className="size-4 shrink-0 text-ink/40" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runActive();
              }
            }}
            placeholder="Bir eylem ara veya sohbetlerinde ara…"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-ink/35 focus:outline-none"
          />
        </div>
        <div className="nova-scroll max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink/40">Sonuç bulunamadı.</p>
          ) : (
            results.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${
                  i === activeIndex ? "bg-black/[0.06]" : ""
                }`}
              >
                <cmd.icon className="size-4 shrink-0 text-ink/60" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                {cmd.hint && (
                  <span className="shrink-0 text-[11px] text-ink/35">{cmd.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
