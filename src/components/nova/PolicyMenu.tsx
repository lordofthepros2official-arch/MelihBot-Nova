import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ShieldCheck, Lock, ScrollText, HelpCircle, ChevronLeft, X } from "lucide-react";
import { PRIVACY_POLICY, SECURITY_POLICY, TERMS_OF_USE, USER_GUIDE } from "@/lib/policies";
import signatureDark from "@/assets/signature-dark.png";

type View = "menu" | "security" | "privacy" | "terms" | "guide";

const TITLES: Record<Exclude<View, "menu">, string> = {
  security: "Güvenlik",
  privacy: "Gizlilik",
  terms: "Kullanım Koşulları",
  guide: "Kullanım Kılavuzu",
};

const CONTENT: Record<Exclude<View, "menu">, string> = {
  security: SECURITY_POLICY,
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
  guide: USER_GUIDE,
};

export function PolicyMenu({ initial, onClose }: { initial: View; onClose: () => void }) {
  const [view, setView] = useState<View>(initial);

  // Erişilebilirlik / standart modal davranışı: Esc tuşu her zaman
  // modalı doğrudan kapatmalı — tarayıcıdaki/işletim sistemindeki her
  // modal, dialog ve sheet'in kullanıcı beklentisi budur. Esc'nin önce
  // "Geri" gibi davranıp alt sayfadan menüye dönmesi (bir önceki
  // sürümde denenmişti) QA testinde tutarsız/şaşırtıcı bulundu, çünkü
  // kullanıcı Esc'ye bastığında pencerenin tamamen kapanmasını bekler.
  // Alt sayfadan menüye dönmek istiyorsa zaten üstteki "Geri" (ChevronLeft)
  // butonu bunun için var.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div
        className="animate-rise flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] bg-white text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 border-b border-black/5 px-5 py-4">
          {view !== "menu" && (
            <button
              onClick={() => setView("menu")}
              className="rounded-full p-1.5 hover:bg-black/5"
              aria-label="Geri"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <h2 className="flex-1 text-center text-[15px] font-semibold">
            {view === "menu" ? "Politikalar" : TITLES[view]}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-black/5"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        {view === "menu" ? (
          <div className="space-y-2 p-4">
            <button
              onClick={() => setView("guide")}
              className="flex w-full items-center gap-3 rounded-full bg-black/[0.04] px-5 py-4 text-left text-[15px] font-medium transition hover:bg-black/[0.08]"
            >
              <HelpCircle className="size-5" /> Kullanım Kılavuzu
            </button>
            <button
              onClick={() => setView("security")}
              className="flex w-full items-center gap-3 rounded-full bg-black/[0.04] px-5 py-4 text-left text-[15px] font-medium transition hover:bg-black/[0.08]"
            >
              <ShieldCheck className="size-5" /> Güvenlik Politikası
            </button>
            <button
              onClick={() => setView("privacy")}
              className="flex w-full items-center gap-3 rounded-full bg-black/[0.04] px-5 py-4 text-left text-[15px] font-medium transition hover:bg-black/[0.08]"
            >
              <Lock className="size-5" /> Gizlilik Politikası
            </button>
            <button
              onClick={() => setView("terms")}
              className="flex w-full items-center gap-3 rounded-full bg-black/[0.04] px-5 py-4 text-left text-[15px] font-medium transition hover:bg-black/[0.08]"
            >
              <ScrollText className="size-5" /> Kullanım Koşulları
            </button>
          </div>
        ) : (
          <div className="nova-scroll prose-nova overflow-y-auto px-6 py-5 text-[14.5px]">
            <ReactMarkdown>{CONTENT[view]}</ReactMarkdown>
            {(view === "security" || view === "privacy") && (
              <img src={signatureDark} alt="M. Ertürk imzası" className="-mt-4 mb-2 h-14 w-auto" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type PolicyView = View;
