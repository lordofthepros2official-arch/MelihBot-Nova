import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Folder,
  X,
  Plus,
  Upload,
  FileText,
  Share,
  MoreHorizontal,
  Settings,
  Pin,
  Paperclip,
  ArrowUp,
  Trash2,
} from "lucide-react";
import { Composer, type ComposerModes, type Attachment } from "./Composer";
import {
  deleteProject,
  fetchProjects,
  getSubprojects,
  loadProjects,
  newProject,
  toggleProjectPinned,
  upsertProject,
  type Project,
} from "@/lib/projects";
import { recordSharedLink } from "@/lib/shared-links";
import { fetchThread, getThread, type Thread } from "@/lib/chat-store";
import { notify } from "@/lib/notifications";
import { useSettings } from "@/lib/use-settings";
import { VOICE_OPTIONS } from "@/lib/settings-store";

type Tab = "all" | "mine" | "shared";

export function ProjectsPane({
  onOpenChat,
  onNewChatInProject,
  initialOpenId,
}: {
  onOpenChat: (threadId: string) => void;
  onNewChatInProject: (
    project: Project,
    text: string,
    modes: ComposerModes,
    attachments: Attachment[],
  ) => void;
  initialOpenId?: string | null;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  // Yalnızca salt-okunur görüntüleme için (boş proje ekranındaki başlık
  // metni) — Ayarlar panelinin taslak/kaydet akışıyla ilgisi yok, bu yüzden
  // ChatShell'deki ortak useSettings() kaynağını buraya taşımak yerine
  // kendi bağımsız (kayıtlı hali okuyan) örneğini çağırmak yeterli.
  const { settings: appSettings } = useSettings();
  const assistantNameForDisplay = appSettings.assistantName;

  const refresh = () => setProjects(loadProjects());
  useEffect(() => {
    refresh();
    void fetchProjects();
    const h = () => refresh();
    window.addEventListener("nova:projects", h);
    return () => window.removeEventListener("nova:projects", h);
  }, []);

  const filtered = useMemo(() => {
    // NOT: Kasıtlı olarak toLocaleLowerCase("tr") DEĞİL, düz toLowerCase()
    // kullanılıyor. Türkçe locale kuralında büyük "I" harfi noktasız "ı"ya
    // dönüşür ("PROJESI" -> "proıesı" değil ama örn. "I" tek başına "ı"
    // olur). Kullanıcı büyük "I" içeren bir sorgu yazdığında (İngilizce/
    // mobil klavye alışkanlığıyla çok yaygın) bu, proje adındaki normal
    // "i" ile eşleşmeyip aramanın mevcut bir projeyi bulamamasına yol
    // açıyordu — QA raporunda kanıtlanmış hata buydu. Konum-bağımsız
    // toLowerCase() basit ASCII case-folding yapar ve bu tuzağa düşmez.
    const q = query.trim().toLowerCase();
    const base = tab === "shared" ? [] : projects;
    if (q) return base.filter((p) => p.name.toLowerCase().includes(q));
    // Arama boşken yalnızca KÖK seviyesindeki projeler gösterilir (parentId
    // yok) — alt projeler, üst projelerinin içine girildiğinde görünür
    // (bkz. ProjectDetail "Alt Projeler" bölümü). Bu, iç içe geçmiş
    // projelerin ana listede tekrar tekrar görünmesini önler.
    return base.filter((p) => !p.parentId);
  }, [projects, query, tab]);

  const subprojectCount = (parentId: string) =>
    projects.filter((p) => p.parentId === parentId).length;

  const open = projects.find((p) => p.id === openId) ?? null;
  if (open)
    return (
      <ProjectDetail
        project={open}
        allProjects={projects}
        onOpenSubproject={(id) => setOpenId(id)}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
        onOpenChat={onOpenChat}
        onNewChat={(text, modes, attachments) => onNewChatInProject(open, text, modes, attachments)}
        onChanged={refresh}
        assistantName={assistantNameForDisplay}
      />
    );

  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 pt-20 pb-12">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[34px] leading-none font-normal text-ink">Projeler</h1>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-[260px] items-center gap-2 rounded-full bg-white/80 px-4 shadow-sm max-sm:w-[150px]">
              <Search className="size-4 text-ink/45" strokeWidth={1.8} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Projelerde ara"
                className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink/45 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setCreating(true)}
              className="h-11 rounded-full bg-black px-6 text-[15px] font-medium text-white transition hover:opacity-90"
            >
              Yeni
            </button>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-2 text-[15px]">
          {(
            [
              ["all", "Tümü"],
              ["mine", "Senin oluşturdukların"],
              ["shared", "Seninle paylaşılanlar"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-2 transition ${
                tab === k ? "bg-black/[0.06] font-medium text-ink" : "text-ink/60 hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between px-2 pb-3 text-[14px] text-ink/55">
            <span>Ad</span>
            <span>Değiştirilme tarihi</span>
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-2xl bg-white/40 px-5 py-10 text-center text-[14px] text-ink/55">
              {tab === "shared" ? "Seninle paylaşılan proje yok." : "Henüz proje yok."}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="flex w-full items-center justify-between border-t border-black/10 px-2 py-4 text-left transition hover:bg-white/40"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/70">
                    <Folder className="size-[18px] text-ink" strokeWidth={1.7} />
                  </span>
                  <span className="flex items-center gap-1.5 text-[15px] text-ink">
                    {p.pinned && <Pin className="size-3.5 text-ink/50" strokeWidth={2} />}
                    {p.name}
                    {subprojectCount(p.id) > 0 && (
                      <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-[11.5px] font-medium text-ink/50">
                        {subprojectCount(p.id)} alt proje
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-[14px] text-ink/55">
                  {new Date(p.updatedAt).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreate={(name, memory) => {
            const p = newProject(name, memory);
            upsertProject(p);
            setCreating(false);
            refresh();
            setOpenId(p.id);
          }}
        />
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Erişilebilirlik: diğer tüm modallarla (bkz. PolicyMenu) tutarlı olacak
  // şekilde Esc tuşuyla da kapatılabilsin.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="animate-rise relative w-full max-w-[620px] rounded-2xl bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, memory: string) => void;
}) {
  const [name, setName] = useState("");
  const [memory, setMemory] = useState("Varsayılan bellek");
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between">
        <h2 className="text-[20px] text-ink">Proje oluştur</h2>
        <button onClick={onClose} aria-label="Kapat" className="rounded-full p-1 hover:bg-black/5">
          <X className="size-5 text-ink/70" />
        </button>
      </div>
      <p className="mt-5 text-[14px] text-ink/80">Proje ismi</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kopenhag Gezisi"
        className="mt-2 w-full rounded-xl border border-black/12 px-4 py-3 text-[15px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      <p className="mt-4 rounded-xl bg-black/[0.04] px-4 py-3 text-[13.5px] leading-relaxed text-ink/70">
        Projeler sohbetleri, dosyaları ve özel talimatları tek bir yerde tutar. Bunları devam eden
        işler için veya işleri düzene koymak için kullan.
      </p>
      <div className="mt-5 flex items-center justify-between">
        <select
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          className="rounded-lg bg-transparent py-2 text-[15px] text-ink focus:outline-none"
        >
          <option>Varsayılan bellek</option>
          <option>Proje belleği</option>
          <option>Bellek kapalı</option>
        </select>
        <button
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), memory)}
          className="rounded-full bg-black px-5 py-2.5 text-[15px] font-medium text-white disabled:bg-black/40"
        >
          Proje oluştur
        </button>
      </div>
    </Modal>
  );
}

function ProjectDetail({
  project,
  allProjects,
  onOpenSubproject,
  onBack,
  onOpenChat,
  onNewChat,
  onChanged,
  assistantName,
}: {
  project: Project;
  /** Alt proje listesini hesaplamak için tüm projeler (bkz. subprojects). */
  allProjects: Project[];
  /** Bir alt projeye tıklanınca o projeyi açar (ProjectsPane'deki openId'yi değiştirir). */
  onOpenSubproject: (id: string) => void;
  onBack: () => void;
  onOpenChat: (id: string) => void;
  onNewChat: (text: string, modes: ComposerModes, attachments: Attachment[]) => void;
  onChanged: () => void;
  assistantName: string;
}) {
  const [tab, setTab] = useState<"chats" | "sources" | "subprojects">("chats");
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [creatingSubproject, setCreatingSubproject] = useState(false);
  const threads = project.chatIds.map((id) => getThread(id)).filter((t): t is Thread => Boolean(t));
  const subprojects = getSubprojects(allProjects, project.id);
  const parentProject = project.parentId
    ? allProjects.find((p) => p.id === project.parentId)
    : null;

  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 pt-20 pb-12">
        <button onClick={onBack} className="mb-1 text-[13px] text-ink/55 hover:text-ink">
          ← Projeler
        </button>
        {parentProject && (
          <button
            onClick={() => onOpenSubproject(parentProject.id)}
            className="mb-4 flex items-center gap-1 text-[13px] text-ink/45 hover:text-ink/70"
          >
            <Folder className="size-3.5" strokeWidth={1.8} />
            {parentProject.name} içinde
          </button>
        )}
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-[30px] text-ink">
            <Folder className="size-7" strokeWidth={1.6} />
            {project.name}
          </h1>
          <div className="relative flex items-center gap-2">
            <button
              title="Bu bağlantı yalnızca bu tarayıcıda/cihazda çalışır; başka bir cihaza veya kullanıcıya erişim vermez."
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("project", project.id);
                void navigator.clipboard.writeText(url.toString());
                recordSharedLink(project.id, project.name);
                notify("projects", "Bağlantı kopyalandı", project.name);
              }}
              className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] text-ink shadow-sm"
            >
              <Share className="size-4" strokeWidth={1.8} /> Bağlantıyı kopyala
            </button>
            <button
              onClick={() => setMenu((v) => !v)}
              aria-label="Proje menüsü"
              className="flex size-10 items-center justify-center rounded-full bg-white text-ink shadow-sm"
            >
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="animate-rise absolute top-12 right-0 z-40 w-56 rounded-2xl bg-white p-2 shadow-2xl">
                  <button
                    onClick={() => {
                      setMenu(false);
                      setSettings(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-ink hover:bg-black/5"
                  >
                    <Settings className="size-[18px]" strokeWidth={1.7} /> Proje ayarları
                  </button>
                  <button
                    onClick={() => {
                      toggleProjectPinned(project.id);
                      setMenu(false);
                      onChanged();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-ink hover:bg-black/5"
                  >
                    <Pin className="size-[18px]" strokeWidth={1.7} />
                    {project.pinned ? "Sabitlemeyi kaldır" : "Projeyi sabitle"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5">
          <Composer
            draft={draft}
            onDraftChange={setDraft}
            onSend={(text, modes, attachments) => onNewChat(text, modes, attachments)}
            busy={false}
            onStop={() => {}}
            onOpenLive={() => {}}
            onOpenCanvas={() => {}}
            compact
            placeholder={`${project.name} içinde yeni sohbet`}
            autoFocus={false}
          />
        </div>

        <div className="mt-6 flex items-center gap-2 text-[15px]">
          {(
            [
              ["chats", "Sohbetler"],
              ["sources", "Kaynaklar"],
              ["subprojects", `Alt Projeler${subprojects.length > 0 ? ` (${subprojects.length})` : ""}`],
            ] as ["chats" | "sources" | "subprojects", string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-2 transition ${
                tab === k ? "bg-black/[0.06] font-medium text-ink" : "text-ink/60 hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "subprojects" ? (
          <div className="mt-6">
            <button
              onClick={() => setCreatingSubproject(true)}
              className="mb-4 flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2} /> Alt proje oluştur
            </button>
            {subprojects.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[15px] text-ink/50">
                  Bu projenin içinde henüz alt proje yok.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {subprojects.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => onOpenSubproject(sp.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-black/5 bg-white/60 px-4 py-3.5 text-left transition hover:bg-white"
                  >
                    <span className="flex items-center gap-3 text-[15px] text-ink">
                      <Folder className="size-[18px] text-ink/70" strokeWidth={1.7} />
                      {sp.name}
                    </span>
                    <span className="text-[13px] text-ink/45">
                      {sp.chatIds.length} sohbet
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : tab === "chats" ? (
          threads.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[16px] font-semibold text-ink">Henüz sohbet yok</p>
              <p className="mt-1 text-[14px] text-ink/60">
                {project.name} projesindeki sohbetler burada yer alacak
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenChat(t.id)}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/60 px-4 py-3 text-left hover:bg-white"
                >
                  <span className="truncate text-[15px] text-ink">{t.title}</span>
                  <span className="text-[13px] text-ink/50">
                    {new Date(t.updatedAt).toLocaleDateString("tr-TR")}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-black/15 px-6 py-14 text-center">
            {project.sources.length === 0 ? (
              <>
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-white shadow-sm">
                  <Paperclip className="size-5 text-ink" strokeWidth={1.7} />
                </div>
                <p className="text-[16px] font-semibold text-ink">
                  MelihBot {assistantName} için daha fazla bağlam ekle
                </p>
                <p className="mx-auto mt-2 max-w-md text-[14px] text-ink/60">
                  Proje hakkında daha derin bir bağlam sağlamak için kaynakları yükle veya metin
                  girdisi ekle. Bu kaynaklar proje sohbetlerinde kullanılır.
                </p>
              </>
            ) : (
              <div className="space-y-2 text-left">
                {project.sources.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3"
                  >
                    <span className="flex items-center gap-2 text-[14px] text-ink">
                      <FileText className="size-4" /> {s.name}
                    </span>
                    <button
                      onClick={() => {
                        upsertProject({
                          ...project,
                          sources: project.sources.filter((x) => x.id !== s.id),
                        });
                        onChanged();
                      }}
                      aria-label="Kaynağı sil"
                      className="rounded-full p-1.5 text-ink/50 hover:bg-black/5"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setAdding(true)}
              className="mt-6 rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white"
            >
              Kaynak ekle
            </button>
          </div>
        )}
      </div>

      {adding && (
        <AddSourceModal
          onClose={() => setAdding(false)}
          onAdd={(src) => {
            upsertProject({ ...project, sources: [...project.sources, src] });
            setAdding(false);
            onChanged();
          }}
        />
      )}
      {settings && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setSettings(false)}
          onSave={(p) => {
            upsertProject(p);
            setSettings(false);
            onChanged();
          }}
          onDelete={() => {
            deleteProject(project.id);
            setSettings(false);
            onBack();
          }}
        />
      )}
      {creatingSubproject && (
        <CreateProjectModal
          onClose={() => setCreatingSubproject(false)}
          onCreate={(name, memory) => {
            const p = newProject(name, memory, project.id);
            upsertProject(p);
            setCreatingSubproject(false);
            onChanged();
            onOpenSubproject(p.id);
          }}
        />
      )}
    </div>
  );
}

function AddSourceModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (s: { id: string; name: string; kind: "file" | "text"; content: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [textMode, setTextMode] = useState(false);

  const readFile = async (file: File) => {
    const content = await file.text().catch(() => "");
    onAdd({
      id: crypto.randomUUID(),
      name: file.name,
      kind: "file",
      content: content.slice(0, 20000),
    });
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between">
        <h2 className="text-[20px] text-ink">Kaynakları ekle</h2>
        <button onClick={onClose} aria-label="Kapat" className="rounded-full p-1 hover:bg-black/5">
          <X className="size-5 text-ink/70" />
        </button>
      </div>
      {textMode ? (
        <>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Metni buraya yapıştır…"
            className="mt-4 h-52 w-full resize-none rounded-xl border border-black/12 p-4 text-[14px] text-ink focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setTextMode(false)}
              className="rounded-full px-4 py-2 text-[14px] text-ink/70"
            >
              Geri
            </button>
            <button
              disabled={!text.trim()}
              onClick={() =>
                onAdd({
                  id: crypto.randomUUID(),
                  name: text.trim().slice(0, 40) + "…",
                  kind: "text",
                  content: text.trim(),
                })
              }
              className="rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white disabled:bg-black/40"
            >
              Ekle
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
            className="mt-4 flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-black/20 text-ink/55"
          >
            <Upload className="mb-2 size-6" strokeWidth={1.6} />
            <p className="text-[14px]">Kaynakları buraya sürükle</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SourceTile
              icon={Upload}
              label="Karşıya yükle"
              onClick={() => fileRef.current?.click()}
            />
            <SourceTile icon={FileText} label="Metin girdisi" onClick={() => setTextMode(true)} />
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
        </>
      )}
    </Modal>
  );
}

function SourceTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-black/10 py-5 text-[14px] text-ink transition hover:bg-black/[0.03]"
    >
      <Icon className="size-5" strokeWidth={1.7} />
      {label}
    </button>
  );
}

function ProjectSettingsModal({
  project,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onSave: (p: Project) => void;
  onDelete: () => void;
}) {
  const [p, setP] = useState(project);
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between">
        <h2 className="text-[20px] text-ink">Proje ayarları</h2>
        <button onClick={onClose} aria-label="Kapat" className="rounded-full p-1 hover:bg-black/5">
          <X className="size-5 text-ink/70" />
        </button>
      </div>
      <p className="mt-5 text-[14px] text-ink/80">Proje ismi</p>
      <input
        value={p.name}
        onChange={(e) => setP({ ...p, name: e.target.value })}
        className="mt-2 w-full rounded-xl border border-black/12 px-4 py-3 text-[15px] text-ink focus:outline-none"
      />
      <p className="mt-4 text-[14px] text-ink/80">Talimatlar</p>
      <p className="text-[13px] text-ink/55">
        Bağlamı belirle ve bu projede nasıl yanıt verileceğini özelleştir.
      </p>
      <textarea
        value={p.instructions}
        onChange={(e) => setP({ ...p, instructions: e.target.value })}
        placeholder='Örnek: "Yanıtları kısa ve odaklı tut."'
        className="mt-2 h-24 w-full resize-none rounded-xl border border-black/12 p-3 text-[14px] text-ink focus:outline-none"
      />
      <p className="mt-4 text-[14px] text-ink/80">Bellek</p>
      <select
        value={p.memory}
        onChange={(e) => setP({ ...p, memory: e.target.value })}
        className="mt-2 w-full rounded-xl border border-black/12 px-4 py-3 text-[15px] text-ink focus:outline-none"
      >
        <option>Varsayılan bellek</option>
        <option>Proje belleği</option>
        <option>Bellek kapalı</option>
      </select>
      <p className="mt-4 text-[14px] text-ink/80">Kitaplık erişimi</p>
      <select
        value={p.libraryAccess}
        onChange={(e) => setP({ ...p, libraryAccess: e.target.value })}
        className="mt-2 w-full rounded-xl border border-black/12 px-4 py-3 text-[15px] text-ink focus:outline-none"
      >
        <option>Etkin</option>
        <option>Devre dışı</option>
      </select>
      <p className="mt-4 text-[14px] text-ink/80">Sesli okuma (bu proje için)</p>
      <p className="text-[13px] text-ink/55">
        Bu projedeki sohbetlerde kullanılacak sesi genel Ayarlar &gt; Ses tercihinden farklı
        yapabilirsin.
      </p>
      <select
        value={p.ttsVoiceOverride ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          setP((prev) => {
            if (!value) {
              const { ttsVoiceOverride: _omit, ...rest } = prev;
              return rest;
            }
            return { ...prev, ttsVoiceOverride: value };
          });
        }}
        className="mt-2 w-full rounded-xl border border-black/12 px-4 py-3 text-[15px] text-ink focus:outline-none"
      >
        <option value="">Genel Ayarlar'daki sesi kullan</option>
        {VOICE_OPTIONS.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onDelete}
          className="rounded-full border border-red-500/60 px-4 py-2 text-[14px] font-medium text-red-600 hover:bg-red-50"
        >
          Projeyi sil
        </button>
        <button
          disabled={!p.name.trim()}
          onClick={() => onSave({ ...p, name: p.name.trim() })}
          className="rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:bg-black/40"
        >
          Kaydet
        </button>
      </div>
      {!p.name.trim() && (
        <p className="mt-2 text-right text-[12.5px] text-red-600">Proje adı boş olamaz.</p>
      )}
    </Modal>
  );
}
