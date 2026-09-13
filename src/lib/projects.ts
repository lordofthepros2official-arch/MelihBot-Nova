import { idbGetAll, idbSetAll, onIdbUserChange } from "./idb-store";

export type ProjectSource = { id: string; name: string; kind: "file" | "text"; content: string };

export type Project = {
  id: string;
  name: string;
  instructions: string;
  memory: string;
  libraryAccess: string;
  createdAt: number;
  updatedAt: number;
  chatIds: string[];
  sources: ProjectSource[];
  pinned?: boolean;
  /** Bu projenin İÇİNDE bulunduğu üst proje (varsa). Yoksa/undefined ise
   * en üst seviyede (kök) bir projedir. Bu alan sayesinde projeler
   * sınırsız derinlikte iç içe geçebilir (bkz. ProjectsPane.tsx
   * "Alt proje oluştur" eylemi ve breadcrumb navigasyonu). Bir projenin
   * kendi alt ağacına (kendisi, çocuğu, torunu...) parent olarak
   * atanmasına izin verilmez — bkz. isDescendantOf. */
  parentId?: string;
  /** Bu proje içindeki sohbetlerde kullanılacak TTS sesi override'ı (bkz.
   * gemini-speech.ts speakLocal — voiceId parametresi). Boşsa/yoksa
   * kullanıcının genel Ayarlar > Ses tercihi kullanılır. Örn: "İş"
   * projesinde daha resmi bir ses, "Kişisel"de farklı bir ses seçilebilir
   * (bkz. ProjectsPane.tsx ProjectSettingsModal "Bu projede farklı ses
   * kullan"). */
  ttsVoiceOverride?: string;
};

/**
 * Projeler artık SUNUCUDA DEĞİL, tarayıcının IndexedDB'sinde saklanır (bkz.
 * src/lib/idb-store.ts). Aynı chat-store.ts deseninde: `loadProjects()`
 * senkron erişim için bir bellek-içi önbellek kullanır, gerçek kaynak
 * IndexedDB'dir.
 */
function isBrowser() {
  return typeof window !== "undefined";
}

let projectsCache: Project[] = [];
let cacheHydrated = false;

if (isBrowser()) {
  onIdbUserChange(() => {
    cacheHydrated = false;
    projectsCache = [];
    window.dispatchEvent(new Event("nova:projects"));
    void fetchProjects();
  });
}

function sortProjects(list: Project[]): Project[] {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function setCache(list: Project[]) {
  projectsCache = sortProjects(list);
  void idbSetAll("projects", projectsCache);
  if (isBrowser()) window.dispatchEvent(new Event("nova:projects"));
}

/** Senkron erişim için: en son bilinen (önbellekteki) proje listesini döner. */
export function loadProjects(): Project[] {
  return projectsCache;
}

/** IndexedDB'den taze proje listesini okur ve önbelleği günceller. */
export async function fetchProjects(): Promise<Project[]> {
  const list = await idbGetAll<Project>("projects");
  const sorted = sortProjects(list);
  projectsCache = sorted;
  cacheHydrated = true;
  if (isBrowser()) window.dispatchEvent(new Event("nova:projects"));
  return sorted;
}

/** Projeyi hem bellek-içi önbellekte hem de IndexedDB'de (kalıcı kaynak) günceller. */
export function upsertProject(p: Project) {
  const list = loadProjects().filter((x) => x.id !== p.id);
  const withTimestamp = { ...p, updatedAt: Date.now() };
  setCache([withTimestamp, ...list]);
}

export function toggleProjectPinned(id: string) {
  const p = loadProjects().find((x) => x.id === id);
  if (!p) return;
  const list = loadProjects().filter((x) => x.id !== id);
  // Sabitleme sırasında updatedAt değişmemeli, aksi halde her sabitlemede
  // proje "az önce değiştirilmiş" gibi görünür.
  const updated = { ...p, pinned: !p.pinned };
  setCache([updated, ...list]);
}

/** id'nin, candidateAncestorId'nin alt ağacında (çocuk, torun, ...) olup
 * olmadığını kontrol eder — bir projeyi kendi alt ağacının içine taşımayı
 * (döngüsel referans) önlemek için kullanılır (bkz. ProjectsPane.tsx
 * "Üst proje" seçici). */
export function isDescendantOf(projects: Project[], id: string, candidateAncestorId: string): boolean {
  let current = projects.find((p) => p.id === candidateAncestorId);
  while (current?.parentId) {
    if (current.parentId === id) return true;
    current = projects.find((p) => p.id === current!.parentId);
  }
  return false;
}

/** Bir projenin doğrudan alt projelerini döner (torunlar dahil değil). */
export function getSubprojects(projects: Project[], parentId: string): Project[] {
  return projects.filter((p) => p.parentId === parentId);
}

export function deleteProject(id: string) {
  // Alt projeler "öksüz" (hiçbir yerden erişilemez) kalmasın diye, silinen
  // projenin tüm alt ağacı (çocuklar, torunlar...) da birlikte silinir.
  const all = loadProjects();
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of all) {
      if (p.parentId && toDelete.has(p.parentId) && !toDelete.has(p.id)) {
        toDelete.add(p.id);
        changed = true;
      }
    }
  }
  setCache(all.filter((x) => !toDelete.has(x.id)));
}

export function newProject(name: string, memory = "Varsayılan bellek", parentId?: string): Project {
  return {
    id: crypto.randomUUID(),
    name,
    instructions: "",
    memory,
    libraryAccess: "Etkin",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    chatIds: [],
    sources: [],
    ...(parentId ? { parentId } : {}),
  };
}

export function addThreadToProject(projectId: string, threadId: string) {
  const p = loadProjects().find((x) => x.id === projectId);
  if (!p || p.chatIds.includes(threadId)) return;
  upsertProject({ ...p, chatIds: [threadId, ...p.chatIds] });
}

// Geriye dönük uyumluluk: cacheHydrated dışarıdan kullanılmıyor ama
// gelecekte fetchThread benzeri bir "henüz hydrate olmadıysa bekle" deseni
// gerekirse burada tutulur.
export function isProjectsCacheHydrated(): boolean {
  return cacheHydrated;
}
