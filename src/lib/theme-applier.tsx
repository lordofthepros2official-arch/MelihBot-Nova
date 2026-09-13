import { useEffect } from "react";
import {
  COLOR_THEMES,
  ACCENT_SWATCHES,
  FONT_OPTIONS,
  getStoredBackgroundPhoto,
  type NovaSettings,
} from "./settings-store";

/**
 * `useSettings()`'ten gelen görünüm tercihlerini gerçek CSS custom
 * property'lerine yazar (document.documentElement üzerinde). Bu sayede
 * styles.css'teki mevcut `--app-grad-*`, `--ink`, `--gradient-app`
 * değişkenleri hiçbir class değişikliği gerekmeden runtime'da override
 * edilir — app-gradient, glass-card gibi tüm mevcut utility'ler otomatik
 * olarak yeni renklerle çalışmaya devam eder.
 *
 * Görünmez bir bileşendir (null render eder), ChatShell'in en üstünde
 * her zaman mount edilmelidir.
 */
export function ThemeApplier({ settings }: { settings: NovaSettings }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-contrast", settings.contrastMode);
  }, [settings.contrastMode]);

  useEffect(() => {
    const root = document.documentElement.style;
    const theme = COLOR_THEMES.find((t) => t.id === settings.colorTheme) ?? COLOR_THEMES[0]!;

    // Vurgu rengi: kullanıcı Arayüz > Buton Rengi'nden özel bir renk veya
    // hazır bir palet seçtiyse önce o kullanılır; "Temaya göre" seçiliyken
    // (veya hiç seçim yoksa) seçili renk temasının accent'ine düşülür.
    const swatch = ACCENT_SWATCHES.find((s) => s.id === settings.accentSwatch);
    const accent =
      settings.accentSwatch === "custom" && settings.customAccentColor
        ? settings.customAccentColor
        : swatch?.color || theme.accent;
    root.setProperty("--ink", accent);
    // Sol panel (sidebar) rengi: seçili temanın en koyu gradyan durağı,
    // biraz daha koyulaştırılmış bir tonuyla eşleşir.
    root.setProperty("--nova-sidebar", theme.sidebar);

    // Yazı fontu: Arayüz > Yazı Fontu'ndan seçilen aile, tüm uygulamada
    // kullanılan --font-sf değişkenini override eder (bkz. styles.css body).
    const font = FONT_OPTIONS.find((f) => f.id === settings.fontFamily) ?? FONT_OPTIONS[0]!;
    root.setProperty("--font-sf", font.stack);

    if (settings.backgroundMode === "photo") {
      const photo = getStoredBackgroundPhoto();
      if (photo) {
        const overlay = Math.min(Math.max(settings.photoOverlayOpacity, 0), 80) / 100;
        root.setProperty(
          "--gradient-app",
          `linear-gradient(oklch(0.1 0 0 / ${overlay}), oklch(0.1 0 0 / ${overlay})), url(${JSON.stringify(photo)})`,
        );
        root.setProperty("--nova-bg-size", "cover");
      } else {
        // Fotoğraf modu seçili ama kayıtlı fotoğraf yoksa (silinmiş/hiç
        // yüklenmemiş), sessizce seçili temanın gradyanına düş.
        applyGradient(root, theme);
      }
    } else if (settings.backgroundMode === "solid") {
      root.setProperty("--gradient-app", settings.solidColor);
      root.setProperty("--nova-bg-size", "auto");
    } else {
      applyGradient(root, theme);
    }
  }, [
    settings.colorTheme,
    settings.backgroundMode,
    settings.solidColor,
    settings.photoOverlayOpacity,
    settings.accentSwatch,
    settings.customAccentColor,
    settings.fontFamily,
  ]);

  return null;
}

function applyGradient(root: CSSStyleDeclaration, theme: (typeof COLOR_THEMES)[number]) {
  const [g1, g2, g3, g4] = theme.gradient;
  root.setProperty(
    "--gradient-app",
    `linear-gradient(135deg, ${g1} 0%, ${g2} 38%, ${g3} 68%, ${g4} 100%)`,
  );
  root.setProperty("--nova-bg-size", "auto");
}
