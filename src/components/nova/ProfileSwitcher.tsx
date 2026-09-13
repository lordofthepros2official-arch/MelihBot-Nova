import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Plus, UserRound } from "lucide-react";
import { listProfiles, createProfile, getActiveProfileId, setActiveProfileId } from "@/lib/profiles";

/**
 * Sidebar'ın altında gösterilen kompakt profil değiştirici (Madde 12 —
 * Çoklu profil desteği). Profil değişimi, o profile ait TÜM veriyi
 * (sohbetler, projeler, ayarlar, medya — bkz. current-user.ts
 * namespacedKey) değiştirdiği için, React state'lerinin tutarlı bir
 * şekilde sıfırlanmasını garanti etmek adına basitçe sayfayı yeniden
 * yükler — tek tek her store'un kendi dinleyicisine güvenmek yerine bu,
 * daha az zarif ama çok daha güvenilir bir yaklaşımdır.
 */
export function ProfileSwitcher() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(listProfiles);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const activeId = getActiveProfileId();
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]!;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = (id: string) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setActiveProfileId(id);
    window.location.reload();
  };

  return (
    <div ref={rootRef} className="relative border-t border-white/10 px-5 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-white/5"
      >
        <UserRound className="size-3.5 shrink-0 text-white/45" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/60">
          {active.name}
        </span>
        <ChevronUp
          className={`size-3.5 shrink-0 text-white/40 transition-transform ${open ? "" : "rotate-180"}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-3 z-10 mb-1 w-56 overflow-hidden rounded-2xl bg-[#1a1a1a] py-1.5 shadow-2xl ring-1 ring-white/10">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => switchTo(p.id)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-white/85 transition hover:bg-white/10"
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {p.id === activeId && <Check className="size-3.5" strokeWidth={2.5} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))}
          <div className="mx-3.5 my-1 h-px bg-white/10" />
          {creating ? (
            <div className="px-3.5 py-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const p = createProfile(newName);
                    if (p) {
                      setProfiles(listProfiles());
                      setNewName("");
                      setCreating(false);
                      switchTo(p.id);
                    }
                  } else if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Profil adı…"
                className="w-full rounded-lg bg-white/10 px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-white/35 focus:outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              disabled={profiles.length >= 8}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <Plus className="size-4 shrink-0" strokeWidth={1.8} />
              Yeni profil
            </button>
          )}
        </div>
      )}
    </div>
  );
}
