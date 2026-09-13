import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  SquarePen,
  Search,
  PanelLeft,
  BookOpen,
  Images,
  Clapperboard,
  Music2,
  FolderClosed,
  Trash2,
  MessageSquare,
  Check,
} from "lucide-react";
import type { Thread } from "@/lib/chat-store";
import { colorForTag } from "@/lib/tags";
import { ProfileSwitcher } from "./ProfileSwitcher";
import signatureLight from "@/assets/signature-light.png";

export type PaneView = "chat" | "library" | "images" | "videos" | "music" | "projects";

export function Sidebar({
  open,
  onToggle,
  threads,
  activeId,
  view,
  onView,
  onNewChat,
  onDelete,
  assistantName,
}: {
  open: boolean;
  onToggle: () => void;
  threads: Thread[];
  activeId?: string | undefined;
  view: PaneView;
  onView: (v: PaneView) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  /** Ayarlar > Model bölümünden kullanıcının verdiği asistan ismi (bkz.
   * settings-store.ts assistantName, varsayılan "Nova"). Ürün/marka ön eki
   * ("MelihBot") burada sabit kalır — değişen yalnızca kısa isim. */
  assistantName: string;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  // Yanlışlıkla kalıcı silmeyi önlemek için: ilk tıklama "onaylıyor musun?"
  // durumuna geçer, ikinci tıklama (aynı sohbette) gerçekten siler. Başka
  // bir yere tıklanırsa veya birkaç saniye geçerse otomatik iptal olur —
  // uygulamanın diğer yerlerindeki (proje/hesap silme) "Evet, sil / Vazgeç"
  // deseniyle aynı güvenlik seviyesini, ekstra bir modal açmadan sağlar.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const requestDelete = (id: string) => {
    if (confirmingDeleteId === id) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingDeleteId(null);
      onDelete(id);
      return;
    }
    setConfirmingDeleteId(id);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmingDeleteId(null), 3000);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLocaleLowerCase("tr").includes(q) ||
        t.messages.some((m) => m.content.toLocaleLowerCase("tr").includes(q)),
    );
  }, [threads, query]);

  const navItems: { key: PaneView; label: string; icon: React.ElementType }[] = [
    { key: "library", label: "Kitaplık", icon: BookOpen },
    { key: "images", label: "Görseller", icon: Images },
    { key: "videos", label: "Videolar", icon: Clapperboard },
    { key: "music", label: "Müzikler", icon: Music2 },
    { key: "projects", label: "Projeler", icon: FolderClosed },
  ];

  return (
    <aside
      className={`z-40 flex h-full shrink-0 flex-col text-white transition-[width] duration-300 max-md:fixed max-md:inset-y-0 max-md:left-0 ${
        open ? "w-[272px]" : "w-0 overflow-hidden"
      }`}
      style={{ backgroundColor: "var(--nova-sidebar, #000)" }}
    >
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <div className="flex min-w-0 items-center gap-2 pl-2">
          {/* Asistan avatarı: kullanıcının Arayüz > Buton Rengi'nden seçtiği
              vurgu rengiyle (--ink CSS değişkeni, bkz. theme-applier.tsx)
              boyanan, asistanın adının ilk harfini gösteren basit bir
              rozet. Ekstra bir ayar alanı gerektirmeden mevcut tema
              tercihiyle tutarlı kalır. */}
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            style={{ backgroundColor: "var(--ink, #1c2c4a)" }}
            aria-hidden="true"
          >
            {(assistantName.trim().charAt(0) || "N").toUpperCase()}
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight">
            MelihBot {assistantName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearching((s) => !s)}
            aria-label="Sohbetlerde ara"
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Search className="size-[18px]" strokeWidth={1.8} />
          </button>
          <button
            onClick={onToggle}
            aria-label="Paneli gizle"
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <PanelLeft className="size-[18px]" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {searching && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sohbetlerde ara"
            className="w-full rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      )}

      <div className="px-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-full bg-white px-4 py-3 text-[15px] font-medium text-black transition hover:bg-white/90"
        >
          <SquarePen className="size-[18px]" strokeWidth={1.8} /> Yeni Sohbet
        </button>
      </div>

      <nav className="mt-3 space-y-0.5 px-3">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onView(item.key)}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] transition ${
              view === item.key ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10"
            }`}
          >
            <item.icon className="size-[18px]" strokeWidth={1.8} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="nova-scroll mt-4 flex-1 overflow-y-auto px-3 pb-6">
        <p className="px-4 pb-1.5 text-xs font-medium text-white/40">Son zamanlar</p>
        {filtered.length === 0 && (
          <p className="px-4 py-2 text-[13px] text-white/35">Henüz sohbet yok.</p>
        )}
        {filtered.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-1 rounded-2xl pr-1 transition ${
              activeId === t.id ? "bg-white/15" : "hover:bg-white/10"
            }`}
          >
            <Link
              to="/c/$threadId"
              params={{ threadId: t.id }}
              onClick={() => onView("chat")}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 text-[14.5px] text-white/85"
            >
              <MessageSquare className="size-4 shrink-0 opacity-60" strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.tags && t.tags.length > 0 && (
                <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                  {t.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className={`size-1.5 rounded-full ${colorForTag(tag).dot}`}
                      title={tag}
                    />
                  ))}
                </span>
              )}
            </Link>
            <button
              onClick={() => requestDelete(t.id)}
              aria-label={confirmingDeleteId === t.id ? "Silmeyi onayla" : "Sohbeti sil"}
              title={confirmingDeleteId === t.id ? "Silmek için tekrar tıkla" : "Sohbeti sil"}
              className={`rounded-full p-2 transition ${
                confirmingDeleteId === t.id
                  ? "bg-red-500 text-white opacity-100"
                  : "text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
              }`}
            >
              {confirmingDeleteId === t.id ? (
                <Check className="size-4" strokeWidth={2} />
              ) : (
                <Trash2 className="size-4" strokeWidth={1.7} />
              )}
            </button>
          </div>
        ))}
      </div>

      <ProfileSwitcher />
      <div className="border-t border-white/10 px-5 py-3">
        <img src={signatureLight} alt="M. Ertürk imzası" className="h-8 w-auto opacity-80" />
        <p className="mt-1 text-[10.5px] leading-relaxed text-white/35">MelihBot {assistantName}</p>
      </div>
    </aside>
  );
}
