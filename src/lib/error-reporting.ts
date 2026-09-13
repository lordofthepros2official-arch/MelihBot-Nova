type AppErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Uygulama içi hata raporlama. Konsola loglar; harici bir izleme sistemine
 * bağlıysa (opsiyonel), oraya da iletir. Herhangi bir dış servise veri
 * göndermez — yalnızca window nesnesine böyle bir hook eklenmişse kullanılır.
 */
export function reportAppError(
  error: unknown,
  context: Record<string, unknown> = {},
  _options: AppErrorOptions = {},
) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error("[app-error]", message, context);
}
