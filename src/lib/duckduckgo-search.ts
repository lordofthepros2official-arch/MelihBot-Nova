/**
 * DuckDuckGo'nun anahtar gerektirmeyen HTML uç noktasını (html.duckduckgo.com/html/)
 * kazıyan (scraping) arama fonksiyonu. Bu dosya route'tan bağımsızdır —
 * yalnızca src/routes/api/search.ts (kullanıcının Composer'daki "Web'de
 * Arama" toggle'ıyla açtığı mod) tarafından kullanılır. src/routes/api/chat.ts
 * BUNU KULLANMAZ — o, Gemini'nin kendi native `google_search` grounding
 * tool'unu kullanır (modelin kendi kararıyla arama yapması istendiğinde);
 * bu iki arama yolu birbirinden bağımsızdır ve karıştırılmamalıdır.
 *
 * DuckDuckGo'nun resmi/ücretsiz bir "web sonuçları" API'si yoktur; bu HTML
 * kazıma resmi olarak desteklenmez, bu yüzden hatalar burada fırlatılır ve
 * çağıran taraf (search.ts route handler'ı) kendi hata/fallback mesajını
 * üretir — hiçbir zaman burada sessizce yutulmaz.
 */
const MAX_QUERY_CHARS = 400;
const MAX_RESULTS = 5;
const FETCH_TIMEOUT_MS = 8_000;

export type SearchResult = { title: string; url: string; snippet: string };

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]*>/g, "")).trim();
}

/** DuckDuckGo'nun yönlendirme linkini (//duckduckgo.com/l/?uddg=...) gerçek URL'e çözer. */
function resolveDdgUrl(href: string): string {
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    const real = url.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : href;
  } catch {
    return href;
  }
}

function parseResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // DuckDuckGo HTML sonuçlarında her sonuç bir "result__body" bloğu içinde yer alır.
  const blocks = html.split('class="result__body"').slice(1);
  for (const block of blocks) {
    if (results.length >= MAX_RESULTS) break;
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const url = resolveDdgUrl(decodeHtmlEntities(linkMatch[1] ?? ""));
    const title = stripTags(linkMatch[2] ?? "");
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "") : "";
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

/**
 * DuckDuckGo HTML uç noktasını sorgular ve ayrıştırılmış sonuç listesini
 * döner. Ağ hatası veya HTTP hata kodu durumunda exception fırlatır.
 */
export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, MAX_QUERY_CHARS);
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Bazı sağlayıcılar tarayıcı benzeri bir User-Agent olmadan isteği reddeder.
      "User-Agent": "Mozilla/5.0 (compatible; MelihBotNova/1.0)",
    },
    body: `q=${encodeURIComponent(trimmed)}&kl=tr-tr`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  return parseResults(html);
}
