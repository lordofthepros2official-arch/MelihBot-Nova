import { useState } from "react";
import { User, Loader2, LogIn, UserPlus } from "lucide-react";
import { isValidUsername, isValidEmail, isValidPassword, isValidFullName } from "@/lib/auth";
import type { AuthUser } from "@/lib/use-auth";

type Mode = "login" | "register";

/**
 * Uygulama ilk açıldığında GeminiKeyGate'ten ÖNCE gösterilen zorunlu ekran:
 * kullanıcı giriş yapmadan/kayıt olmadan sohbete geçemez. Aynı GeminiKeyGate
 * gibi kapatılamaz — geçerli bir oturum kurulana kadar ekranda kalır.
 */
export function AuthGate({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="app-gradient fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 py-8 sm:items-center">
      <div className="glass-card w-full max-w-md rounded-3xl p-6 sm:p-8">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-ink/10">
            <User className="size-5 text-ink" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[19px] font-semibold text-ink">
              {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
            </h1>
            <p className="text-[13px] text-ink/60">MelihBot Nova'yı kullanabilmek için</p>
          </div>
        </div>

        <div className="mt-5 flex rounded-2xl bg-black/[0.04] p-1">
          <TabButton active={mode === "login"} onClick={() => setMode("login")} icon={LogIn}>
            Giriş Yap
          </TabButton>
          <TabButton
            active={mode === "register"}
            onClick={() => setMode("register")}
            icon={UserPlus}
          >
            Üye Ol
          </TabButton>
        </div>

        {mode === "login" ? (
          <LoginForm onSignedIn={onSignedIn} />
        ) : (
          <RegisterForm onSignedIn={onSignedIn} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LogIn;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-medium transition ${
        active ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink/75"
      }`}
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-[12.5px] text-red-600">{message}</p>;
}

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60";

function LoginForm({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Kullanıcı adı/e-posta ve şifre gerekli.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || "Giriş yapılamadı. Bilgilerini kontrol et.");
        setBusy(false);
        return;
      }
      onSignedIn(data.user);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar dene.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">
          Kullanıcı adı veya e-posta
        </label>
        <input
          type="text"
          autoComplete="username"
          value={identifier}
          disabled={busy}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (error) setError(null);
          }}
          placeholder="kullanici_adi ya da sen@ornek.com"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">Şifre</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={busy}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Şifreni gir"
          className={inputClass}
        />
      </div>
      <FieldError message={error} />
      <button
        type="submit"
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Giriş yapılıyor…
          </>
        ) : (
          <>
            <LogIn className="size-4" /> Giriş Yap
          </>
        )}
      </button>
    </form>
  );
}

function RegisterForm({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidFullName(fullName)) {
      setError("Ad soyad en az 2 karakter olmalı.");
      return;
    }
    if (!isValidUsername(username)) {
      setError(
        "Kullanıcı adı 3-32 karakter olmalı ve yalnızca harf, rakam, alt çizgi (_) ya da nokta (.) içermeli.",
      );
      return;
    }
    if (!isValidEmail(email)) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }
    if (!isValidPassword(password)) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || "Kayıt oluşturulamadı.");
        setBusy(false);
        return;
      }
      onSignedIn(data.user);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar dene.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">Ad Soyad</label>
        <input
          type="text"
          autoComplete="name"
          value={fullName}
          disabled={busy}
          onChange={(e) => {
            setFullName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Adın ve soyadın"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">Kullanıcı adı</label>
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          disabled={busy}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          placeholder="kullanici_adi"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">E-posta</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          disabled={busy}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="sen@ornek.com"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink/70">Şifre</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={busy}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="En az 8 karakter"
          className={inputClass}
        />
      </div>
      <FieldError message={error} />
      <button
        type="submit"
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Hesap oluşturuluyor…
          </>
        ) : (
          <>
            <UserPlus className="size-4" /> Üye Ol
          </>
        )}
      </button>
    </form>
  );
}
