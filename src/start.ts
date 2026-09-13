import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep requests protected from
// cross-site requests.
//
// DÜZELTME NOTU: Önceki bir sürümde bu filtre `ctx.handlerType === "serverFn"
// || ctx.handlerType === "router"` idi — amaç /api/auth/* gibi server
// route'ları da (bkz. aşağıdaki CSRF gerekçesi) kapsamaktı. Ama
// `handlerType: "router"`, TanStack'in kaynak kodunda (bkz.
// @tanstack/start-server-core/createStartHandler.js) SADECE server
// route'ları değil, `executeRouter` ile SAYFA NAVİGASYONLARINI (ör. "/"
// route'unun kendisi) de kapsayan ortak bir değerdir. Top-level sayfa
// navigasyonlarında (adres çubuğuna yazma, yeni sekme, bookmark) tarayıcı
// `Sec-Fetch-Site: none` gönderir — bu "same-origin" ile eşleşmediği için
// CSRF middleware'i SAYFANIN KENDİSİNİ 403 ile reddediyordu (gerçek prod
// hatası: "GET / 403 Forbidden"). Bu yüzden `handlerType` yerine PATH bazlı
// filtreleme kullanılıyor: yalnızca `/api/` altındaki istekler (server
// route'lar, hem serverFn hem router tipinde olabilir) CSRF kontrolünden
// geçer; normal sayfa route'ları (`/`, `/c/$threadId` vb.) hiç etkilenmez.
//
// /api/auth/* uç noktaları çerez tabanlı oturum kullanıyor (bkz.
// lib/auth.ts) — cookie'ler cross-origin isteklerde de otomatik gönderildiği
// için bu uç noktalar CSRF'e karşı korunmalı (ör. /api/auth/logout,
// korumasız kalsaydı üçüncü bir sitenin basit bir cross-origin POST
// isteğiyle kullanıcıyı habersizce oturumdan düşürebilirdi). /api/image,
// /api/chat gibi x-gemini-api-key header'ı zorunlu kılan uç noktalar için bu
// ekstra bir katmandır (zaten header zorunluluğu dolaylı bir CSRF koruması
// sağlıyordu); tarayıcıdan gelen normal aynı-origin fetch() istekleri
// Sec-Fetch-Site/Origin header'larını doğal olarak taşıdığından sorunsuz
// geçer — yalnızca top-level SAYFA navigasyonları (Sec-Fetch-Site: none
// gönderen) bu sorunu yaşıyordu, onlar zaten /api/ altında değil.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => new URL(ctx.request.url).pathname.startsWith("/api/"),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
