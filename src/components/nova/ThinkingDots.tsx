import { Loader2 } from "lucide-react";

export function ThinkingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-ink/70">
      <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      <span className="text-sm">{label}</span>
      <span className="dots-anim text-sm tracking-[0.2em]">…</span>
    </div>
  );
}
