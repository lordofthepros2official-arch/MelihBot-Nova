import type { PaneView } from "@/components/nova/Sidebar";
import type { PolicyView } from "@/components/nova/PolicyMenu";

/**
 * QA raporlarında her özellik sayfası kendi "Eşlenen Rotalar" bilgisini
 * (?view=kitaplik, ?view=gorseller, ?view=projeler, ?modal=guvenlik,
 * ?modal=gizlilik ...) belgeliyordu, ama uygulama bu parametreleri hiç
 * okumuyordu — yalnızca sidebar/footer butonlarına tıklayınca state
 * değişiyordu; sayfa yenilenince veya link doğrudan paylaşılınca state
 * kayboluyordu. Bu QA raporlarında tekrar eden "URL parametresi mevcut
 * ama otomatik açmıyor" bulgusunun kök nedeniydi.
 *
 * Bu dosya, kod içindeki state anahtarları (İngilizce: library/images/
 * projects, security/privacy/terms/guide) ile QA raporlarında ve dış
 * dünyaya açık URL'lerde kullanılan Türkçe anahtarlar arasındaki tek
 * doğru eşlemeyi tutar, böylece iki taraf asla birbirinden sapmaz.
 */

const VIEW_TO_PARAM: Record<Exclude<PaneView, "chat">, string> = {
  library: "kitaplik",
  images: "gorseller",
  videos: "videolar",
  music: "muzikler",
  projects: "projeler",
};

const PARAM_TO_VIEW: Record<string, PaneView> = Object.fromEntries(
  Object.entries(VIEW_TO_PARAM).map(([view, param]) => [param, view as PaneView]),
);

const MODAL_TO_PARAM: Record<PolicyView, string> = {
  menu: "politikalar",
  security: "guvenlik",
  privacy: "gizlilik",
  terms: "kullanim-kosullari",
  guide: "kullanim-kilavuzu",
};

const PARAM_TO_MODAL: Record<string, PolicyView> = Object.fromEntries(
  Object.entries(MODAL_TO_PARAM).map(([modal, param]) => [param, modal as PolicyView]),
);

/** Sayfa ilk yüklendiğinde (veya doğrudan derin bağlantıyla açıldığında)
 * URL'deki ?view= ve ?modal= parametrelerini okuyup ilk state'i üretir. */
export function readInitialUiStateFromUrl(): {
  view: PaneView;
  policy: PolicyView | null;
} {
  if (typeof window === "undefined") return { view: "chat", policy: null };
  const params = new URLSearchParams(window.location.search);

  const viewParam = params.get("view");
  const view: PaneView = (viewParam && PARAM_TO_VIEW[viewParam]) || "chat";

  const modalParam = params.get("modal");
  const policy: PolicyView | null = (modalParam && PARAM_TO_MODAL[modalParam]) || null;

  return { view, policy };
}

/** `view`/`policy` state'i her değiştiğinde çağrılır; adres çubuğundaki
 * ?view= ve ?modal= parametrelerini state ile birebir aynı tutar (geçmişe
 * yeni bir girdi eklemeden, replaceState ile) — böylece sayfa yenilendiğinde
 * veya link kopyalanıp paylaşıldığında aynı görünüm/modal geri gelir. */
export function syncUiStateToUrl(view: PaneView, policy: PolicyView | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);

  if (view === "chat") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", VIEW_TO_PARAM[view]);
  }

  if (policy === null) {
    url.searchParams.delete("modal");
  } else {
    url.searchParams.set("modal", MODAL_TO_PARAM[policy]);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, "", next);
  }
}
