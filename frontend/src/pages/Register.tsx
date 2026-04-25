import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDynamicTranslation } from "@/hooks/useDynamicTranslation";

export function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, user, status } = useAuth();

  const requestedRedirect = (location.state as { from?: string } | null)?.from ?? "/";
  const redirectTo = requestedRedirect === "/login" || requestedRedirect === "/register" ? "/" : requestedRedirect;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const registerTexts = [
    "使用者名稱不可空白",
    "使用者名稱不可超過 128 字元",
    "註冊失敗",
    "驗證登入狀態中…",
    "建立你的帳號",
    "選擇你感興趣的主題，我們會優先推薦更貼近你的展覽",
    "顯示名稱",
    "顯示在個人頁的名稱",
    "Email",
    "您的 Email",
    "密碼",
    "至少 8 個字元",
    "建立帳號中…",
    "建立帳號",
    "已經有帳號了？",
    "直接登入",
  ];
  const t = useDynamicTranslation(registerTexts, "register page ui text");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setError(t("使用者名稱不可空白"));
      return;
    }
    if (trimmedDisplayName.length > 128) {
      setError(t("使用者名稱不可超過 128 字元"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({
        email: email.trim(),
        password,
        display_name: trimmedDisplayName,
        preference_tags: [],
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("註冊失敗"));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-white/60 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("驗證登入狀態中…")}
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-extrabold text-white tracking-wide">{t("建立你的帳號")}</h1>
          <p className="text-sm text-white/50 mt-2">{t("選擇你感興趣的主題，我們會優先推薦更貼近你的展覽")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">{t("顯示名稱")}</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={128}
                className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
                placeholder={t("顯示在個人頁的名稱")}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">{t("Email")}</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
                placeholder={t("您的 Email")}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">{t("密碼")}</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-md bg-transparent border border-white/20 focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none px-4 text-lg text-white placeholder:text-white/35 transition-colors"
              placeholder={t("至少 8 個字元")}
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-md bg-primary hover:bg-primary/90 text-white font-semibold text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("建立帳號中…")}</> : <><UserPlus className="w-4 h-4" /> {t("建立帳號")}</>}
          </button>
        </form>

        <p className="text-center text-sm text-white/60 mt-8">
          {t("已經有帳號了？")}{" "}
          <Link to="/login" state={{ from: redirectTo }} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">
            {t("直接登入")}
          </Link>
        </p>
      </div>
    </div>
  );
}
