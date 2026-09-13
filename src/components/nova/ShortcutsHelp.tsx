import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import {
  DEFAULT_SHORTCUTS,
  getStoredShortcuts,
  comboToDisplay,
  type ShortcutAction,
} from "@/lib/keyboard-shortcuts";

/**
 * "?" tuşuyla açılan hızlı klavye kısayolları listesi (GitHub/Slack/Linear
 * deseni). Ayarlar > Klavye'deki kayıtlı kombinasyonları canlı okur — burada
 * gösterilen tuşlar her zaman kullanıcının GÜNCEL atamalarıyla eşleşir,
 * DEFAULT_SHORTCUTS ile değil (kullanıcı bir kısayolu değiştirmişse burada
 * da yeni ataması görünür).
 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const bindings = getStoredShortcuts();
  const actions = Object.entries(DEFAULT_SHORTCUTS) as [ShortcutAction, typeof DEFAULT_SHORTCUTS[ShortcutAction]][];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise w-full max-w-sm rounded-[28px] bg-white p-5 text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Klavye kısayolları"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Keyboard className="size-4" strokeWidth={1.8} />
            Klavye kısayolları
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-black/5"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="space-y-1.5">
          {actions.map(([action, def]) => (
            <li
              key={action}
              className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-[13.5px] odd:bg-black/[0.02]"
            >
              <span className="text-ink/75">{def.label}</span>
              <kbd className="shrink-0 rounded-md bg-black/[0.06] px-2 py-0.5 font-mono text-[12px] text-ink/70">
                {comboToDisplay(bindings[action])}
              </kbd>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-[13.5px] odd:bg-black/[0.02]">
            <span className="text-ink/75">Bu listeyi aç/kapat</span>
            <kbd className="shrink-0 rounded-md bg-black/[0.06] px-2 py-0.5 font-mono text-[12px] text-ink/70">
              ?
            </kbd>
          </li>
        </ul>
        <p className="mt-3 text-[11.5px] text-ink/40">
          Kısayolları Ayarlar → Klavye'den değiştirebilirsin.
        </p>
      </div>
    </div>
  );
}
