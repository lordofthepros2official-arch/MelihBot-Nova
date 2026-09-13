/**
 * Agent modu: ayrı bir menü/modal YOK. Kullanıcı normal sohbet kutusuna yazar;
 * mesaj, çok adımlı/görev niteliğinde görünüyorsa otomatik olarak agent akışı
 * başlar (bkz. ChatShell.tsx send() → shouldTriggerAgent çağrısı) ve adımlar
 * sohbetin İÇİNDE canlı olarak gösterilir. Kullanıcı Composer'daki "Agent"
 * anahtarıyla bunu manuel olarak da her zaman zorlayabilir.
 *
 * Karar client-side, sezgisel (heuristic) kurallarla verilir — ekstra bir API
 * çağrısı gerektirmez, deterministiktir ve hızlıdır.
 *
 * ÖNEMLİ SINIR: "Agent" burada gerçek bir otonom ajan (dosya sistemine,
 * gerçek web'e veya ödeme sistemlerine erişebilen) DEĞİLDİR — sadece görevi
 * adımlara bölüp, her adımı sırayla tekrar LLM'e danışarak "simüle eden" bir
 * akıştır (bkz. runAgentStep). stepRequiresApproval'daki risk kalıpları
 * ("sil", "gönder", "ödeme" vb.) yalnızca metin eşleştirmesidir; hiçbir adım
 * gerçekte dosya/web/ödeme işlemi yapmaz.
 */

const AGENT_TRIGGER_PATTERNS: RegExp[] = [
  // Çok adımlı / planlama gerektiren fiiller
  /\b(araştır|araştırma yap|karşılaştır|derle|topla|listele|bul ve|incele|analiz et|rapor(la| hazırla)|plan(la|ı hazırla)|adım adım|sırayla)\b/i,
  // "Şunu yap, sonra bunu yap" gibi çok görevli istekler
  /\b(önce .+ sonra|hem .+ hem de .+ yap)\b/i,
  // Kod projesi / build gerektiren istekler (Canvas'a bağlanacak ama tetikleme burada)
  /\b(uygulama (yaz|geliştir|kur)|proje oluştur|script yaz.*ve çalıştır|kod yaz.*test et)\b/i,
];

const AGENT_MIN_WORD_COUNT = 6; // çok kısa mesajlar agent tetiklemesin ("merhaba" gibi)

export function shouldTriggerAgent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length < AGENT_MIN_WORD_COUNT) return false;
  return AGENT_TRIGGER_PATTERNS.some((re) => re.test(trimmed));
}

import type { ChatAgentStep } from "./chat-store";
import { getStoredGeminiKey } from "./gemini-key";
import { buildSettingsHeaders } from "./settings-store";

export type AgentStepStatus = ChatAgentStep["status"];
export type AgentStep = ChatAgentStep;

/** Bir adımın kullanıcı onayı gerektirip gerektirmediğine karar verir. */
export function stepRequiresApproval(title: string, detail: string): boolean {
  const text = `${title} ${detail}`.toLowerCase();
  const riskyPatterns = [
    "sil",
    "gönder",
    "yayınla",
    "satın al",
    "ödeme",
    "e-posta gönder",
    "paylaş",
    "yükle",
    "kaydet ve gönder",
  ];
  return riskyPatterns.some((p) => text.includes(p));
}

type WireMsg = { role: "user" | "assistant"; content: string };

async function askModel(messages: WireMsg[]): Promise<string> {
  const geminiKey = getStoredGeminiKey();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(geminiKey ? { "x-gemini-api-key": geminiKey } : {}),
      ...buildSettingsHeaders(),
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || "Yanıt alınamadı.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }
  return full;
}

function parsePlan(raw: string): { title: string; detail: string }[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]) as { title?: string; detail?: string }[];
      const steps = arr
        .filter((s) => s?.title)
        .map((s) => ({ title: String(s.title), detail: String(s.detail ?? "") }));
      if (steps.length) return steps;
    } catch {
      /* düz metne düş */
    }
  }
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 6)
    .map((l) => ({ title: l, detail: "" }));
}

/** Hedeften bir adım planı çıkarır. */
export async function planAgentSteps(goal: string): Promise<AgentStep[]> {
  const raw = await askModel([
    {
      role: "user",
      content:
        `Hedef: ${goal}\n\n` +
        `Bu hedefi tamamlamak için en fazla 5 adımlık kısa bir plan çıkar. ` +
        `SADECE şu biçimde JSON dizisi döndür, başka hiçbir şey yazma: ` +
        `[{"title":"kısa adım başlığı","detail":"bu adımda tam olarak ne yapılacak"}]`,
    },
  ]);
  const parsed = parsePlan(raw);
  if (!parsed.length) throw new Error("Plan oluşturulamadı.");
  return parsed.map((s, i) => ({
    id: i + 1,
    title: s.title,
    detail: s.detail,
    status: stepRequiresApproval(s.title, s.detail)
      ? ("needs_approval" as const)
      : ("pending" as const),
    output: "",
    requiresApproval: stepRequiresApproval(s.title, s.detail),
  }));
}

/** Tek bir adımı çalıştırır, önceki tamamlanmış adımların çıktısını bağlam olarak kullanır. */
export async function runAgentStep(
  goal: string,
  step: AgentStep,
  previousSteps: AgentStep[],
): Promise<string> {
  const context = previousSteps
    .filter((s) => s.status === "done" && s.output)
    .map((s) => `Adım ${s.id} (${s.title}) sonucu:\n${s.output}`)
    .join("\n\n");
  return askModel([
    {
      role: "user",
      content:
        `Genel hedef: ${goal}\n\n` +
        (context ? `Önceki adım sonuçları:\n${context}\n\n` : "") +
        `Şimdi sadece şu adımı tamamla ve sonucunu ver:\n` +
        `${step.title}\n${step.detail}\n\n` +
        `Yalnızca bu adımın çıktısını üret, sonraki adımlara geçme.`,
    },
  ]);
}
